import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
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
import { getTheme, type ThemeColors } from "@/constants/theme";
import type { AppLanguage, NotificationItem, NotificationType } from "@/models";
import ApiService from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";

function notifConfig(type: NotificationType) {
  const map: Record<string, { icon: React.ComponentProps<typeof Ionicons>["name"]; color: string; bg: string }> = {
    mission_assigned: { icon: "flash", color: "#3B82F6", bg: "#EFF6FF" },
    mission_cancelled: { icon: "flash-off", color: "#EF4444", bg: "#FEF2F2" },
    mission_completed: { icon: "checkmark-circle", color: "#22C55E", bg: "#F0FDF4" },
    mission_created: { icon: "flash", color: "#3B82F6", bg: "#EFF6FF" },
    status_changed: { icon: "shield-checkmark", color: "#22C55E", bg: "#F0FDF4" },
    news: { icon: "newspaper", color: "#8B5CF6", bg: "#F5F3FF" },
    loa_update: { icon: "calendar", color: "#CA8A04", bg: "#FEF9C3" },
    reminder: { icon: "alarm", color: "#F97316", bg: "#FFF7ED" },
    high_priority_alert: { icon: "warning", color: "#EF4444", bg: "#FEF2F2" },
  };
  return map[type] ?? map["reminder"]!;
}

function timeAgo(iso: string | null | undefined, lang: AppLanguage) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("time.justNow", lang);
  if (m < 60) return t("time.minutesAgo", lang).replace("{n}", String(m));
  const h = Math.floor(m / 60);
  if (h < 24) return t("time.hoursAgo", lang).replace("{n}", String(h));
  return t("time.daysAgo", lang).replace("{n}", String(Math.floor(h / 24)));
}

