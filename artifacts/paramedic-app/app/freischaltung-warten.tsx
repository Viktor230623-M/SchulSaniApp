import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { AuthButton, AuthField, AuthLink, AuthMessage, AuthShell } from "@/components/AuthSurface";
import { getTheme } from "@/constants/theme";
import { t } from "@/constants/i18n";
import ApiService from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";

/**
 * Wartebildschirm fuer nicht freigeschaltete Konten.
 *
 * Zwei Wege fuehren hierher: Die E-Mail-Bestaetigung (mit Adresse, dort kann
 * die Bestaetigungsmail erneut angefordert werden) und der OIDC-Rueckweg
 * (`via=oidc`, ohne Adresse -- der Anbieter hat die Identitaet bereits
 * bestaetigt, es fehlt nur die Freischaltung durch einen Verwalter).
 */
export default function FreischaltungWartenScreen() {
  const { email: rawEmail, via: rawVia } = useLocalSearchParams<{ email?: string; via?: string }>();
  const viaOidc = rawVia === "oidc";
  const [email, setEmail] = useState(typeof rawEmail === "string" ? rawEmail : "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(
    viaOidc
      ? t("auth.approvalPendingViaOidc", useAppStore.getState().language)
      : t("auth.registerSuccess", useAppStore.getState().language),
  );
  const [error, setError] = useState("");
  const lang = useAppStore((s) => s.language);
  const theme = getTheme(useAppStore((s) => s.theme));

  async function resend() {
    if (!email.trim()) { setError(t("auth.emailRequired", lang)); return; }
    setLoading(true); setError("");
    try { setMessage(await ApiService.resendLocalVerification(email)); }
    catch (err) { setError(err instanceof Error ? err.message : t("auth.verifyFailed", lang)); }
    finally { setLoading(false); }
  }

  return (
    <AuthShell
      theme={theme}
      title={viaOidc ? t("auth.approvalPendingHeading", lang) : t("auth.verifyHeading", lang)}
      body={viaOidc ? t("auth.approvalPendingBody", lang) : t("auth.registerBody", lang)}
    >
      {message ? <AuthMessage text={message} theme={theme} /> : null}
      {!viaOidc && (
        <>
          <AuthField label={t("auth.email", lang)} value={email} onChangeText={setEmail} theme={theme} icon="mail-outline" keyboardType="email-address" autoComplete="email" onSubmitEditing={resend} />
          {error ? <AuthMessage text={error} error theme={theme} /> : null}
          <AuthButton label={t("auth.resendVerification", lang)} loading={loading} disabled={!email} onPress={resend} theme={theme} />
        </>
      )}
      <AuthLink label={t("auth.backToLogin", lang)} onPress={() => router.replace("/login")} theme={theme} />
    </AuthShell>
  );
}
