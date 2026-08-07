import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
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
import { getTheme } from "@/constants/theme";
import ApiService, { type AuthProviderInfo } from "@/services/ApiService";
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

  useEffect(() => {
    let cancelled = false;
    ApiService.getAuthProviders()
      .then((list) => {
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
      const restored = code && verifier ? await ApiService.exchangeNativeSession(code, verifier) : null;
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
  const showProviderList = providers !== null && providers.length > 1 && selectedProvider === null;
  const selectedVisual = selectedProvider ? providerVisual(selectedProvider) : null;

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
                  onPress={() => handleRedirect(provider)}
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
                  {t("auth.providerLogin", lang).replace("{provider}", selectedProvider.displayName)}
                </Text>
                <Text style={[styles.body, { color: theme.textSecondary }]}>
                  {t("auth.providerNote", lang).replace("{provider}", selectedProvider.displayName)}
                </Text>
              </View>
            </View>

            {!!redirectError && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color="#EF4444" />
                <Text style={styles.errorText}>{redirectError}</Text>
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("auth.providerLogin", lang).replace("{provider}", selectedProvider.displayName)}
              onPress={() => handleRedirect(selectedProvider)}
              disabled={redirecting}
              style={({ pressed }) => [
                styles.loginButton,
                { backgroundColor: theme.tint, opacity: redirecting ? 0.7 : pressed ? 0.9 : 1 },
              ]}
            >
              {redirecting ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.loginButtonText}>{t("auth.redirecting", lang)}</Text>
                </View>
              ) : (
                <Text style={styles.loginButtonText}>
                  {t("auth.providerLogin", lang).replace("{provider}", selectedProvider.displayName)}
                </Text>
              )}
            </Pressable>
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
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  loginButtonText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
