/**
 * CalendarScreen.tsx
 * ----------------------------------------------------------------------------
 * Calendario visual mensual y semanal.
 *   - Vista mensual: cuadrícula coloreada por cumplimiento (entreno/pasos/calorías).
 *   - Vista semanal planificable: arrastrar una sesión a otro día recalcula
 *     la recuperación muscular (mínimo 48h para el mismo grupo).
 *   - Botón "+" para planificar sesión futura.
 */
import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, Modal, TextInput
} from "react-native";
import { colors, spacing, radius } from "@/theme/colors";
import { openDatabase, queryAsync, execAsync } from "@/modules/persistence/db";

type ViewMode = "month" | "week";

interface DayCell {
  day: string;
  workoutDone: boolean;
  steps: number;
  kcalIn: number;
  kcalOut: number;
  compliance: "full" | "partial" | "missed" | "rest" | "future" | "planned";
}

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

export const CalendarScreen: React.FC = () => {
  const [mode, setMode] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState(new Date());
  const [days, setDays] = useState<DayCell[]>([]);
  const [plannedModal, setPlannedModal] = useState<string | null>(null);
  const [routineName, setRoutineName] = useState("");

  const loadDays = useCallback(async () => {
    const start = new Date(cursor);
    if (mode === "month") {
      start.setDate(1);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));  // empezar en lunes
    } else {
      const dayOfWeek = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - dayOfWeek);
    }
    const count = mode === "month" ? 42 : 7;
    const out: DayCell[] = [];
    const db = await openDatabase();
    for (let i = 0; i < count; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const row = await queryAsync<any>(
        db,
        `SELECT * FROM calendar_days WHERE day = ?`,
        [iso]
      );
      const planned = await queryAsync<any>(
        db,
        `SELECT * FROM planned_sessions WHERE day = ? AND status = 'planned'`,
        [iso]
      );
      const today = new Date().toISOString().slice(0, 10);
      const compliance: DayCell["compliance"] =
        planned.length > 0 && iso >= today ? "planned" :
        iso > today ? "future" :
        row[0]?.compliance ?? "missed";
      out.push({
        day: iso,
        workoutDone: !!row[0]?.workout_done,
        steps: row[0]?.steps ?? 0,
        kcalIn: row[0]?.kcal_in ?? 0,
        kcalOut: row[0]?.kcal_out ?? 0,
        compliance: compliance as DayCell["compliance"]
      });
    }
    setDays(out);
  }, [cursor, mode]);

  useEffect(() => { loadDays(); }, [loadDays]);

  function moveCursor(delta: number) {
    const d = new Date(cursor);
    if (mode === "month") d.setMonth(d.getMonth() + delta);
    else d.setDate(d.getDate() + delta * 7);
    setCursor(d);
  }

  async function savePlanned() {
    if (!plannedModal || !routineName) return;
    const db = await openDatabase();
    const id = `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    await execAsync(
      db,
      `INSERT INTO planned_sessions (id, day, routine_id, planned_exercises, status, moved_to, created_at, updated_at, synced_at)
       VALUES (?, ?, NULL, ?, 'planned', NULL, ?, ?, NULL)`,
      [id, plannedModal, JSON.stringify([{ name: routineName }]), Date.now(), Date.now()]
    );
    setPlannedModal(null);
    setRoutineName("");
    loadDays();
  }

  return (
    <ScrollView style={styles.scroll}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>
            {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </Text>
          <View style={styles.modeToggle}>
            <Pressable style={[styles.modeBtn, mode === "month" && styles.modeBtnActive]} onPress={() => setMode("month")}>
              <Text style={[styles.modeBtnText, mode === "month" && styles.modeBtnTextActive]}>Mes</Text>
            </Pressable>
            <Pressable style={[styles.modeBtn, mode === "week" && styles.modeBtnActive]} onPress={() => setMode("week")}>
              <Text style={[styles.modeBtnText, mode === "week" && styles.modeBtnTextActive]}>Semana</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.navRow}>
          <Pressable style={styles.navBtn} onPress={() => moveCursor(-1)}>
            <Text style={styles.navBtnText}>←</Text>
          </Pressable>
          <Pressable style={styles.navBtn} onPress={() => setCursor(new Date())}>
            <Text style={styles.navBtnText}>Hoy</Text>
          </Pressable>
          <Pressable style={styles.navBtn} onPress={() => moveCursor(1)}>
            <Text style={styles.navBtnText}>→</Text>
          </Pressable>
        </View>

        <View style={styles.weekHeader}>
          {WEEKDAYS.map((d, i) => (
            <Text key={i} style={styles.weekDayLabel}>{d}</Text>
          ))}
        </View>

        <View style={styles.grid}>
          {days.map((d, i) => (
            <Pressable
              key={i}
              style={[
                styles.dayCell,
                mode === "month" && styles.dayCellMonth,
                { backgroundColor: complianceColor(d.compliance) + "22", borderColor: complianceColor(d.compliance) }
              ]}
              onPress={() => {
                if (d.day >= new Date().toISOString().slice(0, 10)) {
                  setPlannedModal(d.day);
                }
              }}
            >
              <Text style={styles.dayNumber}>{parseInt(d.day.slice(8))}</Text>
              {d.workoutDone && <Text style={styles.dayMark}>💪</Text>}
              {d.compliance === "planned" && <Text style={styles.dayMark}>📅</Text>}
              {d.steps > 0 && mode === "week" && (
                <Text style={styles.daySteps}>{d.steps.toLocaleString()}</Text>
              )}
            </Pressable>
          ))}
        </View>

        <View style={styles.legendRow}>
          <Legend color={complianceColor("full")} label="Completo" />
          <Legend color={complianceColor("partial")} label="Parcial" />
          <Legend color={complianceColor("missed")} label="Perdido" />
          <Legend color={complianceColor("planned")} label="Planificado" />
          <Legend color={complianceColor("rest")} label="Descanso" />
        </View>
      </View>

      {/* Modal para planificar */}
      <Modal visible={!!plannedModal} animationType="slide" transparent={true}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Planificar sesión</Text>
          <Text style={styles.modalDate}>{plannedModal}</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Push day, Pierna, Full body…"
            placeholderTextColor={colors.textMuted}
            value={routineName}
            onChangeText={setRoutineName}
            autoFocus
          />
          <View style={styles.modalActions}>
            <Pressable style={styles.cancelBtn} onPress={() => setPlannedModal(null)}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
            <Pressable style={styles.confirmBtn} onPress={savePlanned}>
              <Text style={styles.confirmText}>Guardar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const Legend: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <View style={styles.legendItem}>
    <View style={[styles.legendDot, { backgroundColor: color }]} />
    <Text style={styles.legendText}>{label}</Text>
  </View>
);

function complianceColor(c: DayCell["compliance"]): string {
  switch (c) {
    case "full": return colors.ok;
    case "partial": return colors.bottom;
    case "missed": return colors.error;
    case "planned": return colors.accent;
    case "rest": return colors.dim;
    case "future": return colors.dim;
  }
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { color: colors.bright, fontSize: 22, fontWeight: "800", textTransform: "capitalize" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  modeToggle: { flexDirection: "row", gap: 4 },
  modeBtn: { paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: radius.sm, backgroundColor: colors.bgCard },
  modeBtnActive: { backgroundColor: colors.accent },
  modeBtnText: { color: colors.textMuted, fontWeight: "700", fontSize: 12 },
  modeBtnTextActive: { color: "#08080c" },
  navRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.md, gap: spacing.sm },
  navBtn: { flex: 1, backgroundColor: colors.bgCard, paddingVertical: spacing.sm, borderRadius: radius.md, alignItems: "center", borderWidth: 1, borderColor: colors.dim },
  navBtnText: { color: colors.bright, fontWeight: "800" },
  weekHeader: { flexDirection: "row", marginBottom: spacing.xs },
  weekDayLabel: { flex: 1, textAlign: "center", color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  dayCell: { flexBasis: "13%", minHeight: 50, padding: 4, borderRadius: radius.sm, borderWidth: 1, alignItems: "center" },
  dayCellMonth: { minHeight: 48 },
  dayNumber: { color: colors.bright, fontSize: 11, fontWeight: "700" },
  dayMark: { fontSize: 12, marginTop: 2 },
  daySteps: { color: colors.concentric, fontSize: 9, fontWeight: "700", marginTop: 2 },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: colors.textMuted, fontSize: 11 },
  modal: { backgroundColor: colors.bgCard, margin: spacing.lg, borderRadius: radius.lg, padding: spacing.lg, marginTop: "30%" },
  modalTitle: { color: colors.bright, fontSize: 18, fontWeight: "800" },
  modalDate: { color: colors.textMuted, fontSize: 14, marginBottom: spacing.md },
  input: { backgroundColor: colors.bg, color: colors.bright, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.dim, marginBottom: spacing.md },
  modalActions: { flexDirection: "row", gap: spacing.md },
  cancelBtn: { flex: 1, backgroundColor: "rgba(255,255,255,0.06)", paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center" },
  cancelText: { color: colors.bright, fontWeight: "700" },
  confirmBtn: { flex: 1, backgroundColor: colors.accent, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center" },
  confirmText: { color: "#08080c", fontWeight: "800" }
});
