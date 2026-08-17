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
  background: "#F7F7F9",
  backgroundSecondary: "#F1F1F5",
  backgroundTertiary: "#E8E8ED",
  card: "#FFFFFF",
  cardBorder: "#D9D9DE",
  text: "#111827",
  textSecondary: "#6B7280",
  textTertiary: "#9CA3AF",
  tint: "#22C55E",
  tintLight: "#DCFCE7",
  tintDark: "#16A34A",
  tabBar: "#FFFFFF",
  tabBarBorder: "#E5E7EB",
  tabBarActive: "#22C55E",
  tabBarInactive: "#6B7280",
  inputBackground: "#F9FAFB",
  inputBorder: "#E5E7EB",
  danger: "#EF4444",
  warning: "#F97316",
  success: "#22C55E",
  overlay: "rgba(0,0,0,0.5)",
  shadow: "rgba(0,0,0,0.08)",
};

const darkTheme: ThemeColors = {
  background: "#111113",
  backgroundSecondary: "#1B1B1F",
  backgroundTertiary: "#29292E",
  card: "#1B1B1F",
  cardBorder: "#38383F",
  text: "#F9FAFB",
  textSecondary: "#9CA3AF",
  textTertiary: "#6B7280",
  tint: "#22C55E",
  tintLight: "#052E16",
  tintDark: "#16A34A",
  tabBar: "#1A1A1A",
  tabBarBorder: "#2E2E2E",
  tabBarActive: "#22C55E",
  tabBarInactive: "#8A8F99",
  inputBackground: "#242424",
  inputBorder: "#2E2E2E",
  danger: "#EF4444",
  warning: "#F97316",
  success: "#22C55E",
  overlay: "rgba(0,0,0,0.7)",
  shadow: "rgba(0,0,0,0.3)",
};

const redTheme: ThemeColors = {
  background: "#FFF8F8",
  backgroundSecondary: "#FFF0F0",
  backgroundTertiary: "#FFE4E4",
  card: "#FFFFFF",
  cardBorder: "#F2C6C6",
  text: "#111827",
  textSecondary: "#6B7280",
  textTertiary: "#9CA3AF",
  tint: "#EF4444",
  tintLight: "#FEE2E2",
  tintDark: "#DC2626",
  tabBar: "#FFFFFF",
  tabBarBorder: "#FECACA",
  tabBarActive: "#EF4444",
  tabBarInactive: "#6B7280",
  inputBackground: "#FFF5F5",
  inputBorder: "#FECACA",
  danger: "#DC2626",
  warning: "#F97316",
  success: "#22C55E",
  overlay: "rgba(0,0,0,0.5)",
  shadow: "rgba(239,68,68,0.12)",
};

const tealTheme: ThemeColors = {
  background: "#F2FBFA",
  backgroundSecondary: "#E2F5F2",
  backgroundTertiary: "#C7EAE5",
  card: "#FFFFFF",
  cardBorder: "#A7D9D2",
  text: "#0F172A",
  textSecondary: "#475569",
  textTertiary: "#94A3B8",
  tint: "#0D9488",
  tintLight: "#CCFBF1",
  tintDark: "#0F766E",
  tabBar: "#F0FDFA",
  tabBarBorder: "#99F6E4",
  tabBarActive: "#0D9488",
  tabBarInactive: "#64748B",
  inputBackground: "#F0FDFA",
  inputBorder: "#99F6E4",
  danger: "#EF4444",
  warning: "#F97316",
  success: "#0D9488",
  overlay: "rgba(0,0,0,0.5)",
  shadow: "rgba(13,148,136,0.12)",
};

const crimsonTheme: ThemeColors = {
  background: "#08090B",
  backgroundSecondary: "#121317",
  backgroundTertiary: "#211014",
  card: "#121317",
  cardBorder: "#4A2029",
  text: "#F5F5F5",
  textSecondary: "#A8A8A8",
  textTertiary: "#6B6B6B",
  tint: "#E8001C",
  tintLight: "#2D0008",
  tintDark: "#B0001A",
  tabBar: "#0D0D0D",
  tabBarBorder: "#3D0000",
  tabBarActive: "#E8001C",
  tabBarInactive: "#83838B",
  inputBackground: "#1A0000",
  inputBorder: "#3D0000",
  danger: "#FF1744",
  warning: "#FF6D00",
  success: "#00C853",
  overlay: "rgba(0,0,0,0.85)",
  shadow: "rgba(232,0,28,0.25)",
};


