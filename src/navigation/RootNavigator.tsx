/**
 * RootNavigator.tsx (Fase 3) - Navegación completa.
 *   - Bottom tabs: Coach AI, Readiness, Salud, Entrenos, Nutrición
 *   - Stack modal: Calendario, Periodización, Planificador comidas,
 *     Recomendaciones, Recordatorios, Datos (export).
 */
import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Pressable, Text } from "react-native";
import { colors, spacing } from "@/theme/colors";

import { CameraScreen } from "@/modules/camera/CameraScreen";
import { ReadinessScreen } from "@/modules/intelligence/ReadinessScreen";
import { HealthConnectScreen } from "@/modules/health/HealthConnectScreen";
import { WorkoutsScreen } from "@/modules/entrenos/WorkoutsScreen";
import { NutritionScreen } from "@/modules/nutrition/NutritionScreen";
import { CalendarScreen } from "@/modules/calendar/CalendarScreen";
import { PeriodizationScreen } from "@/modules/periodization/PeriodizationScreen";
import { MealPlannerScreen } from "@/modules/mealPlanner/MealPlannerScreen";
import { RecommendationsScreen } from "@/modules/recommendations/RecommendationsScreen";
import { RemindersScreen } from "@/modules/reminders/localNotifications";

import { exportWorkoutAsJson, exportWorkoutAsCsv, exportFullBackupAsJson, exportTableAsCsv } from "@/modules/export/exportService";
import { openDatabase, queryAsync } from "@/modules/persistence/db";
import { useWorkoutStore } from "@/store/workoutStore";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const MoreButton: React.FC<{ onPress: () => void }> = ({ onPress }) => (
  <Pressable onPress={onPress} style={{ marginRight: spacing.md }}>
    <Text style={{ color: colors.accent, fontWeight: "800" }}>Más</Text>
  </Pressable>
);

const ExportScreen: React.FC = () => {
  return <ExportScreenImpl />;
};

