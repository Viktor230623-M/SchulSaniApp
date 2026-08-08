import type { ViewStyle } from "react-native";

import type { ThemeColors } from "@/constants/theme";

export function appleCardStyle(theme: ThemeColors): ViewStyle {
  return {
    backgroundColor: theme.card,
    borderColor: theme.cardBorder,
    borderWidth: 1,
    borderRadius: 20,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 2,
  };
}
