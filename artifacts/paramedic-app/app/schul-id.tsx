import { router } from "expo-router";
import React, { useEffect, useState } from "react";

import { AuthButton, AuthField, AuthLink, AuthMessage, AuthShell } from "@/components/AuthSurface";
import { getTheme } from "@/constants/theme";
import { t } from "@/constants/i18n";
import ApiService, { type PublicSchool } from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";

/**
 * Direkter Einstieg ueber die Schul-ID: Die Schule wird in der Liste der
 * aktiven Schulen gesucht und ausgewaehlt, danach fuehrt der normale
 * Anmeldebildschirm weiter. Schulen ohne Lizenz landen auf dem Lizenz-Screen.
 */
export default function SchulIdScreen() {
  const lang = useAppStore((s) => s.language);
  const theme = getTheme(useAppStore((s) => s.theme));
  const setSelectedSchool = useAppStore((s) => s.setSelectedSchool);
  const [id, setId] = useState("");
  const [schools, setSchools] = useState<PublicSchool[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    ApiService.getSchools()
      .then((result) => {
        if (!cancelled) setSchools(result.schools);
      })
      .catch(() => {
        if (!cancelled) setSchools([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function submit() {
    if (!id.trim() || submitting || schools === null) return;
    setSubmitting(true);
    setError("");
    const gesucht = id.trim().toLowerCase();
    const treffer = schools.find((school) => school.id.toLowerCase() === gesucht);
    if (treffer) {
      setSelectedSchool({ id: treffer.id, name: treffer.name });
      router.replace("/login");
      return;
    }
    setError(t("auth.schulIdNotFound", lang));
    setSubmitting(false);
  }

  return (
    <AuthShell theme={theme} title={t("auth.schulIdHeading", lang)} body={t("auth.schulIdBody", lang)}>
      <AuthField
        label={t("auth.schulIdLabel", lang)}
        value={id}
        onChangeText={setId}
        theme={theme}
        icon="school-outline"
        autoComplete="username"
        onSubmitEditing={submit}
      />
      {error ? <AuthMessage text={error} error theme={theme} /> : null}
      <AuthButton
        label={t("auth.schulIdButton", lang)}
        loading={submitting}
        disabled={!id.trim()}
        onPress={submit}
        theme={theme}
      />
      <AuthLink label={t("auth.schulIdHint", lang)} onPress={() => router.push("/lizenz")} theme={theme} />
      <AuthLink label={t("auth.backToLogin", lang)} onPress={() => router.replace("/")} theme={theme} />
    </AuthShell>
  );
}
