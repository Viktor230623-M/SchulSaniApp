import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { getTheme } from "@/constants/theme";
import { useAppStore } from "@/store/useAppStore";

interface Props {
  value: Date;
  onChange: (date: Date) => void;
  label?: string;
}

const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export function DatePickerField({ value, onChange, label }: Props) {
  const themeKey = useAppStore((s) => s.theme);
  const theme = getTheme(themeKey);
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date(value));

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Build calendar grid
  const firstDay = new Date(year, month, 1);
  // Monday-based: getDay() returns 0=Sun, shift so Mon=0
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const today = new Date();

  function prevMonth() {
    setViewDate(new Date(year, month - 1, 1));
  }
  function nextMonth() {
    setViewDate(new Date(year, month + 1, 1));
  }
  function select(day: number) {
    const selected = new Date(year, month, day);
    onChange(selected);
    setOpen(false);
  }

  return (
    <>
      <Pressable
        onPress={() => { setViewDate(new Date(value)); setOpen(true); }}
        style={[styles.field, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder }]}
      >
        {label && <Text style={[styles.label, { color: theme.textTertiary }]}>{label}</Text>}
        <View style={styles.fieldRow}>
          <Text style={[styles.fieldValue, { color: theme.text }]}>{formatDate(value)}</Text>
          <Ionicons name="calendar-outline" size={18} color={theme.textTertiary} />
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="fade">
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.picker, { backgroundColor: theme.card, borderColor: theme.cardBorder }]} onPress={() => {}}>
            {/* Header */}
            <View style={styles.header}>
              <Pressable onPress={prevMonth} style={styles.navBtn}>
                <Ionicons name="chevron-back" size={20} color={theme.text} />
              </Pressable>
              <Text style={[styles.monthLabel, { color: theme.text }]}>{MONTHS[month]} {year}</Text>
              <Pressable onPress={nextMonth} style={styles.navBtn}>
                <Ionicons name="chevron-forward" size={20} color={theme.text} />
              </Pressable>
            </View>

            {/* Day headers */}
            <View style={styles.grid}>
              {DAYS.map((d) => (
                <Text key={d} style={[styles.dayHeader, { color: theme.textTertiary }]}>{d}</Text>
              ))}

              {/* Calendar cells */}
              {cells.map((day, i) => {
                if (day === null) return <View key={`e${i}`} style={styles.cell} />;
                const cellDate = new Date(year, month, day);
                const isSelected = isSameDay(cellDate, value);
                const isToday = isSameDay(cellDate, today);
                return (
                  <Pressable
                    key={day}
                    onPress={() => select(day)}
                    style={styles.cell}
                  >
                    <View style={[
                      styles.dayCircle,
                      isSelected && { backgroundColor: theme.tint },
                      !isSelected && isToday && { borderWidth: 1.5, borderColor: theme.tint },
                    ]}>
                      <Text style={[
                        styles.cellText,
                        { color: isSelected ? "#fff" : isToday ? theme.tint : theme.text },
                        isSelected && { fontFamily: "Inter_700Bold" },
                      ]}>
                        {day}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Pressable onPress={() => setOpen(false)} style={[styles.cancelBtn, { borderColor: theme.cardBorder }]}>
              <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Schließen</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: { padding: 14, borderRadius: 12, borderWidth: 1 },
  label: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 4 },
  fieldRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  fieldValue: { fontSize: 16, fontFamily: "Inter_500Medium" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  picker: { width: 320, borderRadius: 20, padding: 16, borderWidth: 1, gap: 12 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  navBtn: { padding: 8 },
  monthLabel: { fontSize: 16, fontFamily: "Inter_700Bold" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  dayHeader: { width: "14.28%", textAlign: "center", fontSize: 11, fontFamily: "Inter_600SemiBold", paddingBottom: 8 },
  cell: { width: "14.28%", aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  cellText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 34, includeFontPadding: false },
  cancelBtn: { paddingVertical: 12, borderRadius: 12, alignItems: "center", borderWidth: 1, marginTop: 4 },
  cancelText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
