/**
 * BarcodeScannerScreen.tsx
 * ----------------------------------------------------------------------------
 * Escáner de códigos de barras con react-native-vision-camera (mismo motor
 * que el Coach AI) + frame processor de barcode detection.
 *
 * - Lee EAN-13, UPC-A, QR.
 * - Al detectar: vibra + llama a OpenFoodFacts.
 * - Muestra el producto encontrado + botón "Añadir X gramos".
 */
import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, Pressable, useWindowDimensions
} from "react-native";
import { Camera, useCameraDevice, useCameraPermission, useFrameProcessor } from "react-native-vision-camera";
import { runOnJS } from "react-native-reanimated";
import { Worklets } from "react-native-worklets-core";
import { colors, spacing, radius } from "@/theme/colors";
import { findFoodByBarcode, type OffProduct } from "./openFoodFactsClient";
import { logFood } from "./foodRepo";

export const BarcodeScannerScreen: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { width, height } = useWindowDimensions();
  const cameraPerm = useCameraPermission();
  const device = useCameraDevice("back");
  const [barcode, setBarcode] = useState<string | null>(null);
  const [product, setProduct] = useState<OffProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [grams, setGrams] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [logged, setLogged] = useState(false);

  const lookupBarcode = useCallback(async (b: string) => {
    setLoading(true);
    setError(null);
    setProduct(null);
    setLogged(false);
    try {
      const p = await findFoodByBarcode(b);
      if (p) {
        setProduct(p);
      } else {
        setError("Producto no encontrado en Open Food Facts");
      }
    } catch (e: any) {
      setError(e.message ?? "Error de red");
    } finally {
      setLoading(false);
    }
  }, []);

  const onBarcodes = Worklets.createRunInJsFn((codes: string[]) => {
    if (codes.length > 0) {
      const first = codes[0];
      setBarcode((prev) => {
        if (prev === first) return prev;  // evitar spam
        lookupBarcode(first);
        return first;
      });
    }
  });

  const frameProcessor = useFrameProcessor((frame) => {
    "worklet";
    // Plugin nativo "scanBarcodes" - VisionCamera expone barcode detection
    // como plugin incluido en su package.
    const result = (frame as any).__callFrameProcessorPlugin?.("scanBarcodes", {
      barcodeTypes: ["ean-13", "ean-8", "upc-a", "upc-e", "qr"]
    });
    if (result && Array.isArray(result)) {
      const codes = result.map((r: any) => r.rawValue).filter(Boolean);
      if (codes.length > 0) {
        onBarcodes(codes);
      }
    }
  }, []);

  if (!cameraPerm.hasPermission) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Cámara requerida</Text>
        <Pressable style={styles.btn} onPress={cameraPerm.requestPermission}>
          <Text style={styles.btnText}>Conceder cámara</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {device && (
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={true}
          frameProcessor={frameProcessor}
          enableZoomGesture={false}
        />
      )}

      {/* Marco de escaneo */}
      <View pointerEvents="none" style={styles.scanFrame}>
        <View style={styles.cornerTL} />
        <View style={styles.cornerTR} />
        <View style={styles.cornerBL} />
        <View style={styles.cornerBR} />
      </View>

      <View style={styles.bottomCard}>
        {barcode && (
          <Text style={styles.barcodeText}>Código: {barcode}</Text>
        )}
        {loading && <Text style={styles.loading}>Buscando producto…</Text>}
        {error && <Text style={styles.error}>{error}</Text>}
        {product && (
          <>
            <Text style={styles.productName}>{product.name}</Text>
            {product.brand && <Text style={styles.productBrand}>{product.brand}</Text>}
            <Text style={styles.productMacros}>
              {product.kcal} kcal · {product.protein_g}P · {product.carbs_g}C · {product.fat_g}F
              {" (por 100g)"}
            </Text>
            <View style={styles.gramsRow}>
              <Pressable style={styles.stepBtn} onPress={() => setGrams(Math.max(10, grams - 25))}>
                <Text style={styles.stepBtnText}>-25</Text>
              </Pressable>
              <Text style={styles.gramsValue}>{grams}g</Text>
              <Pressable style={styles.stepBtn} onPress={() => setGrams(grams + 25)}>
                <Text style={styles.stepBtnText}>+25</Text>
              </Pressable>
            </View>
            {!logged ? (
              <Pressable
                style={styles.addBtn}
                onPress={async () => {
                  // Necesitamos el food_id; buscamos en cache
                  const { getFoodByBarcodeFromCache } = await import("./openFoodFactsClient");
                  const cached = await getFoodByBarcodeFromCache(product.barcode);
                  if (!cached) {
                    setError("Producto cacheado no disponible");
                    return;
                  }
                  // getFoodByBarcodeFromCache returns OffProduct; we need FoodRow.id
                  // Vamos a buscar por barcode directo en SQLite
                  const { openDatabase, queryAsync } = await import("@/modules/persistence/db");
                  const db = await openDatabase();
                  const rows = await queryAsync<{ id: string }>(db, "SELECT id FROM foods WHERE barcode = ?", [product.barcode]);
                  if (rows[0]) {
                    await logFood({ foodId: rows[0].id, grams, mealName: "snack" });
                    setLogged(true);
                  }
                }}
              >
                <Text style={styles.addBtnText}>Añadir {grams}g</Text>
              </Pressable>
            ) : (
              <Text style={styles.logged}>✓ Añadido a tu día</Text>
            )}
          </>
        )}
        <Pressable style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeText}>Cerrar</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  title: { color: colors.bright, fontSize: 20, marginBottom: spacing.lg },
  btn: { backgroundColor: colors.accent, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md },
  btnText: { color: "#08080c", fontWeight: "800" },
  scanFrame: {
    position: "absolute",
    top: "30%", left: "10%", right: "10%", bottom: "30%",
    borderWidth: 0
  },
  cornerTL: { position: "absolute", top: 0, left: 0, width: 30, height: 30, borderTopWidth: 3, borderLeftWidth: 3, borderColor: colors.accent },
  cornerTR: { position: "absolute", top: 0, right: 0, width: 30, height: 30, borderTopWidth: 3, borderRightWidth: 3, borderColor: colors.accent },
  cornerBL: { position: "absolute", bottom: 0, left: 0, width: 30, height: 30, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: colors.accent },
  cornerBR: { position: "absolute", bottom: 0, right: 0, width: 30, height: 30, borderBottomWidth: 3, borderRightWidth: 3, borderColor: colors.accent },
  bottomCard: {
    position: "absolute",
    left: spacing.md, right: spacing.md, bottom: spacing.xl,
    backgroundColor: "rgba(8, 10, 14, 0.95)",
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1, borderColor: colors.dim
  },
  barcodeText: { color: colors.textMuted, fontSize: 12, marginBottom: 4 },
  loading: { color: colors.bright, fontSize: 14 },
  error: { color: colors.error, fontSize: 14, fontWeight: "700" },
  productName: { color: colors.bright, fontSize: 18, fontWeight: "800" },
  productBrand: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  productMacros: { color: colors.bright, fontSize: 14, marginTop: spacing.sm, fontWeight: "600" },
  gramsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md },
  stepBtn: { backgroundColor: "rgba(255,255,255,0.1)", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm, minWidth: 60, alignItems: "center" },
  stepBtnText: { color: colors.bright, fontWeight: "700" },
  gramsValue: { color: colors.bright, fontSize: 22, fontWeight: "800" },
  addBtn: { backgroundColor: colors.accent, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center", marginTop: spacing.md },
  addBtnText: { color: "#08080c", fontWeight: "800", fontSize: 16 },
  logged: { color: colors.ok, fontWeight: "800", fontSize: 14, marginTop: spacing.md, textAlign: "center" },
  closeBtn: { backgroundColor: "rgba(255,255,255,0.06)", paddingVertical: spacing.sm, borderRadius: radius.md, alignItems: "center", marginTop: spacing.md },
  closeText: { color: colors.bright, fontWeight: "700" }
});
