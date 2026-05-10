function formatName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

function formatFullName(firstName?: string, lastName?: string): string {
  if (!firstName || !lastName) return "—";
  return `${formatName(firstName)} ${formatName(lastName)}`;
}

import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import Constants from "expo-constants";
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
import { getTheme, type ThemeColors } from "@/constants/theme";
import type { AppLanguage, AppTheme, User, Mission, LOARequest } from "@/models";
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

function RoleBadgeLarge({ role, theme }: { role: User["role"]; theme: ThemeColors }) {
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

  const exclusiveUnlocked = ["cto", "admin", "sanitaeter_leitung_admin"].includes(user?.role ?? "");

  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const canSeeAllUsers = ["admin", "cto", "sanitaeter_leitung_admin", "teacher"].includes(user?.role ?? "");

  const [showActivityLog, setShowActivityLog] = useState(false);
  const [activityLogData, setActivityLogData] = useState<(Mission | LOARequest & { type: string })[]>([]);
  const [loadingActivityLog, setLoadingActivityLog] = useState(false);

  const [showSaniActivity, setShowSaniActivity] = useState(false);
  const [saniActivityData, setSaniActivityData] = useState<(Mission & { assignedUser: User | null })[]>([]);
  const [loadingSaniActivity, setLoadingSaniActivity] = useState(false);

  useEffect(() => {
    if (canSeeAllUsers && user) {
      setLoadingUsers(true);
      ApiService.getAllUsers()
        .then((data) => {
          setAllUsers(Array.isArray(data) ? data : []);
        })
        .catch((err) => console.error("Failed to load all users:", err))
        .finally(() => setLoadingUsers(false));
    }
  }, [canSeeAllUsers, user]);

  useEffect(() => {
    if (showActivityLog && user) {
      setLoadingActivityLog(true);
      Promise.all([
        ApiService.getMissions(),
        ApiService.getLOARequests(),
      ])
        .then(([missions, loaRequests]) => {
          const activities: (Mission | LOARequest & { type: string })[] = [
            ...(Array.isArray(missions) ? missions.map((m) => ({ type: "mission" as const, ...m })) : []),
            ...(Array.isArray(loaRequests) ? loaRequests.map((l) => ({ type: "loa" as const, ...l })) : []),
          ].sort((a, b) => {
            const dateA = new Date(a.requestedAt || a.createdAt || 0).getTime();
            const dateB = new Date(b.requestedAt || b.createdAt || 0).getTime();
            return dateB - dateA;
          }).slice(0, 20);
          setActivityLogData(activities);
        })
        .catch((err) => console.error("Failed to load activity log:", err))
        .finally(() => setLoadingActivityLog(false));
    }
  }, [showActivityLog, user]);

  useEffect(() => {
    if (showSaniActivity && user) {
      setLoadingSaniActivity(true);
      Promise.all([
        ApiService.getMissions(),
        ApiService.getAllUsers(),
      ])
        .then(([missions, users]) => {
          const completedMissions = Array.isArray(missions) ? missions.filter((m) => m.status === "completed" || m.status === "accepted") : [];
          const userMap = new Map((Array.isArray(users) ? users : []).map((u) => [u.id, u]));
          const activities: (Mission & { assignedUser: User | null })[] = completedMissions.map((m) => {
            const assigned = m.assignedParamedicId ? userMap.get(m.assignedParamedicId) ?? null : null;
            return { ...m, assignedUser: assigned };
          }).slice(0, 20);
          setSaniActivityData(activities);
        })
        .catch((err) => console.error("Failed to load sani activity:", err))
        .finally(() => setLoadingSaniActivity(false));
    }
  }, [showSaniActivity, user]);

  async function handlePickImage() {
    if (!user) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Berechtigung", "Fotobibliothek-Zugriff wird benötigt.");
      return;
    }
     const result = await ImagePicker.launchImageLibraryAsync({
       mediaTypes: ImagePicker.MediaTypeOptions.Images,
       allowsEditing: true,
       aspect: [1, 1],
       quality: 0.8,
     });
     if (!result.canceled && result.assets && result.assets.length > 0) {
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

  const isCTO = user?.role === "cto";
  const themes = isCTO
    ? [...baseThemes, ...exclusiveThemes]
    : exclusiveUnlocked
    ? [...baseThemes, ...exclusiveThemes.filter((th) => th.key !== "teal")]
    : baseThemes;

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

      <View style={[styles.profileCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Pressable onPress={handlePickImage} style={styles.avatarWrap}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: theme.tintLight }]}>
              <Text style={[styles.avatarInitials, { color: theme.tint }]}>
                {user ? `${formatName(user.firstName)[0]}${formatName(user.lastName)[0]}` : "??"}
              </Text>
            </View>
          )}
          <View style={[styles.avatarEdit, { backgroundColor: theme.tint }]}>
            <Feather name="camera" size={12} color="#fff" />
          </View>
        </Pressable>

        <View style={styles.profileInfo}>
          <Text style={[styles.profileName, { color: theme.text }]}>
            {user ? formatFullName(user.firstName, user.lastName) : "—"}
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

      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Pressable onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setShowActivityLog(!showActivityLog);
        }} style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>
            {t("settings.activityLog", lang)}
          </Text>
          <Ionicons name={showActivityLog ? "chevron-up" : "chevron-down"} size={16} color={theme.textTertiary} />
        </Pressable>
        {showActivityLog && (
          loadingActivityLog ? (
            <ActivityIndicator color={theme.tint} />
          ) : activityLogData.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.textTertiary }]}>Keine Aktivitäten</Text>
          ) : (
            activityLogData.map((item, index) => (
              <View key={item.id || index} style={[styles.activityRow, { borderTopColor: theme.cardBorder }]}>
                <View style={[styles.activityIcon, { backgroundColor: item.type === "mission" ? "#FEE2E2" : "#DBEAFE" }]}>
                  <Ionicons name={item.type === "mission" ? "medical" : "calendar-outline"} size={14} color={item.type === "mission" ? "#DC2626" : "#2563EB"} />
                </View>
                <View style={styles.activityInfo}>
                  <Text style={[styles.activityTitle, { color: theme.text }]} numberOfLines={1}>
                    {item.title || item.reason}
                  </Text>
                  <Text style={[styles.activityDate, { color: theme.textTertiary }]}>
                    {item.type === "mission" ? new Date(item.requestedAt).toLocaleDateString("de-DE") : `${new Date(item.fromDate).toLocaleDateString("de-DE")} - ${new Date(item.toDate).toLocaleDateString("de-DE")}`}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: (item.type === "mission" ? (item.status === "completed" ? "#DCFCE7" : "#FEF3C7") : (item.status === "approved" ? "#DCFCE7" : "#FEF3C7")) }]}>
                  <Text style={[styles.statusText, { color: (item.type === "mission" ? (item.status === "completed" ? "#16A34A" : "#D97706") : (item.status === "approved" ? "#16A34A" : "#D97706")) }]}>
                    {item.type === "mission" ? (item.status === "completed" ? "Erledigt" : item.status === "accepted" ? "Angenommen" : "Ausstehend") : (item.status === "approved" ? "Genehmigt" : item.status === "rejected" ? "Abgelehnt" : "Ausstehend")}
                  </Text>
                </View>
              </View>
            ))
          )
        )}
      </View>

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
                        {formatName(u.firstName || "")[0]}{formatName(u.lastName || "")[0]}
                      </Text>
                    </View>
                    <View style={styles.userInfo}>
                      <Text style={[styles.userName, { color: theme.text }]}>
                        {formatFullName(u.firstName, u.lastName)}
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
      )}

      {canSeeAllUsers && (
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Pressable onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowSaniActivity(!showSaniActivity);
          }} style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>
              {t("settings.saniActivity", lang)}
            </Text>
            <Ionicons name={showSaniActivity ? "chevron-up" : "chevron-down"} size={16} color={theme.textTertiary} />
          </Pressable>
          {showSaniActivity && (
            loadingSaniActivity ? (
              <ActivityIndicator color={theme.tint} />
            ) : saniActivityData.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.textTertiary }]}>Keine Sani-Aktivitäten</Text>
            ) : (
              saniActivityData.map((item, index) => (
                <View key={item.id || index} style={[styles.saniActivityRow, { borderTopColor: theme.cardBorder }]}>
                  <View style={[styles.saniAvatar, { backgroundColor: item.assignedUser ? "#DCFCE7" : "#F3F4F6" }]}>
                    <Text style={[styles.saniAvatarText, { color: item.assignedUser ? "#16A34A" : "#6B7280" }]}>
                      {item.assignedUser ? `${formatName(item.assignedUser.firstName || "")[0]}${formatName(item.assignedUser.lastName || "")[0]}` : "?"}
                    </Text>
                  </View>
                  <View style={styles.saniInfo}>
                    <Text style={[styles.saniName, { color: theme.text }]}>
                      {item.assignedUser ? formatFullName(item.assignedUser.firstName, item.assignedUser.lastName) : "Nicht zugewiesen"}
                    </Text>
                    <Text style={[styles.saniMission, { color: theme.textTertiary }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                  </View>
                  <Text style={[styles.saniTime, { color: theme.textTertiary }]}>
                    {item.scheduledFor ? new Date(item.scheduledFor).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "--:--"}
                  </Text>
                </View>
              ))
            )
          )}
        </View>
      )}

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
        {t("settings.version", lang)} {Constants.expoConfig?.version ?? "1.0.0-beta.1"} · SchulSanitäter · gymbla.de
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
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 8 },
  activityRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 12, borderTopWidth: 1 },
  activityIcon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  activityInfo: { flex: 1 },
  activityTitle: { fontSize: 14, fontFamily: "Inter_500Medium" },
  activityDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  saniActivityRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 12, borderTopWidth: 1 },
  saniAvatar: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  saniAvatarText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  saniInfo: { flex: 1 },
  saniName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  saniMission: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  saniTime: { fontSize: 12, fontFamily: "Inter_500Medium" },
});
