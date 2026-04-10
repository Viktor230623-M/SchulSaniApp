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
import { WaveBackground } from "@/components/WaveBackground";
import { t } from "@/constants/i18n";
import { getTheme } from "@/constants/theme";
import ApiService, { setAuthToken } from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const login = useAppStore((s) => s.login);
  const setTheme = useAppStore((s) => s.setTheme);
  const lang = useAppStore((s) => s.language);
  const theme = getTheme(useAppStore((s) => s.theme));

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);

  async function handleLogin() {
    if (!username.trim()) {
      setError(t("auth.usernameRequired", lang));
      return;
    }
    if (!password.trim()) {
      setError(t("auth.passwordRequired", lang));
      return;
    }
    setLoading(true);
    setError("");
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const { user, isTealUnlocked, token } = await ApiService.login({ username, password });
      if (isTealUnlocked) setTheme("teal");
      if (token) setAuthToken(token);
      login(user);
      router.replace("/(tabs)/news");
    } catch (err: any) {
      setError(err?.message ?? t("auth.loginFailed", lang));
    } finally {
      setLoading(false);
    }
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <WaveBackground color={theme.tintLight} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: topPad + 40, paddingBottom: insets.bottom + 40 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <MedicalCross size={64} color={theme.tint} animate />
            <Text style={[styles.appName, { color: theme.text }]}>SchulSanitäter</Text>
            <Text style={[styles.appSubtitle, { color: theme.textSecondary }]}>
              Verwaltungssystem · gymbla.de
            </Text>
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: theme.card, borderColor: theme.cardBorder },
            ]}
          >
            <View style={styles.iservHeader}>
              <View style={[styles.iservBadge, { backgroundColor: "#EFF6FF" }]}>
                <Text style={styles.iservBadgeText}>IServ</Text>
              </View>
              <Text style={[styles.iservTitle, { color: theme.text }]}>
                {t("auth.iservLogin", lang)}
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>
                {t("auth.username", lang)}
              </Text>
              <View
                style={[
                  styles.inputWrap,
                  { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder },
                ]}
              >
                <Ionicons name="person-outline" size={18} color={theme.textTertiary} />
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Benutzername"
                  placeholderTextColor={theme.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  style={[styles.input, { color: theme.text }]}
                  onSubmitEditing={handleLogin}
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>
                {t("auth.password", lang)}
              </Text>
              <View
                style={[
                  styles.inputWrap,
                  { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder },
                ]}
              >
                <Ionicons name="lock-closed-outline" size={18} color={theme.textTertiary} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={theme.textTertiary}
                  secureTextEntry={!showPass}
                  autoComplete="password"
                  style={[styles.input, { color: theme.text, flex: 1 }]}
                  onSubmitEditing={handleLogin}
                  returnKeyType="done"
                />
                <Pressable onPress={() => setShowPass(!showPass)}>
                  <Ionicons
                    name={showPass ? "eye-off-outline" : "eye-outline"}
                    size={18}
                    color={theme.textTertiary}
                  />
                </Pressable>
              </View>
            </View>

            {!!error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color="#EF4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Pressable
              onPress={handleLogin}
              disabled={loading}
              style={({ pressed }) => [
                styles.loginButton,
                { backgroundColor: "#005BAA", opacity: loading ? 0.7 : pressed ? 0.9 : 1 },
              ]}
            >
              {loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.loginButtonText}>{t("auth.loginLoading", lang)}</Text>
                </View>
              ) : (
                <Text style={styles.loginButtonText}>{t("auth.loginButton", lang)}</Text>
              )}
            </Pressable>

            <Text style={[styles.footerNote, { color: theme.textTertiary }]}>
              {t("auth.iservNote", lang)}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 24, alignItems: "center" },
  header: { alignItems: "center", gap: 8, marginBottom: 32 },
  appName: { fontSize: 26, fontFamily: "Inter_700Bold", marginTop: 12 },
  appSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular" },
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
  iservHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  iservBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  iservBadgeText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#1D4ED8", letterSpacing: 0.5 },
  iservTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  inputGroup: { gap: 6 },
  label: { fontSize: 13, fontFamily: "Inter_500Medium" },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#FEF2F2",
  },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#EF4444", flex: 1 },
  loginButton: { paddingVertical: 15, borderRadius: 12, alignItems: "center" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  loginButtonText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
  footerNote: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
});
