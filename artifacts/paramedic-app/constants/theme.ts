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

const crimsonTheme: ThemeColors = {
  background: "#000000",
  backgroundSecondary: "#0D0D0D",
  backgroundTertiary: "#1A0000",
  card: "#0D0D0D",
  cardBorder: "#3D0000",
  text: "#F5F5F5",
  textSecondary: "#A8A8A8",
  textTertiary: "#6B6B6B",
  tint: "#E8001C",
  tintLight: "#2D0008",
  tintDark: "#B0001A",
  tabBar: "#0D0D0D",
  tabBarBorder: "#3D0000",
  tabBarActive: "#E8001C",
  tabBarInactive: "#5C5C5C",
  inputBackground: "#1A0000",
  inputBorder: "#3D0000",
  danger: "#FF1744",
  warning: "#FF6D00",
  success: "#00C853",
  overlay: "rgba(0,0,0,0.85)",
  shadow: "rgba(232,0,28,0.25)",
};


const midnightTheme: ThemeColors = {
  background: "#050D1A",
  backgroundSecondary: "#0A1628",
  backgroundTertiary: "#0F2040",
  card: "#0A1628",
  cardBorder: "#1A3055",
  text: "#E8F0FE",
  textSecondary: "#8AADD4",
  textTertiary: "#4D7098",
  tint: "#3B82F6",
  tintLight: "#0C1F3D",
  tintDark: "#1D4ED8",
  tabBar: "#0A1628",
  tabBarBorder: "#1A3055",
  tabBarActive: "#3B82F6",
  tabBarInactive: "#4D7098",
  inputBackground: "#0F2040",
  inputBorder: "#1A3055",
  danger: "#EF4444",
  warning: "#F97316",
  success: "#22C55E",
  overlay: "rgba(0,0,0,0.75)",
  shadow: "rgba(59,130,246,0.2)",
};

const sunsetTheme: ThemeColors = {
  background: "#FFFBF5",
  backgroundSecondary: "#FFF3E0",
  backgroundTertiary: "#FFE8C8",
  card: "#FFFFFF",
  cardBorder: "#FDDBA6",
  text: "#1C0F00",
  textSecondary: "#7C5C3A",
  textTertiary: "#B08A64",
  tint: "#F97316",
  tintLight: "#FFF3E0",
  tintDark: "#EA580C",
  tabBar: "#FFFBF5",
  tabBarBorder: "#FDDBA6",
  tabBarActive: "#F97316",
  tabBarInactive: "#B08A64",
  inputBackground: "#FFF3E0",
  inputBorder: "#FDDBA6",
  danger: "#EF4444",
  warning: "#EAB308",
  success: "#22C55E",
  overlay: "rgba(28,15,0,0.5)",
  shadow: "rgba(249,115,22,0.15)",
};

const amethystTheme: ThemeColors = {
  background: "#FAFAFA",
  backgroundSecondary: "#F5F0FF",
  backgroundTertiary: "#EDE0FF",
  card: "#FFFFFF",
  cardBorder: "#D8B4FE",
  text: "#1A0533",
  textSecondary: "#6D4C8E",
  textTertiary: "#9C7BB5",
  tint: "#8B5CF6",
  tintLight: "#EDE0FF",
  tintDark: "#6D28D9",
  tabBar: "#FAFAFA",
  tabBarBorder: "#D8B4FE",
  tabBarActive: "#8B5CF6",
  tabBarInactive: "#9C7BB5",
  inputBackground: "#F5F0FF",
  inputBorder: "#D8B4FE",
  danger: "#EF4444",
  warning: "#F97316",
  success: "#22C55E",
  overlay: "rgba(0,0,0,0.5)",
  shadow: "rgba(139,92,246,0.15)",
};

export const THEMES: Record<AppTheme, ThemeColors> = {
  light: lightTheme,
  dark: darkTheme,
  red: redTheme,
  teal: tealTheme,
  crimson: crimsonTheme,
  midnight: midnightTheme,
  sunset: sunsetTheme,
  amethyst: amethystTheme
};

export function getTheme(theme: AppTheme): ThemeColors {
  return THEMES[theme] ?? lightTheme;
}
