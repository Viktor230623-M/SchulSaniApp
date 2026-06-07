import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { t } from "@/constants/i18n";
import { getTheme } from "@/constants/theme";
import type { IncidentReport } from "@/models";
import ApiService from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";

const LEADERSHIP_ROLES = ["admin", "cto", "sanitaeter_leitung", "sanitaeter_leitung_admin"];

export default function ReportsIndexScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.language);
  const themeKey = useAppStore((s) => s.theme);
  const user = useAppStore((s) => s.user);
  const theme = getTheme(themeKey);

  const isLeadership = LEADERSHIP_ROLES.includes(user?.role ?? "");
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mine, setMine] = useState(!isLeadership);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => { load(); }, [mine]);

  async function load() {
    try {
      const data = await ApiService.getIncidentReports(mine ? { mine: true } : {});
      setReports(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await load();
  }

  const outcomeColor = (o: string | null | undefined) => {
    if (!o) return "#9CA3AF";
    if (["ambulance_112", "hospital"].includes(o)) return "#EF4444";
    if (["sent_home", "picked_up_by_parents", "family_doctor"].includes(o)) return "#F97316";
    return "#22C55E";
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={reports}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{
          paddingTop: topPad + 16,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: 16,
          gap: 10,
          flexGrow: 1,
        }}
        ListHeaderComponent={
          <View>
            <View style={[styles.headerRow, { borderBottomColor: theme.cardBorder }]}>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
                style={styles.backBtn}
              >
                <Ionicons name="chevron-back" size={28} color={theme.text} />
              </Pressable>
              <Text style={[styles.headerTitle, { color: theme.text }]}>{t("report.reports", lang)}</Text>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push("/report/new");
                }}
                style={[styles.newBtn, { backgroundColor: theme.tint }]}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.newBtnText}>{t("report.walkin", lang)}</Text>
              </Pressable>
            </View>

            {isLeadership && (
              <View style={styles.filterRow}>
                {[
                  { label: t("news.myArticles", lang).replace("Beiträge", "Protokolle").replace("Articles", "Reports"), value: true },
                  { label: t("news.allArticles", lang).replace("Beiträge", "Protokolle").replace("Articles", "Reports"), value: false },
                ].map((opt) => (
                  <Pressable
                    key={String(opt.value)}
                    onPress={() => { setMine(opt.value); setLoading(true); }}
                    style={[
                      styles.filterBtn,
                      {
                        backgroundColor: mine === opt.value ? theme.tint : theme.card,
                        borderColor: mine === opt.value ? theme.tint : theme.cardBorder,
                      },
                    ]}
                  >
                    <Text style={[styles.filterText, { color: mine === opt.value ? "#fff" : theme.textSecondary }]}>
                      {opt.value
                        ? (lang === "de" ? "Meine Protokolle" : "My Reports")
                        : (lang === "de" ? "Alle Protokolle" : "All Reports")}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 60 }} />
          ) : (
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={52} color={theme.textTertiary} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>{t("report.noReports", lang)}</Text>
              <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>{t("report.noReportsDesc", lang)}</Text>
            </View>
          )
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
        renderItem={({ item }) => {
          const catLabel = item.category ? t(`report.categories.${item.category}`, lang) : "—";
          const outcomeLabel = item.outcome ? t(`report.outcomes.${item.outcome}`, lang) : "—";
          const color = outcomeColor(item.outcome ?? null);
          return (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/report/${item.id}`);
              }}
              style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
            >
              <View style={styles.cardTop}>
                <View style={[styles.outcomeIndicator, { backgroundColor: color + "20", borderColor: color + "40" }]}>
                  <Ionicons
                    name={
                      item.outcome === "ambulance_112" || item.outcome === "hospital"
                        ? "warning"
                        : item.outcome === "back_to_class"
                          ? "checkmark-circle"
                          : "arrow-forward-circle"
                    }
                    size={20}
                    color={color}
                  />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                    {catLabel}
                  </Text>
                  <Text style={[styles.cardMeta, { color: theme.textSecondary }]}>
                    {outcomeLabel}
                    {item.location ? ` · ${item.location}` : ""}
                  </Text>
                </View>
                <View style={[
                  styles.statusPill,
                  { backgroundColor: item.status === "submitted" ? "#22C55E20" : theme.tintLight }
                ]}>
                  <Text style={[
                    styles.statusPillText,
                    { color: item.status === "submitted" ? "#22C55E" : theme.tint }
                  ]}>
                    {t(`report.${item.status}`, lang)}
                  </Text>
                </View>
              </View>
              <Text style={[styles.cardDate, { color: theme.textTertiary }]}>
                {new Date(item.createdAt).toLocaleDateString(lang === "de" ? "de-DE" : "en-US", {
                  day: "2-digit", month: "2-digit", year: "numeric",
                })}
                {item.missionId ? (lang === "de" ? " · Einsatz" : " · Mission") : (lang === "de" ? " · Walk-in" : " · Walk-in")}
              </Text>
            </Pressable>
          );
        }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 8,
    marginBottom: 12,
  },
  backBtn: { padding: 4, marginLeft: -4 },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold", flex: 1 },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  newBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  filterRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  filterText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  outcomeIndicator: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  cardMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  cardDate: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: "flex-start" },
  statusPillText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptyDesc: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
});
