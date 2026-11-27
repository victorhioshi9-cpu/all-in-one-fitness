/**
 * RootNavigator.tsx (Rediseño v0.4) - Navegación completa.
 *   - Bottom tabs (v0.5): Inicio, Ejercicios, Coach AI (centro), Entrenos, Nutrición
 *     (Readiness y Salud pasaron a pantallas de stack, accesibles desde Inicio y "Más")
 *   - Stack modal: Calendario, Periodización, Planificador comidas,
 *     Recomendaciones, Recordatorios, Datos (export), Mi perfil.
 *
 * Cambios v0.4:
 *   - Añadido "Mi perfil" en el menú "Más" -> abre ProfileScreen (nueva).
 *   - Limpieza de imports (ScrollView/View al inicio del archivo).
 */
import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Pressable, Text, View, ScrollView } from "react-native";
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
import { ProfileScreen } from "@/modules/profile/ProfileScreen";
import { PlanScreen } from "@/modules/plan/PlanScreen";
import { PhysiqueScreen } from "@/modules/physique/PhysiqueScreen";
import { HomeScreen } from "@/modules/home/HomeScreen";
import { ExerciseLibraryScreen } from "@/modules/library/ExerciseLibraryScreen";
import { ExerciseDetailScreen } from "@/modules/library/ExerciseDetailScreen";
import { Icon, type IconName } from "@/components/Icon";

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

const TabBarMoreScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const items: { label: string; target: string; icon: IconName }[] = [
    { label: "Mi perfil", target: "Profile", icon: "person-outline" },
    { label: "Mi plan", target: "Plan", icon: "flag-outline" },
    { label: "Readiness", target: "Readiness", icon: "pulse-outline" },
    { label: "Salud y wearables", target: "Health", icon: "heart-outline" },
    { label: "Análisis físico (foto)", target: "Physique", icon: "image-outline" },
    { label: "Calendario", target: "Calendar", icon: "calendar-outline" },
    { label: "Periodización", target: "Periodization", icon: "stats-chart-outline" },
    { label: "Plan de comidas", target: "MealPlanner", icon: "restaurant-outline" },
    { label: "Recomendaciones", target: "Recommendations", icon: "bulb-outline" },
    { label: "Recordatorios", target: "Reminders", icon: "alarm-outline" },
    { label: "Exportar datos", target: "Export", icon: "download-outline" }
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
          <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: colors.accentDim, alignItems: "center", justifyContent: "center" }}>
            <Icon name={item.icon} size={20} color={colors.accent} />
          </View>
          <Text style={{ color: colors.bright, fontSize: 16, fontWeight: "700", flex: 1 }}>{item.label}</Text>
          <Icon name="chevron-forward" size={18} color={colors.textDim} />
        </Pressable>
      ))}
    </ScrollView>
  );
};

