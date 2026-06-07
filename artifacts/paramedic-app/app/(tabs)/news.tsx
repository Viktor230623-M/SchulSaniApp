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
import { getTheme, type ThemeColors } from "@/constants/theme";
import type { AppLanguage, NewsItem, NewsStatus } from "@/models";
import ApiService from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";
import { localized } from "@/utils/localize";

type Filter = "all" | NewsStatus;

function categoryConfig(cat: NewsItem["category"], tint: string, lang: AppLanguage) {
  return {
    announcement: { label: t("news.catAnnouncement", lang), icon: "megaphone-outline" as const, color: "#3B82F6", bg: "#EFF6FF" },
    training: { label: t("news.catTraining", lang), icon: "fitness-outline" as const, color: "#8B5CF6", bg: "#F5F3FF" },
    update: { label: t("news.catUpdate", lang), icon: "refresh-outline" as const, color: tint, bg: "#F0FDF4" },
    alert: { label: t("news.catAlert", lang), icon: "alert-circle-outline" as const, color: "#EF4444", bg: "#FEF2F2" },
  }[cat];
}

function StatusChip({ status, lang }: { status: NewsStatus; lang: AppLanguage }) {
  const cfg = {
    pending: { label: t("news.statusPending", lang), color: "#F97316", bg: "#FFF7ED" },
    approved: { label: t("news.statusApproved", lang), color: "#22C55E", bg: "#F0FDF4" },
    rejected: { label: t("news.statusRejected", lang), color: "#EF4444", bg: "#FEF2F2" },
  }[status];
  return (
    <View style={[styles.chip, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.chipText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

interface NewsCardProps {
  item: NewsItem;
  canModerate: boolean;
  isOwner: boolean;
  onMarkRead: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, data: { title: string; summary: string; content: string }) => void;
  theme: ThemeColors;
  lang: AppLanguage;
}

function NewsCard({
  item, canModerate, isOwner,
  onMarkRead, onApprove, onReject, onDelete, onEdit,
  theme, lang,
}: NewsCardProps) {
  const [expanded, setExpanded] = useState(false);
  const cat = categoryConfig(item.category, theme.tint, lang);
  const canDelete = isOwner || canModerate;

  function handleDelete() {
    if (Platform.OS === "web") {
      onDelete(item.id);
      return;
    }
    Alert.alert(
      t("news.deleteConfirm", lang),
      t("news.deleteDesc", lang),
      [
        { text: t("common.cancel", lang), style: "cancel" },
        { text: t("common.delete", lang), style: "destructive", onPress: () => onDelete(item.id) },
      ]
    );
  }

  return (
    <Pressable
      onPress={() => setExpanded(!expanded)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: item.isRead ? theme.cardBorder : theme.tint + "55",
          opacity: pressed ? 0.96 : 1,
        },
      ]}
    >
      <View style={styles.cardRow}>
        <View style={[styles.catBadge, { backgroundColor: cat.bg }]}>
          <Ionicons name={cat.icon} size={12} color={cat.color} />
          <Text style={[styles.catText, { color: cat.color }]}>{cat.label}</Text>
        </View>
        <StatusChip status={item.status} lang={lang} />
        {!item.isRead && item.status === "approved" && (
          <View style={[styles.unreadDot, { backgroundColor: theme.tint }]} />
        )}
        {canDelete && (
          <Pressable onPress={handleDelete} hitSlop={8} style={styles.deleteIconBtn}>
            <Ionicons name="trash-outline" size={15} color={theme.textTertiary} />
          </Pressable>
        )}
      </View>

      <Text style={[styles.title, { color: theme.text }]}>{localized(item, "title", lang, item.title)}</Text>
      <Text style={[styles.summary, { color: theme.textSecondary }]}>{localized(item, "summary", lang, item.summary)}</Text>

      {expanded && (
        <Text style={[styles.content, { color: theme.text, borderTopColor: theme.cardBorder }]}>
          {localized(item, "content", lang, item.content)}
        </Text>
      )}

      {item.rejectionReason && (
        <View style={styles.rejectionBox}>
          <Ionicons name="alert-circle" size={13} color="#EF4444" />
          <Text style={styles.rejectionText}>
            {canModerate
              ? `${t("news.statusRejected", lang)}: ${item.rejectionReason}`
              : `${t("news.rejectedAuthorPrefix", lang)}: ${item.rejectionReason} – ${t("news.rejectedAuthorHint", lang)}`}
          </Text>
        </View>
      )}

      <View style={styles.cardFooter}>
        <Text style={[styles.author, { color: theme.textTertiary }]}>
          {item.author} · {new Date(item.publishedAt).toLocaleDateString("de-DE")}
        </Text>
        <View style={styles.footerActions}>
          {item.status === "approved" && !item.isRead && (
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onMarkRead(item.id); }}
              style={[styles.smallBtn, { borderColor: theme.tint }]}
            >
              <Text style={[styles.smallBtnText, { color: theme.tint }]}>{t("news.markRead", lang)}</Text>
            </Pressable>
          )}
          {canModerate && item.status === "pending" && (
            <>
              <Pressable
                onPress={() => onReject(item.id)}
                style={[styles.smallBtn, { borderColor: theme.danger }]}
              >
                <Text style={[styles.smallBtnText, { color: theme.danger }]}>{t("news.reject", lang)}</Text>
              </Pressable>
              <Pressable
                onPress={() => onApprove(item.id)}
                style={[styles.smallBtn, { borderColor: theme.tint, backgroundColor: theme.tint }]}
              >
                <Text style={[styles.smallBtnText, { color: "#fff" }]}>{t("news.approve", lang)}</Text>
              </Pressable>
            </>
          )}
          {isOwner && item.status === "rejected" && (
            <Pressable
              onPress={() => onEdit(item)}
              style={[styles.smallBtn, { borderColor: "#8B5CF6" }]}
            >
              <Text style={[styles.smallBtnText, { color: "#8B5CF6" }]}>{t("common.edit", lang)}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default function NewsScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.language);
  const themeKey = useAppStore((s) => s.theme);
  const theme = getTheme(themeKey);
  const user = useAppStore((s) => s.user);
  const { news, newsLoading, setNews, setNewsLoading, updateNewsItem, addNewsItem, removeNewsItem } = useAppStore();

  const [filter, setFilter] = useState<Filter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSummary, setNewSummary] = useState("");
  const [newContent, setNewContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editItem, setEditItem] = useState<NewsItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [rejectNewsId, setRejectNewsId] = useState<string | null>(null);
  const [rejectNewsReason, setRejectNewsReason] = useState("");

  const canModerate = ["admin", "teacher", "cto"].includes(user?.role ?? "");

  useEffect(() => { load(); }, []);

  async function load() {
    setNewsLoading(true);
    try {
      const data = await ApiService.getNews();
      setNews(data);
    } catch (err) {
      console.error("Failed to load news:", err);
    } finally {
      setNewsLoading(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleMarkRead(id: string) {
    await ApiService.markNewsRead(id);
    updateNewsItem(id, { isRead: true });
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await ApiService.markAllNewsRead();
      news.forEach((n) => updateNewsItem(n.id, { isRead: true }));
    } finally {
      setMarkingAll(false);
    }
  }

  async function handleApprove(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await ApiService.approveNews(id);
    updateNewsItem(id, { status: "approved" });
  }

  function handleReject(id: string) {
    setRejectNewsId(id);
    setRejectNewsReason("");
  }

  async function handleRejectSubmit() {
    if (!rejectNewsId || !rejectNewsReason.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await ApiService.rejectNews(rejectNewsId, rejectNewsReason.trim());
      updateNewsItem(rejectNewsId, { status: "rejected", rejectionReason: rejectNewsReason.trim() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nachricht konnte nicht abgelehnt werden.";
      Alert.alert(t("common.error", lang), message);
    } finally {
      setRejectNewsId(null);
      setRejectNewsReason("");
    }
  }

  async function handleDelete(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await ApiService.deleteNews(id);
    removeNewsItem(id);
  }

  function handleEdit(item: NewsItem) {
    setEditItem(item);
    setEditTitle(item.title);
    setEditSummary(item.summary);
    setEditContent(item.content);
  }

  async function handleEditSubmit() {
    if (!editItem || !editTitle.trim() || !editContent.trim()) return;
    setEditSubmitting(true);
    const updated = await ApiService.editNews(editItem.id, {
      title: editTitle,
      summary: editSummary || editContent.substring(0, 80) + "...",
      content: editContent,
    });
    updateNewsItem(editItem.id, updated);
    setEditItem(null);
    setEditSubmitting(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function handleCreate() {
    if (!newTitle.trim() || !newContent.trim()) return;
    setSubmitting(true);
    const item = await ApiService.createNews({
      title: newTitle,
      summary: newSummary || newContent.substring(0, 80) + "...",
      content: newContent,
      category: "announcement",
      author: user ? `${user.firstName} ${user.lastName}` : t("common.unknown", lang),
      authorId: user?.id ?? "",
    });
    addNewsItem(item);
    setNewTitle("");
    setNewSummary("");
    setNewContent("");
    setSubmitting(false);
    setShowCreate(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  const filtered = news.filter((n) => {
    if (filter === "all") {
      return n.status === "approved" || n.authorId === user?.id || canModerate;
    }
    if (filter === "pending") return n.status === "pending" && (n.authorId === user?.id || canModerate);
    if (filter === "rejected") return n.status === "rejected" && (n.authorId === user?.id || canModerate);
    return n.status === filter;
  });

  const unread = news.filter((n) => n.status === "approved" && !n.isRead).length;
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={filtered}
        keyExtractor={(n) => n.id}
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
              <View>
                <Text style={[styles.heading, { color: theme.text }]}>{t("news.title", lang)}</Text>
                {unread > 0 && (
                  <Text style={[styles.unreadHint, { color: theme.tint }]}>
                    {unread} {t("news.unread", lang)}
                  </Text>
                )}
              </View>
              <View style={styles.headerBtns}>
                {unread > 0 && (
                  <Pressable
                    onPress={handleMarkAllRead}
                    disabled={markingAll}
                    style={[styles.markAllBtn, { backgroundColor: theme.tintLight, borderColor: theme.tint + "44", opacity: markingAll ? 0.6 : 1 }]}
                  >
                    {markingAll
                      ? <ActivityIndicator size="small" color={theme.tintDark} />
                      : <Text style={[styles.markAllText, { color: theme.tintDark }]}>{t("news.markAllRead", lang)}</Text>
                    }
                  </Pressable>
                )}
                <Pressable
                  onPress={() => setShowCreate(true)}
                  style={[styles.iconBtn, { backgroundColor: theme.tint }]}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                </Pressable>
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
              {(["all", "approved", "pending", "rejected"] as const).map((f) => {
                const label = f === "all" ? t("news.allArticles", lang) : f === "approved" ? t("news.filterApproved", lang) : f === "pending" ? t("news.filterPending", lang) : t("news.filterRejected", lang);
                return (
                  <Pressable
                    key={f}
                    onPress={() => setFilter(f)}
                    style={[
                      styles.filterPill,
                      { backgroundColor: filter === f ? theme.tint : theme.backgroundTertiary },
                    ]}
                  >
                    <Text style={[styles.filterPillText, { color: filter === f ? "#fff" : theme.textSecondary }]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          !newsLoading ? (
            <View style={styles.empty}>
              <Ionicons name="newspaper-outline" size={52} color={theme.textTertiary} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>{t("news.noNews", lang)}</Text>
            </View>
          ) : (
            <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 60 }} />
          )
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
        renderItem={({ item }) => (
          <NewsCard
            item={item}
            canModerate={canModerate}
            isOwner={item.authorId === user?.id}
            onMarkRead={handleMarkRead}
            onApprove={handleApprove}
            onReject={handleReject}
            onDelete={handleDelete}
            onEdit={handleEdit}
            theme={theme}
            lang={lang}
          />
        )}
        showsVerticalScrollIndicator={false}
      />

      {/* Create Modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="formSheet">
        <View style={[styles.modal, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t("news.newArticle", lang)}</Text>
            <Pressable onPress={() => setShowCreate(false)}>
              <Ionicons name="close" size={24} color={theme.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
            <TextInput
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder={t("news.newsTitle", lang)}
              placeholderTextColor={theme.textTertiary}
              style={[styles.textIn, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }]}
            />
            <TextInput
              value={newSummary}
              onChangeText={setNewSummary}
              placeholder={t("news.summary", lang)}
              placeholderTextColor={theme.textTertiary}
              style={[styles.textIn, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }]}
            />
            <TextInput
              value={newContent}
              onChangeText={setNewContent}
              placeholder={t("news.content", lang)}
              placeholderTextColor={theme.textTertiary}
              multiline
              numberOfLines={6}
              style={[styles.textIn, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text, height: 120, textAlignVertical: "top" }]}
            />
            <Text style={[styles.hint, { color: theme.textTertiary }]}>{t("news.submitHint", lang)}</Text>
            <Pressable onPress={handleCreate} disabled={submitting} style={[styles.submitBtn, { backgroundColor: theme.tint }]}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>{t("news.submit", lang)}</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* Reject Modal */}
      <Modal visible={!!rejectNewsId} animationType="slide" presentationStyle="formSheet">
        <View style={[styles.modal, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t("news.rejectTitle", lang)}</Text>
            <Pressable onPress={() => setRejectNewsId(null)}>
              <Ionicons name="close" size={24} color={theme.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
            <TextInput
              value={rejectNewsReason}
              onChangeText={setRejectNewsReason}
              placeholder={t("news.rejectPlaceholder", lang)}
              placeholderTextColor={theme.textTertiary}
              multiline
              numberOfLines={4}
              style={[styles.textIn, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text, height: 120, textAlignVertical: "top" }]}
            />
            <Pressable
              onPress={handleRejectSubmit}
              disabled={!rejectNewsReason.trim()}
              style={[styles.submitBtn, { backgroundColor: theme.danger }]}
            >
              <Text style={styles.submitBtnText}>{t("news.reject", lang)}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal visible={!!editItem} animationType="slide" presentationStyle="formSheet">
        <View style={[styles.modal, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t("news.editTitle", lang)}</Text>
            <Pressable onPress={() => setEditItem(null)}>
              <Ionicons name="close" size={24} color={theme.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
            <TextInput
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder={t("news.newsTitle", lang)}
              placeholderTextColor={theme.textTertiary}
              style={[styles.textIn, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }]}
            />
            <TextInput
              value={editSummary}
              onChangeText={setEditSummary}
              placeholder={t("news.summary", lang)}
              placeholderTextColor={theme.textTertiary}
              style={[styles.textIn, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }]}
            />
            <TextInput
              value={editContent}
              onChangeText={setEditContent}
              placeholder={t("news.content", lang)}
              placeholderTextColor={theme.textTertiary}
              multiline
              numberOfLines={6}
              style={[styles.textIn, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text, height: 120, textAlignVertical: "top" }]}
            />
            <Text style={[styles.hint, { color: theme.textTertiary }]}>{t("news.editSubmitHint", lang)}</Text>
            <Pressable onPress={handleEditSubmit} disabled={editSubmitting} style={[styles.submitBtn, { backgroundColor: "#8B5CF6" }]}>
              {editSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>{t("news.resubmit", lang)}</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heading: { fontSize: 28, fontFamily: "Inter_700Bold" },
  unreadHint: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  headerBtns: { flexDirection: "row", gap: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  markAllBtn: { paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, borderWidth: 1 },
  markAllText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  filterScroll: { marginBottom: 8 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginRight: 8 },
  filterPillText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  card: { borderRadius: 16, padding: 14, borderWidth: 1, gap: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  catBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  catText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  chipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  deleteIconBtn: { marginLeft: "auto" as any, padding: 4 },
  title: { fontSize: 16, fontFamily: "Inter_700Bold" },
  summary: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  content: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22, paddingTop: 8, borderTopWidth: 1, marginTop: 4 },
  rejectionBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FEF2F2", padding: 8, borderRadius: 8 },
  rejectionText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#EF4444", flex: 1 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 },
  author: { fontSize: 11, fontFamily: "Inter_400Regular" },
  footerActions: { flexDirection: "row", gap: 6 },
  smallBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  smallBtnText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  textIn: { padding: 14, borderRadius: 12, borderWidth: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular" },
  submitBtn: { paddingVertical: 15, borderRadius: 12, alignItems: "center" },
  submitBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
