import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getTheme } from "@/constants/theme";
import type { DbConsoleResult, SqlPreset } from "@/models";
import ApiService from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";

/** Mirrors the server-side gate; the API is the real guard, this only hides the UI. */
const OWNER_USER_ID = "iserv-viktor.gnjatic";

export default function DatabaseConsoleScreen() {
  const insets = useSafeAreaInsets();
  const themeKey = useAppStore((s) => s.theme);
  const theme = getTheme(themeKey);
  const user = useAppStore((s) => s.user);
  const isOwner = user?.id === OWNER_USER_ID;

  const [presets, setPresets] = useState<SqlPreset[]>([]);
  const [tables, setTables] = useState<{ table: string; approx_rows: number }[]>([]);
  const [statement, setStatement] = useState("");
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DbConsoleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  useEffect(() => {
    if (!isOwner) return;
    (async () => {
      try {
        const [p, t] = await Promise.all([ApiService.getDbPresets(), ApiService.getDbTables()]);
        setPresets(p.presets);
        setTables(t.tables);
      } catch {
        setError("Konsole konnte nicht geladen werden.");
      }
    })();
  }, [isOwner]);

  const groups = useMemo(() => {
    const map = new Map<string, SqlPreset[]>();
    for (const p of presets) {
      const list = map.get(p.group) ?? [];
      list.push(p);
      map.set(p.group, list);
    }
    return [...map.entries()];
  }, [presets]);

  /** Placeholders look like :name and must be filled in before running. */
  const openPlaceholders = useMemo(
    () => [...new Set((statement.match(/:[a-z_äöü]+/gi) ?? []))],
    [statement]
  );

  async function run(confirm: boolean) {
    if (!statement.trim()) return;
    if (openPlaceholders.length > 0) {
      Alert.alert(
        "Platzhalter offen",
        `Bitte noch ersetzen: ${openPlaceholders.join(", ")}`
      );
      return;
    }
    setRunning(true);
    setError(null);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const res = await ApiService.runDbStatement({
        statement,
        presetKey: activePreset,
        confirm,
      });
      setResult(res);
      if (res.preview && res.rowsAffected > 0) {
        Alert.alert(
          res.unbounded ? "Achtung: keine Bedingung" : "Vorschau",
          `${res.rowsAffected} Zeile(n) würden geändert.${
            res.unbounded ? "\n\nDiese Anweisung hat kein WHERE und trifft die ganze Tabelle." : ""
          }\n\nJetzt wirklich ausführen?`,
          [
            { text: "Abbrechen", style: "cancel" },
            { text: "Ausführen", style: "destructive", onPress: () => run(true) },
          ]
        );
      } else if (res.committed) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setRunning(false);
    }
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (!isOwner) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, paddingTop: topPad + 40 }]}>
        <Text style={[styles.notAllowed, { color: theme.textSecondary }]}>
          Kein Zugriff.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: topPad + 16,
          paddingBottom: insets.bottom + 80,
          paddingHorizontal: 16,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.headerRow, { borderBottomColor: theme.cardBorder }]}>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={28} color={theme.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Datenbank</Text>
        </View>

        <View style={[styles.warnBox, { backgroundColor: "#EF444415", borderColor: "#EF444455" }]}>
          <Ionicons name="warning" size={16} color="#EF4444" />
          <Text style={[styles.warnText, { color: theme.text }]}>
            Änderungen wirken sofort auf die echte Datenbank. Schreibende Befehle
            zeigen zuerst eine Vorschau. Jede Ausführung wird protokolliert.
          </Text>
        </View>

        {/* Table overview */}
        {tables.length > 0 && (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.cardTitle, { color: theme.tint }]}>Tabellen</Text>
            <View style={styles.tableWrap}>
              {tables.map((t) => (
                <View key={t.table} style={[styles.tablePill, { borderColor: theme.cardBorder }]}>
                  <Text style={[styles.tablePillName, { color: theme.text }]}>{t.table}</Text>
                  <Text style={[styles.tablePillCount, { color: theme.textSecondary }]}>
                    {t.approx_rows}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Presets */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: theme.tint }]}>Vorgefertigte Befehle</Text>
          {groups.map(([group, items]) => {
            const open = openGroup === group;
            return (
              <View key={group}>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setOpenGroup(open ? null : group);
                  }}
                  style={[styles.groupHeader, { borderBottomColor: theme.cardBorder }]}
                >
                  <Text style={[styles.groupTitle, { color: theme.text }]}>{group}</Text>
                  <Ionicons
                    name={open ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={theme.textSecondary}
                  />
                </Pressable>
                {open &&
                  items.map((p) => (
                    <Pressable
                      key={p.key}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setStatement(p.sql);
                        setActivePreset(p.key);
                        setResult(null);
                        setError(null);
                      }}
                      style={[styles.presetRow, { borderColor: theme.cardBorder }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.presetLabel,
                            { color: p.destructive ? "#EF4444" : theme.text },
                          ]}
                        >
                          {p.destructive ? "⚠ " : ""}
                          {p.label}
                        </Text>
                        <Text style={[styles.presetDesc, { color: theme.textSecondary }]}>
                          {p.description}
                        </Text>
                      </View>
                      <Ionicons name="arrow-forward" size={15} color={theme.textSecondary} />
                    </Pressable>
                  ))}
              </View>
            );
          })}
        </View>

        {/* Editor */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: theme.tint }]}>SQL</Text>
          <TextInput
            value={statement}
            onChangeText={(v) => { setStatement(v); setActivePreset(null); }}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="SELECT * FROM missions LIMIT 20"
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.editor,
              { backgroundColor: theme.background, borderColor: theme.cardBorder, color: theme.text },
            ]}
          />
          {openPlaceholders.length > 0 && (
            <Text style={[styles.placeholderHint, { color: "#F97316" }]}>
              Noch zu ersetzen: {openPlaceholders.join(", ")}
            </Text>
          )}
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => { setStatement(""); setResult(null); setError(null); setActivePreset(null); }}
              style={[styles.secondaryBtn, { borderColor: theme.cardBorder }]}
            >
              <Text style={[styles.secondaryBtnText, { color: theme.textSecondary }]}>Leeren</Text>
            </Pressable>
            <Pressable
              onPress={() => run(false)}
              disabled={running || !statement.trim()}
              style={[
                styles.runBtn,
                { backgroundColor: theme.tint, opacity: running || !statement.trim() ? 0.5 : 1 },
              ]}
            >
              {running ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="play" size={15} color="#fff" />
                  <Text style={styles.runBtnText}>Ausführen</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>

        {/* Error */}
        {error && (
          <View style={[styles.card, { backgroundColor: "#EF444415", borderColor: "#EF444455" }]}>
            <Text style={[styles.errorText, { color: "#EF4444" }]}>{error}</Text>
          </View>
        )}

        {/* Result */}
        {result && (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.cardTitle, { color: theme.tint }]}>Ergebnis</Text>
            <Text style={[styles.resultMeta, { color: theme.textSecondary }]}>
              {result.kind === "read"
                ? `${result.rows.length} Zeile(n)${result.truncated ? " (gekürzt auf 200)" : ""}`
                : result.committed
                  ? `${result.rowsAffected} Zeile(n) geändert — gespeichert`
                  : `${result.rowsAffected} Zeile(n) betroffen — Vorschau, nichts gespeichert`}
            </Text>

            {result.kind === "read" && result.rows.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View>
                  <View style={[styles.trHead, { borderBottomColor: theme.cardBorder }]}>
                    {result.fields.map((f) => (
                      <Text key={f} style={[styles.th, { color: theme.textSecondary }]}>{f}</Text>
                    ))}
                  </View>
                  {result.rows.map((row, i) => (
                    <View key={i} style={[styles.tr, { borderBottomColor: theme.cardBorder }]}>
                      {result.fields.map((f) => (
                        <Text key={f} style={[styles.td, { color: theme.text }]} numberOfLines={2}>
                          {formatCell(row[f])}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  notAllowed: { textAlign: "center", fontSize: 15, fontFamily: "Inter_500Medium" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 14,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  warnBox: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  warnText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 14 },
  cardTitle: { fontSize: 13, fontFamily: "Inter_700Bold", marginBottom: 10, letterSpacing: 0.3 },
  tableWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tablePill: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tablePillName: { fontSize: 12, fontFamily: "Inter_500Medium" },
  tablePillCount: { fontSize: 12, fontFamily: "Inter_700Bold" },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  groupTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  presetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 8,
  },
  presetLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  presetDesc: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 15 },
  editor: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    minHeight: 120,
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    textAlignVertical: "top",
  },
  placeholderHint: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 8 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  secondaryBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  runBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingVertical: 11,
  },
  runBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  errorText: { fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18 },
  resultMeta: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 10 },
  trHead: { flexDirection: "row", borderBottomWidth: 1, paddingBottom: 6 },
  th: { width: 130, fontSize: 11, fontFamily: "Inter_700Bold", paddingRight: 8 },
  tr: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 7 },
  td: { width: 130, fontSize: 11, fontFamily: "Inter_400Regular", paddingRight: 8 },
});
