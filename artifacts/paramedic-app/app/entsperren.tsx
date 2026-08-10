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
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MedicalCross } from "@/components/MedicalCross";
import { useTopPad } from "@/hooks/useTopPad";
import { SCHOOL_NAME } from "@/constants/appConfig";
import { t } from "@/constants/i18n";
import { getTheme, istDunklesThema, withAlpha } from "@/constants/theme";
import ApiService, { ensureCryptoUnlocked } from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";

/**
 * Entsperrt die Ende-zu-Ende-Verschluesselung dieser Sitzung. Gezeigt wird der
 * Screen immer dann, wenn die Sitzung besteht, der KEK aber noch nicht
 * eingegeben wurde -- also nach einem Reload, fuer OIDC-Konten nach dem
 * Login-Umweg und nach dem Passwort-Wechsel. Ist noch kein Schluesselpaar
 * vorhanden (frisches OIDC-Konto), wird hier erstmals ein Entsperr-Code
 * gesetzt; das Passwort bzw. der Code verlaesst das Geraet nie.
 */
export default function EntsperrenScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.language);
  const theme = getTheme(useAppStore((s) => s.theme));
  const topPad = useTopPad();

  const [hasKeypair, setHasKeypair] = useState<boolean | null>(null);
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    ApiService.getMyCryptoKey()
      .then((data) => {
        if (!cancelled) setHasKeypair(data.hasKeypair);
      })
      .catch(() => {
        if (!cancelled) setHasKeypair(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleUnlock() {
    if (!secret.trim()) return;
    setBusy(true);
    setError("");
    try {
      await ensureCryptoUnlocked(secret);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)/news");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("crypto.unlockFailed", lang));
    } finally {
      setBusy(false);
    }
  }

  const dunkel = istDunklesThema(theme.background);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: topPad + 40, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <MedicalCross size={56} color={theme.tint} animate />
          <Text style={[styles.title, { color: theme.text }]}>{SCHOOL_NAME}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <View style={styles.iconRow}>
            <View style={[styles.iconBox, { backgroundColor: theme.tintLight }]}>
              <Ionicons name="lock-closed-outline" size={22} color={theme.tint} />
            </View>
            <View style={styles.copy}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                {hasKeypair === false ? t("crypto.setupTitle", lang) : t("crypto.lockedTitle", lang)}
              </Text>
              <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
                {hasKeypair === false ? t("crypto.setupDesc", lang) : t("crypto.lockedDesc", lang)}
              </Text>
            </View>
          </View>

          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
            {hasKeypair === false ? t("crypto.unlockCode", lang) : t("crypto.secret", lang)}
          </Text>
          <View style={[styles.secretRow, { borderColor: theme.inputBorder, backgroundColor: theme.inputBackground }]}>
            <TextInput
              value={secret}
              onChangeText={setSecret}
              placeholder={hasKeypair === false ? t("crypto.unlockCodePlaceholder", lang) : t("crypto.secretPlaceholder", lang)}
              placeholderTextColor={theme.textTertiary}
              secureTextEntry={!showSecret}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={handleUnlock}
              style={[styles.secretInput, { color: theme.text }]}
            />
            <Pressable
              onPress={() => setShowSecret((v) => !v)}
              hitSlop={8}
              style={styles.secretToggle}
            >
              <Ionicons name={showSecret ? "eye-off-outline" : "eye-outline"} size={20} color={theme.textTertiary} />
            </Pressable>
          </View>

          {!!error && (
            <View style={[styles.errorBox, { backgroundColor: withAlpha(theme.danger, 0.1) }]}>
              <Ionicons name="alert-circle" size={18} color={theme.danger} />
              <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
            </View>
          )}

          <Pressable
            disabled={busy || !secret.trim()}
            onPress={handleUnlock}
            style={({ pressed }) => [
              styles.unlockBtn,
              { backgroundColor: theme.tint, opacity: busy || !secret.trim() ? 0.7 : pressed ? 0.9 : 1 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="key-outline" size={18} color="#fff" />
                <Text style={styles.unlockBtnText}>
                  {hasKeypair === false ? t("crypto.setupButton", lang) : t("crypto.unlockButton", lang)}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 24, alignItems: "center" },
  header: { alignItems: "center", gap: 12, marginBottom: 32 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  card: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  iconRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  iconBox: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  cardBody: { fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular" },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  secretRow: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  secretInput: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },
  secretToggle: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10 },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: "Inter_400Regular" },
  unlockBtn: {
    minHeight: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  unlockBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
