import React from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { getTheme } from "@/constants/theme";
import { useAppStore } from "@/store/useAppStore";

const SEPARATOR = ", ";

/** Splits a comma-separated free-text value into trimmed, non-empty terms. */
export function splitTerms(value: string): string[] {
  return value.split(",").map((t) => t.trim()).filter(Boolean);
}

/** Case-insensitive check whether a term is already one of the listed entries. */
export function hasTerm(value: string, term: string): boolean {
  const needle = term.trim().toLowerCase();
  return splitTerms(value).some((t) => t.toLowerCase() === needle);
}

/**
 * Adds the term if missing, removes it if present. The text field stays the single
 * source of truth — chip selection is always derived from it, never stored separately.
 */
export function toggleTerm(value: string, term: string): string {
  const terms = splitTerms(value);
  const needle = term.trim().toLowerCase();
  const without = terms.filter((t) => t.toLowerCase() !== needle);
  if (without.length !== terms.length) return without.join(SEPARATOR);
  return [...terms, term.trim()].join(SEPARATOR);
}

interface Suggestion {
  key: string;
  label: string;
}

interface Props {
  label: string;
  value: string;
  onChange: (next: string) => void;
  suggestions: Suggestion[];
  placeholder?: string;
  multiline?: boolean;
  editable?: boolean;
}

/**
 * Free-text field with suggestion chips. Tapping a chip inserts or removes its label
 * from the text; a chip renders as active exactly when its label appears in the text.
 */
export default function ChipTextField({
  label,
  value,
  onChange,
  suggestions,
  placeholder,
  multiline = false,
  editable = true,
}: Props) {
  const themeKey = useAppStore((s) => s.theme);
  const theme = getTheme(themeKey);

  const onChipPress = (chipLabel: string) => {
    if (!editable) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(toggleTerm(value, chipLabel));
  };

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        editable={editable}
        multiline={multiline}
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          {
            backgroundColor: theme.card,
            borderColor: theme.cardBorder,
            color: theme.text,
          },
        ]}
      />
      <View style={styles.chipRow}>
        {suggestions.map((s) => {
          const active = hasTerm(value, s.label);
          return (
            <Pressable
              key={s.key}
              onPress={() => onChipPress(s.label)}
              disabled={!editable}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? theme.tint : theme.card,
                  borderColor: active ? theme.tint : theme.cardBorder,
                  opacity: editable ? 1 : 0.6,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: active ? "#fff" : theme.text },
                ]}
              >
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    minHeight: 46,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
