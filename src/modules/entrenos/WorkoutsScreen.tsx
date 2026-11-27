/**
 * WorkoutsScreen.tsx (Rediseño v0.4)
 * ----------------------------------------------------------------------------
 * Pantalla principal de Entrenos rediseñada:
 *   - Planificador semanal (chips Lun→Dom): tapping muestra rutina sugerida.
 *   - "Rutinas sugeridas": scroll horizontal con tarjetas de rutina.
 *   - Tap en rutina -> modal con todos los bloques (emoji, sets×reps, rest,
 *     "cómo hacerlo" desde preset.calibrationHint).
 *   - "Mi rutina personal": editor simple (lista de ejercicios, add/remove,
 *     ajustar sets/reps/peso).
 *   - Conserva el historial + doble progresión + deload + tools (Plate, HIIT,
 *     Rest, Heatmap, Summary) del archivo original.
 *
 * Toda la metadata de rutinas viene de routineLibrary.ts. La persistencia
 * real de workouts/sets no cambia (workoutStore + setRepo).
 */
import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, RefreshControl, FlatList,
  Modal, TextInput
} from "react-native";
import { colors, spacing, radius } from "@/theme/colors";
import { openDatabase, queryAsync } from "@/modules/persistence/db";
import { PlateCalculator } from "./PlateCalculator";
import { HIITTimer, RestTimer } from "./HIITTimer";
import { MuscleHeatMap, PostWorkoutSummary } from "./PostWorkoutSummary";
import { MuscleRecoveryCard } from "@/modules/muscles/MuscleRecoveryCard";
import { computeDoubleProgression, suggestDeload } from "./doubleProgression";
import {
  ROUTINES, ROUTINES_BY_DAY, DAYS_OF_WEEK, estimateRoutineMinutes,
  summarizeSetsReps, type Routine, type RoutineBlock
} from "./routineLibrary";
import { EXERCISE_PRESETS, type ExercisePreset } from "@/modules/biomechanics/exercisePresets";

type ToolKind = "plate" | "hiit" | "rest" | "heatmap" | "summary" | null;

interface PersonalBlock {
  uid: string;
  exerciseId: string;
  sets: number;
  reps: string;
  weightKg: number;
}

const uid = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

const DIFFICULTY_COLOR: Record<Routine["difficulty"], string> = {
  principiante: colors.ok,
  intermedio: colors.bottom,
  avanzado: colors.error
};

const DIFFICULTY_LABEL: Record<Routine["difficulty"], string> = {
  principiante: "Principiante",
  intermedio: "Intermedio",
  avanzado: "Avanzado"
};

