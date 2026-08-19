import { router } from "expo-router";
import React, { useState } from "react";
import { AuthButton, AuthField, AuthLink, AuthMessage, AuthShell } from "@/components/AuthSurface";
import { getTheme } from "@/constants/theme";
import { t } from "@/constants/i18n";
import ApiService from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";

export default function PasswortVergessenScreen() {
  const lang = useAppStore((s) => s.language);
  const theme = getTheme(useAppStore((s) => s.theme));
  const selectedSchool = useAppStore((s) => s.selectedSchool);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    if (!email.trim()) { setError(t("auth.emailRequired", lang)); return; }
    setLoading(true); setError(""); setMessage("");
    try {
      const response = await ApiService.requestPasswordReset(email, selectedSchool?.id);
      setMessage(response || t("auth.forgotSuccess", lang));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.loginFailed", lang));
    } finally { setLoading(false); }
  }

  return (
    <AuthShell theme={theme} title={t("auth.forgotHeading", lang)} body={t("auth.forgotBody", lang)}>
      <AuthField label={t("auth.email", lang)} value={email} onChangeText={setEmail} theme={theme} icon="mail-outline" keyboardType="email-address" autoComplete="email" onSubmitEditing={submit} />
      {message ? <AuthMessage text={message} theme={theme} /> : null}
      {error ? <AuthMessage text={error} error theme={theme} /> : null}
      <AuthButton label={t("auth.forgotButton", lang)} loading={loading} disabled={!email} onPress={submit} theme={theme} />
      <AuthLink label={t("auth.backToLogin", lang)} onPress={() => router.replace("/")} theme={theme} />
    </AuthShell>
  );
}
