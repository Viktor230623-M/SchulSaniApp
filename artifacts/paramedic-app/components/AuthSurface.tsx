import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MedicalCross } from "@/components/MedicalCross";
import { appleCardStyle } from "@/components/AppleSurface";
import { useTopPad } from "@/hooks/useTopPad";
import { getTheme, withAlpha } from "@/constants/theme";
import { SCHOOL_NAME } from "@/constants/appConfig";
import { t } from "@/constants/i18n";
import { useAppStore } from "@/store/useAppStore";

export type AuthTheme = ReturnType<typeof getTheme>;

type AuthShellProps = {
  theme: AuthTheme;
  title: string;
  body: string;
  children: React.ReactNode;
};

export function AuthShell({ theme, title, body, children }: AuthShellProps) {
  const insets = useSafeAreaInsets();
  const topPad = useTopPad();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: topPad + 28, paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <MedicalCross size={56} color={theme.tint} />
            <Text style={[styles.brand, { color: theme.text }]}>{SCHOOL_NAME}</Text>
            <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
            <Text style={[styles.body, { color: theme.textSecondary }]}>{body}</Text>
          </View>
          <View style={[styles.card, appleCardStyle(theme)]}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export function AuthField({
  label,
  value,
  onChangeText,
  theme,
  icon,
  password = false,
  visible = false,
  onToggleVisibility,
  keyboardType,
  autoComplete,
  onSubmitEditing,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  theme: AuthTheme;
  icon: keyof typeof Ionicons.glyphMap;
  password?: boolean;
  visible?: boolean;
  onToggleVisibility?: () => void;
  keyboardType?: "default" | "email-address";
  autoComplete?: "email" | "password" | "new-password" | "name" | "username";
  onSubmitEditing?: () => void;
}) {
  const lang = useAppStore((s) => s.language);

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      <View style={[styles.inputWrap, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder }]}>
        <Ionicons name={icon} size={19} color={theme.textTertiary} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          accessibilityLabel={label}
          secureTextEntry={password && !visible}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={autoComplete}
          keyboardType={keyboardType}
          style={[styles.input, { color: theme.text }]}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={onSubmitEditing ? "done" : "next"}
        />
        {password && onToggleVisibility && (
          <Pressable accessibilityRole="button" accessibilityLabel={visible ? t("auth.hidePassword", lang) : t("auth.showPassword", lang)} onPress={onToggleVisibility} style={styles.iconButton}>
            <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={20} color={theme.textTertiary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function AuthButton({ label, loading, disabled, onPress, theme }: { label: string; loading?: boolean; disabled?: boolean; onPress: () => void; theme: AuthTheme }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: theme.tint, opacity: disabled || loading ? 0.45 : pressed ? 0.82 : 1 }]}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{label}</Text>}
    </Pressable>
  );
}

export function AuthMessage({ text, error, theme }: { text: string; error?: boolean; theme: AuthTheme }) {
  return (
    <View style={[styles.message, { backgroundColor: error ? withAlpha(theme.danger, 0.12) : withAlpha(theme.tint, 0.12) }]} accessibilityLiveRegion="polite">
      <Ionicons name={error ? "alert-circle-outline" : "checkmark-circle-outline"} size={18} color={error ? theme.danger : theme.tint} />
      <Text style={[styles.messageText, { color: error ? theme.danger : theme.text }]}>{text}</Text>
    </View>
  );
}

export function AuthLink({ label, onPress, theme }: { label: string; onPress: () => void; theme: AuthTheme }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => [styles.link, { opacity: pressed ? 0.55 : 1 }]}>
      <Text style={[styles.linkText, { color: theme.text, textDecorationLine: "underline" }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, alignItems: "center" },
  header: { width: "100%", maxWidth: 400, alignItems: "center", marginBottom: 24, gap: 8 },
  brand: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  title: { fontSize: 24, lineHeight: 30, fontFamily: "Inter_700Bold", textAlign: "center", marginTop: 12 },
  body: { maxWidth: 350, fontSize: 14, lineHeight: 21, fontFamily: "Inter_400Regular", textAlign: "center" },
  card: { width: "100%", maxWidth: 400, padding: 22, gap: 16 },
  field: { gap: 7 },
  label: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_600SemiBold" },
  inputWrap: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 13, borderWidth: 1, paddingHorizontal: 13 },
  input: { flex: 1, minHeight: 48, fontSize: 16, fontFamily: "Inter_400Regular" },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", marginRight: -8 },
  button: { minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  buttonText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  message: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 13, borderRadius: 13 },
  messageText: { flex: 1, fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular" },
  link: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  linkText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