export const WorkoutsScreen: React.FC = () => {
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showTool, setShowTool] = useState<ToolKind>(null);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [deloadAlerts, setDeloadAlerts] = useState<{ exerciseId: string; reason: string; deloadWeight: number }[]>([]);

  // Rediseño
  const [selectedDay, setSelectedDay] = useState<string>(currentDayOfWeek());
  const [routineDetail, setRoutineDetail] = useState<Routine | null>(null);
  const [personalRoutine, setPersonalRoutine] = useState<PersonalBlock[]>([]);
  const [showPersonalEditor, setShowPersonalEditor] = useState(false);
  const [showExercisePicker, setShowExercisePicker] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const db = await openDatabase();
      const rows = await queryAsync<any>(
        db,
        `SELECT w.*, COUNT(s.id) as sets_count, COALESCE(SUM(s.volume_kg), 0) as total_volume
         FROM workouts w LEFT JOIN sets s ON s.workout_id = w.id
         GROUP BY w.id ORDER BY w.started_at DESC LIMIT 30`,
        []
      );
      setWorkouts(rows);

      // Doble progresión para los ejercicios más frecuentes
      const exercises = await queryAsync<{ id: string; name: string }>(
        db,
        `SELECT e.id, e.name FROM exercises e
         WHERE e.id IN (SELECT DISTINCT exercise_id FROM sets ORDER BY created_at DESC LIMIT 5)`,
        []
      );
      const sugg = [];
      for (const ex of exercises) {
        const s = await computeDoubleProgression({
          exerciseId: ex.id, minReps: 6, maxReps: 8, targetSets: 4, weightIncrementKg: 2.5
        });
        if (s) sugg.push({ ...s, name: ex.name });
        const dl = await suggestDeload(ex.id);
        if (dl.needed && dl.deloadWeight) {
          setDeloadAlerts(prev => [...prev.filter(a => a.exerciseId !== ex.id), { exerciseId: ex.id, reason: dl.reason!, deloadWeight: dl.deloadWeight! }]);
        }
      }
      setSuggestions(sugg);
    } catch (err) {
      console.warn("[WorkoutsScreen] refresh falló:", err);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const routineForSelectedDay = useMemo<Routine | undefined>(
    () => ROUTINES_BY_DAY[selectedDay as keyof typeof ROUTINES_BY_DAY],
    [selectedDay]
  );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
    >
      <Text style={styles.title}>Entrenos</Text>
      <Text style={styles.subtitle}>Planifica tu semana y sigue rutinas guiadas</Text>

      {/* Deload alerts */}
      {deloadAlerts.length > 0 && (
        <View style={styles.alertCard}>
          <Text style={styles.alertTitle}>⚠ Deload sugerido</Text>
          {deloadAlerts.map(a => (
            <Text key={a.exerciseId} style={styles.alertText}>
              {a.reason} → bajar a {a.deloadWeight} kg
            </Text>
          ))}
        </View>
      )}

      {/* === Planificador semanal === */}
      <Text style={styles.sectionTitle}>Esta semana</Text>
      <View style={styles.weekRow}>
        {DAYS_OF_WEEK.map((d) => {
          const active = d === selectedDay;
          const hasRoutine = !!ROUTINES_BY_DAY[d];
          return (
            <Pressable
              key={d}
              style={[styles.dayChip, active && styles.dayChipActive]}
              onPress={() => setSelectedDay(d)}
            >
              <Text style={[styles.dayChipLabel, active && styles.dayChipLabelActive]}>{d}</Text>
              {hasRoutine ? (
                <View style={[styles.dayDot, active && styles.dayDotActive]} />
              ) : <View style={{ height: 6 }} />}
            </Pressable>
          );
        })}
      </View>

      {/* Tarjeta de rutina del día seleccionado */}
      {routineForSelectedDay ? (
        <Pressable
          style={styles.dayRoutineCard}
          onPress={() => setRoutineDetail(routineForSelectedDay!)}
        >
          <View style={styles.dayRoutineStripe} />
          <Text style={styles.dayRoutineEmoji}>{routineForSelectedDay.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.dayRoutineDay}>{selectedDay} · rutina sugerida</Text>
            <Text style={styles.dayRoutineName}>{routineForSelectedDay.name}</Text>
            <Text style={styles.dayRoutineFocus}>{routineForSelectedDay.focus}</Text>
            <View style={styles.dayRoutineMeta}>
              <Text style={styles.dayRoutineMetaText}>
                {routineForSelectedDay.blocks.length} ejercicios · {estimateRoutineMinutes(routineForSelectedDay)} min
              </Text>
              <Text style={[styles.difficultyPill, { color: DIFFICULTY_COLOR[routineForSelectedDay.difficulty] }]}>
                {DIFFICULTY_LABEL[routineForSelectedDay.difficulty]}
              </Text>
            </View>
          </View>
        </Pressable>
      ) : (
        <View style={styles.dayRoutineCardEmpty}>
          <Text style={styles.dayRoutineEmojiEmpty}>🗓️</Text>
          <Text style={styles.dayRoutineDay}>{selectedDay}</Text>
          <Text style={styles.dayRoutineEmptyText}>Sin rutina asignada a este día.</Text>
        </View>
      )}

      {/* === Rutinas sugeridas (scroll horizontal) === */}
      <Text style={styles.sectionTitle}>Rutinas sugeridas</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: spacing.lg, gap: spacing.md, paddingBottom: spacing.sm }}
      >
        {ROUTINES.map((r) => (
          <Pressable
            key={r.id}
            style={styles.routineCardH}
            onPress={() => setRoutineDetail(r)}
          >
            <View style={[styles.routineCardStripe, { backgroundColor: DIFFICULTY_COLOR[r.difficulty] }]} />
            <Text style={styles.routineEmoji}>{r.emoji}</Text>
            <Text style={styles.routineName} numberOfLines={1}>{r.name}</Text>
            <Text style={styles.routineFocus} numberOfLines={2}>{r.focus}</Text>
            <View style={styles.routineMetaRow}>
              <Text style={styles.routineMetaText}>
                {r.dayOfWeek === "any" ? "Cualquier día" : r.dayOfWeek}
              </Text>
              <Text style={styles.routineMetaText}>· {estimateRoutineMinutes(r)} min</Text>
            </View>
            <Text style={styles.routineSets}>{summarizeSetsReps(r)}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Mi rutina personal */}
      <Pressable style={styles.personalBtn} onPress={() => setShowPersonalEditor(true)}>
        <Text style={styles.personalEmoji}>✏️</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.personalTitle}>Mi rutina personal</Text>
          <Text style={styles.personalSub}>
            {personalRoutine.length === 0
              ? "Crea una rutina a medida: elige ejercicios, sets, reps y peso."
              : `${personalRoutine.length} ejercicios en tu rutina`}
          </Text>
        </View>
        <Text style={styles.personalCaret}>›</Text>
      </Pressable>

      {/* Doble progresión */}
      {suggestions.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Próxima sesión sugerida</Text>
          {suggestions.map(s => (
            <View key={s.exerciseId} style={styles.suggRow}>
              <Text style={styles.suggName}>{s.name}</Text>
              <Text style={[
                styles.suggRec,
                { color: s.recommendation === "increase_weight" ? colors.ok : s.recommendation === "maintain" ? colors.warning : colors.concentric }
              ]}>
                {s.nextWeight}kg × {s.nextTargetReps} reps
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Tools */}
      <Text style={styles.sectionTitle}>Herramientas</Text>
      <View style={styles.toolsRow}>
        <Pressable style={styles.toolBtn} onPress={() => setShowTool("plate")}>
          <Text style={styles.toolEmoji}>⚖️</Text>
          <Text style={styles.toolText}>Discos</Text>
        </Pressable>
        <Pressable style={styles.toolBtn} onPress={() => setShowTool("hiit")}>
          <Text style={styles.toolEmoji}>⏱️</Text>
          <Text style={styles.toolText}>HIIT</Text>
        </Pressable>
        <Pressable style={styles.toolBtn} onPress={() => setShowTool("rest")}>
          <Text style={styles.toolEmoji}>😴</Text>
          <Text style={styles.toolText}>Descanso</Text>
        </Pressable>
        <Pressable style={styles.toolBtn} onPress={() => setShowTool("heatmap")}>
          <Text style={styles.toolEmoji}>🔥</Text>
          <Text style={styles.toolText}>Heatmap</Text>
        </Pressable>
      </View>

      {/* Historial */}
      <Text style={styles.sectionTitle}>Historial</Text>
      {workouts.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={{ fontSize: 44, marginBottom: spacing.md }}>🏋️</Text>
          <Text style={styles.emptyStateTitle}>Sin entrenos aún</Text>
          <Text style={styles.emptyStateText}>
            Empieza siguiendo una rutina sugerida arriba, o ve a la pestaña Coach para tu primera sesión con análisis de postura.
          </Text>
        </View>
      )}
      <FlatList
        data={workouts}
        scrollEnabled={false}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.workoutCard}
            onPress={() => { setSelectedWorkoutId(item.id); setShowTool("summary"); }}
          >
            <View style={styles.workoutHeader}>
              <Text style={styles.workoutName}>{item.name}</Text>
              <Text style={styles.workoutDate}>
                {new Date(item.started_at).toLocaleDateString()}
              </Text>
            </View>
            <View style={styles.workoutStats}>
              <Text style={styles.workoutStat}>{Math.round(item.total_volume)} kg</Text>
              <Text style={styles.workoutStat}>{item.sets_count} series</Text>
              {item.duration_sec && (
                <Text style={styles.workoutStat}>{Math.floor(item.duration_sec / 60)} min</Text>
              )}
            </View>
            {item.status === "in_progress" && (
              <Text style={styles.inProgress}>EN CURSO</Text>
            )}
          </Pressable>
        )}
      />

      {/* === Modal: detalle de rutina === */}
      <Modal visible={routineDetail !== null} animationType="slide" transparent={false}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setRoutineDetail(null)} hitSlop={12}>
              <Text style={styles.closeText}>‹ Cerrar</Text>
            </Pressable>
            <Text style={styles.modalTitleSmall}>Rutina</Text>
            <View style={{ width: 60 }} />
          </View>
          {routineDetail && <RoutineDetail routine={routineDetail} />}
        </View>
      </Modal>

      {/* === Modal: editor de rutina personal === */}
      <Modal visible={showPersonalEditor} animationType="slide" transparent={false}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowPersonalEditor(false)} hitSlop={12}>
              <Text style={styles.closeText}>‹ Cerrar</Text>
            </Pressable>
            <Text style={styles.modalTitleSmall}>Mi rutina</Text>
            <Pressable onPress={() => setShowExercisePicker(true)} hitSlop={12}>
              <Text style={styles.addBtnText}>+ Añadir</Text>
            </Pressable>
          </View>
          <PersonalRoutineEditor
            blocks={personalRoutine}
            onChange={setPersonalRoutine}
            onAdd={() => setShowExercisePicker(true)}
          />
        </View>
      </Modal>

      {/* === Modal: picker de ejercicio para rutina personal === */}
      <Modal visible={showExercisePicker} animationType="slide" transparent={false}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowExercisePicker(false)} hitSlop={12}>
              <Text style={styles.closeText}>‹ Cerrar</Text>
            </Pressable>
            <Text style={styles.modalTitleSmall}>Añadir ejercicio</Text>
            <View style={{ width: 60 }} />
          </View>
          <ExercisePicker
            onPick={(preset) => {
              setPersonalRoutine(prev => [
                ...prev,
                { uid: uid(), exerciseId: preset.id, sets: 3, reps: "10-12", weightKg: 20 }
              ]);
              setShowExercisePicker(false);
            }}
          />
        </View>
      </Modal>

      {/* === Tool modals (existentes) === */}
      <Modal visible={showTool !== null} animationType="slide" transparent={false}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {showTool === "plate" && "Calculadora de discos"}
              {showTool === "hiit" && "Modo HIIT"}
              {showTool === "rest" && "Cronómetro de descanso"}
              {showTool === "heatmap" && "Mapa de calor muscular"}
              {showTool === "summary" && "Resumen de entreno"}
            </Text>
            <Pressable onPress={() => setShowTool(null)}>
              <Text style={styles.closeText}>Cerrar</Text>
            </Pressable>
          </View>
          <ScrollView>
            {showTool === "plate" && <PlateCalculator />}
            {showTool === "hiit" && <HIITTimer />}
            {showTool === "rest" && <RestTimer suggestedSec={90} />}
            {showTool === "heatmap" && (
              <>
                <MuscleRecoveryCard />
                <View style={{ height: spacing.md }} />
                <MuscleHeatMap />
              </>
            )}
            {showTool === "summary" && selectedWorkoutId && (
              <PostWorkoutSummary workoutId={selectedWorkoutId} onClose={() => setShowTool(null)} />
            )}
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
};

