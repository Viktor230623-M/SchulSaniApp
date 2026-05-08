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

import { WaveBackground } from "@/components/WaveBackground";
import { t } from "@/constants/i18n";
import { getTheme } from "@/constants/theme";
import type { ActivitySummary, User } from "@/models";
import ApiService from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";

interface ActivityUser {
  userId: string;
  userName: string;
  role: User["role"];
  totalLogs: number;
  lastActivityAt: string;
}

const ROLE_CONFIG: Record<User["role"], { label: string; bg: string; text: string }> = {
  cto: { label: "CTO", bg: "#CCFBF1", text: "#0F766E" },
  admin: { label: "Administrator", bg: "#FEF2F2", text: "#DC2626" },
  sanitaeter_leitung_admin: { label: "Sanitäter Leitung", bg: "#EFF6FF", text: "#2563EB" },
  sanitaeter_leitung: { label: "Sanitäter Leitung", bg: "#EFF6FF", text: "#2563EB" },
  teacher: { label: "Lehrer", bg: "#FFF7ED", text: "#EA580C" },
  student_paramedic: { label: "Sanitäter", bg: "#F0FDF4", text: "#16A34A" },
};

const ACTION_CONFIG: Record<string, { icon: string; color: string }> = {
  accepted: { icon: "checkmark-circle", color: "#22C55E" },
  dismissed: { icon: "close-circle", color: "#EF4444" },
  unanswered: { icon: "time", color: "#F97316" },
  completed: { icon: "flag", color: "#3B82F6" },
};

