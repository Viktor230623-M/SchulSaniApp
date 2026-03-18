import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
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
import type { Mission, MissionPriority, MissionStatus } from "@/models";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
  });
}

function PriorityBadge({ priority }: { priority: MissionPriority }) {
  const config = {
    high: { label: "Hoch", bg: "#FEF2F2", text: "#EF4444", dot: "#EF4444" },
    medium: { label: "Mittel", bg: "#FFF7ED", text: "#F97316", dot: "#F97316" },
    low: { label: "Niedrig", bg: "#F0FDF4", text: "#22C55E", dot: "#22C55E" },
  }[priority];

  return (
    <View style={[styles.priorityBadge, { backgroundColor: config.bg }]}>
      <View style={[styles.priorityDot, { backgroundColor: config.dot }]} />
      <Text style={[styles.priorityText, { color: config.text }]}>
        {config.label}
      </Text>
    </View>
  );
}

function StatusBadge({ status }: { status: MissionStatus }) {
  const config = {
    pending: { label: "Ausstehend", bg: "#EFF6FF", text: "#3B82F6" },
    accepted: { label: "Angenommen", bg: "#F0FDF4", text: "#22C55E" },
    rejected: { label: "Abgelehnt", bg: "#FEF2F2", text: "#EF4444" },
    completed: { label: "Abgeschlossen", bg: "#F3F4F6", text: "#6B7280" },
  }[status];

  return (
    <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
      <Text style={[styles.statusBadgeText, { color: config.text }]}>
        {config.label}
      </Text>
    </View>
  );
}

function MissionCard({
  mission,
  onAccept,
  onReject,
}: {
  mission: Mission;
  onAccept: () => void;
  onReject: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleAccept() {
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await onAccept();
    setLoading(false);
  }

  async function handleReject() {
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await onReject();
    setLoading(false);
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <PriorityBadge priority={mission.priority} />
          <StatusBadge status={mission.status} />
        </View>
        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>{formatTime(mission.requestedAt)}</Text>
          <Text style={styles.dateText}>{formatDate(mission.requestedAt)}</Text>
        </View>
      </View>

      <Text style={styles.missionTitle}>{mission.title}</Text>
      <Text style={styles.missionDescription}>{mission.description}</Text>

      <View style={styles.metaRow}>
        <Feather name="map-pin" size={13} color="#9CA3AF" />
        <Text style={styles.metaText}>{mission.location}</Text>
      </View>

      {mission.patientInfo && (
        <View style={styles.metaRow}>
          <Ionicons name="person-outline" size={13} color="#9CA3AF" />
          <Text style={styles.metaText}>{mission.patientInfo}</Text>
        </View>
      )}

      {mission.status === "pending" && (
        <View style={styles.actionRow}>
          <Pressable
            onPress={handleReject}
            disabled={loading}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.rejectBtn,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#EF4444" />
            ) : (
              <>
                <Ionicons name="close" size={18} color="#EF4444" />
                <Text style={styles.rejectBtnText}>Ablehnen</Text>
              </>
            )}
          </Pressable>
          <Pressable
            onPress={handleAccept}
            disabled={loading}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.acceptBtn,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.acceptBtnText}>Annehmen</Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

export default function MissionsScreen() {
  const insets = useSafeAreaInsets();
  const { missions, missionsLoading, refreshMissions, handleAcceptMission, handleRejectMission } =
    useApp();
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    setRefreshing(true);
    await refreshMissions();
    setRefreshing(false);
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.container}>
      <FlatList
        data={missions}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{
          paddingTop: topPad + 20,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: 16,
          gap: 12,
          flexGrow: 1,
        }}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.heading}>Einsätze</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{missions.length}</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          !missionsLoading ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="ambulance"
                size={52}
                color="#D1D5DB"
              />
              <Text style={styles.emptyTitle}>Keine Einsätze</Text>
              <Text style={styles.emptySubtitle}>
                Aktuell sind keine Einsätze vorhanden.
              </Text>
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
        renderItem={({ item }) => (
          <MissionCard
            mission={item}
            onAccept={() => handleAcceptMission(item.id)}
            onReject={() => handleRejectMission(item.id)}
          />
        )}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!missions.length || true}
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
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  heading: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: "#111827",
  },
  countBadge: {
    backgroundColor: "#22C55E",
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  countText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: 8,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardHeaderLeft: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    flex: 1,
  },
  timeContainer: {
    alignItems: "flex-end",
  },
  timeText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#374151",
  },
  dateText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#9CA3AF",
  },
  priorityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  priorityText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  missionTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#111827",
  },
  missionDescription: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#9CA3AF",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
  },
  acceptBtn: {
    backgroundColor: "#22C55E",
  },
  acceptBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  rejectBtn: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  rejectBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#EF4444",
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
    paddingHorizontal: 40,
  },
});
