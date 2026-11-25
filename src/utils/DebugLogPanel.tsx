/**
 * DebugLogPanel.tsx
 * ----------------------------------------------------------------------------
 * Panel flotante que muestra los logs capturados por debugLogger.
 *
 * Uso:
 *   import { DebugLogPanel } from "@/utils/DebugLogPanel";
 *   // En cualquier pantalla, al final del JSX:
 *   <DebugLogPanel />
 *
 * El panel está cerrado por defecto. Se abre con un botón flotante (🐞) en la
 * esquina inferior derecha. Muestra los últimos 200 logs con timestamp, nivel
 * y tag. Botón "Limpiar" vacía el array. Botón "Cerrar" lo oculta.
 */
import React, { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, Pressable, Modal, ScrollView, Switch
} from "react-native";
import { useDebugLogs, clearDebugLogs, type LogEntry } from "./debugLogger";
import { colors, spacing, radius } from "@/theme/colors";

const LEVEL_COLOR: Record<string, string> = {
  log: colors.textMuted,
  warn: "#f59e0b",
  error: "#ef4444"
};

const LEVEL_LABEL: Record<string, string> = {
  log: "LOG",
  warn: "WRN",
  error: "ERR"
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  const ms = d.getMilliseconds().toString().padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

export const DebugLogPanel: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [filterError, setFilterError] = useState(false);
  const logs = useDebugLogs();

  const filteredLogs = useMemo(() => {
    if (!filterError) return logs;
    return logs.filter((l) => l.level === "error" || l.level === "warn");
  }, [logs, filterError]);

  if (!visible) {
    return (
      <Pressable
        style={styles.fab}
        onPress={() => setVisible(true)}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={styles.fabText}>🐞</Text>
        {logs.some((l) => l.level === "error") && (
          <View style={styles.fabBadge} />
        )}
      </Pressable>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={() => setVisible(false)}>
      <View style={styles.overlay}>
        <View style={styles.panel}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Logs de diagnóstico ({filteredLogs.length})</Text>
            <Pressable style={styles.headerBtn} onPress={() => setVisible(false)}>
              <Text style={styles.headerBtnText}>Cerrar ✕</Text>
            </Pressable>
          </View>

          {/* Controles */}
          <View style={styles.controls}>
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>Solo errores/warnings</Text>
              <Switch
                value={filterError}
                onValueChange={setFilterError}
                trackColor={{ false: colors.dim, true: colors.accent }}
                thumbColor={filterError ? colors.bright : colors.textMuted}
              />
            </View>
            <Pressable style={styles.clearBtn} onPress={clearDebugLogs}>
              <Text style={styles.clearBtnText}>Limpiar</Text>
            </Pressable>
          </View>

          {/* Lista de logs */}
          <ScrollView style={styles.logList} contentContainerStyle={{ padding: spacing.sm, paddingBottom: spacing.xxl }}>
            {filteredLogs.length === 0 && (
              <Text style={styles.emptyText}>No hay logs. Abre la cámara para ver actividad.</Text>
            )}
            {filteredLogs.slice().reverse().map((log: LogEntry) => (
              <View key={log.id} style={[styles.logEntry, { borderLeftColor: LEVEL_COLOR[log.level] }]}>
                <View style={styles.logHeader}>
                  <Text style={styles.logTime}>{formatTime(log.ts)}</Text>
                  <Text style={[styles.logLevel, { color: LEVEL_COLOR[log.level] }]}>{LEVEL_LABEL[log.level]}</Text>
                  <Text style={styles.logTag}>[{log.tag}]</Text>
                </View>
                <Text style={styles.logMessage}>{log.message}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    bottom: 80,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(8,10,14,0.9)",
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999
  },
  fabText: { fontSize: 22 },
  fabBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ef4444"
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end"
  },
  panel: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    height: "80%",
    borderWidth: 1,
    borderColor: colors.dim
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.dim
  },
  title: { color: colors.bright, fontSize: 16, fontWeight: "800" },
  headerBtn: {
    backgroundColor: colors.bgCard,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm
  },
  headerBtnText: { color: colors.bright, fontWeight: "700", fontSize: 13 },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.dim
  },
  filterRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  filterLabel: { color: colors.textMuted, fontSize: 13 },
  clearBtn: {
    backgroundColor: "#ef4444",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm
  },
  clearBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  logList: { flex: 1 },
  emptyText: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: spacing.xl },
  logEntry: {
    borderLeftWidth: 3,
    backgroundColor: colors.bgCard,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: 4
  },
  logHeader: { flexDirection: "row", gap: 6, marginBottom: 2 },
  logTime: { color: colors.dim, fontSize: 10, fontFamily: "monospace" },
  logLevel: { fontSize: 10, fontWeight: "800", fontFamily: "monospace" },
  logTag: { color: colors.accent, fontSize: 10, fontFamily: "monospace" },
  logMessage: { color: colors.bright, fontSize: 11, fontFamily: "monospace", lineHeight: 14 }
});
