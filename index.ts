// OBLIGATORIO: react-native-gesture-handler debe importarse ANTES que cualquier
// otro módulo en RN 0.74+ con New Architecture. Sin esto, los Pressable y
// Touchable de toda la app no reciben eventos de toque (botones no responden).
// Esto es la causa raíz del bug "la app se queda pegada en pantalla de permiso".
import "react-native-gesture-handler";

import "expo-status-bar";
import { registerRootComponent } from "expo";
import App from "./src/App";

registerRootComponent(App);
