import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { t } from "@/constants/i18n";
import { getTheme } from "@/constants/theme";
import type { AppLanguage, AppTheme, User } from "@/models";
import ApiService from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";

function RoleBadge({ role, theme }: { role: User["role"]; theme: any }) {
  const colors: Record<User["role"], { bg: string; text: string }> = {
    cto: { bg: "#F5F3FF", text: "#8B5CF6" },
    student_paramedic: { bg: "#F0FDF4", text: "#22C55E" },
    sanitaeter_leitung: { bg: "#EFF6FF", text: "#3B82F6" },
    admin: { bg: "#FEF2F2", text: "#EF4444" },
    teacher: { bg: "#FFF7ED", text: "#F97316" },
  };
  const cfg = colors[role] ?? { bg: theme.backgroundTertiary, text: theme.textSecondary };
  const labels: Record<User["role"], string> = {
    cto: "CTO",
    student_paramedic: "Sanitäter",
    sanitaeter_leitung: "Sanitäter Leitung",
    admin: "Administrator",
    teacher: "Lehrer",
  };
  return (
    <View style={[styles.roleBadge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.roleBadgeText, { color: cfg.text }]}>{labels[role]}</Text>
    </View>
  );
}

function SettingRow({ icon, label, value, onPress, right, theme }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.settingRow,
        { backgroundColor: pressed ? theme.backgroundTertiary : "transparent" },
      ]}
    >
      <View style={[styles.settingIcon, { backgroundColor: theme.backgroundTertiary }]}>
        {icon}
      </View>
      <Text style={[styles.settingLabel, { color: theme.text }]}>{label}</Text>
      <View style={styles.settingRight}>
        {value && <Text style={[styles.settingValue, { color: theme.textTertiary }]}>{value}</Text>}
        {right ?? <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />}
      </View>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.language);
  const themeKey = useAppStore((s) => s.theme);
  const theme = getTheme(themeKey);
  const user = useAppStore((s) => s.user);
  const avatarUri = useAppStore((s) => s.avatarUri);
  const setTheme = useAppStore((s) => s.setTheme);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const setAvatarUri = useAppStore((s) => s.setAvatarUri);
  const logout = useAppStore((s) => s.logout);

  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showUsers, setShowUsers] = useState(false);

  const canSeeAllUsers = user?.role === "admin" || user?.role === "cto";

  useEffect(() => {
    if (canSeeAllUsers) {
      setLoadingUsers(true);
      ApiService.getAllUsers().then((data) => {
        setAllUsers(data);
        setLoadingUsers(false);
      });
    }
  }, [canSeeAllUsers]);

  async function handlePickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Berechtigung", "Kamerazugriff wird benötigt.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }

  function handleLogout() {
    if (Platform.OS === "web") {
      logout();
      router.replace("/login");
      return;
    }
    Alert.alert(t("settings.logout", lang), t("settings.logoutConfirm", lang), [
      { text: t("common.cancel", lang), style: "cancel" },
      {
        text: t("settings.logout", lang),
        style: "destructive",
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          logout();
          router.replace("/login");
        },
      },
    ]);
  }

  const themes: { key: AppTheme; label: string; color: string }[] = [
    { key: "light", label: t("settings.themeLight", lang), color: "#F9FAFB" },
    { key: "dark", label: t("settings.themeDark", lang), color: "#1A1A1A" },
    { key: "red", label: t("settings.themeRed", lang), color: "#EF4444" },
  ];

  const langs: { key: AppLanguage; label: string; flag: string }[] = [
    { key: "de", label: "Deutsch", flag: "🇩🇪" },
    { key: "en", label: "English", flag: "🇬🇧" },
  ];

  const roleLabels: Record<User["role"], string> = {
    cto: "CTO",
    student_paramedic: "Sanitäter",
    sanitaeter_leitung: "Sanitäter Leitung",
    admin: "Administrator",
    teacher: "Lehrer",
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={{
        paddingTop: topPad + 20,
        paddingBottom: insets.bottom + 120,
        paddingHorizontal: 16,
        gap: 20,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.heading, { color: theme.text }]}>{t("settings.title", lang)}</Text>

      {/* Profile Card */}
      <View style={[styles.profileCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Pressable onPress={handlePickImage} style={styles.avatarWrap}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: theme.tintLight }]}>
              <Text style={[styles.avatarInitials, { color: theme.tint }]}>
                {user ? `${user.firstName[0]}${user.lastName[0]}` : "??"}
              </Text>
            </View>
          )}
          <View style={[styles.avatarEdit, { backgroundColor: theme.tint }]}>
            <Feather name="camera" size={12} color="#fff" />
          </View>
        </Pressable>
        <View style={styles.profileInfo}>
          <Text style={[styles.profileName, { color: theme.text }]}>
            {user ? `${user.firstName} ${user.lastName}` : "—"}
          </Text>
          <Text style={[styles.profileEmail, { color: theme.textSecondary }]}>{user?.email}</Text>
          {user && <RoleBadge role={user.role} theme={theme} />}
        </View>
      </View>

      {/* Language */}
      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>{t("settings.language", lang)}</Text>
        <View style={styles.langRow}>
          {langs.map((l) => (
            <Pressable
              key={l.key}
              onPress={() => { setLanguage(l.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              style={[
                styles.langBtn,
                { backgroundColor: lang === l.key ? theme.tint : theme.backgroundTertiary },
              ]}
            >
              <Text style={styles.langFlag}>{l.flag}</Text>
              <Text style={[styles.langLabel, { color: lang === l.key ? "#fff" : theme.textSecondary }]}>
                {l.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Theme */}
      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>{t("settings.theme", lang)}</Text>
        <View style={styles.themeRow}>
          {themes.map((th) => (
            <Pressable
              key={th.key}
              onPress={() => { setTheme(th.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              style={[
                styles.themeBtn,
                { borderColor: themeKey === th.key ? theme.tint : theme.cardBorder, borderWidth: themeKey === th.key ? 2 : 1 },
              ]}
            >
              <View style={[styles.themePreview, { backgroundColor: th.color }]} />
              <Text style={[styles.themeLabel, { color: theme.text }]}>{th.label}</Text>
              {themeKey === th.key && (
                <Ionicons name="checkmark-circle" size={16} color={theme.tint} />
              )}
            </Pressable>
          ))}
        </View>
      </View>

      {/* Admin: All Users */}
      {canSeeAllUsers && (
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Pressable onPress={() => setShowUsers(!showUsers)} style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>{t("settings.allUsers", lang)}</Text>
            <Ionicons name={showUsers ? "chevron-up" : "chevron-down"} size={16} color={theme.textTertiary} />
          </Pressable>
          {showUsers && (
            loadingUsers ? (
              <ActivityIndicator color={theme.tint} />
            ) : (
              allUsers.map((u) => (
                <View key={u.id} style={[styles.userRow, { borderTopColor: theme.cardBorder }]}>
                  <View style={[styles.userAvatar, { backgroundColor: theme.tintLight }]}>
                    <Text style={[styles.userAvatarText, { color: theme.tint }]}>{u.firstName[0]}{u.lastName[0]}</Text>
                  </View>
                  <View style={styles.userInfo}>
                    <Text style={[styles.userName, { color: theme.text }]}>{u.firstName} {u.lastName}</Text>
                    <Text style={[styles.userEmail, { color: theme.textTertiary }]}>{u.email}</Text>
                  </View>
                  <RoleBadge role={u.role} theme={theme} />
                </View>
              ))
            )
          )}
        </View>
      )}

      {/* Logout */}
      <Pressable
        onPress={handleLogout}
        style={({ pressed }) => [
          styles.logoutBtn,
          { backgroundColor: "#FEF2F2", opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <Ionicons name="log-out-outline" size={20} color="#EF4444" />
        <Text style={styles.logoutText}>{t("settings.logout", lang)}</Text>
      </Pressable>

      <Text style={[styles.version, { color: theme.textTertiary }]}>
        {t("settings.version", lang)} 1.0.0
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heading: { fontSize: 28, fontFamily: "Inter_700Bold" },
  profileCard: { borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", gap: 16, borderWidth: 1 },
  avatarWrap: { position: "relative" },
  avatar: { width: 72, height: 72, borderRadius: 20 },
  avatarPlaceholder: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarInitials: { fontSize: 22, fontFamily: "Inter_700Bold" },
  avatarEdit: { position: "absolute", bottom: -2, right: -2, width: 24, height: 24, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  profileInfo: { flex: 1, gap: 4 },
  profileName: { fontSize: 18, fontFamily: "Inter_700Bold" },
  profileEmail: { fontSize: 13, fontFamily: "Inter_400Regular" },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: "flex-start" },
  roleBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  section: { borderRadius: 16, padding: 16, gap: 12, borderWidth: 1 },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  langRow: { flexDirection: "row", gap: 10 },
  langBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12 },
  langFlag: { fontSize: 20 },
  langLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  themeRow: { gap: 8 },
  themeBtn: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12 },
  themePreview: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  themeLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  settingRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 4, borderRadius: 10 },
  settingIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  settingLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  settingRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  settingValue: { fontSize: 14, fontFamily: "Inter_400Regular" },
  userRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 12, borderTopWidth: 1 },
  userAvatar: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  userAvatarText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  userInfo: { flex: 1 },
  userName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  userEmail: { fontSize: 11, fontFamily: "Inter_400Regular" },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 14 },
  logoutText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#EF4444" },
  version: { textAlign: "center", fontSize: 12, fontFamily: "Inter_400Regular" },
});
