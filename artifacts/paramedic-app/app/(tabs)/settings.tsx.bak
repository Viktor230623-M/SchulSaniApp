import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import Constants from 'expo-constants';
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

const ROLE_CONFIG: Record<User["role"], { label: string; bg: string; text: string; icon: string }> = {
  cto: { label: "CTO", bg: "#CCFBF1", text: "#0F766E", icon: "" },
  admin: { label: "Administrator", bg: "#FEF2F2", text: "#DC2626", icon: "" },
  sanitaeter_leitung_admin: { label: "Sanitäter Leitung", bg: "#EFF6FF", text: "#2563EB", icon: "" },
  sanitaeter_leitung: { label: "Sanitäter Leitung", bg: "#EFF6FF", text: "#2563EB", icon: "" },
  teacher: { label: "Lehrer", bg: "#FFF7ED", text: "#EA580C", icon: "" },
  student_paramedic: { label: "Sanitäter", bg: "#F0FDF4", text: "#16A34A", icon: "" },
};

function RoleBadgeLarge({ role, theme }: { role: User["role"]; theme: any }) {
  const cfg = ROLE_CONFIG[role];
  return (
    <View style={[styles.roleBadgeLarge, { backgroundColor: cfg.bg, borderColor: cfg.text + "30" }]}>
      <Text style={[styles.roleBadgeLargeText, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.language);
  const themeKey = useAppStore((s) => s.theme);
  const theme = getTheme(themeKey);
  const user = useAppStore((s) => s.user);
  const avatarUriMap = useAppStore((s) => s.avatarUriMap);
  const setTheme = useAppStore((s) => s.setTheme);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const setAvatarUri = useAppStore((s) => s.setAvatarUri);
  const logout = useAppStore((s) => s.logout);

  const avatarUri = user ? (avatarUriMap[user.id] ?? null) : null;

  // Exklusive Themes
  const exclusiveUnlocked = ["cto", "admin", "sanitaeter_leitung_admin"].includes(user?.role ?? "");

  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const canSeeAllUsers = ["admin", "cto", "sanitaeter_leitung_admin", "teacher"].includes(user?.role ?? "");

  useEffect(() => {
  if (canSeeAllUsers && user) {
    setLoadingUsers(true);
    ApiService.getAllUsers().then((data) => {
      setAllUsers(Array.isArray(data) ? data : []);
      setLoadingUsers(false);
    });
  }
}, [canSeeAllUsers, user]);

  async function handlePickImage() {
    if (!user) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Berechtigung", "Fotobibliothek-Zugriff wird benötigt.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setAvatarUri(user.id, result.assets[0].uri);
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

  const baseThemes: { key: AppTheme; label: string; color: string; border: string }[] = [
    { key: "light", label: t("settings.themeLight", lang), color: "#F9FAFB", border: "#E5E7EB" },
    { key: "dark", label: t("settings.themeDark", lang), color: "#1A1A1A", border: "#374151" },
    { key: "red", label: t("settings.themeRed", lang), color: "#EF4444", border: "#FECACA" },
  ];

  const exclusiveThemes: { key: AppTheme; label: string; color: string; border: string }[] = [
    { key: "teal", label: t("settings.themeTeal", lang), color: "#0D9488", border: "#99F6E4" },
    { key: "crimson", label: t("settings.themeCrimson", lang), color: "#E8001C", border: "#3D0000" },
    { key: "midnight", label: t("settings.themeMidnight", lang), color: "#0A1628", border: "#1A3055" },
    { key: "sunset", label: t("settings.themeSunset", lang), color: "#F97316", border: "#FDDBA6" },
    { key: "amethyst", label: t("settings.themeAmethyst", lang), color: "#8B5CF6", border: "#D8B4FE" },
  ];

  const exclusiveKeys: AppTheme[] = ["teal", "crimson", "midnight", "sunset", "amethyst"];

  const isCTO = user?.role === "cto";
  const themes = isCTO ? [...baseThemes, ...exclusiveThemes] : exclusiveUnlocked ? [...baseThemes, ...exclusiveThemes.filter(t => t.key !== "teal")] : baseThemes;

  const langs: { key: AppLanguage; label: string; flag: string }[] = [
    { key: "de", label: "Deutsch", flag: "🇩🇪" },
    { key: "en", label: "English", flag: "🇬🇧" },
  ];

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

      {/* Profile + Rank Card */}
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
          <Text style={[styles.profileEmail, { color: theme.textSecondary }]}>
            {user?.email}
          </Text>
          <Text style={[styles.rankLabel, { color: theme.textTertiary }]}>
            {t("settings.myRank", lang)}
          </Text>
          {user && <RoleBadgeLarge role={user.role} theme={theme} />}
        </View>
      </View>

      {/* My Activity Log */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push("/activity-log");
        }}
        style={({ pressed }) => [
          styles.section,
          { backgroundColor: theme.card, borderColor: theme.cardBorder, opacity: pressed ? 0.96 : 1 },
        ]}
      >
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>
            {t("settings.activityLog", lang)}
          </Text>
          <Ionicons name="chevron-forward-outline" size={16} color={theme.textTertiary} />
        </View>
      </Pressable>

      {/* Language */}
      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>
          {t("settings.language", lang)}
        </Text>
        <View style={styles.langRow}>
          {langs.map((l) => (
            <Pressable
              key={l.key}
              onPress={() => {
                setLanguage(l.key);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
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
        <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>
          {t("settings.theme", lang)}
        </Text>
        {themes.map((th) => (
          <Pressable
            key={th.key}
            onPress={() => {
              setTheme(th.key);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            style={[
              styles.themeBtn,
              {
                borderColor: themeKey === th.key ? theme.tint : theme.cardBorder,
                backgroundColor: themeKey === th.key ? theme.tintLight : "transparent",
                borderWidth: themeKey === th.key ? 2 : 1,
              },
            ]}
          >
            <View style={[styles.themePreview, { backgroundColor: th.color, borderColor: th.border }]} />
            <Text style={[styles.themeLabel, { color: theme.text }]}>{th.label}</Text>
            {themeKey === th.key && (
              <Ionicons name="checkmark-circle" size={18} color={theme.tint} />
            )}
          </Pressable>
        ))}
      </View>

      {/* Admin: All Users */}
      {canSeeAllUsers && (
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Pressable onPress={() => setShowUsers(!showUsers)} style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>
              {t("settings.allUsers", lang)}
            </Text>
            <View style={styles.rowRight}>
              <View style={[styles.countBadge, { backgroundColor: theme.tintLight }]}>
                <Text style={[styles.countText, { color: theme.tint }]}>{allUsers.length}</Text>
              </View>
              <Ionicons name={showUsers ? "chevron-up" : "chevron-down"} size={16} color={theme.textTertiary} />
            </View>
          </Pressable>
          {showUsers && (
            loadingUsers ? (
              <ActivityIndicator color={theme.tint} />
            ) : (
              allUsers.map((u) => {
                const cfg = ROLE_CONFIG[u.role] ?? { label: u.role, bg: "#F3F4F6", text: "#6B7280", icon: "" };
                return (
                  <View key={u.id} style={[styles.userRow, { borderTopColor: theme.cardBorder }]}>
                    <View style={[styles.userAvatar, { backgroundColor: cfg.bg }]}>
                      <Text style={[styles.userAvatarText, { color: cfg.text }]}>
                        {u.firstName?.[0] ?? "?"}{u.lastName?.[0] ?? ""}
                      </Text>
                    </View>
                    <View style={styles.userInfo}>
                      <Text style={[styles.userName, { color: theme.text }]}>
                        {u.firstName} {u.lastName}
                      </Text>
                      <Text style={[styles.userEmail, { color: theme.textTertiary }]}>{u.email}</Text>
                    </View>
                    <View style={[styles.smallRoleBadge, { backgroundColor: cfg.bg }]}>
                      <Text style={[styles.smallRoleText, { color: cfg.text }]}>{cfg.label}</Text>
                    </View>
                  </View>
                );
              })
            )
          )}
</View>
  {canSeeAllUsers && (
  <Pressable
    onPress={() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push("/admin/sani-activity");
    }}
    style={({ pressed }) => [
      styles.section,
      { backgroundColor: theme.card, borderColor: theme.cardBorder, opacity: pressed ? 0.96 : 1 },
    ]}
  >
    <View style={styles.sectionHeaderRow}>
      <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>
        {t("settings.saniActivity", lang)}
      </Text>
      <Ionicons name="chevron-forward-outline" size={16} color={theme.textTertiary} />
    </View>
  </Pressable>
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
        {t("settings.version", lang)} {Constants.expoConfig?.version ?? '1.0.0-beta.1'} · SchulSanitäter · gymbla.de
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heading: { fontSize: 28, fontFamily: "Inter_700Bold" },
  profileCard: { borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "flex-start", gap: 16, borderWidth: 1 },
  avatarWrap: { position: "relative" },
  avatar: { width: 72, height: 72, borderRadius: 20 },
  avatarPlaceholder: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarInitials: { fontSize: 22, fontFamily: "Inter_700Bold" },
  avatarEdit: { position: "absolute", bottom: -2, right: -2, width: 24, height: 24, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  profileInfo: { flex: 1, gap: 4 },
  profileName: { fontSize: 18, fontFamily: "Inter_700Bold" },
  profileEmail: { fontSize: 13, fontFamily: "Inter_400Regular" },
  rankLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 6 },
  roleBadgeLarge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, alignSelf: "flex-start" },
  roleIcon: { fontSize: 14 },
  roleBadgeLargeText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  section: { borderRadius: 16, padding: 16, gap: 12, borderWidth: 1 },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  countText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  langRow: { flexDirection: "row", gap: 10 },
  langBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12 },
  langFlag: { fontSize: 20 },
  langLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  themeBtn: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12 },
  themePreview: { width: 28, height: 28, borderRadius: 8, borderWidth: 1 },
  themeLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  exclusiveTag: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#E8001C" },
  exclusiveHint: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center", paddingTop: 4 },
  userRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 12, borderTopWidth: 1 },
  userAvatar: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  userAvatarText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  userInfo: { flex: 1 },
  userName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  userEmail: { fontSize: 11, fontFamily: "Inter_400Regular" },
  smallRoleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  smallRoleText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 14 },
  logoutText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#EF4444" },
  version: { textAlign: "center", fontSize: 12, fontFamily: "Inter_400Regular" },
});
