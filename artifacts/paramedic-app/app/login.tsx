import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
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
import ApiService from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const login = useAppStore((s) => s.login);
  const lang = useAppStore((s) => s.language);
  const theme = getTheme(useAppStore((s) => s.theme));

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);

  async function handleLogin() {
    if (!username.trim()) {
      setError("Benutzername erforderlich");
      return;
    }
    setLoading(true);
    setError("");
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const user = await ApiService.login({ username, password });
      login(user);
      router.replace("/(tabs)/news");
    } catch {
      setError("Anmeldung fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setLoading(false);
    }
  }

  async function handleIServLogin() {
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await new Promise((r) => setTimeout(r, 800));
    const user = await ApiService.login({ username: "iserv-user", password: "" });
    login(user);
    router.replace("/(tabs)/news");
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
            <Text style={[styles.appName, { color: theme.text }]}>
              SchulSanitäter
            </Text>
            <Text style={[styles.appSubtitle, { color: theme.textSecondary }]}>
              Verwaltungssystem
            </Text>
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: theme.card, borderColor: theme.cardBorder },
            ]}
          >
            <Pressable
              onPress={handleIServLogin}
              disabled={loading}
              style={({ pressed }) => [
                styles.iservButton,
                { backgroundColor: "#005BAA", opacity: pressed ? 0.85 : 1 },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MaterialCommunityIcons name="school" size={20} color="#fff" />
                  <Text style={styles.iservButtonText}>
                    {t("auth.iserv", lang)}
                  </Text>
                </>
              )}
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
              <Text style={[styles.dividerText, { color: theme.textTertiary }]}>
                {t("auth.or", lang)}
              </Text>
              <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>
                {t("auth.username", lang)}
              </Text>
              <View
                style={[
                  styles.inputWrap,
                  {
                    backgroundColor: theme.inputBackground,
                    borderColor: theme.inputBorder,
                  },
                ]}
              >
                <Ionicons name="person-outline" size={18} color={theme.textTertiary} />
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  placeholder="max.mueller"
                  placeholderTextColor={theme.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.input, { color: theme.text }]}
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
                  {
                    backgroundColor: theme.inputBackground,
                    borderColor: theme.inputBorder,
                  },
                ]}
              >
                <Ionicons name="lock-closed-outline" size={18} color={theme.textTertiary} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={theme.textTertiary}
                  secureTextEntry={!showPass}
                  style={[styles.input, { color: theme.text, flex: 1 }]}
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
              <View style={[styles.errorBox, { backgroundColor: "#FEF2F2" }]}>
                <Ionicons name="alert-circle" size={16} color="#EF4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Pressable
              onPress={handleLogin}
              disabled={loading}
              style={({ pressed }) => [
                styles.loginButton,
                { backgroundColor: theme.tint, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.loginButtonText}>
                  {t("auth.loginButton", lang)}
                </Text>
              )}
            </Pressable>

            <Text style={[styles.hintText, { color: theme.textTertiary }]}>
              {t("auth.hint", lang)}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    alignItems: "center",
  },
  header: {
    alignItems: "center",
    gap: 8,
    marginBottom: 32,
  },
  appName: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    marginTop: 12,
  },
  appSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
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
  iservButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
  },
  iservButtonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  inputGroup: { gap: 6 },
  label: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#EF4444",
    flex: 1,
  },
  loginButton: {
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  loginButtonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  hintText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
