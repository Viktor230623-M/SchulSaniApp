import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
import { t } from "@/constants/i18n";
import { getTheme, withAlpha } from "@/constants/theme";
import ApiService from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";

// Loeschen ist endgueltig und laeuft nur mit dem richtigen Passwort (lokale
// Konten). OIDC-/Apple-Konten ohne Passwort landen hier nie: die Einstellungen
// fuehren nur bei hasPassword hierher.
export default function KontoLoeschenScreen() {
  const insets = useSafeAreaInsets();
  const topPad = useTopPad();
  const lang = useAppStore((s) => s.language);
  const theme = getTheme(useAppStore((s) => s.theme));
  const logout = useAppStore((s) => s.logout);

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    if (!password) return;
    setLoading(true);
    setError("");
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await ApiService.deleteAccount(password);
      logout();
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settings.deleteAccountFailed", lang));
      setLoading(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: topPad + 40, paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <MedicalCross size={64} color={theme.danger} animate />
            <Text style={[styles.heading, { color: theme.text }]}>{t("settings.deleteAccountPasswordHeading", lang)}</Text>
            <Text style={[styles.body, { color: theme.textSecondary }]}>{t("settings.deleteAccountPasswordBody", lang)}</Text>
          </View>

          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>{t("auth.currentPassword", lang)}</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                accessibilityLabel={t("auth.currentPassword", lang)}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
                style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }]}
                placeholderTextColor={theme.textTertiary}
                onSubmitEditing={handleDelete}
                returnKeyType="done"
              />
            </View>

            {!!error && (
              <View style={[styles.errorBox, { backgroundColor: withAlpha(theme.danger, 0.1) }]}>
                <Ionicons name="alert-circle" size={16} color={theme.danger} />
                <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
              </View>
            )}

            <Pressable onPress={() => setShowPassword((visible) => !visible)} style={styles.visibilityLink}>
              <Text style={[styles.visibilityText, { color: theme.textTertiary }]}>
                {showPassword ? t("auth.hidePassword", lang) : t("auth.showPassword", lang)}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleDelete}
              disabled={loading || !password}
              style={({ pressed }) => [styles.confirmButton, { backgroundColor: theme.danger, opacity: loading ? 0.7 : !password ? 0.4 : pressed ? 0.9 : 1 }]}
            >
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.confirmButtonText}>{t("settings.deleteAccountPasswordButton", lang)}</Text>}
            </Pressable>
          </View>

          <Pressable onPress={() => router.back()} style={styles.cancelLink}>
            <Text style={[styles.cancelText, { color: theme.textTertiary }]}>{t("common.cancel", lang)}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 24, alignItems: "center" },
  header: { alignItems: "center", gap: 8, marginBottom: 32 },
  heading: { fontSize: 22, fontFamily: "Inter_700Bold", marginTop: 12, textAlign: "center" },
  body: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", maxWidth: 320 },
  card: { width: "100%", maxWidth: 400, borderRadius: 20, padding: 24, borderWidth: 1, gap: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  inputGroup: { width: "100%", gap: 6 },
  label: { fontSize: 13, fontFamily: "Inter_500Medium" },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10 },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  visibilityLink: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  visibilityText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  confirmButton: { paddingVertical: 15, borderRadius: 12, alignItems: "center" },
  confirmButtonText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
  cancelLink: { marginTop: 20, minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  cancelText: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
