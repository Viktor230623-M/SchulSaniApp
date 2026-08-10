import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTopPad } from "@/hooks/useTopPad";
import { t } from "@/constants/i18n";
import { getTheme } from "@/constants/theme";
import type { User } from "@/models";
import { notify } from "@/lib/dialog";
import ApiService from "@/services/ApiService";
import { has, useAppStore } from "@/store/useAppStore";

/**
 * Verwaltung der Ende-zu-Ende-Verschluesselung. Hier wird der schulweite
 * Datenschluessel erzeugt, der Zugriff darauf freigegeben (Grant) und nach
 * Geraeteverlust neu verpackt (Recovery). Der Server sieht nur Umschlaege --
 * das Verpacken passiert in diesem Client.
 */
export default function CryptoScreen() {
  const insets = useSafeAreaInsets();
  const themeKey = useAppStore((s) => s.theme);
  const theme = getTheme(themeKey);
  const topPad = useTopPad();
  const lang = useAppStore((s) => s.language);

  const canManage = has("reports.read_all") && has("reports.see_patient_info");
  const [latestVersion, setLatestVersion] = useState<number | null>(null);
  const [wrapCount, setWrapCount] = useState(0);
  const [users, setUsers] = useState<User[]>([]);
  const [publicKeys, setPublicKeys] = useState<Map<string, string>>(new Map());
  const [legacyCount, setLegacyCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [dekBusy, setDekBusy] = useState(false);
  const [grantBusy, setGrantBusy] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrationDone, setMigrationDone] = useState(false);

  async function load() {
    try {
      const [dek, keys, users] = await Promise.all([
        ApiService.getMyDekWraps(),
        ApiService.listSchoolPublicKeys(),
        ApiService.getAllUsers(),
      ]);
      setLatestVersion(dek.latestVersion);
      setWrapCount(dek.wraps.length);
      setPublicKeys(new Map(keys.map((k) => [k.userId, k.publicKey])));
      setUsers(users);
      const legacy = await ApiService.listLegacyReports();
      setLegacyCount(legacy.length);
    } catch {
      // Teilausfaelle einzelner Abrufe sind kein Abbruchgrund; der Screen bleibt
      // bedienbar und zeigt an, was geladen werden konnte.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canManage) { setLoading(false); return; }
    load();
  }, [canManage]);

  async function handleCreateDek() {
    setDekBusy(true);
    try {
      const version = await ApiService.initDek();
      setLatestVersion(version);
      setWrapCount((c) => c + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await notify(t("common.success", lang), t("crypto.dekCreated", lang));
    } catch (err) {
      await notify(t("common.error", lang), err instanceof Error ? err.message : t("crypto.dekCreateFailed", lang));
    } finally {
      setDekBusy(false);
    }
  }

  async function handleGrant(user: User, recover: boolean) {
    if (grantBusy) return;
    setGrantBusy(user.id);
    try {
      await ApiService.grantDek(user.id, recover);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await notify(
        t("common.success", lang),
        recover ? t("crypto.recoverDone", lang) : t("crypto.grantDone", lang),
      );
    } catch (err) {
      await notify(t("common.error", lang), err instanceof Error ? err.message : t("crypto.grantFailed", lang));
    } finally {
      setGrantBusy(null);
    }
  }

  async function handleMigrate() {
    if (migrating || !legacyCount) return;
    setMigrating(true);
    try {
      const legacy = await ApiService.listLegacyReports();
      for (const report of legacy) {
        await ApiService.putLegacyReportEncrypted(report.id);
      }
      setLegacyCount(0);
      setMigrationDone(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await notify(t("common.success", lang), t("crypto.migrationDone", lang));
    } catch (err) {
      await notify(t("common.error", lang), err instanceof Error ? err.message : t("crypto.migrationFailed", lang));
    } finally {
      setMigrating(false);
    }
  }

  if (!canManage) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top + topPad }]}>
        <Text style={[styles.denied, { color: theme.textTertiary }]}>{t("crypto.noAccess", lang)}</Text>
      </View>
    );
  }

  const usersWithKeys = users.filter((u) => publicKeys.has(u.id));

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + topPad }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t("crypto.title", lang)}</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        <Text style={[styles.desc, { color: theme.textSecondary }]}>{t("crypto.desc", lang)}</Text>

        {/* Datenschluessel */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{t("crypto.dekTitle", lang)}</Text>
          <Text style={[styles.cardHint, { color: theme.textTertiary }]}>{t("crypto.dekHint", lang)}</Text>
          {loading ? (
            <ActivityIndicator color={theme.tint} style={{ marginTop: 8 }} />
          ) : latestVersion === null ? (
            <Pressable
              disabled={dekBusy}
              onPress={handleCreateDek}
              style={[styles.primaryBtn, { backgroundColor: theme.tint }]}
            >
              {dekBusy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="key-outline" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>{t("crypto.dekCreate", lang)}</Text>
                </>
              )}
            </Pressable>
          ) : (
            <>
              <View style={styles.statusRow}>
                <View style={[styles.statusChip, { backgroundColor: theme.tint + "22" }]}>
                  <Text style={[styles.statusText, { color: theme.tint }]}>
                    {t("crypto.dekVersion", lang).replace("{v}", String(latestVersion))}
                  </Text>
                </View>
                <Text style={[styles.statusMeta, { color: theme.textTertiary }]}>
                  {t("crypto.wrapCount", lang).replace("{n}", String(wrapCount))}
                </Text>
              </View>
              <Pressable
                disabled={dekBusy}
                onPress={handleCreateDek}
                style={[styles.secondaryBtn, { borderColor: theme.tint }]}
              >
                {dekBusy ? (
                  <ActivityIndicator color={theme.tint} size="small" />
                ) : (
                  <Text style={[styles.secondaryBtnText, { color: theme.tint }]}>{t("crypto.dekRotate", lang)}</Text>
                )}
              </Pressable>
            </>
          )}
        </View>

        {/* Zugriff freigeben */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{t("crypto.grantsTitle", lang)}</Text>
          <Text style={[styles.cardHint, { color: theme.textTertiary }]}>{t("crypto.grantsHint", lang)}</Text>
          {loading ? (
            <ActivityIndicator color={theme.tint} style={{ marginTop: 8 }} />
          ) : usersWithKeys.length === 0 ? (
            <Text style={[styles.empty, { color: theme.textTertiary }]}>{t("crypto.noKeys", lang)}</Text>
          ) : (
            usersWithKeys.map((u) => {
              const busy = grantBusy === u.id;
              return (
                <View key={u.id} style={[styles.userRow, { borderColor: theme.cardBorder }]}>
                  <View style={styles.userInfo}>
                    <Text style={[styles.userName, { color: theme.text }]} numberOfLines={1}>
                      {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.email}
                    </Text>
                    <Text style={[styles.userMeta, { color: theme.textTertiary }]} numberOfLines={1}>
                      {u.email ?? u.id}
                    </Text>
                  </View>
                  <View style={styles.userActions}>
                    <Pressable
                      disabled={busy || latestVersion === null}
                      onPress={() => handleGrant(u, false)}
                      style={[styles.miniBtn, { backgroundColor: theme.tint, opacity: latestVersion === null ? 0.5 : 1 }]}
                    >
                      {busy ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.miniBtnText}>{t("crypto.grantButton", lang)}</Text>
                      )}
                    </Pressable>
                    <Pressable
                      disabled={busy || latestVersion === null}
                      onPress={() => handleGrant(u, true)}
                      style={[styles.miniBtn, styles.miniBtnOutline, { borderColor: theme.cardBorder, opacity: latestVersion === null ? 0.5 : 1 }]}
                    >
                      <Text style={[styles.miniBtnOutlineText, { color: theme.textSecondary }]}>{t("crypto.recoverButton", lang)}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Migration von Alt-Protokollen */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{t("crypto.migrationTitle", lang)}</Text>
          <Text style={[styles.cardHint, { color: theme.textTertiary }]}>{t("crypto.migrationHint", lang)}</Text>
          {loading ? (
            <ActivityIndicator color={theme.tint} style={{ marginTop: 8 }} />
          ) : legacyCount === null || legacyCount === 0 ? (
            <Text style={[styles.empty, { color: theme.textTertiary }]}>
              {migrationDone ? t("crypto.migrationDone", lang) : t("crypto.migrationNone", lang)}
            </Text>
          ) : (
            <Pressable
              disabled={migrating}
              onPress={handleMigrate}
              style={[styles.primaryBtn, { backgroundColor: theme.warning ?? theme.tint }]}
            >
              {migrating ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="shield-checkmark-outline" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>
                    {t("crypto.migrationButton", lang).replace("{n}", String(legacyCount))}
                  </Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 10,
  },
  backBtn: { padding: 6 },
  headerTitle: { fontSize: 20, fontWeight: "700", marginLeft: 8 },
  content: { paddingHorizontal: 16, paddingTop: 8 },
  desc: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    gap: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: "700" },
  cardHint: { fontSize: 12, lineHeight: 17 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusChip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: "700" },
  statusMeta: { fontSize: 12 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 13,
  },
  primaryBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  secondaryBtn: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 11,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: "700" },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    paddingVertical: 10,
  },
  userInfo: { flex: 1, gap: 2 },
  userName: { fontSize: 14, fontWeight: "600" },
  userMeta: { fontSize: 12 },
  userActions: { flexDirection: "row", gap: 6 },
  miniBtn: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minWidth: 76,
    alignItems: "center",
  },
  miniBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  miniBtnOutline: { borderWidth: 1 },
  miniBtnOutlineText: { fontSize: 12, fontWeight: "600" },
  empty: { fontSize: 13, textAlign: "center", marginTop: 4 },
  denied: { textAlign: "center", marginTop: 40, fontSize: 15 },
});