// ============================================================================
// Sub-pantalla: detalle de rutina
// ============================================================================
const RoutineDetail: React.FC<{ routine: Routine }> = ({ routine }) => {
  const totalMin = estimateRoutineMinutes(routine);
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
      <View style={styles.detailHeaderCard}>
        <Text style={styles.detailEmoji}>{routine.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.detailName}>{routine.name}</Text>
          <Text style={styles.detailFocus}>{routine.focus}</Text>
          <View style={styles.detailMetaRow}>
            <Text style={styles.detailMetaPill}>
              {routine.dayOfWeek === "any" ? "Cualquier día" : routine.dayOfWeek}
            </Text>
            <Text style={styles.detailMetaPill}>{routine.blocks.length} ejercicios</Text>
            <Text style={styles.detailMetaPill}>~{totalMin} min</Text>
            <Text style={[styles.detailMetaPill, { color: DIFFICULTY_COLOR[routine.difficulty], borderColor: DIFFICULTY_COLOR[routine.difficulty] }]}>
              {DIFFICULTY_LABEL[routine.difficulty]}
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Bloques</Text>
      {routine.blocks.map((b, i) => (
        <RoutineBlockRow key={`${b.exerciseId}_${i}`} block={b} index={i + 1} />
      ))}

      <View style={styles.tipCard}>
        <Text style={styles.tipEmoji}>💡</Text>
        <Text style={styles.tipText}>
          Para cada bloque, abre la pestaña Coach y selecciona el ejercicio para que el AI vigile tu postura en vivo.
        </Text>
      </View>
    </ScrollView>
  );
};

