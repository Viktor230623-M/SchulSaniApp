import { requireNativeViewManager } from "expo-modules-core";
import React from "react";
import { Platform, type StyleProp, type ViewStyle } from "react-native";

export interface LiquidGlassViewProps {
  /** Radius der Glasflaeche, entspricht dem der Pille bzw. des Knopfs. */
  cornerRadius?: number;
  /** Dunkles Material fuer dunkle Themen. */
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
}

// Das Modul steckt nur in einem Dev-Build oder Store-Build. Expo Go kennt es
// nicht -- der Aufruf wirft dort, und der Fallback uebernimmt die Rezeptur aus
// GlasTabLeiste. Deshalb ist das Laden defensiv und nur auf iOS versucht.
let NativeView: React.ComponentType<LiquidGlassViewProps> | null = null;
if (Platform.OS === "ios") {
  try {
    NativeView = requireNativeViewManager("LiquidGlass");
  } catch {
    NativeView = null;
  }
}

/** True, sobald das native Glas tatsaechlich im Client steckt. */
export const nativeGlassAvailable = NativeView !== null;

export function LiquidGlassView(props: LiquidGlassViewProps) {
  if (!NativeView) return null;
  return <NativeView {...props} />;
}
