import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { AuthButton, AuthField, AuthLink, AuthMessage, AuthShell } from "@/components/AuthSurface";
import { getTheme } from "@/constants/theme";
import { t } from "@/constants/i18n";
import ApiService from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";

/**
 * Schul-Zugangscode fuer frische OIDC-/Apple-Konten.
 *
 * Die Anmeldung hat die Identitaet bereits verifiziert und ein Konto
 * angelegt; auf Instanzen mit Schul-Zugangscode fehlt diesem Konto nur noch
 * die Eintrittskarte. Der einmalige `handoff` bindet den Vorgang an genau
 * dieses Konto und verfaellt nach Ablauf — er ist nicht uebertragbar.
 */
export default function SchulCodeScreen() {
  const { handoff: rawHandoff } = useLocalSearchParams<{ handoff?: string }>();
  const handoff = typeof rawHandoff === "string" ? rawHandoff : "";
  const lang = useAppStore((s) => s.language);
  const theme = getTheme(useAppStore((s) => s.theme));
  const login = useAppStore((s) => s.login);
  const setToken = useAppStore((s) => s.setToken);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!handoff || !code.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const restored = await ApiService.completeJoinCode(handoff, code.trim());
      setToken(restored.token);
      login(restored.user);
      router.replace(
        restored.user.mustChangePassword
          ? "/passwort-wechseln"
          : restored.user.profileConfirmedAt === null
            ? "/name-bestaetigen"
            : "/(tabs)/news",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.joinCodeFailed", lang));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell theme={theme} title={t("auth.joinCodeHeading", lang)} body={t("auth.joinCodeBody", lang)}>
      {!handoff ? (
        <AuthMessage text={t("auth.joinCodeExpired", lang)} error theme={theme} />
      ) : (
        <>
          <AuthField
            label={t("auth.joinCodeLabel", lang)}
            value={code}
            onChangeText={setCode}
            theme={theme}
            icon="key-outline"
            autoComplete="username"
            onSubmitEditing={submit}
          />
          {error ? <AuthMessage text={error} error theme={theme} /> : null}
          <AuthButton label={t("auth.joinCodeButton", lang)} loading={loading} disabled={!code.trim()} onPress={submit} theme={theme} />
        </>
      )}
      <AuthLink label={t("auth.backToLogin", lang)} onPress={() => router.replace("/login")} theme={theme} />
    </AuthShell>
  );
}
