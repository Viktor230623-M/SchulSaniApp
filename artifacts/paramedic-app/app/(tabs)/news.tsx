import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
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

import { WaveBackground } from "@/components/WaveBackground";
import { useApp } from "@/context/AppContext";
import type { NewsItem } from "@/models";

function categoryConfig(category: NewsItem["category"]) {
  return {
    announcement: {
      label: "Ankündigung",
      icon: "megaphone-outline" as const,
      color: "#3B82F6",
      bg: "#EFF6FF",
    },
    training: {
      label: "Training",
      icon: "fitness-outline" as const,
      color: "#8B5CF6",
      bg: "#F5F3FF",
    },
    update: {
      label: "Update",
      icon: "refresh-outline" as const,
      color: "#22C55E",
      bg: "#F0FDF4",
    },
    alert: {
      label: "Wichtig",
      icon: "alert-circle-outline" as const,
      color: "#EF4444",
      bg: "#FEF2F2",
    },
  }[category];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function NewsCard({ item }: { item: NewsItem }) {
  const [expanded, setExpanded] = useState(false);
  const cat = categoryConfig(item.category);

  return (
    <Pressable
      onPress={() => setExpanded(!expanded)}
      style={({ pressed }) => [
        styles.card,
        !item.isRead && styles.cardUnread,
        { opacity: pressed ? 0.95 : 1 },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.catBadge, { backgroundColor: cat.bg }]}>
          <Ionicons name={cat.icon} size={13} color={cat.color} />
          <Text style={[styles.catText, { color: cat.color }]}>{cat.label}</Text>
        </View>
        {!item.isRead && <View style={styles.unreadDot} />}
      </View>

      <Text style={styles.newsTitle}>{item.title}</Text>
      <Text style={styles.newsSummary}>{item.summary}</Text>

      {expanded && (
        <Text style={styles.newsContent}>{item.content}</Text>
      )}

      <View style={styles.cardFooter}>
        <View style={styles.authorRow}>
          <Ionicons name="person-outline" size={12} color="#9CA3AF" />
          <Text style={styles.authorText}>{item.author}</Text>
        </View>
        <Text style={styles.dateText}>{formatDate(item.publishedAt)}</Text>
      </View>
    </Pressable>
  );
}

export default function NewsScreen() {
  const insets = useSafeAreaInsets();
  const { news, newsLoading, refreshNews } = useApp();
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    setRefreshing(true);
    await refreshNews();
    setRefreshing(false);
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const unread = news.filter((n) => !n.isRead).length;

  return (
    <View style={styles.container}>
      <WaveBackground color="#F0FDF4" />
      <FlatList
        data={news}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{
          paddingTop: topPad + 20,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: 16,
          gap: 12,
          flexGrow: 1,
        }}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <View>
              <Text style={styles.heading}>Neuigkeiten</Text>
              {unread > 0 && (
                <Text style={styles.unreadHint}>{unread} ungelesen</Text>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          !newsLoading ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="newspaper-variant-outline"
                size={52}
                color="#D1D5DB"
              />
              <Text style={styles.emptyTitle}>Keine Neuigkeiten</Text>
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
        renderItem={({ item }) => <NewsCard item={item} />}
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
    marginBottom: 8,
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
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    gap: 8,
  },
  cardUnread: {
    borderColor: "#BBF7D0",
    backgroundColor: "#F0FDF4",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  catBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  catText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22C55E",
  },
  newsTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#111827",
  },
  newsSummary: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    lineHeight: 18,
  },
  newsContent: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#374151",
    lineHeight: 22,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    marginTop: 4,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  authorText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#9CA3AF",
  },
  dateText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#9CA3AF",
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
});
