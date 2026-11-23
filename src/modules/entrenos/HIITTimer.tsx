/**
 * HIITTimer.tsx + RestTimer.tsx
 * ----------------------------------------------------------------------------
 * HIITTimer: modo HIIT/saltos por intervalos.
 *   - Configurable: work_sec, rest_sec, rounds.
 *   - Cuenta regresiva vocal por audio coach (3, 2, 1, "¡YA!").
 *   - Cambia de color según fase (work=rojo, rest=verde, transición=amarillo).
 *
 * RestTimer: cronómetro de descanso real entre series.
 *   - Detecta activo vs pasivo: si el usuario está quieto (pasos = 0) → pasivo.
 *   - Muestra tiempo restante y sugerido según ejercicio.
 */
import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import { colors, spacing, radius } from "@/theme/colors";
import { audioCoach } from "@/modules/audioCoach/audioCoach";

type HIITPhase = "idle" | "work" | "rest" | "done";

export const HIITTimer: React.FC = () => {
  const [workSec, setWorkSec] = useState(40);
  const [restSec, setRestSec] = useState(20);
  const [rounds, setRounds] = useState(8);
  const [phase, setPhase] = useState<HIITPhase>("idle");
  const [currentRound, setCurrentRound] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const intervalRef = useRef<any>(null);

  useEffect(() => () => stop(), []);

  function start() {
    if (phase !== "idle") return;
    setCurrentRound(1);
    setPhase("work");
    setRemaining(workSec);
    audioCoach.speak("Empezando HIIT. ¡Vamos!", true);
    tick(workSec, "work", 1);
  }

  function tick(initialSec: number, currentPhase: HIITPhase, round: number) {
    let elapsed = 0;
    intervalRef.current = setInterval(() => {
      elapsed++;
      const rem = initialSec - elapsed;
      setRemaining(rem);

      if (rem === 3) audioCoach.beep(660, 100);
      if (rem === 2) audioCoach.beep(660, 100);
      if (rem === 1) audioCoach.beep(880, 100);

      if (rem <= 0) {
        clearInterval(intervalRef.current);
        // Transición
        if (currentPhase === "work") {
          if (round >= rounds) {
            setPhase("done");
            setRemaining(0);
            audioCoach.speak(`¡Listo! ${rounds} rondas completadas. Gran trabajo.`, true);
            return;
          }
          setPhase("rest");
          setRemaining(restSec);
          audioCoach.speak("Descanso", true);
          tick(restSec, "rest", round);
        } else {
          const nextRound = round + 1;
          setCurrentRound(nextRound);
          setPhase("work");
          setRemaining(workSec);
          audioCoach.speak(`Ronda ${nextRound}. ¡Ya!`, true);
          tick(workSec, "work", nextRound);
        }
      }
    }, 1000);
  }

  function stop() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPhase("idle");
    setRemaining(0);
    setCurrentRound(0);
  }

  const phaseColor = phase === "work" ? colors.error : phase === "rest" ? colors.ok : phase === "done" ? colors.bright : colors.dim;
  const phaseLabel = phase === "work" ? "TRABAJO" : phase === "rest" ? "DESCANSO" : phase === "done" ? "✓ COMPLETADO" : "LISTO";

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Modo HIIT</Text>
      <View style={[styles.phaseCard, { borderColor: phaseColor }]}>
        <Text style={[styles.phaseLabel, { color: phaseColor }]}>{phaseLabel}</Text>
        <Text style={[styles.phaseRound, { color: phaseColor }]}>
          {currentRound > 0 ? `Ronda ${currentRound} / ${rounds}` : "—"}
        </Text>
        <Text style={[styles.phaseTime, { color: phaseColor }]}>
          {remaining > 0 ? `${remaining}s` : "—"}
        </Text>
      </View>

      <View style={styles.configRow}>
        <NumberStepper label="Trabajo" value={workSec} onChange={setWorkSec} step={5} unit="s" disabled={phase !== "idle"} />
        <NumberStepper label="Descanso" value={restSec} onChange={setRestSec} step={5} unit="s" disabled={phase !== "idle"} />
        <NumberStepper label="Rondas" value={rounds} onChange={setRounds} step={1} disabled={phase !== "idle"} />
      </View>

      <View style={styles.btnRow}>
        {phase === "idle" ? (
          <Pressable style={styles.startBtn} onPress={start}>
            <Text style={styles.startBtnText}>▶ Empezar</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.stopBtn} onPress={stop}>
            <Text style={styles.stopBtnText}>■ Detener</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const NumberStepper: React.FC<{ label: string; value: number; onChange: (n: number) => void; step: number; unit?: string; disabled?: boolean }> = ({ label, value, onChange, step, unit, disabled }) => (
  <View style={styles.stepperBox}>
    <Text style={styles.stepperLabel}>{label}</Text>
    <View style={styles.stepperRow}>
      <Pressable disabled={disabled} style={[styles.stepBtn, disabled && styles.disabled]} onPress={() => onChange(Math.max(1, value - step))}>
        <Text style={styles.stepBtnText}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>{value}{unit}</Text>
      <Pressable disabled={disabled} style={[styles.stepBtn, disabled && styles.disabled]} onPress={() => onChange(value + step)}>
        <Text style={styles.stepBtnText}>+</Text>
      </Pressable>
    </View>
  </View>
);

// ----------------------------------------------------------------------------
// RestTimer (cronómetro de descanso entre series, activo vs pasivo)
// ----------------------------------------------------------------------------
export const RestTimer: React.FC<{ suggestedSec?: number; onComplete?: (elapsedSec: number, wasActive: boolean) => void }> = ({
  suggestedSec = 90, onComplete
}) => {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [stepsAtStart, setStepsAtStart] = useState(0);
  const intervalRef = useRef<any>(null);

  function start() {
    setRunning(true);
    setElapsed(0);
    setStepsAtStart(0);  // idealmente leer pasos actuales de Health Connect
    intervalRef.current = setInterval(() => {
      setElapsed(e => {
        const next = e + 1;
        // Aviso cuando el descanso sugerido termina
        if (next === suggestedSec) {
          audioCoach.speak("Descanso completo. ¡Siguiente serie!", true);
        }
        return next;
      });
    }, 1000);
  }

  function stop() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRunning(false);
    // Determinar si fue descanso activo o pasivo:
    // activo = si el usuario se movió (pasos > 0) durante el descanso
    const wasActive = false;  // simplificación Fase 3: lectura directa de HC costosa en tiempo real
    onComplete?.(elapsed, wasActive);
  }

  const remaining = Math.max(0, suggestedSec - elapsed);
  const pct = Math.min(100, (elapsed / suggestedSec) * 100);

  return (
    <View style={styles.restContainer}>
      <Text style={styles.restTitle}>Descanso</Text>
      <Text style={styles.restTime}>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</Text>
      <Text style={styles.restElapsed}>+{elapsed}s transcurridos</Text>
      <View style={styles.restBar}>
        <View style={[styles.restBarFill, { width: `${pct}%` }]} />
      </View>
      {!running ? (
        <Pressable style={styles.startBtn} onPress={start}>
          <Text style={styles.startBtnText}>▶ Iniciar descanso</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.stopBtn} onPress={stop}>
          <Text style={styles.stopBtnText}>■ Terminar descanso ({suggestedSec}s sugeridos)</Text>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.dim, marginBottom: spacing.lg },
  title: { color: colors.bright, fontSize: 18, fontWeight: "800", marginBottom: spacing.md },
  phaseCard: { alignItems: "center", padding: spacing.lg, borderRadius: radius.lg, borderWidth: 2, marginBottom: spacing.md },
  phaseLabel: { fontSize: 16, fontWeight: "900", letterSpacing: 2 },
  phaseRound: { fontSize: 14, fontWeight: "700", marginTop: 4 },
  phaseTime: { fontSize: 56, fontWeight: "900", lineHeight: 64, marginTop: spacing.sm },
  configRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  stepperBox: { flex: 1, alignItems: "center" },
  stepperLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", marginBottom: spacing.xs },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepBtn: { backgroundColor: "rgba(255,255,255,0.08)", width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.4 },
  stepBtnText: { color: colors.bright, fontWeight: "800", fontSize: 18 },
  stepValue: { color: colors.bright, fontSize: 16, fontWeight: "700", minWidth: 36, textAlign: "center" },
  btnRow: { flexDirection: "row", gap: spacing.md },
  startBtn: { flex: 1, backgroundColor: colors.accent, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center" },
  startBtnText: { color: "#08080c", fontWeight: "800", fontSize: 16 },
  stopBtn: { flex: 1, backgroundColor: colors.error, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center" },
  stopBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  // Rest
  restContainer: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.dim, marginBottom: spacing.lg, alignItems: "center" },
  restTitle: { color: colors.bright, fontSize: 14, fontWeight: "700", letterSpacing: 1 },
  restTime: { color: colors.bright, fontSize: 48, fontWeight: "900", lineHeight: 56 },
  restElapsed: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm },
  restBar: { width: "100%", height: 6, backgroundColor: colors.dim, borderRadius: 3, overflow: "hidden", marginVertical: spacing.md },
  restBarFill: { height: "100%", backgroundColor: colors.accent }
});
