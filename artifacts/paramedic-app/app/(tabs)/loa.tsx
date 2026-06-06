import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { DatePickerField } from "@/components/DatePickerField";
import type { LOARequest, LOAStatus } from "@/models";
import ApiService from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}.${month}.${year}`;
}

function toYMD(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

function StatusBadge({ status, lang }: { status: LOAStatus; lang: string }) {
  const cfg = {
    pending: { key: "loa.pending", color: "#F97316", bg: "#FFF7ED" },
    approved: { key: "loa.approved", color: "#22C55E", bg: "#F0FDF4" },
    rejected: { key: "loa.rejected", color: "#EF4444", bg: "#FEF2F2" },
    appealed: { key: "loa.appealed", color: "#8B5CF6", bg: "#F5F3FF" },
  }[status];
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{t(cfg.key, lang as any)}</Text>
    </View>
  );
}

export default function LOAScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.language);
  const themeKey = useAppStore((s) => s.theme);
  const theme = getTheme(themeKey);
  const user = useAppStore((s) => s.user);
  const { loaRequests, setLOARequests, addLOA, updateLOA } = useAppStore();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [fromDate, setFromDate] = useState<Date>(new Date(today));
  const [toDate, setToDate] = useState<Date>(new Date(today));
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [appealText, setAppealText] = useState("");
  const [appealId, setAppealId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const role = user?.role ?? "";
  const canModerate = ["admin", "sanitaeter_leitung_admin", "teacher", "cto"].includes(role);
  const canCreate = ["student_paramedic", "sanitaeter_leitung", "sanitaeter_leitung_admin", "admin", "cto", "sanitaeter"].includes(role);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await ApiService.getLOARequests();
      setLOARequests(data);
    } catch (err) {
      console.error("Failed to load LOA requests:", err);
    } finally {
      setLoading(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleCreate() {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      const req = await ApiService.createLOA({
        userId: user?.id ?? "",
        userName: `${user?.firstName} ${user?.lastName}`.trim(),
        fromDate: toYMD(fromDate),
        toDate: toYMD(toDate),
        reason,
      });
      if (role === "cto") {
        const approved = await ApiService.approveLOA(req.id, t("loa.autoApproved", lang));
        addLOA(approved);
      } else {
        addLOA(req);
      }
      setFromDate(new Date(today));
      setToDate(new Date(today));
      setReason("");
      setShowCreate(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message = err instanceof Error ? err.message : lang === "de" ? "Abwesenheitsantrag konnte nicht erstellt werden." : "Could not create absence request.";
      Alert.alert(t("common.error", lang), message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const updated = await ApiService.approveLOA(id);
    updateLOA(id, updated);
  }

  async function handleReject(id: string) {
    if (!rejectReason.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const updated = await ApiService.rejectLOA(id, rejectReason);
    updateLOA(id, updated);
    setRejectId(null);
    setRejectReason("");
  }

  async function handleAppeal(id: string) {
    if (!appealText.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = await ApiService.appealLOA(id, appealText);
    updateLOA(id, updated);
    setAppealId(null);
    setAppealText("");
  }

  const visible = canModerate
    ? loaRequests
    : loaRequests.filter((r) => r.userId === user?.id);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={visible}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{
          paddingTop: topPad + 20,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: 16,
          gap: 10,
          flexGrow: 1,
        }}
        ListHeaderComponent={
          <View style={styles.headerRow}>
            <Text style={[styles.heading, { color: theme.text }]}>{t("loa.title", lang)}</Text>
            {canCreate && (
              <Pressable
                onPress={() => setShowCreate(true)}
                style={[styles.iconBtn, { backgroundColor: theme.tint }]}
              >
                <Ionicons name="add" size={20} color="#fff" />
              </Pressable>
            )}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={52} color={theme.textTertiary} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>{t("loa.noRequests", lang)}</Text>
            </View>
          ) : (
            <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 60 }} />
          )
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={styles.cardRow}>
              <Text style={[styles.name, { color: theme.text }]}>{item.userName}</Text>
              <StatusBadge status={item.status} lang={lang} />
            </View>
            <Text style={[styles.dates, { color: theme.textSecondary }]}>
              {formatDisplayDate(item.fromDate)} – {formatDisplayDate(item.toDate)}
            </Text>
            <Text style={[styles.reason, { color: theme.text }]}>{item.reason}</Text>
            {item.adminNote && (
              <View style={[styles.noteBox, { backgroundColor: theme.backgroundTertiary }]}>
                <Text style={[styles.noteText, { color: theme.textSecondary }]}>{item.adminNote}</Text>
              </View>
            )}
            {canModerate && item.status === "pending" && (
              <View style={styles.actions}>
                <Pressable
                  onPress={() => { setRejectId(item.id); }}
                  style={[styles.btn, { borderColor: theme.danger }]}
                >
                  <Text style={[styles.btnText, { color: theme.danger }]}>{t("loa.reject", lang)}</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleApprove(item.id)}
                  style={[styles.btn, { backgroundColor: theme.tint, borderColor: theme.tint }]}
                >
                  <Text style={[styles.btnText, { color: "#fff" }]}>{t("loa.approve", lang)}</Text>
                </Pressable>
              </View>
            )}
            {item.userId === user?.id && item.status === "rejected" && (
              <Pressable
                onPress={() => setAppealId(item.id)}
                style={[styles.btn, { borderColor: "#8B5CF6", marginTop: 8 }]}
              >
                <Text style={[styles.btnText, { color: "#8B5CF6" }]}>{t("loa.appeal", lang)}</Text>
              </Pressable>
            )}
          </View>
        )}
      />

      {/* Create Modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="formSheet">
        <View style={[styles.modal, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t("loa.modalTitle", lang)}</Text>
            <Pressable onPress={() => setShowCreate(false)}>
              <Ionicons name="close" size={24} color={theme.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
            <DatePickerField
              value={fromDate}
              onChange={setFromDate}
              label={t("loa.from", lang)}
            />
            <DatePickerField
              value={toDate}
              onChange={setToDate}
              label={t("loa.to", lang)}
            />
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder={t("loa.reasonPlaceholder", lang)}
              placeholderTextColor={theme.textTertiary}
              multiline
              numberOfLines={4}
              style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text, height: 100, textAlignVertical: "top" }]}
            />
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

      {/* Reject Modal */}
      <Modal visible={!!rejectId} animationType="slide" presentationStyle="formSheet">
        <View style={[styles.modal, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t("loa.rejectTitle", lang)}</Text>
            <Pressable onPress={() => setRejectId(null)}>
              <Ionicons name="close" size={24} color={theme.text} />
            </Pressable>
          </View>
          <View style={{ padding: 20, gap: 14 }}>
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder={t("loa.rejectPlaceholder", lang)}
              placeholderTextColor={theme.textTertiary}
              multiline
              numberOfLines={4}
              style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text, height: 100, textAlignVertical: "top" }]}
            />
            <Pressable
              onPress={() => rejectId && handleReject(rejectId)}
              style={[styles.submitBtn, { backgroundColor: "#EF4444" }]}
            >
              <Text style={styles.submitBtnText}>{t("loa.reject", lang)}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Appeal Modal */}
      <Modal visible={!!appealId} animationType="slide" presentationStyle="formSheet">
        <View style={[styles.modal, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t("loa.appealModalTitle", lang)}</Text>
            <Pressable onPress={() => setAppealId(null)}>
              <Ionicons name="close" size={24} color={theme.text} />
            </Pressable>
          </View>
          <View style={{ padding: 20, gap: 14 }}>
            <TextInput
              value={appealText}
              onChangeText={setAppealText}
              placeholder={t("loa.appealPlaceholder", lang)}
              placeholderTextColor={theme.textTertiary}
              multiline
              numberOfLines={4}
              style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text, height: 100, textAlignVertical: "top" }]}
            />
            <Pressable
              onPress={() => appealId && handleAppeal(appealId)}
              style={[styles.submitBtn, { backgroundColor: "#8B5CF6" }]}
            >
              <Text style={styles.submitBtnText}>{t("loa.appealSubmit", lang)}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heading: { fontSize: 28, fontFamily: "Inter_700Bold" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  iconBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: 16, padding: 14, borderWidth: 1, gap: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  dates: { fontSize: 13, fontFamily: "Inter_400Regular" },
  reason: { fontSize: 14, fontFamily: "Inter_400Regular" },
  noteBox: { padding: 10, borderRadius: 8 },
  noteText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  actions: { flexDirection: "row", gap: 8, marginTop: 8 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  btnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  input: { padding: 14, borderRadius: 12, borderWidth: 1, fontSize: 16, fontFamily: "Inter_400Regular" },
  submitBtn: { paddingVertical: 15, borderRadius: 12, alignItems: "center" },
  submitBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
