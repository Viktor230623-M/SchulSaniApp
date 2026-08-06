import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useState } from "react";
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
import { SCHOOL_NAME } from "@/constants/appConfig";
import { t } from "@/constants/i18n";
import { getTheme } from "@/constants/theme";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ApiService, { setAuthToken, type AuthProviderInfo } from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";
import type { AppTheme } from "@/models";

// Symbol und Farbe je Anbieter, im Client abgeleitet -- der Server liefert nur
// Schluessel und Typ, keine Gestaltung. Google, Microsoft und Apple bekommen
// ihr eigenes Zeichen; alles andere ein neutrales nach Typ. Apples Knopf folgt
// den Human Interface Guidelines erst in Stueck 3, die Zuordnung entsteht hier.
function providerVisual(provider: AuthProviderInfo): { icon: keyof typeof Ionicons.glyphMap; color: string } {
  switch (provider.key) {
    case "google":
      return { icon: "logo-google", color: "#EA4335" };
    case "microsoft":
      return { icon: "logo-microsoft", color: "#00A4EF" };
    case "apple":
      return { icon: "logo-apple", color: "#000000" };
  }
  switch (provider.type) {
    case "local":
      return { icon: "key-outline", color: "#6B7280" };
    case "iserv-form":
      return { icon: "business-outline", color: "#1D4ED8" };
    case "oidc-redirect":
      return { icon: "arrow-forward-circle-outline", color: "#6B7280" };
  }
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const login = useAppStore((s) => s.login);
  const setTheme = useAppStore((s) => s.setTheme);
  const setToken = useAppStore((s) => s.setToken);
  const lang = useAppStore((s) => s.language);
  const theme = getTheme(useAppStore((s) => s.theme));

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Anmeldewege dieser Installation, siehe GET /auth/providers. `null` heisst
  // "noch am Laden" -- solange davon nichts gerendert, damit bei genau einem
  // Weg kein kurzes Aufblitzen einer Auswahl vor dem eigentlichen Formular
  // entsteht.
  const [providers, setProviders] = useState<AuthProviderInfo[] | null>(null);
  const [providersFailed, setProvidersFailed] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<AuthProviderInfo | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [redirectError, setRedirectError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await ApiService.getAuthProviders();
        if (cancelled) return;
        if (list.length === 0) throw new Error("Keine Anmeldewege konfiguriert");
        setProviders(list);
        if (list.length === 1) setSelectedProvider(list[0]);
      } catch {
        // Netzfehler beim Start: auf die IServ-Formularroute ausweichen,
        // damit das Formular nicht leer bleibt. Ohne IServ in der
        // Installation hilft nur ein Reload -- der Abruf war schon gestoert.
        if (cancelled) return;
        setProvidersFailed(true);
        setProviders([]);
        setSelectedProvider({ key: "iserv-form", displayName: "", type: "iserv-form" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogin() {
    // Das Passwortformular erscheint nur bei gewaehltem Weg; der Schluessel
    // muss trotzdem mit, damit der Server keinen Weg erraten muss.
    const provider = selectedProvider;
    if (!provider) return;

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
      const { user, isTealUnlocked, token } = await ApiService.login(
        { username, password, providerKey: provider.key },
        rememberMe,
      );
      if (token) {
        setAuthToken(token);
        if (rememberMe || Platform.OS !== "web") {
          setToken(token);
        }
      }
      login(user);
      const savedTheme = await AsyncStorage.getItem(`user_theme_${user.id}`);
      if (savedTheme) {
        setTheme(savedTheme as AppTheme);
      } else if (isTealUnlocked) {
        setTheme("teal");
      }
      router.replace(user.profileConfirmedAt === null ? "/name-bestaetigen" : "/(tabs)/news");
    } catch (err) {
      const message = err instanceof Error ? err.message : t("auth.loginFailed", lang);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRedirect(provider: AuthProviderInfo) {
    setRedirectError("");
    setRedirecting(true);
    const startUrl = ApiService.getProviderStartUrl(provider.key);

    if (Platform.OS === "web") {
      // Gewoehnlicher Seitenwechsel: der Server setzt das Sitzungscookie und
      // leitet auf die App-URL zurueck. Beim naechsten Laden holt _layout.tsx
      // die Sitzung wie gehabt ueber restoreSession() -- kein weiterer Code
      // noetig, das Cookie liegt schon im selben Browser.
      window.location.href = startUrl;
      return;
    }

    try {
      // Ruecksprung nativ ueber expo-web-browser: die App oeffnet den
      // Anmeldedialog im Systembrowser und erhaelt die Kontrolle zurueck,
      // sobald dieser auf die App-URL (expo-linking) weiterleitet oder
      // geschlossen wird.
      const returnUrl = Linking.createURL("login");
      const result = await WebBrowser.openAuthSessionAsync(startUrl, returnUrl);
      if (result.type !== "success") {
        setRedirecting(false);
        if (result.type !== "cancel" && result.type !== "dismiss") {
          setRedirectError(t("auth.redirectFailed", lang));
        }
        return;
      }

      const restored = await ApiService.restoreSession();
      setRedirecting(false);
      if (!restored) {
        setRedirectError(t("auth.redirectFailed", lang));
        return;
      }
      setToken(restored.token);
      login(restored.user);
      router.replace(restored.user.profileConfirmedAt === null ? "/name-bestaetigen" : "/(tabs)/news");
    } catch {
      setRedirecting(false);
      setRedirectError(t("auth.redirectFailed", lang));
    }
  }

  const topPad = useTopPad();
  const providerLabel = selectedProvider?.displayName || "";
  const showProviderList = providers !== null && providers.length > 1 && selectedProvider === null;
  const isIservForm = selectedProvider?.type === "iserv-form";
  const isLocal = selectedProvider?.type === "local";
  const showPasswordForm = isIservForm || isLocal;
  const showRedirectButton = selectedProvider !== null && selectedProvider.type === "oidc-redirect";
  const brandColor = isIservForm ? "#005BAA" : theme.tint;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
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
            <Text style={[styles.appName, { color: theme.text }]}>{SCHOOL_NAME}</Text>
            <Text style={[styles.appSubtitle, { color: theme.textSecondary }]}>
              {t("auth.adminSystem", lang)}
              {providerLabel ? ` · ${providerLabel}` : ""}
            </Text>
          </View>

          {providersFailed && (
            <View
              style={[
                styles.card,
                styles.noticeCard,
                { backgroundColor: theme.card, borderColor: theme.warning, maxWidth: 400, width: "100%" },
              ]}
            >
              <Ionicons name="warning-outline" size={16} color={theme.warning} />
              <Text style={[styles.noticeText, { color: theme.textSecondary }]}>
                {t("auth.providersLoadFailed", lang)}
              </Text>
            </View>
          )}

          {showProviderList && (
            <View
              style={[
                styles.card,
                { backgroundColor: theme.card, borderColor: theme.cardBorder },
              ]}
            >
              <Text style={[styles.iservTitle, { color: theme.text, marginBottom: 4 }]}>
                {t("auth.chooseProvider", lang)}
              </Text>
              {providers!.map((provider) => {
                const visual = providerVisual(provider);
                return (
                  <Pressable
                    key={provider.key}
                    onPress={() => {
                      if (provider.type === "oidc-redirect") {
                        handleRedirect(provider);
                      } else {
                        setSelectedProvider(provider);
                      }
                    }}
                    style={({ pressed }) => [
                      styles.providerRow,
                      { borderColor: theme.inputBorder, backgroundColor: theme.inputBackground, opacity: pressed ? 0.8 : 1 },
                    ]}
                  >
                    <Ionicons name={visual.icon} size={18} color={visual.color} />
                    <Text style={[styles.providerRowText, { color: theme.text, flex: 1 }]}>{provider.displayName}</Text>
                    <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
                  </Pressable>
                );
              })}
            </View>
          )}

          {selectedProvider !== null && (
            <View
              style={[
                styles.card,
                { backgroundColor: theme.card, borderColor: theme.cardBorder },
              ]}
            >
              {providers !== null && providers.length > 1 && (
                <Pressable onPress={() => setSelectedProvider(null)} style={styles.backRow}>
                  <Ionicons name="chevron-back" size={16} color={theme.tint} />
                  <Text style={[styles.backText, { color: theme.tint }]}>
                    {t("auth.backToProviders", lang)}
                  </Text>
                </Pressable>
              )}

              <View style={styles.iservHeader}>
                {isIservForm && providerLabel !== "" && (
                  <View style={[styles.iservBadge, { backgroundColor: "#EFF6FF" }]}>
                    <Text style={styles.iservBadgeText}>{providerLabel}</Text>
                  </View>
                )}
                <Text style={[styles.iservTitle, { color: theme.text }]}>
                  {providerLabel !== ""
                    ? t("auth.providerLogin", lang).replace("{provider}", providerLabel)
                    : t("auth.login", lang)}
                </Text>
              </View>

              {showRedirectButton && (
                <>
                  {!!redirectError && (
                    <View style={styles.errorBox}>
                      <Ionicons name="alert-circle" size={16} color="#EF4444" />
                      <Text style={styles.errorText}>{redirectError}</Text>
                    </View>
                  )}
                  <Pressable
                    onPress={() => handleRedirect(selectedProvider)}
                    disabled={redirecting}
                    style={({ pressed }) => [
                      styles.loginButton,
                      { backgroundColor: brandColor, opacity: redirecting ? 0.7 : pressed ? 0.9 : 1 },
                    ]}
                  >
                    {redirecting ? (
                      <View style={styles.loadingRow}>
                        <ActivityIndicator color="#fff" size="small" />
                        <Text style={styles.loginButtonText}>{t("auth.redirecting", lang)}</Text>
                      </View>
                    ) : (
                      <Text style={styles.loginButtonText}>
                        {t("auth.providerLogin", lang).replace("{provider}", providerLabel)}
                      </Text>
                    )}
                  </Pressable>
                </>
              )}

              {showPasswordForm && (
                <>
                  <View style={styles.inputGroup}>
                    <Text style={[styles.label, { color: theme.textSecondary }]}>
                      {t(isLocal ? "auth.email" : "auth.username", lang)}
                    </Text>
                    <View
                      style={[
                        styles.inputWrap,
                        { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder },
                      ]}
                    >
                      <Ionicons name={isLocal ? "mail-outline" : "person-outline"} size={18} color={theme.textTertiary} />
                      <TextInput
                        value={username}
                        onChangeText={setUsername}
                        placeholder={t(isLocal ? "auth.email" : "auth.username", lang)}
                        placeholderTextColor={theme.textTertiary}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete={isLocal ? "email" : "username"}
                        keyboardType={isLocal ? "email-address" : "default"}
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

                  <View style={styles.rememberRow}>
                    <Pressable
                      onPress={() => setRememberMe(!rememberMe)}
                      style={styles.rememberMeContainer}
                    >
                      <View style={[
                        styles.checkbox,
                        { borderColor: rememberMe ? theme.tint : theme.textTertiary },
                        rememberMe && { backgroundColor: theme.tint }
                      ]}>
                        {rememberMe && <Ionicons name="checkmark" size={12} color="#fff" />}
                      </View>
                      <Text style={[styles.rememberMeText, { color: theme.textSecondary }]}>
                        {t("auth.rememberMe", lang)}
                      </Text>
                    </Pressable>

                    {isLocal && (
                      // Fuehrt noch nirgends hin -- Registrierung und Zuruecksetzen
                      // kommen erst in Stueck 2. Die Zeile steht schon, damit sie
                      // dort nicht nachtraeglich ins Layout gequetscht werden muss.
                      <Text style={[styles.forgotPasswordText, { color: theme.textTertiary }]}>
                        {t("auth.forgotPassword", lang)}
                      </Text>
                    )}
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
                      { backgroundColor: brandColor, opacity: loading ? 0.7 : pressed ? 0.9 : 1 },
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

                  {providerLabel !== "" && (
                    <Text style={[styles.footerNote, { color: theme.textTertiary }]}>
                      {t("auth.providerNote", lang).replace("{provider}", providerLabel)}
                    </Text>
                  )}
                </>
              )}
            </View>
          )}
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
    marginBottom: 16,
  },
  noticeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
  },
  noticeText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  providerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  providerRowText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: -4 },
  backText: { fontSize: 13, fontFamily: "Inter_500Medium" },
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
  rememberRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  rememberMeContainer: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  rememberMeText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  forgotPasswordText: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