const midnightTheme: ThemeColors = {
  background: "#07111F",
  backgroundSecondary: "#0D1B2D",
  backgroundTertiary: "#142A46",
  card: "#0D1B2D",
  cardBorder: "#23446D",
  text: "#E8F0FE",
  textSecondary: "#8AADD4",
  textTertiary: "#4D7098",
  tint: "#3B82F6",
  tintLight: "#0C1F3D",
  tintDark: "#1D4ED8",
  tabBar: "#0A1628",
  tabBarBorder: "#1A3055",
  tabBarActive: "#3B82F6",
  tabBarInactive: "#7C97B5",
  inputBackground: "#0F2040",
  inputBorder: "#1A3055",
  danger: "#EF4444",
  warning: "#F97316",
  success: "#22C55E",
  overlay: "rgba(0,0,0,0.75)",
  shadow: "rgba(59,130,246,0.2)",
};

const sunsetTheme: ThemeColors = {
  background: "#FFFAF6",
  backgroundSecondary: "#FFF1E2",
  backgroundTertiary: "#FFE2BF",
  card: "#FFFFFF",
  cardBorder: "#F0C994",
  text: "#1C0F00",
  textSecondary: "#7C5C3A",
  textTertiary: "#B08A64",
  tint: "#F97316",
  tintLight: "#FFF3E0",
  tintDark: "#EA580C",
  tabBar: "#FFFBF5",
  tabBarBorder: "#FDDBA6",
  tabBarActive: "#F97316",
  tabBarInactive: "#8A6A48",
  inputBackground: "#FFF3E0",
  inputBorder: "#FDDBA6",
  danger: "#EF4444",
  warning: "#EAB308",
  success: "#22C55E",
  overlay: "rgba(28,15,0,0.5)",
  shadow: "rgba(249,115,22,0.15)",
};

const amethystTheme: ThemeColors = {
  background: "#FAF9FC",
  backgroundSecondary: "#F4F0FB",
  backgroundTertiary: "#E9DDF8",
  card: "#FFFFFF",
  cardBorder: "#CFB8EA",
  text: "#1A0533",
  textSecondary: "#6D4C8E",
  textTertiary: "#9C7BB5",
  tint: "#8B5CF6",
  tintLight: "#EDE0FF",
  tintDark: "#6D28D9",
  tabBar: "#FAFAFA",
  tabBarBorder: "#D8B4FE",
  tabBarActive: "#8B5CF6",
  tabBarInactive: "#7A5C96",
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

/** `#RRGGBB` als `rgba(...)` mit gegebener Deckung. Andere Schreibweisen bleiben unveraendert. */
export function withAlpha(hex: string, alpha: number): string {
  const treffer = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!treffer) return hex;
  const wert = parseInt(treffer[1]!, 16);
  return `rgba(${(wert >> 16) & 255},${(wert >> 8) & 255},${wert & 255},${alpha})`;
}

/**
 * Helligkeit nach der Wahrnehmung, nicht nach dem Mittelwert -- Gruen wiegt
 * schwerer als Blau. Damit erkennt eine Komponente ein dunkles Thema selbst,
 * statt sich auf eine gepflegte Liste von Themennamen zu verlassen, die beim
 * naechsten neuen Thema wieder falsch waere.
 */
export function istDunklesThema(hintergrund: string): boolean {
  const treffer = /^#([0-9a-f]{6})$/i.exec(hintergrund.trim());
  if (!treffer) return false;
  const wert = parseInt(treffer[1]!, 16);
  const r = ((wert >> 16) & 255) / 255;
  const g = ((wert >> 8) & 255) / 255;
  const b = (wert & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}