const ExportScreenImpl: React.FC = () => {
  const [workouts, setWorkouts] = React.useState<any[]>([]);
  const [tables] = React.useState([
    "workouts", "sets", "rep_events", "body_metrics", "nutrition_logs",
    "hydration_logs", "health_connect_cache", "personal_records"
  ]);

  React.useEffect(() => {
    (async () => {
      const db = await openDatabase();
      const rows = await queryAsync<any>(db, "SELECT id, name, started_at FROM workouts ORDER BY started_at DESC LIMIT 10", []);
      setWorkouts(rows);
    })();
  }, []);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg }}>
      <Text style={{ color: colors.bright, fontSize: 22, fontWeight: "800", marginBottom: spacing.lg }}>Exportación</Text>

      <Text style={{ color: colors.bright, fontSize: 14, fontWeight: "700", marginBottom: spacing.sm }}>Exportar workout puntual</Text>
      {workouts.map(w => (
        <View key={w.id} style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm }}>
          <Text style={{ color: colors.text, flex: 1 }}>{w.name} ({new Date(w.started_at).toLocaleDateString()})</Text>
          <Pressable style={{ backgroundColor: colors.accent, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 6 }} onPress={() => exportWorkoutAsJson(w.id)}>
            <Text style={{ color: "#000", fontWeight: "800" }}>JSON</Text>
          </Pressable>
          <Pressable style={{ backgroundColor: colors.bgCard, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: colors.dim }} onPress={() => exportWorkoutAsCsv(w.id)}>
            <Text style={{ color: colors.bright, fontWeight: "700" }}>CSV</Text>
          </Pressable>
        </View>
      ))}

      <Text style={{ color: colors.bright, fontSize: 14, fontWeight: "700", marginTop: spacing.lg, marginBottom: spacing.sm }}>Backup completo</Text>
      <Pressable style={{ backgroundColor: colors.accent, paddingVertical: spacing.md, borderRadius: 8, alignItems: "center", marginBottom: spacing.lg }} onPress={() => exportFullBackupAsJson()}>
        <Text style={{ color: "#000", fontWeight: "800" }}>Backup completo JSON</Text>
      </Pressable>

      <Text style={{ color: colors.bright, fontSize: 14, fontWeight: "700", marginBottom: spacing.sm }}>Exportar tabla por CSV</Text>
      {tables.map(t => (
        <Pressable key={t} style={{ backgroundColor: colors.bgCard, paddingVertical: spacing.md, borderRadius: 6, marginBottom: spacing.xs, alignItems: "center", borderWidth: 1, borderColor: colors.dim }} onPress={() => exportTableAsCsv(t)}>
          <Text style={{ color: colors.bright, fontWeight: "700" }}>{t}.csv</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
};

import { ScrollView, View } from "react-native";

const TabBarMoreScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const items = [
    { label: "Calendario", target: "Calendar", emoji: "📅" },
    { label: "Periodización", target: "Periodization", emoji: "🎯" },
    { label: "Plan de comidas", target: "MealPlanner", emoji: "🍽" },
    { label: "Recomendaciones", target: "Recommendations", emoji: "💡" },
    { label: "Recordatorios", target: "Reminders", emoji: "⏰" },
    { label: "Exportar datos", target: "Export", emoji: "📤" }
  ];
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg }}>
      <Text style={{ color: colors.bright, fontSize: 28, fontWeight: "800", marginBottom: spacing.lg }}>Más</Text>
      {items.map(item => (
        <Pressable
          key={item.target}
          style={{ backgroundColor: colors.bgCard, paddingVertical: spacing.lg, paddingHorizontal: spacing.md, borderRadius: 10, marginBottom: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderColor: colors.dim }}
          onPress={() => navigation.navigate(item.target)}
        >
          <Text style={{ fontSize: 20 }}>{item.emoji}</Text>
          <Text style={{ color: colors.bright, fontSize: 16, fontWeight: "700" }}>{item.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
};

export const RootNavigator: React.FC = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main">
        {() => (
          <Tab.Navigator
            screenOptions={{
              headerShown: false,
              tabBarActiveTintColor: colors.accent,
              tabBarInactiveTintColor: colors.textMuted,
              tabBarStyle: {
                backgroundColor: colors.bg,
                borderTopColor: colors.dim,
                borderTopWidth: 1,
                height: 64,
                paddingBottom: 8
              },
              tabBarLabelStyle: { fontWeight: "700", fontSize: 11 }
            }}
          >
            <Tab.Screen name="Coach" component={CameraScreen} options={{ tabBarLabel: "Coach" }} />
            <Tab.Screen name="Readiness" component={ReadinessScreen} options={{ tabBarLabel: "Readiness" }} />
            <Tab.Screen name="Health" component={HealthConnectScreen} options={{ tabBarLabel: "Salud" }} />
            <Tab.Screen name="Workouts" component={WorkoutsScreen} options={{ tabBarLabel: "Entrenos" }} />
            <Tab.Screen name="Nutrition" component={NutritionScreen} options={{ tabBarLabel: "Nutrición" }} />
          </Tab.Navigator>
        )}
      </Stack.Screen>
      <Stack.Screen name="More" component={TabBarMoreScreen} options={{ presentation: "modal", headerShown: true, headerTintColor: colors.accent, headerStyle: { backgroundColor: colors.bg }, headerTitle: "Más" }} />
      <Stack.Screen name="Calendar" component={CalendarScreen} options={{ presentation: "modal", headerShown: true, headerTintColor: colors.accent, headerStyle: { backgroundColor: colors.bg }, headerTitle: "Calendario" }} />
      <Stack.Screen name="Periodization" component={PeriodizationScreen} options={{ presentation: "modal", headerShown: true, headerTintColor: colors.accent, headerStyle: { backgroundColor: colors.bg }, headerTitle: "Periodización" }} />
      <Stack.Screen name="MealPlanner" component={MealPlannerScreen} options={{ presentation: "modal", headerShown: true, headerTintColor: colors.accent, headerStyle: { backgroundColor: colors.bg }, headerTitle: "Plan de comidas" }} />
      <Stack.Screen name="Recommendations" component={RecommendationsScreen} options={{ presentation: "modal", headerShown: true, headerTintColor: colors.accent, headerStyle: { backgroundColor: colors.bg }, headerTitle: "Recomendaciones" }} />
      <Stack.Screen name="Reminders" component={RemindersScreen} options={{ presentation: "modal", headerShown: true, headerTintColor: colors.accent, headerStyle: { backgroundColor: colors.bg }, headerTitle: "Recordatorios" }} />
      <Stack.Screen name="Export" component={ExportScreen} options={{ presentation: "modal", headerShown: true, headerTintColor: colors.accent, headerStyle: { backgroundColor: colors.bg }, headerTitle: "Exportar" }} />
    </Stack.Navigator>
  );
};
