import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTopPad } from "@/hooks/useTopPad";
import { getTheme } from "@/constants/theme";
import { t } from "@/constants/i18n";
import { notify } from "@/lib/dialog";
import ApiService from "@/services/ApiService";
import { toBase64 } from "@/services/crypto/encoding";
import { renderReportBundlePdf, type DecryptedReport } from "@/services/reportPdfClient";
import { has, useAppStore } from "@/store/useAppStore";

type Interval = "semiannual" | "annual" | "five_years";
type ExportRow = {
  id: string;
  fromAt: string | null;
  toAt: string;
  reportCount: number;
  status: "ready" | "downloaded";
  downloadedAt: string | null;
  createdAt: string;
};

const INTERVALS: Interval[] = ["semiannual", "annual", "five_years"];

function fmtDate(iso: string, lang: "de" | "en"): string {
  const d = new Date(iso);
  return d.toLocaleDateString(lang === "de" ? "de-DE" : "en-US", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function ExportsScreen() {
  const insets = useSafeAreaInsets();
  const themeKey = useAppStore((s) => s.theme);
  const theme = getTheme(themeKey);
  const topPad = useTopPad();
  const lang = useAppStore((s) => s.language);

  const canExport = has("reports.read_all") && has("reports.see_patient_info");
  const [interval, setInterval] = useState<Interval>("semiannual");
  const [exports, setExports] = useState<ExportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingInterval, setSavingInterval] = useState(false);
  const [creating, setCreating] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function load() {
    try {
      const data = await ApiService.getExportOverview();
      setInterval(data.interval);
      setExports(data.exports ?? []);
    } catch (err) {
      await notify(t("common.error", lang), err instanceof Error ? err.message : "Export konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canExport) { setLoading(false); return; }
    load();
  }, [canExport]);

  async function changeInterval(next: Interval) {
    if (next === interval) return;
    setSavingInterval(true);
    try {
      await ApiService.setExportInterval(next);
      setInterval(next);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      await notify(t("common.error", lang), err instanceof Error ? err.message : "Intervall konnte nicht gespeichert werden");
    } finally {
      setSavingInterval(false);
    }
  }

  async function createExport() {
    setCreating(true);
    try {
      await ApiService.createExport();
      await load();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      await notify(t("common.error", lang), err instanceof Error ? err.message : t("settings.exportNoReports", lang));
    } finally {
      setCreating(false);
    }
  }

  async function downloadExport(exp: ExportRow) {
    if (downloadingId) return;
    setDownloadingId(exp.id);
    try {
      // Das PDF-Buendel entsteht im Client aus dem entschluesselten Inhalt.
      // Der Bundle-Abruf ist seitenwirkungsfrei; erst die Bestaetigung nach
      // erfolgreichem Download loescht die exportierten Protokolle.
      const bundle = await ApiService.getExportBundle(exp.id);
      const bytes = await renderReportBundlePdf(bundle.reports as DecryptedReport[], lang);
      const filename = `SchulSani-Export-${exp.id.slice(0, 8)}.pdf`;

      if (Platform.OS === "web") {
        const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
        const objectUrl = URL.createObjectURL(blob);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = filename;
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      } else {
        // App-privater Cache, kein iCloud-/Geräte-Sync: Das Buendel verlässt
        // das Geraet nur ueber das Teilen-Menue, nie ueber den Server.
        const dest = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(dest, toBase64(bytes), {
          encoding: FileSystem.EncodingType.Base64,
        });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(dest, { mimeType: "application/pdf" });
        }
      }

      await ApiService.confirmExport(exp.id);
      await load();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      await notify(t("common.error", lang), err instanceof Error ? err.message : t("settings.exportFailed", lang));
    } finally {
      setDownloadingId(null);
    }
  }

  if (!canExport) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top + topPad }]}>
        <Text style={[styles.denied, { color: theme.textTertiary }]}>Kein Zugriff</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + topPad }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t("settings.dataExport", lang)}</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        <Text style={[styles.desc, { color: theme.textSecondary }]}>{t("settings.dataExportDesc", lang)}</Text>

        {/* Intervall */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{t("settings.exportInterval", lang)}</Text>
          <Text style={[styles.cardHint, { color: theme.textTertiary }]}>{t("settings.exportIntervalHint", lang)}</Text>
          <View style={styles.segmentRow}>
            {INTERVALS.map((iv) => {
              const active = iv === interval;
              return (
                <Pressable
                  key={iv}
                  disabled={savingInterval}
                  onPress={() => changeInterval(iv)}
                  style={[styles.segment, active && { backgroundColor: theme.tint }]}
                >
                  <Text style={[styles.segmentText, { color: active ? "#fff" : theme.textSecondary }]}>
                    {t(`settings.interval${iv === "semiannual" ? "Semiannual" : iv === "annual" ? "Annual" : "FiveYears"}`, lang)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Warnung */}
        <View style={[styles.warnCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Ionicons name="warning-outline" size={20} color={theme.warning ?? theme.tint} />
          <Text style={[styles.warnText, { color: theme.textSecondary }]}>{t("settings.exportWarnDelete", lang)}</Text>
        </View>

        {/* Export jetzt erstellen */}
        <Pressable
          disabled={creating}
          onPress={createExport}
          style={[styles.createBtn, { backgroundColor: theme.tint }]}
        >
          {creating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="download-outline" size={18} color="#fff" />
              <Text style={styles.createBtnText}>{t("settings.exportNow", lang)}</Text>
            </>
          )}
        </Pressable>

        {/* Historie */}
        <Text style={[styles.historyTitle, { color: theme.text }]}>Verlauf</Text>
        {loading ? (
          <ActivityIndicator color={theme.tint} style={{ marginTop: 20 }} />
        ) : exports.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textTertiary }]}>{t("settings.exportEmpty", lang)}</Text>
        ) : (
          exports.map((exp) => {
            const ready = exp.status === "ready";
            return (
              <View key={exp.id} style={[styles.card, styles.rowCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                <View style={styles.rowInfo}>
                  <Text style={[styles.rowTitle, { color: theme.text }]}>
                    {t("settings.exportCount", lang).replace("{count}", String(exp.reportCount))}
                  </Text>
                  <Text style={[styles.rowMeta, { color: theme.textTertiary }]}>
                    {t("settings.exportCreatedAt", lang).replace("{date}", fmtDate(exp.createdAt, lang))}
                  </Text>
                  {!ready && exp.downloadedAt && (
                    <Text style={[styles.rowMeta, { color: theme.textTertiary }]}>
                      {t("settings.exportDownloadedAt", lang).replace("{date}", fmtDate(exp.downloadedAt, lang))}
                    </Text>
                  )}
                  <View style={[styles.statusChip, { backgroundColor: ready ? theme.tint + "22" : theme.cardBorder }]}>
                    <Text style={[styles.statusText, { color: ready ? theme.tint : theme.textTertiary }]}>
                      {ready ? t("settings.exportReady", lang) : t("settings.exportDownloaded", lang)}
                    </Text>
                  </View>
                </View>
                {ready && (
                  <Pressable
                    disabled={downloadingId !== null}
                    onPress={() => downloadExport(exp)}
                    style={[styles.downloadBtn, { backgroundColor: theme.tint }]}
                  >
                    {downloadingId === exp.id ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="arrow-down" size={16} color="#fff" />
                        <Text style={styles.downloadBtnText}>{t("settings.exportDownload", lang)}</Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            );
          })
        )}
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
  },
  cardTitle: { fontSize: 16, fontWeight: "700" },
  cardHint: { fontSize: 12, lineHeight: 17, marginTop: 4, marginBottom: 12 },
  segmentRow: { flexDirection: "row", gap: 8 },
  segment: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  segmentText: { fontSize: 13, fontWeight: "600" },
  warnCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  warnText: { flex: 1, fontSize: 13, lineHeight: 18 },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 20,
  },
  createBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  historyTitle: { fontSize: 16, fontWeight: "700", marginBottom: 10 },
  empty: { textAlign: "center", marginTop: 10, fontSize: 14 },
  rowCard: { flexDirection: "row", alignItems: "center" },
  rowInfo: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: "700" },
  rowMeta: { fontSize: 12, marginTop: 2 },
  statusChip: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
  },
  statusText: { fontSize: 11, fontWeight: "600" },
  downloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginLeft: 10,
  },
  downloadBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  denied: { textAlign: "center", marginTop: 40, fontSize: 15 },
});
