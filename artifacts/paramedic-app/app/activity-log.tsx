import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { t } from "@/constants/i18n";
import { getTheme } from "@/constants/theme";
import type { MissionActivityLog } from "@/models";
import ApiService from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";

const ACTION_CONFIG: Record<string, { icon: string; color: string }> = {
  accepted: { icon: "checkmark-circle", color: "#22C55E" },
  dismissed: { icon: "close-circle", color: "#EF4444" },
  unanswered: { icon: "time", color: "#F97316" },
  completed: { icon: "flag", color: "#3B82F6" },
};

export default function ActivityLogScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.language);
  const themeKey = useAppStore((s) => s.theme);
  const theme = getTheme(themeKey);

  const [activities, setActivities] = useState<MissionActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [groupedActivities, setGroupedActivities] = useState<Record<string, MissionActivityLog[]>>({});
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());

  const loadActivities = async () => {
    try {
      const data = await ApiService.getMyActivity();
      const activitiesList = Array.isArray(data) ? data : [];
      setActivities(activitiesList);

      const grouped: Record<string, MissionActivityLog[]> = {};
      activitiesList.forEach((activity) => {
        const weekKey = activity.weekKey || "Unbekannt";
        if (!grouped[weekKey]) {
          grouped[weekKey] = [];
        }
        grouped[weekKey].push(activity);
      });

      setGroupedActivities(grouped);

      const currentWeek = getCurrentWeekKey();
      if (grouped[currentWeek] && !expandedWeeks.has(currentWeek)) {
        setExpandedWeeks(new Set([...expandedWeeks, currentWeek]));
      }
    } catch (err) {
      console.error("Failed to load activities:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadActivities();
  }, []);

  const getCurrentWeekKey = () => {
    const now = new Date();
    const year = now.getFullYear();
    const week = getWeekNumber(now);
    return `${year}-W${week.toString().padStart(2, "0")}`;
  };

  const getWeekNumber = (date: Date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((+d - +yearStart) / 86400000 + 1) / 7);
  };

  const toggleWeek = (weekKey: string) => {
    const newExpanded = new Set(expandedWeeks);
    if (newExpanded.has(weekKey)) {
      newExpanded.delete(weekKey);
    } else {
      newExpanded.add(weekKey);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setExpandedWeeks(newExpanded);
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(lang === "de" ? "de-DE" : "en-US", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={{ paddingTop: topPad + 20, alignItems: "center", justifyContent: "center", flex: 1 }}>
          <ActivityIndicator size="large" color={theme.tint} />
        </View>
      </View>
    );
  }

  const weekKeys = Object.keys(groupedActivities).sort().reverse();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: topPad + 16,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 16,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={loadActivities} tintColor={theme.tint} />
        }
      >
        <View style={[styles.headerRow, { borderBottomColor: theme.cardBorder }]}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={28} color={theme.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {t("settings.activityLog", lang)}
          </Text>
        </View>

        {weekKeys.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Ionicons name="time-outline" size={52} color={theme.textTertiary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              {t("activityLog.noActivity", lang)}
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.textTertiary }]}>
              {t("activityLog.noActivityDesc", lang)}
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.totalText, { color: theme.textSecondary }]}>
              {activities.length} {t("adminActivity.totalLogs", lang)}
            </Text>

            {weekKeys.map((weekKey) => {
              const weekActivities = groupedActivities[weekKey];
              const isExpanded = expandedWeeks.has(weekKey);

              return (
                <View
                  key={weekKey}
                  style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
                >
                  <Pressable onPress={() => toggleWeek(weekKey)} style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <Ionicons
                        name={isExpanded ? "chevron-down" : "chevron-forward"}
                        size={20}
                        color={theme.textSecondary}
                      />
                      <Text style={[styles.cardTitle, { color: theme.text }]}>
                        {t("activityLog.week", lang)} {weekKey}
                      </Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: theme.tintLight }]}>
                      <Text style={[styles.badgeText, { color: theme.tint }]}>{weekActivities.length}</Text>
                    </View>
                  </Pressable>

                  {isExpanded && (
                    <View style={[styles.activitiesList, { borderTopColor: theme.cardBorder }]}>
                      {weekActivities.map((activity, index) => {
                        const actionConfig = ACTION_CONFIG[activity.action] || ACTION_CONFIG.unanswered;

                        return (
                          <View
                            key={activity.id}
                            style={[
                              styles.activityRow,
                              { borderBottomColor: theme.cardBorder },
                              index === weekActivities.length - 1 && { borderBottomWidth: 0 },
                            ]}
                          >
                            <View
                              style={[
                                styles.activityIcon,
                                { backgroundColor: actionConfig.color + "20" },
                              ]}
                            >
                              <Ionicons
                                name={actionConfig.icon as any}
                                size={16}
                                color={actionConfig.color}
                              />
                            </View>

                            <View style={styles.activityInfo}>
                              <Text style={[styles.activityTitle, { color: theme.text }]} numberOfLines={1}>
                                {activity.missionTitle || "Mission"}
                              </Text>
                              <Text style={[styles.activityMeta, { color: theme.textTertiary }]}>
                                {formatDate(activity.createdAt)}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
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
    gap: 4,
  },
  backButton: { padding: 4, marginLeft: -4 },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold", flex: 1 },
  totalText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 40,
    alignItems: "center",
    gap: 12,
  },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  cardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  activitiesList: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderTopWidth: 1,
    gap: 2,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 12,
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  activityInfo: { flex: 1, gap: 2 },
  activityTitle: { fontSize: 14, fontFamily: "Inter_500Medium" },
  activityMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
