import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MedicalCross } from "@/components/MedicalCross";
import { useTopPad } from "@/hooks/useTopPad";
import { t } from "@/constants/i18n";
import { getTheme } from "@/constants/theme";
import { useAppStore } from "@/store/useAppStore";

export default function NotFoundScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.language);
  const theme = getTheme(useAppStore((s) => s.theme));
  const topPad = useTopPad();

  return (
    <>
      <Stack.Screen options={{ title: t("common.notFoundTitle", lang) }} />
      <View style={[styles.container, { backgroundColor: theme.background, paddingTop: topPad, paddingBottom: insets.bottom }]}>
        <View style={styles.inner}>
          <View style={[styles.iconBox, { backgroundColor: theme.tintLight }]}>
            <MedicalCross size={44} color={theme.tint} />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>{t("common.notFoundTitle", lang)}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{t("common.notFoundBody", lang)}</Text>
          <Pressable
            onPress={() => router.replace("/")}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.tint, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Ionicons name="home-outline" size={18} color="#fff" />
            <Text style={styles.buttonText}>{t("common.backHome", lang)}</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  inner: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingBottom: 60 },
  iconBox: { width: 84, height: 84, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  body: { fontSize: 14, lineHeight: 21, fontFamily: "Inter_400Regular", textAlign: "center", maxWidth: 320 },
  button: {
    marginTop: 12,
    minHeight: 50,
    borderRadius: 13,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
