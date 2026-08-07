import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MedicalCross } from "@/components/MedicalCross";
import { useTopPad } from "@/hooks/useTopPad";
import { SCHOOL_NAME } from "@/constants/appConfig";
import { t } from "@/constants/i18n";
import { getTheme, istDunklesThema } from "@/constants/theme";
import ApiService, { AuthError, type AuthProviderInfo } from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";

async function createHandoffVerifier(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createHandoffChallenge(verifier: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

function providerVisual(provider: AuthProviderInfo): { icon: keyof typeof Ionicons.glyphMap; color: string } {
  switch (provider.key) {
    case "google":
      return { icon: "logo-google", color: "#EA4335" };
    case "microsoft":
      return { icon: "logo-microsoft", color: "#00A4EF" };
    case "apple":
      return { icon: "logo-apple", color: "#000000" };
    default:
      return { icon: "arrow-forward-circle-outline", color: "#6B7280" };
  }
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.language);
  const theme = getTheme(useAppStore((s) => s.theme));
  const login = useAppStore((s) => s.login);
  const setToken = useAppStore((s) => s.setToken);
  const [providers, setProviders] = useState<AuthProviderInfo[] | null>(null);
  const [providersFailed, setProvidersFailed] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<AuthProviderInfo | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [redirectError, setRedirectError] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ApiService.getAuthProviders()
      .then(({ providers: list }) => {
        if (cancelled) return;
        if (list.length === 0) throw new Error("Keine Anmeldewege konfiguriert");
        setProviders(list);
        if (list.length === 1) setSelectedProvider(list[0]);
      })
      .catch(() => {
        if (cancelled) return;
        setProvidersFailed(true);
        setProviders([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAppleNative() {
    if (!selectedProvider || selectedProvider.key !== "apple" || Platform.OS !== "ios") return;
    if (redirecting) return;
    setRedirectError("");
    setRedirecting(true);
    try {
      // Im Simulator und in Expo Go gibt es die Apple-Anmeldung nicht; dann
      // faellt der Login auf den Web-Redirect zurueck statt still zu scheitern.
      if (!(await AppleAuthentication.isAvailableAsync())) {
        setRedirecting(false);
        await handleRedirect(selectedProvider);
        return;
      }
      const nonce = await ApiService.startAppleNative();
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce,
      });
      if (!credential.identityToken) {
        setRedirectError(t("auth.redirectFailed", lang));
        return;
      }
      const restored = await ApiService.completeAppleNative({
        identityToken: credential.identityToken,
        nonce,
        fullName: credential.fullName
          ? {
              givenName: credential.fullName.givenName ?? undefined,
              familyName: credential.fullName.familyName ?? undefined,
            }
          : undefined,
        email: credential.email ?? undefined,
      });
      setToken(restored.token);
      login(restored.user);
      router.replace(restored.user.profileConfirmedAt === null ? "/name-bestaetigen" : "/(tabs)/news");
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && err.code === "ERR_REQUEST_CANCELED") {
        // Nutzer hat den Dialog abgebrochen -- kein Fehler, kein Text.
      } else if (err instanceof AuthError && err.handoff) {
        // Neues Konto auf einer Instanz mit Schul-Zugangscode: der einmalige
        // Handoff fuehrt in den Schul-Code-Screen statt in die App.
        router.replace({ pathname: "/schul-code", params: { handoff: err.handoff } });
      } else {
        setRedirectError(err instanceof Error ? err.message : t("auth.redirectFailed", lang));
      }
    } finally {
      setRedirecting(false);
    }
  }

  async function handleLocalLogin() {
    if (!selectedProvider || selectedProvider.type !== "local") return;
    setRedirectError("");
    setRedirecting(true);
    try {
      const restored = await ApiService.loginLocal(selectedProvider.key, username, password);
      setToken(restored.token);
      login(restored.user);
      router.replace(restored.user.mustChangePassword ? "/passwort-wechseln" : restored.user.profileConfirmedAt === null ? "/name-bestaetigen" : "/(tabs)/news");
    } catch (err) {
      setRedirectError(err instanceof Error ? err.message : t("auth.loginFailed", lang));
    } finally {
      setRedirecting(false);
    }
  }

  async function handleRedirect(provider: AuthProviderInfo) {
    setRedirectError("");
    setRedirecting(true);

    try {
      const returnUrl = Platform.OS === "web" ? undefined : Linking.createURL("login");
      const verifier = Platform.OS === "web" ? undefined : await createHandoffVerifier();
      const challenge = verifier ? await createHandoffChallenge(verifier) : undefined;
      const startUrl = ApiService.getProviderStartUrl(provider.key, returnUrl, challenge);

      if (Platform.OS === "web") {
        window.location.href = startUrl;
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(startUrl, returnUrl!);
      if (result.type !== "success") {
        setRedirecting(false);
        if (result.type !== "cancel" && result.type !== "dismiss") {
          setRedirectError(t("auth.redirectFailed", lang));
        }
        return;
      }

      const callback = result.url ? Linking.parse(result.url) : null;
      const code = typeof callback?.queryParams?.code === "string" ? callback.queryParams.code : null;
      const joinCodeHandoff = typeof callback?.queryParams?.handoff === "string" ? callback.queryParams.handoff : null;
      setRedirecting(false);
      if (joinCodeHandoff) {
        // Neues Konto auf einer Instanz mit Schul-Zugangscode: die App zeigt
        // den Schul-Code-Screen, der den einmaligen Handoff einloest.
        router.replace({ pathname: "/schul-code", params: { handoff: joinCodeHandoff } });
        return;
      }
      const restored = code && verifier ? await ApiService.exchangeNativeSession(code, verifier) : null;
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
  const showProviderList = providers !== null && providers.length > 1 && selectedProvider === null;
  const selectedVisual = selectedProvider ? providerVisual(selectedProvider) : null;
  const isLocal = selectedProvider?.type === "local";
  const istAppleNativ = selectedProvider?.key === "apple" && Platform.OS === "ios";
  const dunkel = istDunklesThema(theme.background);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: topPad + 40, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <MedicalCross size={64} color={theme.tint} animate />
          <Text style={[styles.appName, { color: theme.text }]}>{SCHOOL_NAME}</Text>
          <Text style={[styles.appSubtitle, { color: theme.textSecondary }]}>
            {t("auth.adminSystem", lang)}
            {selectedProvider ? ` · ${selectedProvider.displayName}` : ""}
          </Text>
        </View>

        {providersFailed && (
          <View style={[styles.noticeCard, { backgroundColor: theme.card, borderColor: theme.warning }]}>
            <Ionicons name="warning-outline" size={18} color={theme.warning} />
            <Text style={[styles.noticeText, { color: theme.textSecondary }]}>
              {t("auth.providersLoadFailed", lang)}
            </Text>
          </View>
        )}

        {showProviderList && (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.title, { color: theme.text }]}>{t("auth.chooseProvider", lang)}</Text>
            {providers.map((provider) => {
              const visual = providerVisual(provider);
              return (
                <Pressable
                  key={provider.key}
                  accessibilityRole="button"
                  accessibilityLabel={provider.displayName}
                  onPress={() => setSelectedProvider(provider)}
                  disabled={redirecting}
                  style={({ pressed }) => [
                    styles.providerRow,
                    { borderColor: theme.inputBorder, backgroundColor: theme.inputBackground, opacity: redirecting ? 0.6 : pressed ? 0.8 : 1 },
                  ]}
                >
                  <Ionicons name={visual.icon} size={20} color={visual.color} />
                  <Text style={[styles.providerText, { color: theme.text }]}>{provider.displayName}</Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
                </Pressable>
              );
            })}
          </View>
        )}

        {selectedProvider && (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            {providers && providers.length > 1 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("auth.backToProviders", lang)}
                onPress={() => setSelectedProvider(null)}
                style={styles.backRow}
              >
                <Ionicons name="chevron-back" size={18} color={theme.tint} />
                <Text style={[styles.backText, { color: theme.tint }]}>{t("auth.backToProviders", lang)}</Text>
              </Pressable>
            )}

            <View style={styles.providerHeader}>
              <View style={[styles.providerIcon, { backgroundColor: theme.inputBackground }]}>
                <Ionicons name={selectedVisual!.icon} size={22} color={selectedVisual!.color} />
              </View>
              <View style={styles.providerCopy}>
                <Text style={[styles.title, { color: theme.text }]}>
                  {isLocal ? t("auth.login", lang) : t("auth.providerLogin", lang).replace("{provider}", selectedProvider.displayName)}
                </Text>
                <Text style={[styles.body, { color: theme.textSecondary }]}>
                  {isLocal ? t("auth.providerNote", lang).replace("{provider}", selectedProvider.displayName) : t("auth.providerNote", lang).replace("{provider}", selectedProvider.displayName)}
                </Text>
              </View>
            </View>

            {isLocal && (
              <View style={styles.localFields}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{t("auth.username", lang)}</Text>
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  placeholder={t("auth.username", lang)}
                  placeholderTextColor={theme.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  accessibilityLabel={t("auth.username", lang)}
                  style={[styles.localInput, { color: theme.text, borderColor: theme.inputBorder, backgroundColor: theme.inputBackground }]}
                />
                <View style={styles.passwordRow}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{t("auth.password", lang)}</Text>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder={t("auth.password", lang)}
                    placeholderTextColor={theme.textTertiary}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="password"
                    accessibilityLabel={t("auth.password", lang)}
                    onSubmitEditing={handleLocalLogin}
                    style={[styles.localInput, styles.passwordInput, { color: theme.text, borderColor: theme.inputBorder, backgroundColor: theme.inputBackground }]}
                  />
                  <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? t("auth.hidePassword", lang) : t("auth.showPassword", lang)} onPress={() => setShowPassword((visible) => !visible)} style={styles.passwordToggle}>
                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={theme.textTertiary} />
                  </Pressable>
                </View>
                <Pressable accessibilityRole="link" onPress={() => router.push("/passwort-vergessen")} style={styles.localLink}>
                  <Text style={[styles.localLinkText, { color: theme.tint }]}>{t("auth.forgotPassword", lang)}</Text>
                </Pressable>
              </View>
            )}

            {!!redirectError && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color="#EF4444" />
                <Text style={styles.errorText}>{redirectError}</Text>
              </View>
            )}

            {istAppleNativ ? (
              // Apple schreibt vor, dass die Anmeldung mit Apple auf iOS ueber
              // die native Schaltflaeche laeuft, nicht ueber eine eigene.
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={
                  dunkel
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE
                    : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={12}
                onPress={handleAppleNative}
                style={styles.appleButton}
              />
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("auth.providerLogin", lang).replace("{provider}", selectedProvider.displayName)}
                onPress={() => (isLocal ? handleLocalLogin() : handleRedirect(selectedProvider))}
                disabled={redirecting || (isLocal && (!username || !password))}
                style={({ pressed }) => [
                  styles.loginButton,
                  { backgroundColor: theme.tint, opacity: redirecting || (isLocal && (!username || !password)) ? 0.7 : pressed ? 0.9 : 1 },
                ]}
              >
                {redirecting ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={styles.loginButtonText}>{t("auth.redirecting", lang)}</Text>
                  </View>
                ) : (
                  <Text style={styles.loginButtonText}>
                    {isLocal ? t("auth.loginButton", lang) : t("auth.providerLogin", lang).replace("{provider}", selectedProvider.displayName)}
                  </Text>
                )}
              </Pressable>
            )}
            {isLocal && (
              <Pressable accessibilityRole="link" onPress={() => router.push("/registrieren")} style={styles.localLink}>
                <Text style={[styles.localLinkText, { color: theme.tint }]}>{t("auth.register", lang)}</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
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
    width: "100%",
    maxWidth: 400,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  noticeText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  title: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  body: { fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular" },
  providerRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  providerText: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  backRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 4 },
  backText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  providerHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  providerIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  providerCopy: { flex: 1, gap: 4 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, backgroundColor: "#FEF2F2" },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: "Inter_400Regular", color: "#EF4444" },
  loginButton: { minHeight: 52, paddingHorizontal: 16, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  appleButton: { height: 52, width: "100%" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  loginButtonText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
  localFields: { gap: 10 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: -4 },
  localInput: { minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, fontSize: 16, fontFamily: "Inter_400Regular" },
  passwordRow: { position: "relative", justifyContent: "center" },
  passwordInput: { paddingRight: 52 },
  passwordToggle: { position: "absolute", right: 4, minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  localLink: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  localLinkText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
