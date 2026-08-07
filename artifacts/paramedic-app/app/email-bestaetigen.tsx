import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Text } from "react-native";
import { AuthButton, AuthField, AuthLink, AuthMessage, AuthShell } from "@/components/AuthSurface";
import { getTheme } from "@/constants/theme";
import { t } from "@/constants/i18n";
import ApiService from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";

export default function EmailBestaetigenScreen() {
  const { token: rawToken, email: rawEmail } = useLocalSearchParams<{ token?: string; email?: string }>();
  const token = typeof rawToken === "string" ? rawToken : "";
  const initialEmail = typeof rawEmail === "string" ? rawEmail : "";
  const lang = useAppStore((s) => s.language);
  const theme = getTheme(useAppStore((s) => s.theme));
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(Boolean(token));
  const [message, setMessage] = useState("");
  const [error, setError] = useState(token ? "" : t("auth.verifyFailed", lang));

  React.useEffect(() => {
    if (!token) return;
    let cancelled = false;
    ApiService.verifyLocalEmail(token).then((response) => {
      if (!cancelled) { setMessage(response || t("auth.verifySuccess", lang)); setLoading(false); }
    }).catch((err) => {
      if (!cancelled) { setError(err instanceof Error ? err.message : t("auth.verifyFailed", lang)); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [token]);

  async function resend() {
    if (!email.trim()) { setError(t("auth.emailRequired", lang)); return; }
    setLoading(true); setError("");
    try { setMessage(await ApiService.resendLocalVerification(email)); }
    catch (err) { setError(err instanceof Error ? err.message : t("auth.verifyFailed", lang)); }
    finally { setLoading(false); }
  }

  return (
    <AuthShell theme={theme} title={t("auth.verifyHeading", lang)} body={t("auth.verifyBody", lang)}>
      {message ? <AuthMessage text={message} theme={theme} /> : null}
      {error ? <AuthMessage text={error} error theme={theme} /> : null}
      {!token && <AuthField label={t("auth.email", lang)} value={email} onChangeText={setEmail} theme={theme} icon="mail-outline" keyboardType="email-address" autoComplete="email" onSubmitEditing={resend} />}
      {!token && <AuthButton label={t("auth.resendVerification", lang)} loading={loading} disabled={!email} onPress={resend} theme={theme} />}

      <AuthLink label={t("auth.backToLogin", lang)} onPress={() => router.replace("/login")} theme={theme} />
    </AuthShell>
  );
}
