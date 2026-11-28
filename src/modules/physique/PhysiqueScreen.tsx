/**
 * PhysiqueScreen.tsx — Análisis físico con foto (Más → Análisis físico).
 * Cuenta atrás de 5 s, captura foto + pose, calcula proporciones y dice en qué
 * enfocarte (perder / ganar / mejorar). Historial guardado en el teléfono.
 */
import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Image, Alert, TextInput } from "react-native";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import { useIsFocused } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import { colors, spacing, radius } from "@/theme/colors";
import { useSettingsStore } from "@/store/settingsStore";
import { usePoseDetection } from "@/modules/camera/hooks/usePoseDetection";
import { computeMetrics, buildReport, type PhysiqueReport, type PoseMetrics } from "./physiqueAnalysis";
import { bmiOf } from "@/modules/profile/trainingProfile";
import { Icon } from "@/components/Icon";

const KEY = "aio_physique_history";
interface Subject { weightKg: number; heightCm: number; gender: "male" | "female" }
interface Entry { id: string; date: number; uri: string; report: PhysiqueReport; metrics: PoseMetrics | null; subject?: Subject }

/** Borra un archivo sin fallar si ya no existe. */
const safeDelete = async (uri?: string) => {
  if (!uri) return;
  try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch { /* ignorar */ }
};

