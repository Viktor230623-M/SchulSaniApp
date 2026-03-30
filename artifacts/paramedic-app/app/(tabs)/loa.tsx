import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { t } from "@/constants/i18n";
import { getTheme } from "@/constants/theme";
import type { LOARequest, LOAStatus } from "@/models";
import ApiService from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";

function StatusBadge({ status, theme }: { status: LOAStatus; theme: any }) {
  const cfg = {
    pending: { color: "#F97316", bg: "#FFF7ED" },
    approved: { color: "#22C55E", bg: "#F0FDF4" },
    rejected: { color: "#EF4444", bg: "#FEF2F2" },
    appealed: { color: "#8B5CF6", bg: "#F5F3FF" },
  }[status];
  const label = {
    pending: "Ausstehend",
    approved: "Genehmigt",
    rejected: "Abgelehnt",
    appealed: "Einspruch",
  }[status];
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{label}</Text>
    </View>
  );
}

function LOACard({ req, canModerate, onApprove, onReject, onAppeal, theme, lang, currentUserId }: any) {
  const [showAppeal, setShowAppeal] = useState(false);
  const [appealText, setAppealText] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const isOwn = req.userId === currentUserId;

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={[styles.cardName, { color: theme.text }]}>{req.userName}</Text>
          <Text style={[styles.cardDates, { color: theme.textSecondary }]}>
            {fmtDate(req.fromDate)} → {fmtDate(req.toDate)}
          </Text>
        </View>
        <StatusBadge status={req.status} theme={theme} />
      </View>

      <Text style={[styles.cardReason, { color: theme.textSecondary }]}>{req.reason}</Text>

      {req.adminNote && (
        <View style={[styles.noteBox, { backgroundColor: theme.backgroundTertiary }]}>
          <Ionicons name="chatbubble-outline" size={13} color={theme.textTertiary} />
          <Text style={[styles.noteText, { color: theme.textSecondary }]}>{req.adminNote}</Text>
        </View>
      )}

      {req.appealNote && (
        <View style={[styles.noteBox, { backgroundColor: "#F5F3FF" }]}>
          <Ionicons name="arrow-undo" size={13} color="#8B5CF6" />
          <Text style={[styles.noteText, { color: "#8B5CF6" }]}>{req.appealNote}</Text>
        </View>
      )}

      <View style={styles.cardActions}>
        {isOwn && req.status === "rejected" && !req.appealNote && (
          <>
            {!showAppeal ? (
              <Pressable
                onPress={() => setShowAppeal(true)}
                style={[styles.actionBtn, { borderColor: "#8B5CF6" }]}
              >
                <Ionicons name="arrow-undo" size={14} color="#8B5CF6" />
                <Text style={[styles.actionBtnText, { color: "#8B5CF6" }]}>{t("loa.appeal", lang)}</Text>
              </Pressable>
            ) : (
              <View style={styles.appealInput}>
                <TextInput
                  value={appealText}
                  onChangeText={setAppealText}
                  placeholder={t("loa.appealPlaceholder", lang)}
                  placeholderTextColor={theme.textTertiary}
                  style={[styles.inlineInput, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }]}
                />
                <View style={styles.row}>
                  <Pressable onPress={() => setShowAppeal(false)} style={[styles.actionBtn, { borderColor: theme.cardBorder }]}>
                    <Text style={[styles.actionBtnText, { color: theme.textSecondary }]}>{t("common.cancel", lang)}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { onAppeal(req.id, appealText); setShowAppeal(false); }}
                    style={[styles.actionBtn, { backgroundColor: "#8B5CF6", borderColor: "#8B5CF6" }]}
                  >
                    <Text style={[styles.actionBtnText, { color: "#fff" }]}>{t("common.send", lang)}</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </>
        )}

        {canModerate && req.status === "pending" && (
          <>
            {!showReject ? (
              <>
                <Pressable
                  onPress={() => setShowReject(true)}
                  style={[styles.actionBtn, { borderColor: theme.danger }]}
                >
                  <Ionicons name="close" size={14} color={theme.danger} />
                  <Text style={[styles.actionBtnText, { color: theme.danger }]}>{t("loa.reject", lang)}</Text>
                </Pressable>
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onApprove(req.id); }}
                  style={[styles.actionBtn, { backgroundColor: theme.tint, borderColor: theme.tint }]}
                >
                  <Ionicons name="checkmark" size={14} color="#fff" />
                  <Text style={[styles.actionBtnText, { color: "#fff" }]}>{t("loa.approve", lang)}</Text>
                </Pressable>
              </>
            ) : (
              <View style={styles.appealInput}>
                <TextInput
                  value={rejectReason}
                  onChangeText={setRejectReason}
                  placeholder={t("loa.rejectReason", lang)}
                  placeholderTextColor={theme.textTertiary}
                  style={[styles.inlineInput, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }]}
                />
                <View style={styles.row}>
                  <Pressable onPress={() => setShowReject(false)} style={[styles.actionBtn, { borderColor: theme.cardBorder }]}>
                    <Text style={[styles.actionBtnText, { color: theme.textSecondary }]}>{t("common.cancel", lang)}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { onReject(req.id, rejectReason); setShowReject(false); }}
                    style={[styles.actionBtn, { backgroundColor: theme.danger, borderColor: theme.danger }]}
                  >
                    <Text style={[styles.actionBtnText, { color: "#fff" }]}>{t("loa.reject", lang)}</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

export default function LOAScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.language);
  const themeKey = useAppStore((s) => s.theme);
  const theme = getTheme(themeKey);
  const user = useAppStore((s) => s.user);
  const { loaRequests, loaLoading, setLOARequests, setLOALoading, updateLOA, addLOA } = useAppStore();

  const canModerate = user?.role === "admin" || user?.role === "teacher" || user?.role === "sanitaeter_leitung";
  const [showAll, setShowAll] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLOALoading(true);
    const data = await ApiService.getLOARequests(canModerate && showAll ? undefined : user?.id);
    setLOARequests(data);
    setLOALoading(false);
  }

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleApprove(id: string) {
    const updated = await ApiService.approveLOA(id);
    updateLOA(id, { status: "approved", adminNote: updated.adminNote });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function handleReject(id: string, reason: string) {
    const updated = await ApiService.rejectLOA(id, reason);
    updateLOA(id, { status: "rejected", adminNote: reason });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }

  async function handleAppeal(id: string, note: string) {
    const updated = await ApiService.appealLOA(id, note);
    updateLOA(id, { status: "appealed", appealNote: note });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function handleCreate() {
    if (!fromDate || !toDate || !reason.trim()) return;
    setSubmitting(true);
    const req = await ApiService.createLOA({
      userId: user?.id ?? "",
      userName: user ? `${user.firstName} ${user.lastName}` : "",
      fromDate,
      toDate,
      reason,
    });
    addLOA(req);
    setFromDate("");
    setToDate("");
    setReason("");
    setSubmitting(false);
    setShowCreate(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  const displayed = canModerate && showAll
    ? loaRequests
    : loaRequests.filter((r) => r.userId === user?.id);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={displayed}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{
          paddingTop: topPad + 20,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: 16,
          gap: 10,
          flexGrow: 1,
        }}
        ListHeaderComponent={
          <View>
            <View style={styles.headerRow}>
              <Text style={[styles.heading, { color: theme.text }]}>{t("loa.title", lang)}</Text>
              <Pressable
                onPress={() => setShowCreate(true)}
                style={[styles.addBtn, { backgroundColor: theme.tint }]}
              >
                <Ionicons name="add" size={20} color="#fff" />
              </Pressable>
            </View>
            {canModerate && (
              <View style={styles.toggleRow}>
                <Pressable
                  onPress={() => setShowAll(false)}
                  style={[styles.toggleBtn, !showAll && { backgroundColor: theme.tint }]}
                >
                  <Text style={[styles.toggleBtnText, { color: !showAll ? "#fff" : theme.textSecondary }]}>
                    {t("loa.myRequests", lang)}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowAll(true)}
                  style={[styles.toggleBtn, showAll && { backgroundColor: theme.tint }]}
                >
                  <Text style={[styles.toggleBtnText, { color: showAll ? "#fff" : theme.textSecondary }]}>
                    {t("loa.allRequests", lang)}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !loaLoading ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={52} color={theme.textTertiary} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>{t("loa.noRequests", lang)}</Text>
              <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>{t("loa.noRequestsDesc", lang)}</Text>
            </View>
          ) : (
            <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 60 }} />
          )
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
        renderItem={({ item }) => (
          <LOACard
            req={item}
            canModerate={canModerate}
            onApprove={handleApprove}
            onReject={handleReject}
            onAppeal={handleAppeal}
            theme={theme}
            lang={lang}
            currentUserId={user?.id}
          />
        )}
        showsVerticalScrollIndicator={false}
      />

      <Modal visible={showCreate} animationType="slide" presentationStyle="formSheet">
        <View style={[styles.modal, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t("loa.newRequest", lang)}</Text>
            <Pressable onPress={() => setShowCreate(false)}>
              <Ionicons name="close" size={24} color={theme.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
            <View>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{t("loa.from", lang)}</Text>
              <TextInput
                value={fromDate}
                onChangeText={setFromDate}
                placeholder="2025-04-14"
                placeholderTextColor={theme.textTertiary}
                style={[styles.fieldInput, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }]}
              />
            </View>
            <View>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{t("loa.to", lang)}</Text>
              <TextInput
                value={toDate}
                onChangeText={setToDate}
                placeholder="2025-04-18"
                placeholderTextColor={theme.textTertiary}
                style={[styles.fieldInput, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }]}
              />
            </View>
            <View>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{t("loa.reason", lang)}</Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder={t("loa.reasonPlaceholder", lang)}
                placeholderTextColor={theme.textTertiary}
                multiline
                numberOfLines={4}
                style={[styles.fieldInput, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text, height: 100, textAlignVertical: "top" }]}
              />
            </View>
            <Pressable
              onPress={handleCreate}
              disabled={submitting}
              style={[styles.submitBtn, { backgroundColor: theme.tint }]}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>{t("loa.submit", lang)}</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  heading: { fontSize: 28, fontFamily: "Inter_700Bold" },
  addBtn: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  toggleRow: { flexDirection: "row", gap: 8, marginBottom: 10, backgroundColor: "transparent" },
  toggleBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: "transparent", borderWidth: 1, borderColor: "transparent" },
  toggleBtnText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  card: { borderRadius: 16, padding: 16, borderWidth: 1, gap: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  cardDates: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  cardReason: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  noteBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, padding: 10, borderRadius: 10 },
  noteText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 16 },
  cardActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  actionBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  appealInput: { width: "100%", gap: 8 },
  inlineInput: { padding: 10, borderRadius: 10, borderWidth: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  row: { flexDirection: "row", gap: 8 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptyDesc: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 40 },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 6 },
  fieldInput: { padding: 14, borderRadius: 12, borderWidth: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  submitBtn: { paddingVertical: 15, borderRadius: 12, alignItems: "center" },
  submitBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
