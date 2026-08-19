import * as Linking from "expo-linking";
import { router } from "expo-router";
import React from "react";
import { StyleSheet, Text } from "react-native";

import { AuthButton, AuthLink, AuthShell } from "@/components/AuthSurface";
import { LICENSE_EMAIL } from "@/constants/appConfig";
import { t } from "@/constants/i18n";
import { getTheme } from "@/constants/theme";
import { useAppStore } from "@/store/useAppStore";

/**
 * Lizenz-Infoscreen: Schulen ohne Lizenz koennen ueber eine Mail anfragen.
 * Erreichbar ueber den Link auf dem Anmeldebildschirm und als Rueckfall,
 * wenn eine Schul-ID nicht gefunden wird.
 */
export default function LizenzScreen() {
  const lang = useAppStore((s) => s.language);
  const theme = getTheme(useAppStore((s) => s.theme));

  function anfragen() {
    const betreff = encodeURIComponent(t("license.subject", lang));
    Linking.openURL(`mailto:${LICENSE_EMAIL}?subject=${betreff}`).catch(() => {
      // Ohne Mail-App bleibt nur die Anzeige der Adresse — kein Fehler noetig.
    });
  }

  return (
    <AuthShell theme={theme} title={t("license.heading", lang)} body={t("license.body", lang)}>
      <AuthButton label={t("license.cta", lang)} onPress={anfragen} theme={theme} />
      <Text style={[styles.email, { color: theme.textSecondary }]}>{LICENSE_EMAIL}</Text>
      <AuthLink label={t("auth.backToLogin", lang)} onPress={() => router.replace("/")} theme={theme} />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  email: { fontSize: 14, fontFamily: "Inter_500Medium", textAlign: "center" },
});
