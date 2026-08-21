import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text } from "react-native";

import { AuthButton, AuthLink, AuthShell } from "@/components/AuthSurface";
import { getTheme } from "@/constants/theme";
import { t } from "@/constants/i18n";
import { confirmAction, notify } from "@/lib/dialog";
import ApiService from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";

/**
 * Einstieg fuer Nutzer, die noch keiner Schule zugeordnet sind: keine direkte
 * Anmeldung, sondern der Weg ueber die Schul-ID oder eine Lizenzanfrage.
 *
 * Wer schon eine Schule gewaehlt hat (persistierte Auswahl), wird direkt zum
 * Anmeldebildschirm geleitet; auf Instanzen ohne Schul-Waehler (Selbsthosting)
 * ebenso. Die Entscheidung trifft index.tsx, dieser Screen deckt den Rest ab.
 */
export default function StartScreen() {
  const lang = useAppStore((s) => s.language);
  const theme = getTheme(useAppStore((s) => s.theme));
  const selectedSchool = useAppStore((s) => s.selectedSchool);
  const [multiTenant, setMultiTenant] = useState<boolean | null>(null);

  useEffect(() => {
    if (selectedSchool) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    ApiService.getSchools()
      .then((result) => {
        if (cancelled) return;
        if (!result.multiTenant) {
          router.replace("/login");
          return;
        }
        setMultiTenant(true);
      })
      .catch(() => {
        if (cancelled) return;
        router.replace("/login");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSchool]);

  // Noch nicht entschieden (Schul-Auswahl hydriert asynchron, Schulen laden):
  // nichts zeichnen, damit kein kurzer Falsch-Screen aufblitzt.
  if (selectedSchool || multiTenant === null) return null;

  async function call112() {
    const agreed = await confirmAction({
      title: t("emergency.callConfirm", lang),
      message: t("emergency.callBody", lang),
      confirmLabel: t("emergency.callNow", lang),
      cancelLabel: t("emergency.cancel", lang),
      destructive: true,
    });
    if (!agreed) return;
    try {
      await Linking.openURL("tel:112");
    } catch {
      notify(t("common.error", lang));
    }
  }

  return (
    <AuthShell theme={theme} title={t("start.welcome", lang)} body={t("start.body", lang)}>
      <AuthButton label={t("auth.loginWithSchoolId", lang)} onPress={() => router.push("/schul-id")} theme={theme} />
      <AuthLink label={t("auth.schoolNotIncluded", lang)} onPress={() => router.push("/lizenz")} theme={theme} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("emergency.call", lang)}
        onPress={call112}
        style={({ pressed }) => [styles.emergencyBtn, { borderColor: theme.danger, opacity: pressed ? 0.8 : 1 }]}
      >
        <Ionicons name="call" size={18} color={theme.danger} />
        <Text style={[styles.emergencyText, { color: theme.danger }]}>{t("emergency.call", lang)}</Text>
      </Pressable>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  emergencyBtn: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emergencyText: { fontSize: 16, fontFamily: "Inter_700Bold" },
});
