/**
 * Icon.tsx - Iconos vectoriales (Ionicons de @expo/vector-icons, que ya viene
 * incluido con Expo). Sustituye a los emojis en la navegación y las tarjetas.
 */
import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/colors";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];

export const Icon: React.FC<{ name: IconName; size?: number; color?: string }> = ({
  name, size = 22, color = colors.text
}) => <Ionicons name={name} size={size} color={color} />;
