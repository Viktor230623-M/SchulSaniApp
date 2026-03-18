import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
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

import { useApp } from "@/context/AppContext";
import type { NotificationItem, NotificationType } from "@/models";

function notifConfig(type: NotificationType) {
  const map = {
    mission_assigned: {
      icon: "flash" as const,
      iconSet: "Ionicons",
      color: "#3B82F6",
      bg: "#EFF6FF",
    },
    mission_cancelled: {
      icon: "flash-off" as const,
      iconSet: "Ionicons",
      color: "#EF4444",
      bg: "#FEF2F2",
    },
    status_changed: {
      icon: "shield-checkmark" as const,
      iconSet: "Ionicons",
      color: "#22C55E",
      bg: "#F0FDF4",
    },
    news: {
      icon: "newspaper" as const,
      iconSet: "Ionicons",
      color: "#8B5CF6",
      bg: "#F5F3FF",
    },
    holiday: {
      icon: "calendar" as const,
      iconSet: "Ionicons",
      color: "#CA8A04",
      bg: "#FEF9C3",
    },
    reminder: {
      icon: "alarm" as const,
      iconSet: "Ionicons",
      color: "#F97316",
      bg: "#FFF7ED",
    },
  };
  return map[type] ?? map.reminder;
}

function formatTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  return `vor ${Math.floor(hours / 24)} Tagen`;
}

function NotifCard({ item }: { item: NotificationItem }) {
  const conf = notifConfig(item.type);
  return (
    <View style={[styles.card, !item.isRead && styles.cardUnread]}>
      <View style={[styles.iconWrap, { backgroundColor: conf.bg }]}>
        <Ionicons name={conf.icon as any} size={20} color={conf.color} />
      </View>
      <View style={styles.cardContent}>
        <View style={styles.cardTop}>
          <Text
            style={[styles.notifTitle, !item.isRead && styles.notifTitleUnread]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text style={styles.timeText}>{formatTimeAgo(item.createdAt)}</Text>
        </View>
        <Text style={styles.notifBody} numberOfLines={2}>
          {item.body}
        </Text>
      </View>
      {!item.isRead && <View style={styles.unreadDot} />}
    </View>
  );
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const {
    notifications,
    notificationsLoading,
    unreadCount,
    markAllRead,
    refreshNotifications,
  } = useApp();
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    setRefreshing(true);
    await refreshNotifications();
    setRefreshing(false);
  }

  async function handleMarkAllRead() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await markAllRead();
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.container}>
      <FlatList
        data={notifications}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{
          paddingTop: topPad + 20,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: 16,
          gap: 8,
          flexGrow: 1,
        }}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <View>
              <Text style={styles.heading}>Benachrichtigungen</Text>
              {unreadCount > 0 && (
                <Text style={styles.unreadHint}>{unreadCount} ungelesen</Text>
              )}
            </View>
            {unreadCount > 0 && (
              <Pressable
                onPress={handleMarkAllRead}
                style={({ pressed }) => [
                  styles.markAllBtn,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={styles.markAllText}>Alle gelesen</Text>
              </Pressable>
            )}
          </View>
        }
        ListEmptyComponent={
          !notificationsLoading ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="bell-outline"
                size={52}
                color="#D1D5DB"
              />
              <Text style={styles.emptyTitle}>Keine Benachrichtigungen</Text>
              <Text style={styles.emptySubtitle}>Du bist auf dem neuesten Stand.</Text>
            </View>
          ) : (
            <ActivityIndicator
              size="large"
              color="#22C55E"
              style={{ marginTop: 60 }}
            />
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#22C55E"
          />
        }
        renderItem={({ item }) => <NotifCard item={item} />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 12,
  },
  heading: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: "#111827",
  },
  unreadHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#22C55E",
    marginTop: 2,
  },
  markAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#F0FDF4",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  markAllText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#16A34A",
  },
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
    gap: 12,
    alignItems: "center",
  },
  cardUnread: {
    borderColor: "#BBF7D0",
    backgroundColor: "#F0FDF4",
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardContent: {
    flex: 1,
    gap: 4,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  notifTitle: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#374151",
    flex: 1,
  },
  notifTitleUnread: {
    fontFamily: "Inter_700Bold",
    color: "#111827",
  },
  timeText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#9CA3AF",
    flexShrink: 0,
  },
  notifBody: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    lineHeight: 18,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22C55E",
    alignSelf: "center",
    flexShrink: 0,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: "#374151",
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#9CA3AF",
    textAlign: "center",
  },
});
