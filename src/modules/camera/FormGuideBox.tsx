/**
 * FormGuideBox.tsx — Cuadro de técnica TRANSPARENTE sobre la cámara.
 *   verde  = técnica correcta
 *   rojo   = hay un fallo (muestra la corrección)
 *   neutro = sin datos suficientes -> muestra la guía "cómo hacerlo"
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { FormState } from "@/modules/biomechanics/liveFormEngine";

interface Props {
  state: FormState;
  message: string | null;
  exerciseName: string;
  hint: string;
}

const PALETTE = {
  good:    { border: "#22c55e", bg: "rgba(34,197,94,0.16)" },
  bad:     { border: "#ef4444", bg: "rgba(239,68,68,0.22)" },
  unknown: { border: "rgba(255,255,255,0.55)", bg: "rgba(8,10,14,0.22)" }
} as const;

export const FormGuideBox: React.FC<Props> = ({ state, message, exerciseName, hint }) => {
  const p = PALETTE[state];
  return (
    <View pointerEvents="none" style={[styles.box, { borderColor: p.border, backgroundColor: p.bg }]}>
      {state === "good" && <Text style={styles.title}>✓ Buena técnica</Text>}
      {state === "bad" && <Text style={styles.title}>✗ {message ?? "Corrige la postura"}</Text>}
      {state === "unknown" && (
        <>
          <Text style={styles.title}>📋 Cómo hacer {exerciseName}</Text>
          <Text style={styles.text}>{hint}</Text>
        </>
      )}
    </View>
  );
};

const shadow = { textShadowColor: "rgba(0,0,0,0.85)", textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } };
const styles = StyleSheet.create({
  box: { position: "absolute", top: 100, left: 12, right: 12, padding: 10, borderRadius: 12, borderWidth: 2 },
  title: { color: "#fff", fontSize: 15, fontWeight: "800", ...shadow },
  text: { color: "#fff", fontSize: 12, lineHeight: 17, marginTop: 4, ...shadow }
});
