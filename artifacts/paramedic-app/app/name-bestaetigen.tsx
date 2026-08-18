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

export default function NameBestaetigenScreen() {
  const insets = useSafeAreaInsets();
  const topPad = useTopPad();
  const lang = useAppStore((s) => s.language);
  const theme = getTheme(useAppStore((s) => s.theme));
  const user = useAppStore((s) => s.user);
  const login = useAppStore((s) => s.login);
  const logout = useAppStore((s) => s.logout);

  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    setLoading(true);
    setError("");
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const confirmed = await ApiService.confirmProfile(firstName.trim(), lastName.trim());
      login(confirmed);
      router.replace("/(tabs)/news");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.confirmFailed", lang));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await ApiService.logout();
    logout();
    router.replace("/login");
  }

  const canConfirm = firstName.trim().length > 0 && lastName.trim().length > 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: topPad + 40, paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <MedicalCross size={64} color={theme.tint} animate />
            <Text style={[styles.heading, { color: theme.text }]}>{t("auth.confirmHeading", lang)}</Text>
            <Text style={[styles.body, { color: theme.textSecondary }]}>{t("auth.confirmBody", lang)}</Text>
          </View>

          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>{t("common.firstName", lang)}</Text>
              <TextInput
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                autoCorrect={false}
                style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }]}
                placeholderTextColor={theme.textTertiary}
                returnKeyType="next"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>{t("common.lastName", lang)}</Text>
              <TextInput
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                autoCorrect={false}
                style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }]}
                placeholderTextColor={theme.textTertiary}
                onSubmitEditing={canConfirm ? handleConfirm : undefined}
                returnKeyType="done"
              />
            </View>

            {!!error && (
              <View style={[styles.errorBox, { backgroundColor: withAlpha(theme.danger, 0.1) }]}>
                <Ionicons name="alert-circle" size={16} color={theme.danger} />
                <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
              </View>
            )}

            <Pressable
              onPress={handleConfirm}
              disabled={!canConfirm || loading}
              style={({ pressed }) => [
                styles.confirmButton,
                { backgroundColor: theme.tint, opacity: !canConfirm ? 0.4 : loading ? 0.7 : pressed ? 0.9 : 1 },
              ]}
            >
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.confirmButtonText}>{t("auth.confirmButton", lang)}</Text>}
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 24, alignItems: "center" },
  header: { alignItems: "center", gap: 8, marginBottom: 32 },
  heading: { fontSize: 22, fontFamily: "Inter_700Bold", marginTop: 12, textAlign: "center" },
  body: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", maxWidth: 320 },
  card: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  inputGroup: { gap: 6 },
  label: { fontSize: 13, fontFamily: "Inter_500Medium" },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
  },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  confirmButton: { paddingVertical: 15, borderRadius: 12, alignItems: "center" },
  confirmButtonText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
  logoutLink: { marginTop: 20, padding: 8 },
  logoutLinkText: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