const RoutineBlockRow: React.FC<{ block: RoutineBlock; index: number }> = ({ block, index }) => {
  const preset = EXERCISE_PRESETS[block.exerciseId];
  return (
    <View style={styles.blockCard}>
      <View style={styles.blockIndex}>
        <Text style={styles.blockIndexText}>{index}</Text>
      </View>
      <Text style={styles.blockEmoji}>{block.emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.blockName}>{block.name}</Text>
        <View style={styles.blockStatsRow}>
          <Text style={styles.blockStat}>{block.sets} series</Text>
          <Text style={styles.blockStat}>· {block.reps} reps</Text>
          {block.restSec > 0 && (
            <Text style={styles.blockStat}>· {block.restSec}s descanso</Text>
          )}
        </View>
        {block.notes ? (
          <Text style={styles.blockNotes}>📝 {block.notes}</Text>
        ) : null}
        {preset?.calibrationHint ? (
          <Text style={styles.blockHint}>🎯 {preset.calibrationHint}</Text>
        ) : null}
      </View>
    </View>
  );
};

// ============================================================================
// Sub-pantalla: editor de rutina personal
// ============================================================================
const PersonalRoutineEditor: React.FC<{
  blocks: PersonalBlock[];
  onChange: (b: PersonalBlock[]) => void;
  onAdd: () => void;
}> = ({ blocks, onChange, onAdd }) => {
  if (blocks.length === 0) {
    return (
      <View style={styles.personalEmpty}>
        <Text style={{ fontSize: 48, marginBottom: spacing.md }}>📋</Text>
        <Text style={styles.personalEmptyTitle}>Tu rutina está vacía</Text>
        <Text style={styles.personalEmptyText}>
          Añade ejercicios con sus sets, reps y peso. La rutina se guarda mientras navegas.
        </Text>
        <Pressable style={styles.personalAddBtn} onPress={onAdd}>
          <Text style={styles.personalAddBtnText}>+ Añadir primer ejercicio</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
      {blocks.map((b, i) => {
        const preset = EXERCISE_PRESETS[b.exerciseId];
        return (
          <View key={b.uid} style={styles.peBlock}>
            <View style={styles.peBlockHeader}>
              <Text style={styles.peEmoji}>{preset?.emoji ?? "🏋️"}</Text>
              <Text style={styles.peName}>{preset?.name ?? b.exerciseId}</Text>
              <Pressable onPress={() => onChange(blocks.filter((_, idx) => idx !== i))} hitSlop={10}>
                <Text style={styles.peRemove}>✕ Eliminar</Text>
              </Pressable>
            </View>
            <View style={styles.peFields}>
              <PeField
                label="Sets"
                value={String(b.sets)}
                onDec={() => onChange(blocks.map((x, idx) => idx === i ? { ...x, sets: Math.max(1, x.sets - 1) } : x))}
                onInc={() => onChange(blocks.map((x, idx) => idx === i ? { ...x, sets: x.sets + 1 } : x))}
              />
              <PeField
                label="Reps"
                value={b.reps}
                onDec={() => {
                  const n = parseInt(b.reps, 10);
                  if (Number.isFinite(n)) onChange(blocks.map((x, idx) => idx === i ? { ...x, reps: String(Math.max(1, n - 1)) } : x));
                }}
                onInc={() => {
                  const n = parseInt(b.reps, 10);
                  if (Number.isFinite(n)) onChange(blocks.map((x, idx) => idx === i ? { ...x, reps: String(n + 1) } : x));
                }}
              />
              <PeField
                label="Peso (kg)"
                value={b.weightKg.toFixed(1)}
                onDec={() => onChange(blocks.map((x, idx) => idx === i ? { ...x, weightKg: Math.max(0, +(x.weightKg - 2.5).toFixed(1)) } : x))}
                onInc={() => onChange(blocks.map((x, idx) => idx === i ? { ...x, weightKg: +(x.weightKg + 2.5).toFixed(1) } : x))}
              />
            </View>
          </View>
        );
      })}
      <Pressable style={styles.personalAddBtnInline} onPress={onAdd}>
        <Text style={styles.personalAddBtnText}>+ Añadir otro ejercicio</Text>
      </Pressable>
    </ScrollView>
  );
};

const PeField: React.FC<{
  label: string; value: string;
  onDec: () => void; onInc: () => void;
}> = ({ label, value, onDec, onInc }) => (
  <View style={styles.peField}>
    <Text style={styles.peFieldLabel}>{label}</Text>
    <View style={styles.peFieldStepper}>
      <Pressable style={styles.peFieldBtn} onPress={onDec}><Text style={styles.peFieldBtnSign}>−</Text></Pressable>
      <Text style={styles.peFieldValue}>{value}</Text>
      <Pressable style={styles.peFieldBtn} onPress={onInc}><Text style={styles.peFieldBtnSign}>+</Text></Pressable>
    </View>
  </View>
);

// ============================================================================
// Picker de ejercicio (lista plana con emoji + nombre + músculo)
// ============================================================================
const ExercisePicker: React.FC<{ onPick: (p: ExercisePreset) => void }> = ({ onPick }) => {
  const [query, setQuery] = useState("");
  const all = useMemo(() => Object.values(EXERCISE_PRESETS), []);
  const filtered = useMemo(() => {
    if (!query.trim()) return all;
    const q = query.toLowerCase();
    return all.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.primaryMuscle.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q)
    );
  }, [all, query]);

  return (
    <View style={{ flex: 1, padding: spacing.lg }}>
      <TextInput
        style={styles.searchInput}
        placeholder="Buscar ejercicio…"
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={setQuery}
        autoFocus
      />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.dim }} />}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }: { pressed: boolean }) => [styles.pickerRow, pressed && styles.pickerRowPressed]}
            onPress={() => onPick(item)}
          >
            <Text style={styles.pickerEmoji}>{item.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.pickerName}>{item.name}</Text>
              <Text style={styles.pickerMuscle}>{item.primaryMuscle}</Text>
            </View>
            <Text style={styles.pickerCaret}>›</Text>
          </Pressable>
        )}
      />
    </View>
  );
};