export const RootNavigator: React.FC = () => {
  // Reference workoutStore to keep it initialized (same behavior as before).
  void useWorkoutStore();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main">
        {() => (
          <Tab.Navigator
            initialRouteName="Home"
            screenOptions={({ navigation }) => ({
              headerShown: true,
              headerStyle: { backgroundColor: colors.bg },
              headerShadowVisible: false,
              headerTintColor: colors.bright,
              headerTitleStyle: { fontWeight: "800", fontSize: 18 },
              headerTitleAlign: "left",
              headerRight: () => (
                <Pressable
                  onPress={() => navigation.navigate("More")}
                  style={{ marginRight: spacing.md }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Icon name="ellipsis-horizontal-circle-outline" size={26} color={colors.accent} />
                </Pressable>
              ),
              tabBarActiveTintColor: colors.accent,
              tabBarInactiveTintColor: colors.textMuted,
              tabBarStyle: {
                backgroundColor: colors.bg,
                borderTopColor: colors.line,
                borderTopWidth: 1,
                height: 68,
                paddingBottom: 10,
                paddingTop: 6
              },
              tabBarLabelStyle: { fontWeight: "700", fontSize: 11 }
            })}
          >
            <Tab.Screen
              name="Home"
              component={HomeScreen}
              options={{
                tabBarLabel: "Inicio",
                headerShown: false,
                tabBarIcon: ({ color, focused }) => <Icon name={focused ? "home" : "home-outline"} size={23} color={color} />
              }}
            />
            <Tab.Screen
              name="Library"
              component={ExerciseLibraryScreen}
              options={{
                tabBarLabel: "Ejercicios",
                headerShown: false,
                tabBarIcon: ({ color, focused }) => <Icon name={focused ? "body" : "body-outline"} size={23} color={color} />
              }}
            />
            <Tab.Screen
              name="Coach"
              component={CameraScreen}
              options={{
                tabBarLabel: "Coach",
                headerTitle: "Coach AI",
                tabBarIcon: ({ focused }) => (
                  <View
                    style={{
                      width: 46, height: 46, borderRadius: 23, marginTop: -14,
                      backgroundColor: colors.accent, alignItems: "center", justifyContent: "center",
                      borderWidth: 3, borderColor: colors.bg, opacity: focused ? 1 : 0.92
                    }}
                  >
                    <Icon name="camera" size={22} color="#08080c" />
                  </View>
                )
              }}
            />
            <Tab.Screen
              name="Workouts"
              component={WorkoutsScreen}
              options={{
                tabBarLabel: "Entrenos",
                headerTitle: "Entrenos",
                tabBarIcon: ({ color, focused }) => <Icon name={focused ? "barbell" : "barbell-outline"} size={23} color={color} />
              }}
            />
            <Tab.Screen
              name="Nutrition"
              component={NutritionScreen}
              options={{
                tabBarLabel: "Nutrición",
                headerTitle: "Nutrición",
                tabBarIcon: ({ color, focused }) => <Icon name={focused ? "nutrition" : "nutrition-outline"} size={23} color={color} />
              }}
            />
          </Tab.Navigator>
        )}
      </Stack.Screen>
      <Stack.Screen name="More" component={TabBarMoreScreen} options={{ presentation: "modal", headerShown: true, headerTintColor: colors.accent, headerStyle: { backgroundColor: colors.bg }, headerTitle: "Más" }} />
      <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} options={{ headerShown: true, headerTintColor: colors.accent, headerStyle: { backgroundColor: colors.bg }, headerShadowVisible: false, headerTitle: "Ejercicio" }} />
      <Stack.Screen name="Readiness" component={ReadinessScreen} options={{ presentation: "modal", headerShown: true, headerTintColor: colors.accent, headerStyle: { backgroundColor: colors.bg }, headerTitle: "Readiness" }} />
      <Stack.Screen name="Health" component={HealthConnectScreen} options={{ presentation: "modal", headerShown: true, headerTintColor: colors.accent, headerStyle: { backgroundColor: colors.bg }, headerTitle: "Salud & Wearables" }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ presentation: "modal", headerShown: true, headerTintColor: colors.accent, headerStyle: { backgroundColor: colors.bg }, headerTitle: "Mi perfil" }} />
      <Stack.Screen name="Plan" component={PlanScreen} options={{ presentation: "modal", headerShown: true, headerTintColor: colors.accent, headerStyle: { backgroundColor: colors.bg }, headerTitle: "Mi plan" }} />
      <Stack.Screen name="Physique" component={PhysiqueScreen} options={{ presentation: "modal", headerShown: true, headerTintColor: colors.accent, headerStyle: { backgroundColor: colors.bg }, headerTitle: "Análisis físico" }} />
      <Stack.Screen name="Calendar" component={CalendarScreen} options={{ presentation: "modal", headerShown: true, headerTintColor: colors.accent, headerStyle: { backgroundColor: colors.bg }, headerTitle: "Calendario" }} />
      <Stack.Screen name="Periodization" component={PeriodizationScreen} options={{ presentation: "modal", headerShown: true, headerTintColor: colors.accent, headerStyle: { backgroundColor: colors.bg }, headerTitle: "Periodización" }} />
      <Stack.Screen name="MealPlanner" component={MealPlannerScreen} options={{ presentation: "modal", headerShown: true, headerTintColor: colors.accent, headerStyle: { backgroundColor: colors.bg }, headerTitle: "Plan de comidas" }} />
      <Stack.Screen name="Recommendations" component={RecommendationsScreen} options={{ presentation: "modal", headerShown: true, headerTintColor: colors.accent, headerStyle: { backgroundColor: colors.bg }, headerTitle: "Recomendaciones" }} />
      <Stack.Screen name="Reminders" component={RemindersScreen} options={{ presentation: "modal", headerShown: true, headerTintColor: colors.accent, headerStyle: { backgroundColor: colors.bg }, headerTitle: "Recordatorios" }} />
      <Stack.Screen name="Export" component={ExportScreen} options={{ presentation: "modal", headerShown: true, headerTintColor: colors.accent, headerStyle: { backgroundColor: colors.bg }, headerTitle: "Exportar" }} />
    </Stack.Navigator>
  );
};
