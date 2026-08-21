import * as Linking from "expo-linking";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { appleCardStyle } from "@/components/AppleSurface";
import { t } from "@/constants/i18n";
import { getTheme } from "@/constants/theme";
import type { AppLanguage } from "@/models";
import ApiService, { type PrivacyRequest, type PrivacyRequestType } from "@/services/ApiService";
import { notify } from "@/lib/dialog";
import { useAppStore } from "@/store/useAppStore";
import { useTopPad } from "@/hooks/useTopPad";

const requestTypes: PrivacyRequestType[] = [
  "access",
  "rectification",
  "erasure",
  "restriction",
  "portability",
  "objection",
];

function typeLabel(type: PrivacyRequestType, lang: AppLanguage): string {
  return t(`privacyRequests.type${type.charAt(0).toUpperCase()}${type.slice(1)}`, lang);
}

function statusLabel(status: PrivacyRequest["status"], lang: AppLanguage): string {
  const key = status === "in_review" ? "InReview" : status.charAt(0).toUpperCase() + status.slice(1);
  return t(`privacyRequests.status${key}`, lang);
}

export default function PrivacyRequestScreen() {
  const lang = useAppStore((state) => state.language);
  const user = useAppStore((state) => state.user);
  const theme = getTheme(useAppStore((state) => state.theme));
  const insets = useSafeAreaInsets();
  const topPad = useTopPad();
  const [requestType, setRequestType] = useState<PrivacyRequestType>("access");
  const [subjectName, setSubjectName] = useState("");
  const [subjectRelation, setSubjectRelation] = useState("");
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const canManageRequests = user?.permissions?.includes("users.read_all") === true;

  async function loadRequests() {
    setLoading(true);
    setLoadError(false);
    try {
      setRequests(await ApiService.getPrivacyRequests());
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRequests();
  }, []);

  async function submit() {
    const cleanName = subjectName.trim();
    if (!cleanName) {
      await notify(t("common.error", lang), t("privacyRequests.subjectName", lang));
      return;
    }
    setSaving(true);
    try {
      const created = await ApiService.createPrivacyRequest({
        requestType,
        subjectName: cleanName,
        ...(subjectRelation.trim() ? { subjectRelation: subjectRelation.trim() } : {}),
      });
      setRequests((current) => [created, ...current]);
      setSubjectName("");
      setSubjectRelation("");
      await notify(t("common.ok", lang), t("privacyRequests.saved", lang));
    } catch (error) {
      await notify(t("common.error", lang), error instanceof Error ? error.message : t("privacyRequests.saveFailed", lang));
    } finally {
      setSaving(false);
    }
  }

  function openEmail() {
    const subject = encodeURIComponent(t("privacyRequests.emailSubject", lang));
    const body = encodeURIComponent(t("privacyRequests.emailBody", lang));
    void Linking.openURL(`mailto:impressum@schulsaniapp.com?subject=${subject}&body=${body}`);
  }

  async function updateStatus(request: PrivacyRequest, status: PrivacyRequest["status"]) {
    setUpdatingId(request.id);
    try {
      const updated = await ApiService.updatePrivacyRequest(request.id, status);
      setRequests((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (error) {
      await notify(t("common.error", lang), error instanceof Error ? error.message : t("privacyRequests.saveFailed", lang));
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: insets.bottom + 40, paddingHorizontal: 16, gap: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("common.backHome", lang)}
          hitSlop={8}
          style={styles.backButton}
        >
          <Text style={[styles.backText, { color: theme.tint }]}>‹</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{t("privacyRequests.title", lang)}</Text>
      </View>

      <View style={[styles.card, appleCardStyle(theme)]}>
        <Text style={[styles.intro, { color: theme.textSecondary }]}>{t("privacyRequests.intro", lang)}</Text>
        <Text style={[styles.label, { color: theme.text }]}>{t("privacyRequests.typeLabel", lang)}</Text>
        <View style={styles.typeList}>
          {requestTypes.map((type) => {
            const selected = type === requestType;
            return (
              <Pressable
                key={type}
                onPress={() => setRequestType(type)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={typeLabel(type, lang)}
                style={({ pressed }) => [
                  styles.typeButton,
                  {
                    backgroundColor: selected ? theme.tint : theme.backgroundTertiary,
                    borderColor: selected ? theme.tint : theme.cardBorder,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={[styles.typeText, { color: selected ? "#fff" : theme.text }]}>{typeLabel(type, lang)}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { color: theme.text }]}>{t("privacyRequests.subjectName", lang)}</Text>
        <TextInput
          value={subjectName}
          onChangeText={setSubjectName}
          placeholder={t("privacyRequests.subjectNamePlaceholder", lang)}
          placeholderTextColor={theme.textTertiary}
          autoCapitalize="words"
          maxLength={120}
          style={[styles.input, { backgroundColor: theme.backgroundTertiary, borderColor: theme.cardBorder, color: theme.text }]}
          accessibilityLabel={t("privacyRequests.subjectName", lang)}
        />

        <Text style={[styles.label, { color: theme.text }]}>{t("privacyRequests.subjectRelation", lang)}</Text>
        <TextInput
          value={subjectRelation}
          onChangeText={setSubjectRelation}
          placeholder={t("privacyRequests.subjectRelationPlaceholder", lang)}
          placeholderTextColor={theme.textTertiary}
          maxLength={40}
          style={[styles.input, { backgroundColor: theme.backgroundTertiary, borderColor: theme.cardBorder, color: theme.text }]}
          accessibilityLabel={t("privacyRequests.subjectRelation", lang)}
        />

        <Pressable
          onPress={() => void submit()}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={t("privacyRequests.submit", lang)}
          style={({ pressed }) => [styles.submit, { backgroundColor: theme.tint, opacity: pressed || saving ? 0.7 : 1 }]}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{t("privacyRequests.submit", lang)}</Text>}
        </Pressable>

        <Pressable
          onPress={openEmail}
          accessibilityRole="link"
          accessibilityLabel={t("privacyRequests.emailFallback", lang)}
          style={({ pressed }) => [styles.emailButton, { borderColor: theme.tint, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.emailText, { color: theme.tint }]}>{t("privacyRequests.emailFallback", lang)}</Text>
        </Pressable>
      </View>

      <View style={[styles.card, appleCardStyle(theme)]}>
        <Text style={[styles.label, { color: theme.text }]}>{t("privacyRequests.title", lang)}</Text>
        {loading ? (
          <ActivityIndicator color={theme.tint} />
        ) : loadError ? (
          <Text style={[styles.emptyText, { color: theme.danger }]}>{t("privacyRequests.loadFailed", lang)}</Text>
        ) : requests.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.textTertiary }]}>{t("privacyRequests.empty", lang)}</Text>
        ) : (
          requests.map((request) => (
            <View key={request.id} style={[styles.requestRow, { borderTopColor: theme.cardBorder }]}>
              <View style={styles.requestInfo}>
                <Text style={[styles.requestType, { color: theme.text }]}>{typeLabel(request.requestType, lang)}</Text>
                <Text style={[styles.requestSubject, { color: theme.textSecondary }]}>{request.subjectName}</Text>
                <Text style={[styles.requestDate, { color: theme.textTertiary }]}>
                  {new Date(request.createdAt).toLocaleDateString(lang === "de" ? "de-DE" : "en-US")}
                </Text>
              </View>
              <View style={styles.requestActions}>
                <Text style={[styles.status, { color: theme.tint }]}>{statusLabel(request.status, lang)}</Text>
                {canManageRequests && (
                  <View style={styles.statusButtons}>
                    {(["in_review", "fulfilled", "rejected"] as const).map((status) => (
                      <Pressable
                        key={status}
                        onPress={() => void updateStatus(request, status)}
                        disabled={updatingId === request.id || request.status === status}
                        accessibilityRole="button"
                        accessibilityLabel={statusLabel(status, lang)}
                        style={({ pressed }) => [
                          styles.statusButton,
                          { borderColor: theme.cardBorder, opacity: pressed || updatingId === request.id || request.status === status ? 0.45 : 1 },
                        ]}
                      >
                        <Text style={[styles.statusButtonText, { color: theme.textSecondary }]}>{statusLabel(status, lang)}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  backButton: { width: 44, height: 44, justifyContent: "center" },
  backText: { fontSize: 38, lineHeight: 38 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold" },
  card: { padding: 16, gap: 12 },
  intro: { fontSize: 15, lineHeight: 22 },
  label: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  typeList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
  typeText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
  submit: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  submitText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emailButton: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1 },
  emailText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 15, lineHeight: 22 },
  requestRow: { flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, paddingTop: 12 },
  requestInfo: { flex: 1, gap: 2 },
  requestType: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  requestSubject: { fontSize: 14 },
  requestDate: { fontSize: 12 },
  requestActions: { alignItems: "flex-end", gap: 6 },
  status: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  statusButtons: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 4, maxWidth: 220 },
  statusButton: { minHeight: 32, justifyContent: "center", paddingHorizontal: 8, borderRadius: 8, borderWidth: 1 },
  statusButtonText: { fontSize: 11, fontFamily: "Inter_500Medium" },
});