// ============================================================================
// Helpers
// ============================================================================
function currentDayOfWeek(): string {
  // America/Lima = UTC-5 sin DST. Calculamos el día de la semana en Lima
  // usando UTC + offset manual (sin depender del Intl ni del timezone del
  // dispositivo, que puede estar mal configurado).
  const now = new Date();
  const utcHours = now.getUTCHours();    // 0..23
  const utcDay = now.getUTCDay();        // 0=Dom .. 6=Sáb
  // Lima está 5 horas detrás de UTC: si en UTC aún no han pasado las 05:00,
  // en Lima todavía es el día anterior.
  const limaDay = utcHours < 5 ? (utcDay + 6) % 7 : utcDay; // +6 ≡ -1 mod 7
  const map = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return map[limaDay] ?? "Lun";
}

// ============================================================================
// Styles
// ============================================================================
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { color: colors.bright, fontSize: 32, fontWeight: "900", letterSpacing: -0.5 },
  subtitle: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.lg },

  // Alertas deload
  alertCard: { backgroundColor: "rgba(245, 158, 11, 0.12)", borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.warning },
  alertTitle: { color: colors.warning, fontWeight: "800", fontSize: 14, marginBottom: 4 },
  alertText: { color: colors.bright, fontSize: 13, marginTop: 4 },

  // Sección
  sectionTitle: { color: colors.bright, fontSize: 14, fontWeight: "800", letterSpacing: 1, marginBottom: spacing.md, marginTop: spacing.lg },

  // Planificador semanal
  weekRow: {
    flexDirection: "row", gap: 6, marginBottom: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.sm
  },
  dayChip: {
    flex: 1, alignItems: "center", paddingVertical: 10,
    borderRadius: radius.md, gap: 4
  },
  dayChipActive: { backgroundColor: colors.accent },
  dayChipLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "800" },
  dayChipLabelActive: { color: colors.bg },
  dayDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textDim },
  dayDotActive: { backgroundColor: colors.bg },

  // Tarjeta rutina del día
  dayRoutineCard: {
    flexDirection: "row", gap: spacing.md, alignItems: "center",
    backgroundColor: colors.surfaceElevated, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.accent,
    marginBottom: spacing.lg, overflow: "hidden", position: "relative"
  },
  dayRoutineCardEmpty: {
    alignItems: "center", padding: spacing.lg,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.dim, marginBottom: spacing.lg, gap: spacing.sm
  },
  dayRoutineStripe: {
    position: "absolute", left: 0, top: 0, bottom: 0, width: 4,
    backgroundColor: colors.accent
  },
  dayRoutineEmoji: { fontSize: 40 },
  dayRoutineEmojiEmpty: { fontSize: 36 },
  dayRoutineDay: { color: colors.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  dayRoutineName: { color: colors.bright, fontSize: 18, fontWeight: "900", marginTop: 2 },
  dayRoutineFocus: { color: colors.text, fontSize: 13, marginTop: 2 },
  dayRoutineMeta: { flexDirection: "row", gap: spacing.md, marginTop: 6, alignItems: "center" },
  dayRoutineMetaText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  dayRoutineEmptyText: { color: colors.textMuted, fontSize: 13, textAlign: "center" },
  difficultyPill: { fontSize: 11, fontWeight: "800", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: colors.surface, overflow: "hidden" },

  // Tarjetas horizontales de rutinas sugeridas
  routineCardH: {
    width: 180, backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.dim,
    position: "relative", overflow: "hidden"
  },
  routineCardStripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  routineEmoji: { fontSize: 32, marginBottom: 4 },
  routineName: { color: colors.bright, fontSize: 15, fontWeight: "800" },
  routineFocus: { color: colors.textMuted, fontSize: 12, marginTop: 2, minHeight: 32 },
  routineMetaRow: { flexDirection: "row", gap: 4, marginTop: 6 },
  routineMetaText: { color: colors.text, fontSize: 11, fontWeight: "700" },
  routineSets: { color: colors.accent, fontSize: 11, fontWeight: "800", marginTop: 4 },

  // Botón rutina personal
  personalBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceElevated, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.dim,
    marginVertical: spacing.lg
  },
  personalEmoji: { fontSize: 28 },
  personalTitle: { color: colors.bright, fontSize: 16, fontWeight: "800" },
  personalSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  personalCaret: { color: colors.textMuted, fontSize: 22, fontWeight: "900" },

  // Doble progresión card
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.dim },
  cardTitle: { color: colors.bright, fontSize: 14, fontWeight: "800", letterSpacing: 1, marginBottom: spacing.md },
  suggRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  suggName: { color: colors.text, fontSize: 14 },
  suggRec: { fontSize: 14, fontWeight: "800" },

  // Tools
  toolsRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  toolBtn: { flex: 1, backgroundColor: colors.surface, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center", borderWidth: 1, borderColor: colors.dim, gap: 4 },
  toolEmoji: { fontSize: 18 },
  toolText: { color: colors.accent, fontWeight: "800", fontSize: 12 },

  // Empty state
  emptyState: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", borderWidth: 1, borderColor: colors.dim, marginBottom: spacing.lg },
  emptyStateTitle: { color: colors.bright, fontSize: 18, fontWeight: "900", marginBottom: spacing.xs },
  emptyStateText: { color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 19 },

  // Historial
  workoutCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.dim },
  workoutHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  workoutName: { color: colors.bright, fontSize: 16, fontWeight: "700" },
  workoutDate: { color: colors.textMuted, fontSize: 12 },
  workoutStats: { flexDirection: "row", gap: spacing.md },
  workoutStat: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  inProgress: { color: colors.ok, fontSize: 11, fontWeight: "800", marginTop: 4 },

  // Modales
  modalContainer: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, paddingTop: spacing.xxl },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg },
  modalTitle: { color: colors.bright, fontSize: 20, fontWeight: "800" },
  modalTitleSmall: { color: colors.bright, fontSize: 18, fontWeight: "800" },
  closeText: { color: colors.accent, fontWeight: "700", fontSize: 15 },
  addBtnText: { color: colors.accent, fontWeight: "800", fontSize: 15 },

  // Detalle rutina
  detailHeaderCard: { flexDirection: "row", gap: spacing.md, alignItems: "center", backgroundColor: colors.surfaceElevated, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.accent },
  detailEmoji: { fontSize: 44 },
  detailName: { color: colors.bright, fontSize: 22, fontWeight: "900" },
  detailFocus: { color: colors.text, fontSize: 13, marginTop: 2 },
  detailMetaRow: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  detailMetaPill: { color: colors.text, fontSize: 11, fontWeight: "700", backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, overflow: "hidden", borderWidth: 1, borderColor: colors.dim },

  // Bloque de rutina
  blockCard: { flexDirection: "row", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.dim },
  blockIndex: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  blockIndexText: { color: colors.bg, fontSize: 13, fontWeight: "900" },
  blockEmoji: { fontSize: 28 },
  blockName: { color: colors.bright, fontSize: 16, fontWeight: "800" },
  blockStatsRow: { flexDirection: "row", gap: 4, marginTop: 4, flexWrap: "wrap" },
  blockStat: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  blockNotes: { color: colors.text, fontSize: 12, marginTop: 4, lineHeight: 17 },
  blockHint: { color: colors.concentric, fontSize: 12, marginTop: 4, lineHeight: 17 },

  // Tip card
  tipCard: { flexDirection: "row", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.lg, borderWidth: 1, borderColor: colors.dim },
  tipEmoji: { fontSize: 22 },
  tipText: { color: colors.textMuted, fontSize: 12, flex: 1, lineHeight: 17 },

  // Editor rutina personal
  personalEmpty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  personalEmptyTitle: { color: colors.bright, fontSize: 18, fontWeight: "900" },
  personalEmptyText: { color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 19 },
  personalAddBtn: { backgroundColor: colors.accent, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.lg, marginTop: spacing.lg },
  personalAddBtnInline: { backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.lg, alignItems: "center", marginTop: spacing.lg, borderWidth: 1, borderColor: colors.accent },
  personalAddBtnText: { color: colors.accent, fontWeight: "800", fontSize: 14 },

  peBlock: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.dim },
  peBlockHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm },
  peEmoji: { fontSize: 24 },
  peName: { color: colors.bright, fontSize: 15, fontWeight: "800", flex: 1 },
  peRemove: { color: colors.error, fontSize: 12, fontWeight: "700" },
  peFields: { flexDirection: "row", gap: spacing.sm },
  peField: { flex: 1 },
  peFieldLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 0.6, marginBottom: 4, textTransform: "uppercase" },
  peFieldStepper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.dim, borderRadius: radius.md, padding: 4 },
  peFieldBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  peFieldBtnSign: { color: colors.bright, fontSize: 18, fontWeight: "900" },
  peFieldValue: { color: colors.bright, fontSize: 16, fontWeight: "800", minWidth: 50, textAlign: "center" },

  // Picker
  searchInput: {
    backgroundColor: colors.surface, color: colors.bright, fontSize: 15,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.dim, marginBottom: spacing.md
  },
  pickerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  pickerRowPressed: { backgroundColor: colors.surface },
  pickerEmoji: { fontSize: 24 },
  pickerName: { color: colors.bright, fontSize: 15, fontWeight: "700" },
  pickerMuscle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  pickerCaret: { color: colors.textMuted, fontSize: 20, fontWeight: "900" }
});
