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
import { getTheme } from "@/constants/theme";
import ApiService from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";

export default function PasswortWechselnScreen() {
  const insets = useSafeAreaInsets();
  const topPad = useTopPad();
  const lang = useAppStore((s) => s.language);
  const theme = getTheme(useAppStore((s) => s.theme));
  const user = useAppStore((s) => s.user);
  const login = useAppStore((s) => s.login);
  const logout = useAppStore((s) => s.logout);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleChange() {
    if (newPassword.length < 10) {
      setError(t("auth.passwordTooShort", lang));
      return;
    }
    if (newPassword !== repeatPassword) {
      setError(t("auth.passwordMismatch", lang));
      return;
    }

    setLoading(true);
    setError("");
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await ApiService.changePassword(currentPassword, newPassword);
      login(user ? { ...user, mustChangePassword: false } : user!);
      router.replace(user?.profileConfirmedAt === null ? "/name-bestaetigen" : "/(tabs)/news");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.passwordChangeFailed", lang));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await ApiService.logout();
    logout();
    router.replace("/login");
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
            <MedicalCross size={64} color={theme.tint} animate />
            <Text style={[styles.heading, { color: theme.text }]}>{t("auth.changePasswordHeading", lang)}</Text>
            <Text style={[styles.body, { color: theme.textSecondary }]}>{t("auth.changePasswordBody", lang)}</Text>
          </View>

          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <PasswordField label={t("auth.currentPassword", lang)} value={currentPassword} onChangeText={setCurrentPassword} hidden={!showPasswords} theme={theme} />
            <PasswordField label={t("auth.newPassword", lang)} value={newPassword} onChangeText={setNewPassword} hidden={!showPasswords} theme={theme} />
            <PasswordField label={t("auth.repeatPassword", lang)} value={repeatPassword} onChangeText={setRepeatPassword} hidden={!showPasswords} theme={theme} onSubmitEditing={handleChange} />

            {!!error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color="#EF4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Pressable onPress={() => setShowPasswords((visible) => !visible)} style={styles.visibilityLink}>
              <Text style={[styles.visibilityText, { color: theme.textTertiary }]}>
                {showPasswords ? t("auth.hidePassword", lang) : t("auth.showPassword", lang)}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleChange}
              disabled={loading || !currentPassword || !newPassword || !repeatPassword}
              style={({ pressed }) => [styles.confirmButton, { backgroundColor: theme.tint, opacity: loading ? 0.7 : !currentPassword || !newPassword || !repeatPassword ? 0.4 : pressed ? 0.9 : 1 }]}
            >
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.confirmButtonText}>{t("auth.changePasswordButton", lang)}</Text>}
            </Pressable>
          </View>

          <Pressable onPress={handleLogout} style={styles.logoutLink}>
            <Text style={[styles.logoutLinkText, { color: theme.textTertiary }]}>{t("settings.logout", lang)}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function PasswordField({ label, value, onChangeText, hidden, theme, onSubmitEditing }: { label: string; value: string; onChangeText: (value: string) => void; hidden: boolean; theme: ReturnType<typeof getTheme>; onSubmitEditing?: () => void }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={hidden}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="password"
        style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }]}
        placeholderTextColor={theme.textTertiary}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={onSubmitEditing ? "done" : "next"}
      />
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
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, backgroundColor: "#FEF2F2" },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#EF4444", flex: 1 },
  visibilityLink: { alignSelf: "flex-start", paddingVertical: 4 },
  visibilityText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  confirmButton: { paddingVertical: 15, borderRadius: 12, alignItems: "center" },
  confirmButtonText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
  logoutLink: { marginTop: 20, padding: 8 },
  logoutLinkText: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