function HighPriorityBanner({ items, theme, lang }: { items: NotificationItem[]; theme: ThemeColors; lang: AppLanguage }) {
  if (items.length === 0) return null;
  return (
    <View style={[styles.hpSection, { backgroundColor: theme.danger + "20", borderColor: theme.danger + "40" }]}>
      <View style={styles.hpHeader}>
        <Ionicons name="warning" size={16} color={theme.danger} />
        <Text style={[styles.hpTitle, { color: theme.danger }]}>{t("notifications.highPriority", lang)}</Text>
      </View>
      {items.map((n) => (
        <View key={n.id} style={styles.hpCard}>
          <View style={[styles.hpDot, { backgroundColor: theme.danger }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.hpCardTitle, { color: theme.danger }]}>{n.title}</Text>
            <Text style={[styles.hpCardBody, { color: theme.danger }]}>{n.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function NotifCard({ item, theme, lang }: { item: NotificationItem; theme: ThemeColors; lang: AppLanguage }) {
  const conf = notifConfig(item.type);
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: !item.isRead ? theme.tint + "44" : theme.cardBorder }]}>
      <View style={[styles.iconWrap, { backgroundColor: conf.bg }]}>
        <Ionicons name={conf.icon as any} size={20} color={conf.color} />
      </View>
      <View style={styles.cardContent}>
        <View style={styles.cardTop}>
          <Text style={[styles.notifTitle, { color: theme.text, fontFamily: !item.isRead ? "Inter_700Bold" : "Inter_500Medium" }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.timeText, { color: theme.textTertiary }]}>{timeAgo(item.createdAt, lang)}</Text>
        </View>
        <Text style={[styles.notifBody, { color: theme.textSecondary }]} numberOfLines={2}>{item.body}</Text>
      </View>
      {!item.isRead && <View style={[styles.unreadDot, { backgroundColor: theme.tint }]} />}
    </View>
  );
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.language);
  const themeKey = useAppStore((s) => s.theme);
  const theme = getTheme(themeKey);
  const { notifications, notificationsLoading, setNotifications, setNotificationsLoading, markAllNotificationsRead } = useAppStore();
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => { load(); }, []);

  const [loadError, setLoadError] = useState<string | null>(null);

  async function load() {
    setNotificationsLoading(true);
    setLoadError(null);
    try {
      const data = await ApiService.getNotifications();
      setNotifications(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      setNotificationsLoading(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    try {
      await ApiService.markAllNotificationsRead();
      markAllNotificationsRead();
    } finally {
      setMarkingAll(false);
    }
  }

  const user = useAppStore((s) => s.user);
  const safeNotifications = Array.isArray(notifications) ? notifications : [];
  const highPriority = safeNotifications.filter((n) => n.priority === "high" && !n.isRead);
  const normal = safeNotifications.filter((n) => n.priority !== "high");
  const unread = safeNotifications.filter((n) => !n.isRead && n.userId === user?.id).length;
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <ErrorBoundary>
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={normal}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{
          paddingTop: topPad + 20,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: 16,
          gap: 8,
          flexGrow: 1,
        }}
        ListHeaderComponent={
          <View>
            {loadError && (
              <View style={[styles.card, { backgroundColor: theme.danger + "20", borderColor: theme.danger }]}>
                <Text style={{ color: theme.danger }}>{loadError}</Text>
                <Pressable onPress={load}><Text style={{ color: theme.danger, textDecorationLine: "underline" }}>Retry</Text></Pressable>
              </View>
            )}
            <View style={styles.headerRow}>
              <View>
                <Text style={[styles.heading, { color: theme.text }]}>{t("notifications.title", lang)}</Text>
                {unread > 0 && <Text style={[styles.unreadHint, { color: theme.tint }]}>{unread} ungelesen</Text>}
              </View>
              {unread > 0 && (
                <Pressable
                  onPress={handleMarkAllRead}
                  disabled={markingAll}
                  style={[styles.markAllBtn, { backgroundColor: theme.tintLight, borderColor: theme.tint + "44", opacity: markingAll ? 0.6 : 1 }]}
                >
                  {markingAll
                    ? <ActivityIndicator size="small" color={theme.tintDark} />
                    : <Text style={[styles.markAllText, { color: theme.tintDark }]}>{t("notifications.markAllRead", lang)}</Text>
                  }
                </Pressable>
              )}
            </View>
            <HighPriorityBanner items={highPriority} theme={theme} lang={lang} />
          </View>
        }
        ListEmptyComponent={
          !notificationsLoading ? (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="bell-outline" size={52} color={theme.textTertiary} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>{t("notifications.noNotifications", lang)}</Text>
              <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>{t("notifications.noNotificationsDesc", lang)}</Text>
            </View>
          ) : (
            <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 60 }} />
          )
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
        renderItem={({ item }) => <NotifCard item={item} theme={theme} lang={lang} />}
        showsVerticalScrollIndicator={false}
      />
    </View>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 },
  heading: { fontSize: 28, fontFamily: "Inter_700Bold" },
  unreadHint: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  markAllBtn: { paddingHorizontal: 12, paddingVertical: 11, backgroundColor: "#F0FDF4", borderRadius: 10, borderWidth: 1 },
  markAllText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  hpSection: { backgroundColor: "#FEF2F2", borderRadius: 14, padding: 14, marginBottom: 14, gap: 10, borderWidth: 1, borderColor: "#FECACA" },
  hpHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  hpTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#EF4444" },
  hpCard: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  hpDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444", marginTop: 5, flexShrink: 0 },
  hpCardTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#991B1B" },
  hpCardBody: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#DC2626", lineHeight: 16, marginTop: 2 },
  card: { flexDirection: "row", borderRadius: 14, padding: 14, borderWidth: 1, gap: 12, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  iconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  cardContent: { flex: 1, gap: 4 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  notifTitle: { fontSize: 14, flex: 1 },
  timeText: { fontSize: 11, fontFamily: "Inter_400Regular", flexShrink: 0 },
  notifBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, alignSelf: "center", flexShrink: 0 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptyDesc: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
});
