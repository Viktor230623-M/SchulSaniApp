import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MedicalCross } from "@/components/MedicalCross";
import { t } from "@/constants/i18n";
import { getTheme } from "@/constants/theme";
import type { User } from "@/models";
import ApiService from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";

export default function DutyScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.language);
  const themeKey = useAppStore((s) => s.theme);
  const theme = getTheme(themeKey);
  const user = useAppStore((s) => s.user);
  const dutyStatus = useAppStore((s) => s.dutyStatus);
  const dutyLoading = useAppStore((s) => s.dutyLoading);
  const setDutyStatus = useAppStore((s) => s.setDutyStatus);
  const setDutyLoading = useAppStore((s) => s.setDutyLoading);

  const [onDutyUsers, setOnDutyUsers] = useState<User[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const isOnDuty = dutyStatus === "on_duty";
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  useEffect(() => {
    // sync own duty status from backend so it's correct after app reopen
    ApiService.getDutyStatus()
      .then((s) => setDutyStatus(s.status))
      .catch(() => {});
    setListLoading(true);
    ApiService.getOnDutyUsers()
      .then(setOnDutyUsers)
      .catch((err) => {
        console.error("Failed to load on-duty users:", err);
        Alert.alert("Fehler", "Dienststatus konnte nicht geladen werden.");
      })
      .finally(() => setListLoading(false));
  }, []);

  async function handleToggle() {
    if (dutyLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    scale.value = withSpring(0.93, {}, () => { scale.value = withSpring(1); });
    setDutyLoading(true);
    const newStatus = isOnDuty ? "off_duty" : "on_duty";
    try {
      await ApiService.updateDutyStatus(newStatus);
      setDutyStatus(newStatus);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Update on-duty list
      const updated = await ApiService.getOnDutyUsers();
      setOnDutyUsers(updated);
    } catch (err) {
      console.error("Failed to update duty status:", err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message = err instanceof Error ? err.message : "Dienststatus konnte nicht aktualisiert werden.";
      Alert.alert("Fehler", message);
    } finally {
      setDutyLoading(false);
    }
  }

  function roleLabelShort(role: User["role"]) {
    return {
      cto: lang === "de" ? "Eigent." : "Owner",
      student_paramedic: "San.",
      sanitaeter_leitung: "Ltg.",
      sanitaeter_leitung_admin: "Ltg.",
      admin: "Admin",
      teacher: "Lehrer",
    }[role] ?? role;
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: topPad + 20,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: 16,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.heading, { color: theme.text, alignSelf: "flex-start" }]}>
          {t("duty.title", lang)}
        </Text>

        <View style={{ alignItems: "center", gap: 24 }}>
          <MedicalCross size={80} color={isOnDuty ? theme.tint : theme.textTertiary} animate={isOnDuty} />

          <Animated.View style={animatedStyle}>
            <Pressable
              onPress={handleToggle}
              disabled={dutyLoading}
              style={[
                styles.toggleBtn,
                { backgroundColor: isOnDuty ? theme.tint : theme.textTertiary },
              ]}
            >
              {dutyLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MaterialCommunityIcons
                    name={isOnDuty ? "shield-check" : "shield-off"}
                    size={28}
                    color="#fff"
                  />
                  <Text style={styles.toggleBtnLabel}>
                    {isOnDuty ? t("duty.onDuty", lang) : t("duty.offDuty", lang)}
                  </Text>
                  <Text style={styles.toggleBtnHint}>{t("duty.tapToToggle", lang)}</Text>
                </>
              )}
            </Pressable>
          </Animated.View>
        </View>

        <View style={[styles.statusCard, { backgroundColor: isOnDuty ? theme.tintLight : theme.backgroundTertiary }]}>
          <Ionicons
            name={isOnDuty ? "checkmark-circle" : "close-circle"}
            size={20}
            color={isOnDuty ? theme.tint : theme.textTertiary}
          />
          <Text style={[styles.statusText, { color: isOnDuty ? theme.tintDark : theme.textSecondary }]}>
            {isOnDuty ? t("duty.statusAvailable", lang) : t("duty.statusUnavailable", lang)}
          </Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>
            {t("duty.whoIsOnDuty", lang)}
          </Text>
          {listLoading ? (
            <ActivityIndicator color={theme.tint} />
          ) : onDutyUsers.length === 0 ? (
            <Text style={[styles.noOne, { color: theme.textSecondary }]}>
              {t("duty.noOneDuty", lang)}
            </Text>
          ) : (
            onDutyUsers.map((u) => (
              <View key={u.id} style={styles.userRow}>
                <View style={[styles.avatar, { backgroundColor: theme.tintLight }]}>
                  <Text style={[styles.avatarText, { color: theme.tint }]}>
                    {(u.firstName?.[0] ?? "?").toUpperCase()}{(u.lastName?.[0] ?? "").toUpperCase()}
                  </Text>
                </View>
                <View style={styles.userInfo}>
                  <Text style={[styles.userName, { color: theme.text }]}>
                    {u.firstName && u.lastName ? `${u.firstName.charAt(0).toUpperCase() + u.firstName.slice(1).toLowerCase()} ${u.lastName.charAt(0).toUpperCase() + u.lastName.slice(1).toLowerCase()}` : u.id.replace("iserv-", "")}
                  </Text>
                  <Text style={[styles.userRole, { color: theme.textTertiary }]}>
                    {roleLabelShort(u.role)}
                  </Text>
                </View>
                <View style={[styles.onDutyPip, { backgroundColor: theme.tint }]} />
              </View>
            ))
          )}
        </View>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>{t("duty.notes", lang)}</Text>
          {[t("duty.hint1", lang), t("duty.hint2", lang), t("duty.hint3", lang)].map((hint) => (
            <View key={hint} style={styles.hintRow}>
              <Ionicons name="information-circle-outline" size={16} color={theme.textTertiary} />
              <Text style={[styles.hintText, { color: theme.textSecondary }]}>{hint}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heading: { fontSize: 28, fontFamily: "Inter_700Bold" },
  toggleBtn: {
    width: 220, paddingVertical: 28, borderRadius: 24, alignItems: "center", gap: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 10, elevation: 6,
  },
  toggleBtnLabel: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  toggleBtnHint: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)" },
  statusCard: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14, width: "100%" },
  statusText: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  section: { width: "100%", borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  sectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  noOne: { fontSize: 14, fontFamily: "Inter_400Regular" },
  userRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  userInfo: { flex: 1 },
  userName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  userRole: { fontSize: 12, fontFamily: "Inter_400Regular" },
  onDutyPip: { width: 8, height: 8, borderRadius: 4 },
  hintRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  hintText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 18 },
});
