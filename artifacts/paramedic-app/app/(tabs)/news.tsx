import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTopPad } from "@/hooks/useTopPad";
import { GlassLoader } from "@/components/GlassLoader";
import { DatePickerField } from "@/components/DatePickerField";
import { appleCardStyle } from "@/components/AppleSurface";
import { t } from "@/constants/i18n";
import { getTheme, type ThemeColors, istDunklesThema, withAlpha } from "@/constants/theme";
import type { AppLanguage, NewsItem, NewsStatus } from "@/models";
import { confirmAction, notify } from "@/lib/dialog";
import ApiService from "@/services/ApiService";
import { has, useAppStore } from "@/store/useAppStore";
import { localized } from "@/utils/localize";

type Filter = "all" | NewsStatus;

function fmtMeetingWhen(item: NewsItem, lang: AppLanguage): string {
  if (!item.meetingAt) return "";
  const start = new Date(item.meetingAt);
  const dateStr = start.toLocaleDateString(lang === "de" ? "de-DE" : "en-GB", {
    weekday: "short", day: "2-digit", month: "2-digit",
  });
  const startTime = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
  if (item.meetingEndAt) {
    const end = new Date(item.meetingEndAt);
    const endTime = `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
    return t("news.meetingRange", lang).replace("{date}", dateStr).replace("{start}", startTime).replace("{end}", endTime);
  }
  return t("news.meetingAt", lang).replace("{date}", dateStr).replace("{time}", startTime);
}

function categoryConfig(cat: NewsItem["category"], tint: string, lang: AppLanguage) {
  return {
    announcement: { label: t("news.catAnnouncement", lang), icon: "megaphone-outline" as const, color: "#3B82F6" },
    training: { label: t("news.catTraining", lang), icon: "fitness-outline" as const, color: "#8B5CF6" },
    update: { label: t("news.catUpdate", lang), icon: "refresh-outline" as const, color: tint },
    alert: { label: t("news.catAlert", lang), icon: "alert-circle-outline" as const, color: "#EF4444" },
  }[cat];
}

function StatusChip({ status, lang }: { status: NewsStatus; lang: AppLanguage }) {
  const cfg = {
    pending: { label: t("news.statusPending", lang), color: "#F97316" },
    approved: { label: t("news.statusApproved", lang), color: "#22C55E" },
    rejected: { label: t("news.statusRejected", lang), color: "#EF4444" },
  }[status];
  return (
    <View style={[styles.chip, { backgroundColor: withAlpha(cfg.color, 0.14) }]}>
      <Text style={[styles.chipText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

interface NewsCardProps {
  item: NewsItem;
  canModerate: boolean;
  isOwner: boolean;
  userId: string | undefined;
  onMarkRead: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (item: NewsItem) => void;
  onSignup: (id: string) => void;
  onUnsign: (id: string) => void;
  onToggleNotify: (id: string, enabled: boolean) => void;
  theme: ThemeColors;
  lang: AppLanguage;
}

function NewsCard({
  item, canModerate, isOwner, userId,
  onMarkRead, onApprove, onReject, onDelete, onEdit,
  onSignup, onUnsign, onToggleNotify,
  theme, lang,
}: NewsCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const cat = categoryConfig(item.category, theme.tint, lang);
  const canDelete = isOwner || canModerate;
  const isMeeting = !!item.meetingAt;
  const meetingEnded = isMeeting && new Date(item.meetingAt!).getTime() < Date.now();
  const participants = item.meetingSignups ?? [];

  async function handleDelete() {
    const confirmed = await confirmAction({
      title: t("news.deleteConfirm", lang),
      message: t("news.deleteDesc", lang),
      confirmLabel: t("common.delete", lang),
      cancelLabel: t("common.cancel", lang),
      destructive: true,
    });
    if (confirmed) onDelete(item.id);
  }

  return (
    <Pressable
      onPress={() => setExpanded(!expanded)}
      style={({ pressed }) => [
        styles.card,
        appleCardStyle(theme),
        {
          borderColor: item.isRead ? theme.cardBorder : theme.tint + "55",
          opacity: pressed ? 0.96 : 1,
        },
      ]}
    >
      <View style={styles.cardRow}>
        <View style={[styles.catBadge, { backgroundColor: withAlpha(cat.color, 0.14) }]}>
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

      {isMeeting && (
        <View style={[styles.meetingBox, { backgroundColor: withAlpha("#8B5CF6", 0.08), borderColor: "#8B5CF6" + "33" }]}>
          <View style={styles.meetingRow}>
            <Ionicons name="calendar" size={15} color="#8B5CF6" />
            <Text style={[styles.meetingText, { color: theme.text }]}>{fmtMeetingWhen(item, lang)}</Text>
          </View>
          {item.meetingLocation ? (
            <View style={styles.meetingRow}>
              <Ionicons name="location-outline" size={15} color="#8B5CF6" />
              <Text style={[styles.meetingText, { color: theme.textSecondary }]}>{item.meetingLocation}</Text>
            </View>
          ) : null}
          {item.status === "approved" && !meetingEnded && (
            <View style={styles.meetingActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => (item.signedUp ? onUnsign(item.id) : onSignup(item.id))}
                style={[
                  styles.meetingSignBtn,
                  { backgroundColor: item.signedUp ? theme.backgroundTertiary : "#8B5CF6", borderColor: "#8B5CF6" },
                ]}
              >
                <Ionicons name={item.signedUp ? "checkmark-circle" : "person-add"} size={14} color={item.signedUp ? theme.text : "#fff"} />
                <Text style={[styles.meetingSignText, { color: item.signedUp ? theme.text : "#fff" }]}>
                  {item.signedUp ? t("news.meetingSignOut", lang) : t("news.meetingSignUp", lang)}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowParticipants(!showParticipants)}
                hitSlop={8}
                style={styles.meetingCountBtn}
              >
                <Text style={[styles.meetingCountText, { color: theme.textSecondary }]}>
                  {t("news.meetingParticipants", lang).replace("{n}", String(participants.length))}
                </Text>
                <Ionicons name={showParticipants ? "chevron-up" : "chevron-down"} size={13} color={theme.textTertiary} />
              </Pressable>
            </View>
          )}
          {isOwner && item.status === "approved" && (
            <Pressable
              onPress={() => onToggleNotify(item.id, !item.meetingNotifyOnSignup)}
              hitSlop={8}
              style={styles.meetingNotifyRow}
            >
              <Ionicons name={item.meetingNotifyOnSignup ? "notifications" : "notifications-off-outline"} size={13} color={theme.textTertiary} />
              <Text style={[styles.meetingNotifyText, { color: theme.textTertiary }]}>
                {item.meetingNotifyOnSignup ? t("news.meetingNotifyOn", lang) : t("news.meetingNotifyOff", lang)}
              </Text>
            </Pressable>
          )}
          {showParticipants && (
            <View style={styles.participantList}>
              {participants.length === 0 ? (
                <Text style={[styles.participantText, { color: theme.textTertiary }]}>{t("news.noParticipants", lang)}</Text>
              ) : (
                participants.map((p) => (
                  <Text key={p.userId} style={[styles.participantText, { color: theme.textSecondary }]}>
                    {p.userId === userId ? `${p.name} ${t("news.meetingYou", lang)}` : p.name}
                  </Text>
                ))
              )}
            </View>
          )}
          {meetingEnded && (
            <View style={styles.meetingEndedRow}>
              <Ionicons name="time-outline" size={13} color={theme.textTertiary} />
              <Text style={[styles.meetingEndedText, { color: theme.textTertiary }]}>{t("news.meetingEnded", lang)}</Text>
            </View>
          )}
        </View>
      )}

      {expanded && (
        <Text style={[styles.content, { color: theme.text, borderTopColor: theme.cardBorder }]}>
          {localized(item, "content", lang, item.content)}
        </Text>
      )}

      {item.rejectionReason && (
        <View style={[styles.rejectionBox, { backgroundColor: withAlpha("#EF4444", 0.1) }]}>
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
          {item.author} · {new Date(item.publishedAt).toLocaleDateString(lang === "de" ? "de-DE" : "en-GB")}
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
  // Meeting (create)
  const [isMeeting, setIsMeeting] = useState(false);
  const [meetingDate, setMeetingDate] = useState<Date>(new Date());
  const [meetingStartTime, setMeetingStartTime] = useState("15:00");
  const [meetingEndTime, setMeetingEndTime] = useState("");
  const [meetingLocation, setMeetingLocation] = useState("");
  const [meetingNotify, setMeetingNotify] = useState(false);
  // Meeting (edit)
  const [editIsMeeting, setEditIsMeeting] = useState(false);
  const [editMeetingDate, setEditMeetingDate] = useState<Date>(new Date());
  const [editMeetingStartTime, setEditMeetingStartTime] = useState("15:00");
  const [editMeetingEndTime, setEditMeetingEndTime] = useState("");
  const [editMeetingLocation, setEditMeetingLocation] = useState("");
  const [editMeetingNotify, setEditMeetingNotify] = useState(false);

  const canModerate = has("news.moderate");

  const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

  function dateWithTime(d: Date, time: string): Date {
    const [h, m] = time.split(":").map(Number);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h ?? 0, m ?? 0);
  }

  function buildMeetingPayload() {
    if (!isMeeting) return {};
    const start = dateWithTime(meetingDate, meetingStartTime);
    const end = meetingEndTime ? dateWithTime(meetingDate, meetingEndTime) : null;
    return {
      meetingAt: start.toISOString(),
      meetingEndAt: end && end.getTime() > start.getTime() ? end.toISOString() : undefined,
      meetingLocation: meetingLocation.trim() || undefined,
      meetingNotifyOnSignup: meetingNotify,
    };
  }

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
      notify(t("common.error", lang), message);
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
    setEditIsMeeting(!!item.meetingAt);
    if (item.meetingAt) {
      setEditMeetingDate(new Date(item.meetingAt));
      setEditMeetingStartTime(fmtTimeOnly(item.meetingAt));
      setEditMeetingEndTime(item.meetingEndAt ? fmtTimeOnly(item.meetingEndAt) : "");
      setEditMeetingLocation(item.meetingLocation ?? "");
    }
    setEditMeetingNotify(!!item.meetingNotifyOnSignup);
  }

  function fmtTimeOnly(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  async function handleEditSubmit() {
    if (!editItem || !editTitle.trim() || !editContent.trim()) return;
    setEditSubmitting(true);
    const meeting = editIsMeeting
      ? {
          meetingAt: dateWithTime(editMeetingDate, editMeetingStartTime).toISOString(),
          meetingEndAt: editMeetingEndTime ? dateWithTime(editMeetingDate, editMeetingEndTime).toISOString() : null,
          meetingLocation: editMeetingLocation.trim() || null,
          meetingNotifyOnSignup: editMeetingNotify,
        }
      : { meetingAt: null as string | null, meetingEndAt: null as string | null, meetingLocation: null as string | null };
    const updated = await ApiService.editNews(editItem.id, {
      title: editTitle,
      summary: editSummary || editContent.substring(0, 80) + "...",
      content: editContent,
      ...meeting,
    });
    updateNewsItem(editItem.id, updated);
    setEditItem(null);
    setEditSubmitting(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function handleCreate() {
    if (!newTitle.trim() || !newContent.trim()) return;
    if (isMeeting && !TIME_RE.test(meetingStartTime)) {
      notify(t("common.error", lang), t("news.meetingInvalidTime", lang));
      return;
    }
    if (isMeeting && meetingEndTime && !TIME_RE.test(meetingEndTime)) {
      notify(t("common.error", lang), t("news.meetingInvalidTime", lang));
      return;
    }
    setSubmitting(true);
    const item = await ApiService.createNews({
      title: newTitle,
      summary: newSummary || newContent.substring(0, 80) + "...",
      content: newContent,
      category: "announcement",
      author: user ? `${user.firstName} ${user.lastName}` : t("common.unknown", lang),
      authorId: user?.id ?? "",
      ...buildMeetingPayload(),
    });
    addNewsItem(item);
    setNewTitle("");
    setNewSummary("");
    setNewContent("");
    setIsMeeting(false);
    setMeetingLocation("");
    setMeetingEndTime("");
    setMeetingNotify(false);
    setSubmitting(false);
    setShowCreate(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function handleSignup(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const updated = await ApiService.signupNews(id);
      updateNewsItem(id, { meetingSignups: updated.meetingSignups, signedUp: true });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      notify(t("common.error", lang), err instanceof Error ? err.message : "Anmeldung fehlgeschlagen");
    }
  }

  async function handleUnsign(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const updated = await ApiService.unsignNews(id);
      updateNewsItem(id, { meetingSignups: updated.meetingSignups, signedUp: false });
    } catch (err) {
      notify(t("common.error", lang), err instanceof Error ? err.message : "Abmeldung fehlgeschlagen");
    }
  }

  async function handleToggleNotify(id: string, enabled: boolean) {
    try {
      const updated = await ApiService.setMeetingNotify(id, enabled);
      updateNewsItem(id, { meetingNotifyOnSignup: updated.meetingNotifyOnSignup });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      notify(t("common.error", lang), err instanceof Error ? err.message : "Einstellung konnte nicht gespeichert werden");
    }
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
  const topPad = useTopPad();

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
                  testID="news-add"
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
            <View style={{ marginTop: 60, alignItems: "center" }}><GlassLoader size={140} color={theme.tint} dark={istDunklesThema(theme.background)} /></View>
          )
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
        renderItem={({ item }) => (
          <NewsCard
            item={item}
            canModerate={canModerate}
            isOwner={item.authorId === user?.id}
            userId={user?.id}
            onMarkRead={handleMarkRead}
            onApprove={handleApprove}
            onReject={handleReject}
            onDelete={handleDelete}
            onEdit={handleEdit}
            onSignup={handleSignup}
            onUnsign={handleUnsign}
            onToggleNotify={handleToggleNotify}
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
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsMeeting(!isMeeting); }}
              style={[styles.meetingToggleRow, { borderColor: isMeeting ? "#8B5CF6" : theme.inputBorder, backgroundColor: isMeeting ? withAlpha("#8B5CF6", 0.08) : theme.inputBackground }]}
            >
              <Ionicons name="calendar" size={18} color={isMeeting ? "#8B5CF6" : theme.textTertiary} />
              <Text style={[styles.meetingToggleText, { color: isMeeting ? "#8B5CF6" : theme.text }]}>
                {t("news.meetingToggle", lang)}
              </Text>
              <Ionicons name={isMeeting ? "checkmark-circle" : "ellipse-outline"} size={20} color={isMeeting ? "#8B5CF6" : theme.textTertiary} />
            </Pressable>

            {isMeeting && (
              <View style={styles.meetingForm}>
                <DatePickerField value={meetingDate} onChange={setMeetingDate} label={t("news.meetingStart", lang)} />
                <View style={styles.timeRow}>
                  <View style={[styles.textInWrap, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder }]}>
                    <Text style={[styles.meetingTimeLabel, { color: theme.textTertiary }]}>{t("news.meetingStart", lang)}</Text>
                    <TextInput
                      value={meetingStartTime}
                      onChangeText={setMeetingStartTime}
                      placeholder="15:00"
                      placeholderTextColor={theme.textTertiary}
                      style={[styles.textInNoBorder, { color: theme.text }]}
                      autoCapitalize="none"
                    />
                  </View>
                  <View style={[styles.textInWrap, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder }]}>
                    <Text style={[styles.meetingTimeLabel, { color: theme.textTertiary }]}>{t("news.meetingEnd", lang)}</Text>
                    <TextInput
                      value={meetingEndTime}
                      onChangeText={setMeetingEndTime}
                      placeholder="–"
                      placeholderTextColor={theme.textTertiary}
                      style={[styles.textInNoBorder, { color: theme.text }]}
                      autoCapitalize="none"
                    />
                  </View>
                </View>
                <TextInput
                  value={meetingLocation}
                  onChangeText={setMeetingLocation}
                  placeholder={t("news.meetingLocationPlaceholder", lang)}
                  placeholderTextColor={theme.textTertiary}
                  style={[styles.textIn, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }]}
                />
                <Pressable onPress={() => setMeetingNotify(!meetingNotify)} style={styles.meetingNotifyToggle}>
                  <Ionicons name={meetingNotify ? "notifications" : "notifications-off-outline"} size={18} color={meetingNotify ? "#8B5CF6" : theme.textTertiary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.meetingToggleText, { color: meetingNotify ? "#8B5CF6" : theme.text }]}>{t("news.meetingNotify", lang)}</Text>
                    <Text style={[styles.hint, { color: theme.textTertiary }]}>{t("news.meetingNotifyHint", lang)}</Text>
                  </View>
                  <Ionicons name={meetingNotify ? "toggle" : "toggle-outline"} size={22} color={meetingNotify ? "#8B5CF6" : theme.textTertiary} />
                </Pressable>
              </View>
            )}

            <Text style={[styles.hint, { color: theme.textTertiary }]}>{t("news.submitHint", lang)}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={handleCreate}
              disabled={submitting}
              style={[styles.submitBtn, { backgroundColor: theme.tint }]}
            >
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
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setEditIsMeeting(!editIsMeeting); }}
              style={[styles.meetingToggleRow, { borderColor: editIsMeeting ? "#8B5CF6" : theme.inputBorder, backgroundColor: editIsMeeting ? withAlpha("#8B5CF6", 0.08) : theme.inputBackground }]}
            >
              <Ionicons name="calendar" size={18} color={editIsMeeting ? "#8B5CF6" : theme.textTertiary} />
              <Text style={[styles.meetingToggleText, { color: editIsMeeting ? "#8B5CF6" : theme.text }]}>
                {t("news.meetingToggle", lang)}
              </Text>
              <Ionicons name={editIsMeeting ? "checkmark-circle" : "ellipse-outline"} size={20} color={editIsMeeting ? "#8B5CF6" : theme.textTertiary} />
            </Pressable>

            {editIsMeeting && (
              <View style={styles.meetingForm}>
                <DatePickerField value={editMeetingDate} onChange={setEditMeetingDate} label={t("news.meetingStart", lang)} />
                <View style={styles.timeRow}>
                  <View style={[styles.textInWrap, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder }]}>
                    <Text style={[styles.meetingTimeLabel, { color: theme.textTertiary }]}>{t("news.meetingStart", lang)}</Text>
                    <TextInput
                      value={editMeetingStartTime}
                      onChangeText={setEditMeetingStartTime}
                      placeholder="15:00"
                      placeholderTextColor={theme.textTertiary}
                      style={[styles.textInNoBorder, { color: theme.text }]}
                      autoCapitalize="none"
                    />
                  </View>
                  <View style={[styles.textInWrap, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder }]}>
                    <Text style={[styles.meetingTimeLabel, { color: theme.textTertiary }]}>{t("news.meetingEnd", lang)}</Text>
                    <TextInput
                      value={editMeetingEndTime}
                      onChangeText={setEditMeetingEndTime}
                      placeholder="–"
                      placeholderTextColor={theme.textTertiary}
                      style={[styles.textInNoBorder, { color: theme.text }]}
                      autoCapitalize="none"
                    />
                  </View>
                </View>
                <TextInput
                  value={editMeetingLocation}
                  onChangeText={setEditMeetingLocation}
                  placeholder={t("news.meetingLocationPlaceholder", lang)}
                  placeholderTextColor={theme.textTertiary}
                  style={[styles.textIn, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }]}
                />
                <Pressable onPress={() => setEditMeetingNotify(!editMeetingNotify)} style={styles.meetingNotifyToggle}>
                  <Ionicons name={editMeetingNotify ? "notifications" : "notifications-off-outline"} size={18} color={editMeetingNotify ? "#8B5CF6" : theme.textTertiary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.meetingToggleText, { color: editMeetingNotify ? "#8B5CF6" : theme.text }]}>{t("news.meetingNotify", lang)}</Text>
                    <Text style={[styles.hint, { color: theme.textTertiary }]}>{t("news.meetingNotifyHint", lang)}</Text>
                  </View>
                  <Ionicons name={editMeetingNotify ? "toggle" : "toggle-outline"} size={22} color={editMeetingNotify ? "#8B5CF6" : theme.textTertiary} />
                </Pressable>
              </View>
            )}

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
  card: { padding: 14, gap: 8 },
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
  rejectionBox: { flexDirection: "row", alignItems: "center", gap: 6, padding: 8, borderRadius: 8 },
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
  meetingToggleRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 14, borderRadius: 12, borderWidth: 1,
  },
  meetingToggleText: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  meetingForm: { gap: 12 },
  timeRow: { flexDirection: "row", gap: 10 },
  textInWrap: { flex: 1, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, borderRadius: 12, borderWidth: 1 },
  meetingTimeLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2 },
  textInNoBorder: { fontSize: 15, fontFamily: "Inter_500Medium", padding: 0 },
  meetingNotifyToggle: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 4,
  },
  meetingBox: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 6 },
  meetingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  meetingText: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  meetingActions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2 },
  meetingSignBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1,
  },
  meetingSignText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  meetingCountBtn: { flexDirection: "row", alignItems: "center", gap: 4, padding: 4 },
  meetingCountText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  meetingNotifyRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 2 },
  meetingNotifyText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  participantList: { gap: 2, paddingTop: 2, borderTopWidth: 1, borderTopColor: "rgba(128,128,128,0.15)" },
  participantText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  meetingEndedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  meetingEndedText: { fontSize: 11, fontFamily: "Inter_500Medium" },
});
