/**
 * localNotifications.ts + RemindersScreen.tsx
 * ----------------------------------------------------------------------------
 * Wrapper JS sobre LocalNotificationsModule.kt + UI de gestión de recordatorios.
 */
import { NativeModules, Platform } from "react-native";

const LocalNotifications = NativeModules.LocalNotifications;

export interface Reminder {
  id: string;
  type: "workout" | "water" | "supplement" | "goals_review";
  title: string;
  body?: string;
  hour: number;
  minute: number;
  days: number[];  // 1..7 (Lunes=1)
}

export async function scheduleReminder(r: Reminder): Promise<boolean> {
  if (Platform.OS !== "android" || !LocalNotifications) return false;
  await LocalNotifications.schedule({
    id: r.id,
    title: r.title,
    body: r.body ?? "",
    hour: r.hour,
    minute: r.minute,
    days: r.days,
    deepLink: deepLinkForType(r.type)
  });
  // Persistir en SQLite
  const { openDatabase, execAsync } = await import("@/modules/persistence/db");
  const db = await openDatabase();
  await execAsync(
    db,
    `INSERT OR REPLACE INTO local_reminders
      (id, type, title, body, hour, minute, days, is_active, created_at, updated_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
    [r.id, r.type, r.title, r.body ?? null, r.hour, r.minute,
     JSON.stringify(r.days), Date.now(), Date.now()]
  );
  return true;
}

export async function cancelReminder(id: string): Promise<void> {
  if (Platform.OS === "android" && LocalNotifications) {
    await LocalNotifications.cancel(id);
  }
  const { openDatabase, execAsync } = await import("@/modules/persistence/db");
  const db = await openDatabase();
  await execAsync(db, "DELETE FROM local_reminders WHERE id = ?", [id]);
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "android" && LocalNotifications) {
    return await LocalNotifications.requestPermission();
  }
  return false;
}

function deepLinkForType(type: Reminder["type"]): string {
  switch (type) {
    case "workout": return "aiofitness://coach";
    case "water": return "aiofitness://addwater/250";
    case "supplement": return "aiofitness://nutrition";
    case "goals_review": return "aiofitness://calendar";
  }
}

// --- UI --------------------------------------------------------------------
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Switch } from "react-native";
import { colors, spacing, radius } from "@/theme/colors";
import { openDatabase, queryAsync } from "@/modules/persistence/db";

export const RemindersScreen: React.FC = () => {
  const [reminders, setReminders] = useState<any[]>([]);

  useEffect(() => {
    requestNotificationPermission();
    refresh();
  }, []);

  async function refresh() {
    const db = await openDatabase();
    const rows = await queryAsync<any>(db, "SELECT * FROM local_reminders ORDER BY hour, minute", []);
    setReminders(rows);
  }

  async function toggleReminder(r: any) {
    if (r.is_active) {
      await cancelReminder(r.id);
    } else {
      await scheduleReminder({
        id: r.id, type: r.type, title: r.title, body: r.body ?? "",
        hour: r.hour, minute: r.minute,
        days: JSON.parse(r.days)
      });
    }
    refresh();
  }

  async function quickAdd(type: Reminder["type"]) {
    const presets: Record<Reminder["type"], Omit<Reminder, "id">> = {
      workout: { type, title: "Hora de entrenar", body: "Tu sesión planificada te espera.", hour: 18, minute: 0, days: [1,2,3,4,5] },
      water: { type, title: "Bebe agua", body: "Recuerda hidratarte.", hour: 11, minute: 0, days: [1,2,3,4,5,6,7] },
      supplement: { type, title: "Suplemento", body: "Toma tu creatina/whey.", hour: 8, minute: 0, days: [1,2,3,4,5,6,7] },
      goals_review: { type, title: "Revisa tus metas", body: "Mira tu progreso semanal.", hour: 20, minute: 0, days: [0] }
    };
    const id = `rem_${type}_${Date.now().toString(36)}`;
    await scheduleReminder({ id, ...presets[type] });
    refresh();
  }

  return (
    <ScrollView style={styles.scroll}>
      <View style={styles.container}>
        <Text style={styles.title}>Recordatorios</Text>
        <Text style={styles.subtitle}>Notificaciones locales sin internet</Text>

        <Text style={styles.sectionTitle}>Añadir rápido</Text>
        <View style={styles.quickRow}>
          <Pressable style={styles.quickBtn} onPress={() => quickAdd("workout")}>
            <Text style={styles.quickText}>+ Entreno</Text>
          </Pressable>
          <Pressable style={styles.quickBtn} onPress={() => quickAdd("water")}>
            <Text style={styles.quickText}>+ Agua</Text>
          </Pressable>
          <Pressable style={styles.quickBtn} onPress={() => quickAdd("supplement")}>
            <Text style={styles.quickText}>+ Suplemento</Text>
          </Pressable>
          <Pressable style={styles.quickBtn} onPress={() => quickAdd("goals_review")}>
            <Text style={styles.quickText}>+ Metas</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Activos ({reminders.length})</Text>
        {reminders.length === 0 && (
          <Text style={styles.empty}>Sin recordatorios. Añade uno arriba.</Text>
        )}
        {reminders.map(r => (
          <View key={r.id} style={styles.reminderCard}>
            <View style={styles.reminderInfo}>
              <Text style={styles.reminderTitle}>{r.title}</Text>
              <Text style={styles.reminderMeta}>
                {r.hour.toString().padStart(2, "0")}:{r.minute.toString().padStart(2, "0")} · {r.type}
              </Text>
            </View>
            <Switch
              value={!!r.is_active}
              onValueChange={() => toggleReminder(r)}
              trackColor={{ false: colors.dim, true: colors.accent }}
              thumbColor={r.is_active ? "#08080c" : colors.bright}
            />
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { color: colors.bright, fontSize: 28, fontWeight: "800" },
  subtitle: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.lg },
  sectionTitle: { color: colors.bright, fontSize: 13, fontWeight: "800", letterSpacing: 1, marginTop: spacing.lg, marginBottom: spacing.sm },
  quickRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  quickBtn: { backgroundColor: colors.bgCard, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.dim },
  quickText: { color: colors.accent, fontWeight: "800", fontSize: 13 },
  empty: { color: colors.textMuted, fontStyle: "italic" },
  reminderCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.bgCard, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.dim },
  reminderInfo: { flex: 1 },
  reminderTitle: { color: colors.bright, fontSize: 15, fontWeight: "700" },
  reminderMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 }
});
