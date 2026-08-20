import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { AuthButton, AuthField, AuthLink, AuthMessage, AuthShell } from "@/components/AuthSurface";
import { PasswordRequirements } from "@/components/PasswordRequirements";
import { checkPassword, passwordRuleMessageKey } from "@/constants/passwordPolicy";
import { getTheme } from "@/constants/theme";
import { t } from "@/constants/i18n";
import ApiService from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";

export default function RegistrierenScreen() {
  const lang = useAppStore((s) => s.language);
  const theme = getTheme(useAppStore((s) => s.theme));
  const selectedSchool = useAppStore((s) => s.selectedSchool);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinCodeRequired, setJoinCodeRequired] = useState(false);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Das Code-Feld erscheint nur, wenn die Instanz einen Schul-Zugangscode
  // verlangt — auf offenen Instanzen haette es keinen Zweck und wuerde
  // nur verwirren.
  useEffect(() => {
    ApiService.getAuthProviders(selectedSchool?.id)
      .then(({ joinCodeRequired: required }) => setJoinCodeRequired(required))
      .catch(() => {});
  }, [selectedSchool?.id]);

  async function submit() {
    if (!email.trim()) { setError(t("auth.emailRequired", lang)); return; }
    const policy = checkPassword(password, { email, username, firstName, lastName });
    if (!policy.ok) { setError(t(passwordRuleMessageKey(policy.firstFailed!), lang)); return; }
    if (joinCodeRequired && !joinCode.trim()) { setError(t("auth.joinCodeFailed", lang)); return; }
    setLoading(true); setError(""); setMessage("");
    try {
      await ApiService.registerLocalAccount({ email, password, username: username.trim() || undefined, firstName, lastName, joinCode: joinCodeRequired ? joinCode.trim() : undefined, schoolId: selectedSchool?.id });
      router.replace({ pathname: "/email-bestaetigen", params: { email } });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.loginFailed", lang));
    } finally { setLoading(false); }
  }

  return (
    <AuthShell theme={theme} title={t("auth.registerHeading", lang)} body={t("auth.registerBody", lang)}>
      <AuthField label={t("auth.email", lang)} value={email} onChangeText={setEmail} theme={theme} icon="mail-outline" keyboardType="email-address" autoComplete="email" />
      <AuthField label={t("auth.usernameOptional", lang)} value={username} onChangeText={setUsername} theme={theme} icon="at-outline" autoComplete="username" />
      <AuthField label={t("auth.firstNameOptional", lang)} value={firstName} onChangeText={setFirstName} theme={theme} icon="person-outline" autoComplete="name" />
      <AuthField label={t("auth.lastNameOptional", lang)} value={lastName} onChangeText={setLastName} theme={theme} icon="person-outline" autoComplete="name" />
      {joinCodeRequired && (
        <AuthField label={t("auth.joinCodeLabel", lang)} value={joinCode} onChangeText={setJoinCode} theme={theme} icon="key-outline" autoComplete="username" />
      )}
      <AuthField label={t("auth.password", lang)} value={password} onChangeText={setPassword} theme={theme} icon="lock-closed-outline" password visible={visible} onToggleVisibility={() => setVisible((v) => !v)} onSubmitEditing={submit} autoComplete="new-password" />
      <PasswordRequirements password={password} context={{ email, username, firstName, lastName }} theme={theme} lang={lang} />
      {message ? <AuthMessage text={message} theme={theme} /> : null}
      {error ? <AuthMessage text={error} error theme={theme} /> : null}
      <AuthButton label={t("auth.registerButton", lang)} loading={loading} disabled={!email || !password} onPress={submit} theme={theme} />
      <Pressable onPress={() => router.replace("/")} style={styles.secondary}>
        <Text style={[styles.secondaryText, { color: theme.textSecondary }]}>{t("auth.backToLogin", lang)}</Text>
      </Pressable>
      <AuthLink label={t("auth.forgotPassword", lang)} onPress={() => router.push("/passwort-vergessen")} theme={theme} />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  secondary: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  secondaryText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
