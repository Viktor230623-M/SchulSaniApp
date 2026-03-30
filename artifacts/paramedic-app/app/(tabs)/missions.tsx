import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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
import type { Mission, MissionPriority, MissionStatus } from "@/models";
import ApiService from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";

function PriorityBadge({ priority }: { priority: MissionPriority }) {
  const cfg = {
    high: { label: "Hoch", bg: "#FEF2F2", text: "#EF4444", dot: "#EF4444" },
    medium: { label: "Mittel", bg: "#FFF7ED", text: "#F97316", dot: "#F97316" },
    low: { label: "Niedrig", bg: "#F0FDF4", text: "#22C55E", dot: "#22C55E" },
  }[priority];
  return (
    <View style={[styles.priorityBadge, { backgroundColor: cfg.bg }]}>
      <View style={[styles.priorityDot, { backgroundColor: cfg.dot }]} />
      <Text style={[styles.priorityText, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: MissionStatus }) {
  const cfg = {
    pending: { label: "Ausstehend", bg: "#EFF6FF", text: "#3B82F6" },
    accepted: { label: "Angenommen", bg: "#F0FDF4", text: "#22C55E" },
    rejected: { label: "Abgelehnt", bg: "#FEF2F2", text: "#EF4444" },
    completed: { label: "Abgeschlossen", bg: "#F3F4F6", text: "#6B7280" },
  }[status];
  return (
    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.statusBadgeText, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}

function MissionCard({ mission, onAccept, onReject, theme, lang }: any) {
  const [loading, setLoading] = useState(false);

  async function doAccept() {
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await onAccept();
    setLoading(false);
  }

  async function doReject() {
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await onReject();
    setLoading(false);
  }

  function fmt(iso: string) {
    return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      <View style={styles.cardHeader}>
        <View style={styles.badges}>
          <PriorityBadge priority={mission.priority} />
          <StatusBadge status={mission.status} />
        </View>
        <View>
          <Text style={[styles.timeText, { color: theme.text }]}>{fmt(mission.requestedAt)}</Text>
          <Text style={[styles.dateText, { color: theme.textTertiary }]}>
            {new Date(mission.requestedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "short" })}
          </Text>
        </View>
      </View>

      <Text style={[styles.missionTitle, { color: theme.text }]}>{mission.title}</Text>
      <Text style={[styles.missionDesc, { color: theme.textSecondary }]}>{mission.description}</Text>

      <View style={styles.metaRow}>
        <Feather name="map-pin" size={13} color={theme.textTertiary} />
        <Text style={[styles.metaText, { color: theme.textTertiary }]}>{mission.location}</Text>
      </View>
      {mission.patientInfo && (
        <View style={styles.metaRow}>
          <Ionicons name="person-outline" size={13} color={theme.textTertiary} />
          <Text style={[styles.metaText, { color: theme.textTertiary }]}>{mission.patientInfo}</Text>
        </View>
      )}

      {mission.status === "pending" && (
        <View style={styles.actionRow}>
          <Pressable
            onPress={doReject}
            disabled={loading}
            style={({ pressed }) => [
              styles.rejectBtn,
              { opacity: pressed ? 0.7 : 1, borderColor: theme.danger },
            ]}
          >
            {loading ? <ActivityIndicator size="small" color={theme.danger} /> : (
              <>
                <Ionicons name="close" size={16} color={theme.danger} />
                <Text style={[styles.rejectBtnText, { color: theme.danger }]}>{t("missions.reject", lang)}</Text>
              </>
            )}
          </Pressable>
          <Pressable
            onPress={doAccept}
            disabled={loading}
            style={({ pressed }) => [
              styles.acceptBtn,
              { opacity: pressed ? 0.7 : 1, backgroundColor: theme.tint },
            ]}
          >
            {loading ? <ActivityIndicator size="small" color="#fff" /> : (
              <>
                <Ionicons name="checkmark" size={16} color="#fff" />
                <Text style={styles.acceptBtnText}>{t("missions.accept", lang)}</Text>
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
  const lang = useAppStore((s) => s.language);
  const themeKey = useAppStore((s) => s.theme);
  const theme = getTheme(themeKey);
  const { missions, missionsLoading, setMissions, setMissionsLoading, updateMission } = useAppStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setMissionsLoading(true);
    const data = await ApiService.getMissions();
    setMissions(data);
    setMissionsLoading(false);
  }

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
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
          <View style={styles.headerRow}>
            <Text style={[styles.heading, { color: theme.text }]}>{t("missions.title", lang)}</Text>
            <View style={[styles.countBadge, { backgroundColor: theme.tint }]}>
              <Text style={styles.countText}>{missions.length}</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          !missionsLoading ? (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="ambulance" size={52} color={theme.textTertiary} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>{t("missions.noMissions", lang)}</Text>
              <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>{t("missions.noMissionsDesc", lang)}</Text>
            </View>
          ) : (
            <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 60 }} />
          )
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
        renderItem={({ item }) => (
          <MissionCard
            mission={item}
            onAccept={() => { ApiService.acceptMission(item.id).then(() => updateMission(item.id, { status: "accepted" })); }}
            onReject={() => { ApiService.rejectMission(item.id).then(() => updateMission(item.id, { status: "rejected" })); }}
            theme={theme}
            lang={lang}
          />
        )}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  heading: { fontSize: 28, fontFamily: "Inter_700Bold" },
  countBadge: { borderRadius: 12, minWidth: 24, height: 24, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  countText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
  card: { borderRadius: 16, padding: 16, borderWidth: 1, gap: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  badges: { flexDirection: "row", gap: 6, flexWrap: "wrap", flex: 1 },
  timeText: { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "right" },
  dateText: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "right" },
  priorityBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  priorityDot: { width: 6, height: 6, borderRadius: 3 },
  priorityText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  missionTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  missionDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  acceptBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 12 },
  acceptBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  rejectBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 12, borderWidth: 1, backgroundColor: "transparent" },
  rejectBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptyDesc: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 40 },
});
