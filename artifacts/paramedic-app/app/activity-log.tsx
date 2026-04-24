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

const ACTION_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  accepted: { icon: "checkmark-circle", color: "#22C55E", label: "accepted" },
  dismissed: { icon: "close-circle", color: "#EF4444", label: "dismissed" },
  unanswered: { icon: "time", color: "#F97316", label: "unanswered" },
  completed: { icon: "flag", color: "#3B82F6", label: "completed" },
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

      // Group by week
      const grouped: Record<string, MissionActivityLog[]> = {};
      activitiesList.forEach((activity) => {
        const weekKey = activity.weekKey || "Unbekannt";
        if (!grouped[weekKey]) {
          grouped[weekKey] = [];
        }
        grouped[weekKey].push(activity);
      });

      setGroupedActivities(grouped);

      // Expand current week by default
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
      <View style={[styles.container, { backgroundColor: theme.background, paddingTop: topPad + 20 }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  const weekKeys = Object.keys(groupedActivities).sort().reverse();

  if (weekKeys.length === 0) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background }]}
        contentContainerStyle={{
          paddingTop: topPad + 20,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 16,
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
        }}
      >
        <Ionicons name="time-outline" size={64} color={theme.textTertiary} />
        <Text style={[styles.emptyTitle, { color: theme.text }]}>
          {t("activityLog.noActivity", lang)}
        </Text>
        <Text style={[styles.emptySubtitle, { color: theme.textTertiary }]}>
          {t("activityLog.noActivityDesc", lang)}
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={{
        paddingTop: topPad + 20,
        paddingBottom: insets.bottom + 100,
        paddingHorizontal: 16,
      }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={loadActivities} tintColor={theme.tint} />
      }
    >
      <View style={[styles.header, { borderBottomColor: theme.cardBorder }]}>
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

      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        {activities.length} {t("adminActivity.totalLogs", lang)}
      </Text>

      {weekKeys.map((weekKey) => {
        const weekActivities = groupedActivities[weekKey];
        const isExpanded = expandedWeeks.has(weekKey);

        return (
          <View
            key={weekKey}
            style={[styles.weekCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
          >
            <Pressable onPress={() => toggleWeek(weekKey)} style={styles.weekHeader}>
              <View style={styles.weekHeaderLeft}>
                <Ionicons
                  name={isExpanded ? "chevron-down" : "chevron-forward"}
                  size={20}
                  color={theme.textSecondary}
                />
                <Text style={[styles.weekTitle, { color: theme.text }]}>
                  {t("activityLog.week", lang)} {weekKey}
                </Text>
                <View style={[styles.countBadge, { backgroundColor: theme.tintLight }]}>
                  <Text style={[styles.countText, { color: theme.tint }]}>{weekActivities.length}</Text>
                </View>
              </View>
            </Pressable>

            {isExpanded && (
              <View style={styles.activitiesList}>
                {weekActivities.map((activity, index) => {
                  const actionConfig = ACTION_CONFIG[activity.action] || ACTION_CONFIG.unanswered;

                  return (
                    <View
                      key={activity.id}
                      style={[
                        styles.activityItem,
                        { borderBottomColor: theme.cardBorder },
                        index === weekActivities.length - 1 && { borderBottomWidth: 0 },
                      ]}
                    >
                      <View
                        style={[
                          styles.iconContainer,
                          { backgroundColor: actionConfig.color + "20" },
                        ]}
                      >
                        <Ionicons
                          name={actionConfig.icon as any}
                          size={18}
                          color={actionConfig.color}
                        />
                      </View>

                      <View style={styles.activityContent}>
                        <Text style={[styles.activityTitle, { color: theme.text }]}>
                          {activity.missionTitle || "Mission"}
                        </Text>
                        <Text style={[styles.activityDetails, { color: theme.textSecondary }]}>
                          {t("activityLog.actions.accepted", lang)} • {formatDate(activity.createdAt)}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    marginLeft: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 32,
  },
  weekCard: {
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  weekHeader: {
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  weekHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  weekTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  countText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  activitiesList: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  activityDetails: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
});