export const PhysiqueScreen: React.FC = () => {
  const perm = useCameraPermission();
  const [pos, setPos] = useState<"front" | "back">("back");
  const device = useCameraDevice(pos);
  const focused = useIsFocused();
  const s = useSettingsStore();
  const cam = useRef<any>(null);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Entry[]>([]);
  const [current, setCurrent] = useState<Entry | null>(null);
  const [camOn, setCamOn] = useState(false);

  // --- Datos de LA PERSONA DE LA FOTO (por defecto, los de tu perfil) ---
  const [subjW, setSubjW] = useState(s.weightKg ? String(Math.round(s.weightKg * 10) / 10) : "");
  const [subjH, setSubjH] = useState(s.heightCm ? String(Math.round(s.heightCm)) : "");
  const [subjG, setSubjG] = useState<"male" | "female">(s.gender === "female" ? "female" : "male");
  const useMine = () => {
    setSubjW(s.weightKg ? String(Math.round(s.weightKg * 10) / 10) : "");
    setSubjH(s.heightCm ? String(Math.round(s.heightCm)) : "");
    setSubjG(s.gender === "female" ? "female" : "male");
  };
  const num = (t: string) => { const n = parseFloat(t.replace(",", ".")); return Number.isFinite(n) ? n : null; };
  const subjectValid = () => {
    const w = num(subjW), h = num(subjH);
    return w !== null && h !== null && w >= 25 && w <= 300 && h >= 100 && h <= 230;
  };

  const { pose, frameProcessor } = usePoseDetection(camOn && focused && count !== null);
  const buf = useRef<Record<string, number>[]>([]);
  useEffect(() => {
    if (count !== null && pose && (pose as any)._hasData) {
      buf.current.push({ ...(pose as any) });
      if (buf.current.length > 25) buf.current.shift();
    }
  }, [pose, count]);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((r) => { if (r) setHistory(JSON.parse(r)); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (count === null) return;
    if (count > 0) { const t = setTimeout(() => setCount(count - 1), 1000); return () => clearTimeout(t); }
    capture();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  const capture = async () => {
    setBusy(true);
    try {
      const photo = await cam.current?.takePhoto({ flash: "off" });
      const poses = buf.current.slice();
      const metrics = computeMetrics(poses);
      const w = num(subjW), h = num(subjH);
      // El %grasa del perfil solo aplica si la foto es de la misma persona del perfil.
      const sameAsProfile = !!(s.weightKg && s.heightCm && w !== null && h !== null &&
        Math.abs(w - s.weightKg) < 0.6 && Math.abs(h - s.heightCm) < 0.6);
      const report = buildReport({
        metrics, gender: subjG, goal: s.goal, weightKg: w, heightCm: h,
        bodyFatPct: sameAsProfile ? (s.bodyFatManualPct ?? s.bodyFatScalePct ?? null) : null,
        experience: sameAsProfile ? (s.experience ?? null) : null
      });
      let uri = photo?.path ? `file://${photo.path}` : "";
      try {
        const dir = `${FileSystem.documentDirectory}physique/`;
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        const dest = `${dir}${Date.now()}.jpg`;
        await FileSystem.copyAsync({ from: uri, to: dest });
        await safeDelete(uri);          // borra la copia temporal de la cámara
        uri = dest;
      } catch { /* se deja la ruta temporal */ }
      const entry: Entry = {
        id: String(Date.now()), date: Date.now(), uri, report, metrics,
        subject: w !== null && h !== null ? { weightKg: w, heightCm: h, gender: subjG } : undefined
      };
      const dropped = [entry, ...history].slice(30);   // las que salen del límite también se borran del disco
      for (const d of dropped) await safeDelete(d.uri);
      const next = [entry, ...history].slice(0, 30);
      setHistory(next);
      setCurrent(entry);
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
    } catch (e: any) {
      Alert.alert("No se pudo tomar la foto", String(e?.message ?? e));
    } finally {
      buf.current = []; setCount(null); setCamOn(false); setBusy(false);
    }
  };

  // --- Borrado de fotos ---
  const persist = async (next: Entry[]) => {
    setHistory(next);
    try { await AsyncStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignorar */ }
  };
  const deleteEntry = (e: Entry) => {
    Alert.alert("Borrar foto", "Se eliminará la foto y su análisis de este teléfono. No se puede deshacer.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Borrar", style: "destructive",
        onPress: async () => {
          await safeDelete(e.uri);
          if (current?.id === e.id) setCurrent(null);
          await persist(history.filter((h) => h.id !== e.id));
        }
      }
    ]);
  };
  const clearAll = () => {
    Alert.alert("Borrar todo el historial", `Se eliminarán ${history.length} fotos y sus análisis. No se puede deshacer.`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Borrar todo", style: "destructive",
        onPress: async () => {
          for (const h of history) await safeDelete(h.uri);
          setCurrent(null);
          await persist([]);
        }
      }
    ]);
  };

  if (!perm.hasPermission) {
    return (
      <View style={styles.center}>
        <Text style={styles.h1}>Permiso de cámara</Text>
        <Pressable style={styles.btn} onPress={() => perm.requestPermission()}><Text style={styles.btnText}>Conceder acceso</Text></Pressable>
      </View>
    );
  }

  if (camOn && device) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <Camera ref={cam} style={StyleSheet.absoluteFill} device={device} isActive={focused} photo
          frameProcessor={count !== null ? frameProcessor : undefined} />
        <View style={styles.overlay} pointerEvents="box-none">
          <Text style={styles.tip}>De frente, de pies a cabeza, a 2–3 m, buena luz y ropa ajustada</Text>
          {count !== null ? <Text style={styles.count}>{count}</Text> : (
            <View style={{ gap: spacing.sm }}>
              <Pressable style={styles.btn} onPress={() => { buf.current = []; setCount(5); }}><Text style={styles.btnText}>Foto en 5 s</Text></Pressable>
              <Pressable style={styles.btn2} onPress={() => setPos((p) => (p === "back" ? "front" : "back"))}><Text style={styles.btn2Text}>🔄 Cambiar cámara</Text></Pressable>
              <Pressable style={styles.btn2} onPress={() => setCamOn(false)}><Text style={styles.btn2Text}>Cancelar</Text></Pressable>
            </View>
          )}
        </View>
      </View>
    );
  }

  const r = current?.report;
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={styles.h1}>📸 Análisis físico</Text>
      <Text style={styles.muted}>
        Mide proporciones y simetría desde tu foto y, junto con tu peso, IMC y % de grasa, te dice si enfocarte en perder, ganar o mejorar. Es orientativo; la foto no estima el % de grasa. Las fotos se quedan en tu teléfono.
      </Text>
      {/* Datos de la persona de la foto: de aquí sale peso, IMC y el tipo de recomendación */}
      <View style={styles.card}>
        <Text style={styles.h2}>¿De quién es la foto?</Text>
        <Text style={styles.muted}>
          La foto mide proporciones y simetría; el peso y la estatura deciden si toca bajar grasa, ganar o mejorar, y qué tan intenso. Si es otra persona, cambia estos datos.
        </Text>
        <View style={styles.formRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Peso (kg)</Text>
            <TextInput value={subjW} onChangeText={setSubjW} keyboardType="decimal-pad" placeholder="ej. 82"
              placeholderTextColor={colors.textDim} style={styles.input} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Estatura (cm)</Text>
            <TextInput value={subjH} onChangeText={setSubjH} keyboardType="number-pad" placeholder="ej. 172"
              placeholderTextColor={colors.textDim} style={styles.input} />
          </View>
        </View>
        <View style={styles.formRow}>
          {(["male", "female"] as const).map((g) => (
            <Pressable key={g} onPress={() => setSubjG(g)} style={[styles.seg, subjG === g && styles.segOn]}>
              <Text style={[styles.segText, subjG === g && { color: colors.bg }]}>{g === "male" ? "Hombre" : "Mujer"}</Text>
            </Pressable>
          ))}
          <Pressable onPress={useMine} style={styles.seg}><Text style={styles.segText}>Usar mis datos</Text></Pressable>
        </View>
        {num(subjW) !== null && num(subjH) !== null && bmiOf(num(subjW), num(subjH)) !== null && (
          <Text style={[styles.muted, { marginTop: spacing.sm }]}>IMC: {bmiOf(num(subjW), num(subjH))!.toFixed(1)}</Text>
        )}
      </View>

      <Pressable style={[styles.btn, !subjectValid() && { opacity: 0.45 }]} disabled={busy}
        onPress={() => {
          if (!subjectValid()) { Alert.alert("Faltan datos", "Escribe un peso (25–300 kg) y una estatura (100–230 cm) válidos."); return; }
          setCurrent(null); setCamOn(true);
        }}>
        <Text style={styles.btnText}>{busy ? "Analizando…" : "Tomar foto y analizar"}</Text>
      </Pressable>

      {r && current && (
        <View style={styles.card}>
          <Image source={{ uri: current.uri }} style={styles.photo} resizeMode="cover" />
          <Text style={styles.verdict}>{r.headline}</Text>
          {r.basis ? <Text style={[styles.muted, { marginBottom: spacing.xs }]}>Calculado con: {r.basis}</Text> : null}
          {r.items.map((it, i) => (
            <View key={i} style={styles.item}>
              <Text style={styles.itemTitle}>{it.area} · <Text style={{ color: it.priority === "alta" ? colors.error : colors.accent }}>{it.priority}</Text></Text>
              <Text style={styles.muted}>{it.advice}</Text>
            </View>
          ))}
          <Pressable style={styles.delBtn} onPress={() => deleteEntry(current)}>
            <Icon name="trash-outline" size={16} color={colors.error} />
            <Text style={styles.delText}>Borrar esta foto</Text>
          </Pressable>
        </View>
      )}

      {history.length > 0 && <Text style={styles.h2}>Historial</Text>}
      {history.map((h) => (
        <Pressable key={h.id} style={styles.hRow} onPress={() => setCurrent(h)}>
          <Image source={{ uri: h.uri }} style={styles.thumb} />
          <View style={{ flex: 1 }}>
            <Text style={styles.itemTitle}>{new Date(h.date).toLocaleDateString()}</Text>
            <Text style={styles.muted}>{h.report.headline}</Text>
            {h.subject ? <Text style={styles.muted}>{Math.round(h.subject.weightKg)} kg · {Math.round(h.subject.heightCm)} cm</Text> : null}
          </View>
          <Pressable onPress={() => deleteEntry(h)} hitSlop={10} style={styles.trash}>
            <Icon name="trash-outline" size={20} color={colors.error} />
          </Pressable>
        </Pressable>
      ))}
      {history.length > 1 && (
        <Pressable style={[styles.delBtn, { marginTop: spacing.md }]} onPress={clearAll}>
          <Icon name="trash-outline" size={16} color={colors.error} />
          <Text style={styles.delText}>Borrar todo el historial</Text>
        </Pressable>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  h1: { color: colors.bright, fontSize: 24, fontWeight: "800", marginBottom: spacing.sm },
  h2: { color: colors.bright, fontSize: 17, fontWeight: "800", marginTop: spacing.lg, marginBottom: spacing.sm },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  btn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, alignItems: "center", marginTop: spacing.md },
  btnText: { color: colors.bg, fontWeight: "800", fontSize: 15 },
  btn2: { backgroundColor: "rgba(8,10,14,0.85)", borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center", borderWidth: 1, borderColor: colors.dim },
  btn2Text: { color: colors.bright, fontWeight: "700" },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "space-between", alignItems: "center", padding: spacing.lg, paddingTop: 50, paddingBottom: 40 },
  tip: { color: "#fff", backgroundColor: "rgba(8,10,14,0.8)", padding: spacing.sm, borderRadius: radius.sm, textAlign: "center", fontSize: 12 },
  count: { color: "#fff", fontSize: 120, fontWeight: "900" },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.dim, padding: spacing.md, marginTop: spacing.lg },
  photo: { width: "100%", height: 320, borderRadius: radius.md, marginBottom: spacing.md },
  verdict: { color: colors.accent, fontSize: 18, fontWeight: "800", marginBottom: spacing.sm },
  item: { marginTop: spacing.sm },
  itemTitle: { color: colors.bright, fontSize: 14, fontWeight: "700" },
  hRow: { flexDirection: "row", gap: spacing.md, alignItems: "center", backgroundColor: colors.bgCard, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.dim },
  thumb: { width: 56, height: 72, borderRadius: radius.sm },
  formRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, alignItems: "flex-end" },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 4 },
  input: { backgroundColor: colors.surface, color: colors.bright, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 16, borderWidth: 1, borderColor: colors.dim },
  seg: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: colors.dim },
  segOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  segText: { color: colors.bright, fontWeight: "700", fontSize: 13 },
  delBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.error, borderRadius: radius.md, paddingVertical: 10, marginTop: spacing.lg },
  delText: { color: colors.error, fontWeight: "800", fontSize: 13 },
  trash: { padding: spacing.sm }
});
