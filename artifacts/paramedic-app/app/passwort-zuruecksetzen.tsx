import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Text } from "react-native";
import { AuthButton, AuthField, AuthLink, AuthMessage, AuthShell } from "@/components/AuthSurface";
import { getTheme } from "@/constants/theme";
import { t } from "@/constants/i18n";
import ApiService from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";

export default function PasswortZuruecksetzenScreen() {
  const { token: rawToken } = useLocalSearchParams<{ token?: string }>();
  const token = typeof rawToken === "string" ? rawToken : "";
  const lang = useAppStore((s) => s.language);
  const theme = getTheme(useAppStore((s) => s.theme));
  const authStatus = useAppStore((s) => s.authStatus);
  const logout = useAppStore((s) => s.logout);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(token ? "" : t("auth.verifyFailed", lang));

  async function submit() {
    if (!token) return;
    if (password.length < 10) { setError(t("auth.passwordTooShort", lang)); return; }
    if (password !== repeat) { setError(t("auth.passwordMismatch", lang)); return; }
    setLoading(true); setError("");
    try {
      await ApiService.resetLocalPassword(token, password);
      if (authStatus === "authed") {
        await ApiService.logout();
        logout();
      }
      setMessage(t("auth.resetSuccess", lang));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.verifyFailed", lang));
    } finally { setLoading(false); }
  }

  return (
    <AuthShell theme={theme} title={t("auth.resetHeading", lang)} body={t("auth.resetBody", lang)}>
      <AuthField label={t("auth.newPassword", lang)} value={password} onChangeText={setPassword} theme={theme} icon="lock-closed-outline" password visible={visible} onToggleVisibility={() => setVisible((v) => !v)} autoComplete="new-password" />
      <AuthField label={t("auth.repeatPassword", lang)} value={repeat} onChangeText={setRepeat} theme={theme} icon="lock-closed-outline" password visible={visible} onToggleVisibility={() => setVisible((v) => !v)} onSubmitEditing={submit} autoComplete="new-password" />
      {message ? <AuthMessage text={message} theme={theme} /> : null}
      {error ? <AuthMessage text={error} error theme={theme} /> : null}
      {!message && <AuthButton label={t("auth.resetButton", lang)} loading={loading} disabled={!token || !password || !repeat} onPress={submit} theme={theme} />}
      <AuthLink label={t("auth.backToLogin", lang)} onPress={() => router.replace("/")} theme={theme} />
    </AuthShell>
  );
}
