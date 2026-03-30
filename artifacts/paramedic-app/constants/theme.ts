import type { AppTheme } from "@/models";

export interface ThemeColors {
  background: string;
  backgroundSecondary: string;
  backgroundTertiary: string;
  card: string;
  cardBorder: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  tint: string;
  tintLight: string;
  tintDark: string;
  tabBar: string;
  tabBarBorder: string;
  tabBarActive: string;
  tabBarInactive: string;
  inputBackground: string;
  inputBorder: string;
  danger: string;
  warning: string;
  success: string;
  overlay: string;
  shadow: string;
}

const lightTheme: ThemeColors = {
  background: "#FFFFFF",
  backgroundSecondary: "#F9FAFB",
  backgroundTertiary: "#F3F4F6",
  card: "#FFFFFF",
  cardBorder: "#E5E7EB",
  text: "#111827",
  textSecondary: "#6B7280",
  textTertiary: "#9CA3AF",
  tint: "#22C55E",
  tintLight: "#DCFCE7",
  tintDark: "#16A34A",
  tabBar: "#FFFFFF",
  tabBarBorder: "#E5E7EB",
  tabBarActive: "#22C55E",
  tabBarInactive: "#9CA3AF",
  inputBackground: "#F9FAFB",
  inputBorder: "#E5E7EB",
  danger: "#EF4444",
  warning: "#F97316",
  success: "#22C55E",
  overlay: "rgba(0,0,0,0.5)",
  shadow: "rgba(0,0,0,0.08)",
};

const darkTheme: ThemeColors = {
  background: "#0F0F0F",
  backgroundSecondary: "#1A1A1A",
  backgroundTertiary: "#242424",
  card: "#1A1A1A",
  cardBorder: "#2E2E2E",
  text: "#F9FAFB",
  textSecondary: "#9CA3AF",
  textTertiary: "#6B7280",
  tint: "#22C55E",
  tintLight: "#052E16",
  tintDark: "#16A34A",
  tabBar: "#1A1A1A",
  tabBarBorder: "#2E2E2E",
  tabBarActive: "#22C55E",
  tabBarInactive: "#6B7280",
  inputBackground: "#242424",
  inputBorder: "#2E2E2E",
  danger: "#EF4444",
  warning: "#F97316",
  success: "#22C55E",
  overlay: "rgba(0,0,0,0.7)",
  shadow: "rgba(0,0,0,0.3)",
};

const redTheme: ThemeColors = {
  background: "#FFFFFF",
  backgroundSecondary: "#FFF5F5",
  backgroundTertiary: "#FEE2E2",
  card: "#FFFFFF",
  cardBorder: "#FECACA",
  text: "#111827",
  textSecondary: "#6B7280",
  textTertiary: "#9CA3AF",
  tint: "#EF4444",
  tintLight: "#FEE2E2",
  tintDark: "#DC2626",
  tabBar: "#FFFFFF",
  tabBarBorder: "#FECACA",
  tabBarActive: "#EF4444",
  tabBarInactive: "#9CA3AF",
  inputBackground: "#FFF5F5",
  inputBorder: "#FECACA",
  danger: "#DC2626",
  warning: "#F97316",
  success: "#22C55E",
  overlay: "rgba(0,0,0,0.5)",
  shadow: "rgba(239,68,68,0.12)",
};

const tealTheme: ThemeColors = {
  background: "#F0FDFA",
  backgroundSecondary: "#CCFBF1",
  backgroundTertiary: "#99F6E4",
  card: "#FFFFFF",
  cardBorder: "#99F6E4",
  text: "#0F172A",
  textSecondary: "#475569",
  textTertiary: "#94A3B8",
  tint: "#0D9488",
  tintLight: "#CCFBF1",
  tintDark: "#0F766E",
  tabBar: "#F0FDFA",
  tabBarBorder: "#99F6E4",
  tabBarActive: "#0D9488",
  tabBarInactive: "#94A3B8",
  inputBackground: "#F0FDFA",
  inputBorder: "#99F6E4",
  danger: "#EF4444",
  warning: "#F97316",
  success: "#0D9488",
  overlay: "rgba(0,0,0,0.5)",
  shadow: "rgba(13,148,136,0.12)",
};

export const THEMES: Record<AppTheme, ThemeColors> = {
  light: lightTheme,
  dark: darkTheme,
  red: redTheme,
  teal: tealTheme,
};

export function getTheme(theme: AppTheme): ThemeColors {
  return THEMES[theme] ?? lightTheme;
}