export default function SaniActivityScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.language);
  const themeKey = useAppStore((s) => s.theme);
  const theme = getTheme(themeKey);
  const user = useAppStore((s) => s.user);

  const [users, setUsers] = useState<ActivityUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [userActivities, setUserActivities] = useState<ActivitySummary[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);

  const canView = ["cto", "admin", "sanitaeter_leitung", "sanitaeter_leitung_admin"].includes(
    user?.role || ""
  );

  const loadUsers = async () => {
    try {
      const data = await ApiService.getActivityUsers();
      const transformedUsers: ActivityUser[] = (data || []).map((u: any) => ({
        userId: u.userId,
        userName: u.userName,
        role: u.role || "student_paramedic",
        totalLogs: u.activityCount || 0,
        lastActivityAt: u.lastActivity,
      }));
      setUsers(transformedUsers);
    } catch (err) {
      console.error("Failed to load activity users:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadUserActivities = async (userId: string) => {
    setLoadingActivities(true);
    try {
      const data = await ApiService.getUserActivity(userId);
      setUserActivities(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load user activities:", err);
    } finally {
      setLoadingActivities(false);
    }
  };

  useEffect(() => {
    if (canView) {
      loadUsers();
    }
  }, [canView]);

  const handleUserPress = async (userId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedUser(selectedUser === userId ? null : userId);
    if (selectedUser !== userId) {
      await loadUserActivities(userId);
    }
  };

  const formatLastActivity = (timestamp: string) => {
    if (!timestamp) return "-";
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return lang === "de" ? "Gerade eben" : "Just now";
    if (diffMins < 60) return `${diffMins} min`;
    if (diffHours < 24) return `${diffHours} h`;
    if (diffDays < 7) return `${diffDays}d`;

    return date.toLocaleDateString(lang === "de" ? "de-DE" : "en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const formatDate = (timestamp: string) => {
    if (!timestamp) return "-";
    const date = new Date(timestamp);
    return date.toLocaleDateString(lang === "de" ? "de-DE" : "en-US", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (!canView) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <WaveBackground color={theme.backgroundTertiary} />
        <ScrollView
          contentContainerStyle={{
            paddingTop: topPad + 20,
            paddingBottom: insets.bottom + 100,
            paddingHorizontal: 16,
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={loadUsers} tintColor={theme.tint} />
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
              {t("settings.saniActivity", lang)}
            </Text>
          </View>
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Ionicons name="lock-closed-outline" size={52} color={theme.danger} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Zugriff verweigert</Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              {t("common.error", lang)}
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <WaveBackground color={theme.backgroundTertiary} />
        <View style={{ paddingTop: topPad + 20, alignItems: "center", justifyContent: "center", flex: 1 }}>
          <ActivityIndicator size="large" color={theme.tint} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <WaveBackground color={theme.backgroundTertiary} />
      <ScrollView
        contentContainerStyle={{
          paddingTop: topPad + 16,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 16,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={loadUsers} tintColor={theme.tint} />
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
            {t("settings.saniActivity", lang)}
          </Text>
        </View>

        {users.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Ionicons name="people-outline" size={52} color={theme.textTertiary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              {t("adminActivity.noUsers", lang)}
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.textTertiary }]}>
              {t("adminActivity.noUsersDesc", lang)}
            </Text>
          </View>
        ) : (
          users.map((activityUser) => {
            const cfg = ROLE_CONFIG[activityUser.role] || ROLE_CONFIG.student_paramedic;
            const isExpanded = selectedUser === activityUser.userId;

            return (
              <View
                key={activityUser.userId}
                style={[
                  styles.card,
                  { backgroundColor: theme.card, borderColor: isExpanded ? theme.tint : theme.cardBorder },
                  isExpanded && styles.cardExpanded,
                ]}
              >
                <Pressable onPress={() => handleUserPress(activityUser.userId)} style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <View style={[styles.avatar, { backgroundColor: cfg.bg }]}>
                      <Text style={[styles.avatarText, { color: cfg.text }]}>
                        {activityUser.userName.split(" ").map((n) => n[0]).join("")}
                      </Text>
                    </View>
                    <View style={styles.userInfo}>
                      <Text style={[styles.userName, { color: theme.text }]}>
                        {activityUser.userName}
                      </Text>
                      <View style={[styles.roleBadge, { backgroundColor: cfg.bg }]}>
                        <Text style={[styles.roleText, { color: cfg.text }]}>{cfg.label}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.cardHeaderRight}>
                    <View style={[styles.statBadge, { backgroundColor: theme.tintLight }]}>
                      <Ionicons name="document-text-outline" size={12} color={theme.tint} />
                      <Text style={[styles.statText, { color: theme.tint }]}>{activityUser.totalLogs}</Text>
                    </View>
                    <Ionicons
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={theme.textTertiary}
                    />
                  </View>
                </Pressable>

                {isExpanded && (
                  <View style={[styles.activitiesContainer, { borderTopColor: theme.cardBorder }]}>
                    {loadingActivities ? (
                      <ActivityIndicator size="small" color={theme.tint} style={{ margin: 20 }} />
                    ) : userActivities.length === 0 ? (
                      <View style={styles.noActivities}>
                        <Text style={[styles.noActivitiesText, { color: theme.textSecondary }]}>
                          {t("activityLog.noActivity", lang)}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.activitiesList}>
                        {userActivities.map((activity, index) => {
                          const actionConfig =
                            ACTION_CONFIG[activity.action] || ACTION_CONFIG.unanswered;

                          return (
                            <View
                              key={activity.id}
                              style={[
                                styles.activityRow,
                                { borderBottomColor: theme.cardBorder },
                                index === userActivities.length - 1 && { borderBottomWidth: 0 },
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
                                  size={14}
                                  color={actionConfig.color}
                                />
                              </View>
                              <View style={styles.activityInfo}>
                                <Text
                                  style={[styles.activityTitle, { color: theme.text }]}
                                  numberOfLines={1}
                                >
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
                )}
              </View>
            );
          })
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
  cardExpanded: {
    borderWidth: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  userInfo: { flex: 1, gap: 4 },
  userName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: "flex-start" },
  roleText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  cardHeaderRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  statBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  statText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  activitiesContainer: {
    borderTopWidth: 1,
  },
  noActivities: { padding: 20, alignItems: "center" },
  noActivitiesText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  activitiesList: { paddingHorizontal: 14, paddingBottom: 10, gap: 2 },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  activityIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  activityInfo: { flex: 1, gap: 2 },
  activityTitle: { fontSize: 14, fontFamily: "Inter_500Medium" },
  activityMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
