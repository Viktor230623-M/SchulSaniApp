import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { AuthTheme } from "@/components/AuthSurface";
import { t } from "@/constants/i18n";
import {
  PASSWORD_RULE_ORDER,
  checkPassword,
  type PasswordContext,
} from "@/constants/passwordPolicy";
import type { AppLanguage } from "@/models";

type Props = {
  password: string;
  context?: PasswordContext;
  theme: AuthTheme;
  lang: AppLanguage;
};

/**
 * Checkliste unter dem Passwortfeld. Zeigt jede Regel der Richtlinie einzeln,
 * damit nicht erst beim Absenden klar wird, was fehlt.
 *
 * Solange nichts eingegeben wurde, sind alle Regeln neutral (nicht rot) --
 * ein leeres Feld ist kein Fehler, sondern der Ausgangszustand.
 */
export function PasswordRequirements({ password, context, theme, lang }: Props) {
  const { rules } = checkPassword(password, context);
  const untouched = password.length === 0;

  return (
    <View style={styles.list} accessibilityRole="list">
      {PASSWORD_RULE_ORDER.map((key) => {
        const met = rules[key];
        const color = untouched ? theme.textTertiary : met ? theme.success : theme.textSecondary;
        return (
          <View key={key} style={styles.row} accessibilityRole="text">
            <Ionicons
              name={met ? "checkmark-circle" : "ellipse-outline"}
              size={15}
              color={color}
            />
            <Text style={[styles.label, { color }]}>{t(`auth.pwRule.${key}`, lang)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 4, marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 7 },
  label: { fontSize: 12, fontFamily: "Inter_400Regular", flexShrink: 1 },
});
