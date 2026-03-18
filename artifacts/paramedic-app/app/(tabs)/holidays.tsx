import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
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
import type { HolidayItem } from "@/models";

type FilterType = "all" | "school" | "public";

function formatDateRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  if (start === end) {
    return s.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }
  return `${s.toLocaleDateString("de-DE", { day: "2-digit", month: "short" })} – ${e.toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" })}`;
}

function getDuration(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  if (days === 1) return "1 Tag";
  return `${days} Tage`;
}

function HolidayCard({ item }: { item: HolidayItem }) {
  const isSchool = item.type === "school";
  return (
    <View style={[styles.card, isSchool ? styles.schoolCard : styles.publicCard]}>
      <View style={styles.cardLeft}>
        <View
          style={[
            styles.typeIcon,
            { backgroundColor: isSchool ? "#DBEAFE" : "#FEF9C3" },
          ]}
        >
          {isSchool ? (
            <MaterialCommunityIcons
              name="school-outline"
              size={20}
              color="#3B82F6"
            />
          ) : (
            <Ionicons name="flag-outline" size={20} color="#CA8A04" />
          )}
        </View>
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.holidayName}>{item.name}</Text>
        <View style={styles.dateRow}>
          <Feather name="calendar" size={12} color="#9CA3AF" />
          <Text style={styles.dateText}>
            {formatDateRange(item.startDate, item.endDate)}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <View
            style={[
              styles.typeBadge,
              { backgroundColor: isSchool ? "#DBEAFE" : "#FEF9C3" },
            ]}
          >
            <Text
              style={[
                styles.typeBadgeText,
                { color: isSchool ? "#3B82F6" : "#CA8A04" },
              ]}
            >
              {isSchool ? "Schulferien" : "Feiertag"}
            </Text>
          </View>
          {item.state && (
            <Text style={styles.stateText}>{item.state}</Text>
          )}
          <Text style={styles.durationText}>
            {getDuration(item.startDate, item.endDate)}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function HolidaysScreen() {
  const insets = useSafeAreaInsets();
  const { news, newsLoading } = useApp();
  const [filter, setFilter] = useState<FilterType>("all");
  const [refreshing, setRefreshing] = useState(false);

  const [holidays, setHolidays] = React.useState<HolidayItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    import("@/services/ApiService").then(({ default: ApiService }) => {
      ApiService.getHolidays().then((data) => {
        setHolidays(data);
        setLoading(false);
      });
    });
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    const { default: ApiService } = await import("@/services/ApiService");
    const data = await ApiService.getHolidays();
    setHolidays(data);
    setRefreshing(false);
  }

  const filtered = holidays.filter(
    (h) => filter === "all" || h.type === filter
  );

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const FilterPill = ({
    label,
    value,
  }: {
    label: string;
    value: FilterType;
  }) => (
    <Pressable
      onPress={() => setFilter(value)}
      style={[styles.filterPill, filter === value && styles.filterPillActive]}
    >
      <Text
        style={[
          styles.filterPillText,
          filter === value && styles.filterPillTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <WaveBackground color="#EFF6FF" />
      <FlatList
        data={filtered}
        keyExtractor={(h) => h.id}
        contentContainerStyle={{
          paddingTop: topPad + 20,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: 16,
          gap: 10,
          flexGrow: 1,
        }}
        ListHeaderComponent={
          <View>
            <Text style={styles.heading}>Urlaub & Feiertage</Text>
            <View style={styles.filterRow}>
              <FilterPill label="Alle" value="all" />
              <FilterPill label="Schulferien" value="school" />
              <FilterPill label="Feiertage" value="public" />
            </View>
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <Feather name="calendar" size={52} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>Keine Termine</Text>
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
        renderItem={({ item }) => <HolidayCard item={item} />}
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
  heading: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: "#111827",
    marginBottom: 14,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
  },
  filterPillActive: {
    backgroundColor: "#22C55E",
  },
  filterPillText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#6B7280",
  },
  filterPillTextActive: {
    color: "#fff",
  },
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    gap: 12,
    alignItems: "flex-start",
  },
  schoolCard: {
    borderColor: "#BFDBFE",
  },
  publicCard: {
    borderColor: "#FDE68A",
  },
  cardLeft: {
    paddingTop: 2,
  },
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardContent: {
    flex: 1,
    gap: 6,
  },
  holidayName: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#111827",
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  dateText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  stateText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#9CA3AF",
  },
  durationText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
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
