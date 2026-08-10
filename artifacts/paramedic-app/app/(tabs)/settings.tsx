function formatName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

function formatFullName(firstName?: string, lastName?: string): string {
  if (!firstName || !lastName) return "—";
  return `${formatName(firstName)} ${formatName(lastName)}`;
}

type ActivityFeedItem =
  | ({ type: "mission" } & Mission)
  | ({ type: "loa" } & LOARequest);

import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import * as ImagePicker from "expo-image-picker";
import Constants from "expo-constants";
import { SCHOOL_NAME } from "@/constants/appConfig";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTopPad } from "@/hooks/useTopPad";
import { appleCardStyle } from "@/components/AppleSurface";
import { useRoles } from "@/hooks/useRoles";
import { t } from "@/constants/i18n";
import { getTheme, type ThemeColors, istDunklesThema, withAlpha } from "@/constants/theme";
import type { AppLanguage, AppTheme, User, Mission, LOARequest } from "@/models";
import { confirmAction, notify } from "@/lib/dialog";
import ApiService, { type AuthIdentityInfo } from "@/services/ApiService";
import { enableWebPush, webPushState } from "@/services/WebPushService";
import { has, useAppStore } from "@/store/useAppStore";

function RoleBadgeLarge({ label, bg, text }: { label: string; bg: string; text: string }) {
  return (
    <View style={[styles.roleBadgeLarge, { backgroundColor: bg, borderColor: text + "30" }]}>
      <Text style={[styles.roleBadgeLargeText, { color: text }]}>{label}</Text>
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
  const setDefaultTheme = useAppStore((s) => s.setDefaultTheme);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const setAvatarUri = useAppStore((s) => s.setAvatarUri);
  const logout = useAppStore((s) => s.logout);
  const roles = useRoles();
  const linkParams = useLocalSearchParams<{ link?: string }>();

  const avatarUri = user ? (avatarUriMap[user.id] ?? null) : null;

  const [pushState, setPushState] = useState<
    "unsupported" | "needs-install" | "denied" | "granted" | "default"
  >("unsupported");
  const [identities, setIdentities] = useState<AuthIdentityInfo[]>([]);
  const [providers, setProviders] = useState<Awaited<ReturnType<typeof ApiService.getAuthProviders>>["providers"]>([]);
  const [loadingIdentities, setLoadingIdentities] = useState(false);
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null);
  const [removingIdentity, setRemovingIdentity] = useState<string | null>(null);
  const [identityError, setIdentityError] = useState(false);

  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const canSeeAllUsers = has("users.read_all");

  const [showActivityLog, setShowActivityLog] = useState(false);
  const [activityLogData, setActivityLogData] = useState<ActivityFeedItem[]>([]);
  const [loadingActivityLog, setLoadingActivityLog] = useState(false);

  const [showSaniActivity, setShowSaniActivity] = useState(false);
  const [saniActivityData, setSaniActivityData] = useState<(Mission & { assignedUser: User | null })[]>([]);
  const [loadingSaniActivity, setLoadingSaniActivity] = useState(false);

  const isAdmin = has("users.read_pending");
  // The database console is bound to one account, not to a role.
  const isOwner = user?.isOwnerAccount ?? false;
  const canAssignRole = has("users.assign_role");
  const canDeleteUsers = has("users.delete");
  const canManageRoleCatalog = has("roles.manage");
  const canCorrectProfile = has("users.correct_profile");
  const canManageRoles = canAssignRole || canDeleteUsers || isAdmin || canManageRoleCatalog || canCorrectProfile;
  const canExportData = has("reports.read_all") && has("reports.see_patient_info");
  const [showAdmin, setShowAdmin] = useState(false);
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [pendingRoles, setPendingRoles] = useState<Record<string, string>>({});
  const [adminProcessing, setAdminProcessing] = useState<string | null>(null);

  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [correctFirstName, setCorrectFirstName] = useState("");
  const [correctLastName, setCorrectLastName] = useState("");
  const [correctBusy, setCorrectBusy] = useState(false);

  useEffect(() => {
    webPushState().then(setPushState);
  }, []);

  async function loadIdentities() {
    if (!user) return;
    setLoadingIdentities(true);
    setIdentityError(false);
    try {
      setIdentities(await ApiService.getAuthIdentities());
    } catch {
      setIdentityError(true);
    } finally {
      setLoadingIdentities(false);
    }
  }

  useEffect(() => {
    void loadIdentities();
    ApiService.getAuthProviders().then(({ providers }) => setProviders(providers)).catch(() => setProviders([]));
  }, [user?.id]);

  useEffect(() => {
    const result = Array.isArray(linkParams.link) ? linkParams.link[0] : linkParams.link;
    if (result !== "success" && result !== "collision") return;
    notify(
      result === "success" ? t("settings.linkSuccess", lang) : t("settings.linkCollision", lang),
      result === "success" ? undefined : t("settings.linkFailed", lang),
    );
    void loadIdentities();
    router.replace("/(tabs)/settings");
  }, [linkParams.link, lang]);

  async function handleRemoveIdentity(identity: AuthIdentityInfo) {
    const confirmed = await confirmAction({
      title: t("settings.removeIdentityTitle", lang),
      message: t("settings.removeIdentityConfirm", lang).replace("{name}", identity.displayName),
      confirmLabel: t("settings.removeIdentityButton", lang),
      cancelLabel: t("common.cancel", lang),
      destructive: true,
    });
    if (!confirmed) return;
    setRemovingIdentity(identity.id);
    try {
      await ApiService.removeAuthIdentity(identity.id);
      await loadIdentities();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      await notify(t("common.error", lang), err instanceof Error ? err.message : t("settings.removeIdentityFailed", lang));
    } finally {
      setRemovingIdentity(null);
    }
  }

  async function handleLink(providerKey: string) {
    setLinkingProvider(providerKey);
    try {
      const returnUrl = Platform.OS === "web" ? `${window.location.origin}/settings` : Linking.createURL("settings");
      const redirectUrl = await ApiService.startAuthLink(providerKey, returnUrl);
      if (Platform.OS === "web") {
        window.location.href = redirectUrl;
        return;
      }
      const result = await WebBrowser.openAuthSessionAsync(redirectUrl, returnUrl);
      const callback = result.type === "success" ? Linking.parse(result.url) : null;
      const linkResult = typeof callback?.queryParams?.link === "string" ? callback.queryParams.link : null;
      if (linkResult === "success") {
        notify(t("settings.linkSuccess", lang));
        await loadIdentities();
      } else if (linkResult === "collision") {
        notify(t("settings.linkCollision", lang), t("settings.linkFailed", lang));
      } else if (result.type !== "cancel" && result.type !== "dismiss") {
        notify(t("common.error", lang), t("settings.linkFailed", lang));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t("settings.linkFailed", lang);
      notify(t("common.error", lang), message);
    } finally {
      setLinkingProvider(null);
    }
  }

  async function handleEnableWebPush() {
    const result = await enableWebPush();
    setPushState(result === "denied" ? "denied" : result === "granted" ? "granted" : pushState);
  }

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
      Promise.allSettled([
        ApiService.getMissions(),
        ApiService.getLOARequests(),
      ])
        .then(([missionsResult, loaResult]) => {
          const missions = missionsResult.status === "fulfilled" ? missionsResult.value : [];
          const loaRequests = loaResult.status === "fulfilled" ? loaResult.value : [];
          if (missionsResult.status === "rejected") console.error("Failed to load missions:", missionsResult.reason);
          if (loaResult.status === "rejected") console.error("Failed to load LOA requests:", loaResult.reason);
          const activities: ActivityFeedItem[] = [
            ...(Array.isArray(missions) ? missions.map((m) => ({ type: "mission" as const, ...m })) : []),
            ...(Array.isArray(loaRequests) ? loaRequests.map((l) => ({ type: "loa" as const, ...l })) : []),
          ].sort((a, b) => {
            const dateA = new Date(a.type === "mission" ? a.requestedAt : a.createdAt).getTime();
            const dateB = new Date(b.type === "mission" ? b.requestedAt : b.createdAt).getTime();
            return dateB - dateA;
          }).slice(0, 20);
          setActivityLogData(activities);
        })
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

  useEffect(() => {
    if (isAdmin && user) {
      setLoadingPending(true);
      ApiService.getPendingUsers()
        .then((data) => {
          const list = Array.isArray(data) ? data : [];
          setPendingUsers(list);
          const defaults: Record<string, string> = {};
          list.forEach((u) => { defaults[u.id] = "sanitaeter"; });
          setPendingRoles(defaults);
        })
        .catch((err) => console.error("Failed to load pending users:", err))
        .finally(() => setLoadingPending(false));
    }
  }, [isAdmin, user?.id]);

  async function handleApproveUser(userId: string) {
    const role = pendingRoles[userId] ?? "sanitaeter";
    setAdminProcessing(userId);
    try {
      const updated = await ApiService.approveUser(userId, role);
      setPendingUsers((prev) => prev.filter((u) => u.id !== userId));
      setAllUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...updated } : u)));
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    } catch (err) {
      notify(t("common.error", lang), err instanceof Error ? err.message : t("settings.approveFailed", lang));
    } finally {
      setAdminProcessing(null);
    }
  }

  async function handleChangeRole(userId: string, role: string) {
    try {
      const updated = await ApiService.updateUserRole(userId, role);
      setAllUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...updated } : u)));
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    } catch (err) {
      notify(t("common.error", lang), err instanceof Error ? err.message : t("settings.roleChangeFailed", lang));
    }
  }

  async function handleDeleteUser(userId: string, name: string) {
    const confirmed = await confirmAction({
      title: t("settings.deleteUserTitle", lang),
      message: t("settings.deleteUserConfirm", lang).replace("{name}", name),
      confirmLabel: t("common.delete", lang),
      cancelLabel: t("common.cancel", lang),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await ApiService.deleteUser(userId);
      setAllUsers((prev) => prev.filter((u) => u.id !== userId));
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
    } catch (err) {
      await notify(t("common.error", lang), err instanceof Error ? err.message : t("common.error", lang));
    }
  }

  function startCorrect(u: User) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCorrectingId(u.id);
    setCorrectFirstName(u.firstName);
    setCorrectLastName(u.lastName);
  }

  async function handleCorrect(u: User) {
    const firstName = correctFirstName.trim();
    const lastName = correctLastName.trim();
    if (!firstName || !lastName) return;
    const nameChanged = firstName !== u.firstName || lastName !== u.lastName;
    if (!nameChanged) {
      setCorrectingId(null);
      return;
    }
    const lines = [];
    if (nameChanged) {
      lines.push(
        t("settings.correctNameConfirm", lang)
          .replace("{name}", formatFullName(u.firstName, u.lastName))
          .replace("{firstName}", firstName)
          .replace("{lastName}", lastName),
      );
    }
    const confirmed = await confirmAction({
      title: t("settings.correctProfileTitle", lang),
      message: lines.join("\n"),
      confirmLabel: t("common.save", lang),
      cancelLabel: t("common.cancel", lang),
    });
    if (!confirmed) return;
    setCorrectBusy(true);
    try {
      const updated = await ApiService.correctUserProfile(u.id, firstName, lastName);
      setAllUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, ...updated } : x)));
      setCorrectingId(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      await notify(t("common.error", lang), err instanceof Error ? err.message : t("settings.correctProfileFailed", lang));
    } finally {
      setCorrectBusy(false);
    }
  }

  async function handlePickImage() {
    if (!user) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      notify(t("settings.photoPermissionTitle", lang), t("settings.photoPermissionMessage", lang));
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

  async function handleLogout() {
    const confirmed = await confirmAction({
      title: t("settings.logout", lang),
      message: t("settings.logoutConfirm", lang),
      confirmLabel: t("settings.logout", lang),
      cancelLabel: t("common.cancel", lang),
      destructive: true,
    });
    if (!confirmed) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    logout();
    router.replace("/login");
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

  const themes = [...baseThemes, ...exclusiveThemes];

  const langs: { key: AppLanguage; label: string; flag: string }[] = [
    { key: "de", label: "Deutsch", flag: "🇩🇪" },
    { key: "en", label: "English", flag: "🇬🇧" },
  ];

  const topPad = useTopPad();

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

      <View style={[styles.profileCard, appleCardStyle(theme)]}>
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
          {user && (
            <RoleBadgeLarge
              label={roles.displayName(user.role, lang)}
              {...roles.colors(user.role)}
            />
          )}
        </View>
      </View>

      <View
        style={[styles.section, appleCardStyle(theme)]}
        accessibilityRole="summary"
        accessibilityLabel={t("settings.signInMethods", lang)}
      >
        <View style={styles.sectionHeaderRow}>
          <View style={styles.adminHeaderLeft}>
            <Ionicons name="key-outline" size={16} color={theme.tint} />
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{t("settings.signInMethods", lang)}</Text>
          </View>
        </View>
        <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
          {t("settings.signInMethodsDesc", lang)}
        </Text>
        {loadingIdentities ? (
          <ActivityIndicator color={theme.tint} />
        ) : identityError ? (
          <>
            <Text style={[styles.emptyText, { color: theme.danger }]}>
              {t("settings.signInMethodsFailed", lang)}
            </Text>
            <Pressable
              onPress={() => void loadIdentities()}
              accessibilityRole="button"
              accessibilityLabel={t("settings.signInMethodsRetry", lang)}
              style={({ pressed }) => [styles.identityRetry, { borderColor: theme.tint, opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={[styles.identityRetryText, { color: theme.tint }]}>{t("settings.signInMethodsRetry", lang)}</Text>
            </Pressable>
          </>
        ) : identities.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
            {t("settings.signInMethodsEmpty", lang)}
          </Text>
        ) : (
          identities.map((identity) => (
            <View
              key={identity.id}
              style={[styles.identityRow, { borderTopColor: theme.cardBorder }]}
              accessible
              accessibilityLabel={`${identity.displayName}, ${t("settings.linkedOn", lang).replace("{date}", new Date(identity.createdAt).toLocaleDateString(lang === "de" ? "de-DE" : "en-US"))}`}
            >
              <View style={[styles.identityIcon, { backgroundColor: theme.tintLight }]}>
                <Ionicons
                  name="globe-outline"
                  size={18}
                  color={theme.tint}
                  accessible={false}
                />
              </View>
              <View style={styles.identityInfo}>
                <Text style={[styles.userName, { color: theme.text }]}>{identity.displayName}</Text>
                <Text style={[styles.userEmail, { color: theme.textTertiary }]}>
                  {t("settings.linkedOn", lang).replace("{date}", new Date(identity.createdAt).toLocaleDateString(lang === "de" ? "de-DE" : "en-US"))}
                </Text>
              </View>
              {identities.length > 1 ? (
                <Pressable
                  onPress={() => void handleRemoveIdentity(identity)}
                  disabled={removingIdentity === identity.id}
                  accessibilityRole="button"
                  accessibilityLabel={t("settings.removeIdentity", lang)}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.removeIdentityBtn,
                    { opacity: pressed || removingIdentity === identity.id ? 0.5 : 1 },
                  ]}
                >
                  {removingIdentity === identity.id ? (
                    <ActivityIndicator size="small" color={theme.danger} />
                  ) : (
                    <Ionicons name="trash-outline" size={18} color={theme.danger} />
                  )}
                </Pressable>
              ) : (
                <Ionicons name="checkmark-circle" size={20} color={theme.success} />
              )}
            </View>
          ))
        )}
        {providers.filter((provider) => provider.type === "oidc-redirect" && !identities.some((identity) => identity.providerKey === provider.key)).map((provider) => {
          const visual = provider.key === "google"
            ? { icon: "logo-google" as const, color: "#EA4335" }
            : provider.key === "microsoft"
              ? { icon: "logo-microsoft" as const, color: "#00A4EF" }
              : provider.key === "apple"
                ? { icon: "logo-apple" as const, color: theme.text }
                : { icon: "add-circle-outline" as const, color: theme.tint };
          const busy = linkingProvider === provider.key;
          return (
            <Pressable
              key={provider.key}
              onPress={() => void handleLink(provider.key)}
              disabled={linkingProvider !== null}
              accessibilityRole="button"
              accessibilityLabel={`${t("settings.addSignInMethod", lang)}: ${provider.displayName}`}
              style={({ pressed }) => [styles.linkProviderRow, { borderColor: theme.cardBorder, backgroundColor: theme.backgroundTertiary, opacity: pressed || busy ? 0.7 : 1 }]}
            >
              <Ionicons name={visual.icon} size={18} color={visual.color} />
              <Text style={[styles.userName, { color: theme.text, flex: 1 }]}>{provider.displayName}</Text>
              {busy ? <ActivityIndicator size="small" color={theme.tint} /> : <Text style={[styles.linkProviderText, { color: theme.tint }]}>{t("settings.linkSignInMethod", lang)}</Text>}
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.section, appleCardStyle(theme)]}>
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
            <Text style={[styles.emptyText, { color: theme.textTertiary }]}>{t("activityLog.noActivity", lang)}</Text>
          ) : (
            activityLogData.map((item, index) => (
              <View key={item.id || index} style={[styles.activityRow, { borderTopColor: theme.cardBorder }]}>
                <View style={[styles.activityIcon, { backgroundColor: item.type === "mission" ? withAlpha("#DC2626", 0.14) : withAlpha("#2563EB", 0.14) }]}>
                  <Ionicons name={item.type === "mission" ? "medical" : "calendar-outline"} size={14} color={item.type === "mission" ? "#DC2626" : "#2563EB"} />
                </View>
                <View style={styles.activityInfo}>
                  <Text style={[styles.activityTitle, { color: theme.text }]} numberOfLines={1}>
                    {item.type === "mission" ? item.title : item.reason}
                  </Text>
                  <Text style={[styles.activityDate, { color: theme.textTertiary }]}>
                    {item.type === "mission" ? new Date(item.requestedAt).toLocaleDateString(lang === "de" ? "de-DE" : "en-GB") : `${new Date(item.fromDate).toLocaleDateString(lang === "de" ? "de-DE" : "en-GB")} - ${new Date(item.toDate).toLocaleDateString(lang === "de" ? "de-DE" : "en-GB")}`}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: withAlpha(item.type === "mission" ? (item.status === "completed" ? "#16A34A" : "#D97706") : (item.status === "approved" ? "#16A34A" : "#D97706"), 0.14) }]}>
                  <Text style={[styles.statusText, { color: item.type === "mission" ? (item.status === "completed" ? (istDunklesThema(theme.background) ? "#4ADE80" : "#16A34A") : (istDunklesThema(theme.background) ? "#FBBF24" : "#D97706")) : (item.status === "approved" ? (istDunklesThema(theme.background) ? "#4ADE80" : "#16A34A") : (istDunklesThema(theme.background) ? "#FBBF24" : "#D97706")) }]}>
                    {item.type === "mission" ? (item.status === "completed" ? t("missions.completed", lang) : item.status === "accepted" ? t("missions.accepted", lang) : t("missions.pending", lang)) : (item.status === "approved" ? t("loa.approved", lang) : item.status === "rejected" ? t("loa.rejected", lang) : t("loa.pending", lang))}
                  </Text>
                </View>
              </View>
            ))
          )
        )}
      </View>

      <View style={[styles.section, appleCardStyle(theme)]}>
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

      <View style={[styles.section, appleCardStyle(theme)]}>
        <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>
          {t("settings.theme", lang)}
        </Text>
        {themes.map((th) => (
          <Pressable
            key={th.key}
            onPress={() => {
              setDefaultTheme(th.key);
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

      {pushState !== "unsupported" && (
        <View style={[styles.section, appleCardStyle(theme)]}>
          <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>
            {t("settings.notifications", lang)}
          </Text>
          {pushState === "needs-install" && (
            <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
              {t("settings.notificationsNeedsInstall", lang)}
            </Text>
          )}
          {pushState === "denied" && (
            <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
              {t("settings.notificationsDenied", lang)}
            </Text>
          )}
          {pushState === "granted" && (
            <>
              <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
                {t("settings.notificationsActive", lang)}
              </Text>
              <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
                {t("settings.notificationsFocusHint", lang)}
              </Text>
            </>
          )}
          {pushState === "default" && (
            <Pressable
              onPress={handleEnableWebPush}
              style={({ pressed }) => [
                styles.approveBtn,
                { backgroundColor: theme.tint, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Ionicons name="notifications-outline" size={16} color="#fff" />
              <Text style={styles.approveBtnText}>{t("settings.notificationsEnable", lang)}</Text>
            </Pressable>
          )}
        </View>
      )}

      {canSeeAllUsers && (
        <View style={[styles.section, appleCardStyle(theme)]}>
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
                const cfg = roles.colors(u.role);
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
                      <Text style={[styles.smallRoleText, { color: cfg.text }]}>{roles.displayName(u.role, lang)}</Text>
                    </View>
                  </View>
                );
              })
            )
          )}
        </View>
      )}

      {canSeeAllUsers && (
        <View style={[styles.section, appleCardStyle(theme)]}>
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
              <Text style={[styles.emptyText, { color: theme.textTertiary }]}>{t("settings.noSaniActivities", lang)}</Text>
            ) : (
              saniActivityData.map((item, index) => (
                <View key={item.id || index} style={[styles.saniActivityRow, { borderTopColor: theme.cardBorder }]}>
                  <View style={[styles.saniAvatar, { backgroundColor: item.assignedUser ? withAlpha("#16A34A", 0.14) : theme.backgroundTertiary }]}>
                    <Text style={[styles.saniAvatarText, { color: item.assignedUser ? "#16A34A" : theme.textTertiary }]}>
                      {item.assignedUser ? `${formatName(item.assignedUser.firstName || "")[0]}${formatName(item.assignedUser.lastName || "")[0]}` : "?"}
                    </Text>
                  </View>
                  <View style={styles.saniInfo}>
                    <Text style={[styles.saniName, { color: theme.text }]}>
                      {item.assignedUser ? formatFullName(item.assignedUser.firstName, item.assignedUser.lastName) : t("missions.unassigned", lang)}
                    </Text>
                    <Text style={[styles.saniMission, { color: theme.textTertiary }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                  </View>
                  <Text style={[styles.saniTime, { color: theme.textTertiary }]}>
                    {item.scheduledFor ? new Date(item.scheduledFor).toLocaleTimeString(lang === "de" ? "de-DE" : "en-GB", { hour: "2-digit", minute: "2-digit" }) : "--:--"}
                  </Text>
                </View>
              ))
            )
          )}
        </View>
      )}

      {canManageRoles && (
        <View style={[styles.section, appleCardStyle(theme)]}>
          {/* ── Section Header (collapsible) ── */}
          {isOwner && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/admin/database");
              }}
              style={styles.sectionHeaderRow}
            >
              <View style={styles.adminHeaderLeft}>
                <Ionicons name="server-outline" size={13} color="#EF4444" />
                <Text style={[styles.sectionTitle, { color: "#EF4444" }]}>Datenbank</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
            </Pressable>
          )}

          {canManageRoleCatalog && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/admin/roles");
              }}
              style={styles.sectionHeaderRow}
            >
              <View style={styles.adminHeaderLeft}>
                <Ionicons name="key-outline" size={13} color={theme.textTertiary} />
                <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>Rollen</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
            </Pressable>
          )}

          {canExportData && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/admin/exports");
              }}
              style={styles.sectionHeaderRow}
            >
              <View style={styles.adminHeaderLeft}>
                <Ionicons name="archive-outline" size={13} color={theme.textTertiary} />
                <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>{t("settings.dataExport", lang)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
            </Pressable>
          )}

          <Pressable
            onPress={() => {
              setShowAdmin((v) => !v);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            style={styles.sectionHeaderRow}
          >
            <View style={styles.adminHeaderLeft}>
              <Ionicons name="shield-checkmark-outline" size={13} color={theme.textTertiary} />
              <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>{t("settings.userManagement", lang)}</Text>
            </View>
            <View style={styles.rowRight}>
              {pendingUsers.length > 0 && (
                <View style={styles.pendingCountBadge}>
                  <Text style={styles.pendingCountText}>{pendingUsers.length}</Text>
                </View>
              )}
              <Ionicons name={showAdmin ? "chevron-up" : "chevron-down"} size={16} color={theme.textTertiary} />
            </View>
          </Pressable>

          {showAdmin && (
            <>
              {/* ── Pending Approvals (admin/owner only) ── */}
              {isAdmin && (
              <><View style={[styles.adminSubHeader, { borderTopColor: theme.cardBorder }]}>
                <Text style={[styles.adminSubtitle, { color: theme.text }]}>{t("settings.pendingApprovals", lang)}</Text>
                {!loadingPending && pendingUsers.length > 0 && (
                  <View style={styles.amberCountBadge}>
                    <Text style={styles.amberCountText}>{pendingUsers.length}</Text>
                  </View>
                )}
              </View>

              {loadingPending ? (
                <View style={styles.adminLoadingRow}>
                  <ActivityIndicator color={theme.tint} size="small" />
                  <Text style={[styles.adminLoadingText, { color: theme.textTertiary }]}>{t("settings.loadingRequests", lang)}</Text>
                </View>
              ) : pendingUsers.length === 0 ? (
                <View style={styles.adminEmptyRow}>
                  <View style={styles.adminEmptyIcon}>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#16A34A" />
                  </View>
                  <Text style={[styles.emptyText, { color: theme.textTertiary }]}>{t("settings.allAccountsApproved", lang)}</Text>
                </View>
              ) : (
                pendingUsers.map((u) => {
                  const pendingRoleBtns = roles.roles;
                  const selectedRole = pendingRoles[u.id] ?? "sanitaeter";
                  const isProcessing = adminProcessing === u.id;
                  return (
                    <View key={u.id} style={[styles.pendingCard, { borderColor: "#F59E0B", backgroundColor: theme.backgroundTertiary }]}>
                      <View style={styles.adminCardHeader}>
                        <View style={[styles.userAvatar, { backgroundColor: withAlpha("#F59E0B", 0.16) }]}>
                          <Text style={[styles.userAvatarText, { color: istDunklesThema(theme.background) ? "#FBBF24" : "#B45309" }]}>
                            {formatName(u.firstName || "")[0]}{formatName(u.lastName || "")[0]}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.userName, { color: theme.text }]}>{formatFullName(u.firstName, u.lastName)}</Text>
                          <Text style={[styles.userEmail, { color: theme.textTertiary }]}>{u.iservUsername ?? u.email}</Text>
                        </View>
                        <View style={styles.pendingStatusPill}>
                          <Text style={[styles.pendingStatusText, { color: istDunklesThema(theme.background) ? "#FBBF24" : "#B45309" }]}>{t("settings.pending", lang)}</Text>
                        </View>
                      </View>
                      <View style={styles.rolePicker}>
                        {pendingRoleBtns.map((r) => {
                          const selected = selectedRole === r.key;
                          return (
                            <Pressable
                              key={r.key}
                              onPress={() => {
                                setPendingRoles((prev) => ({ ...prev, [u.id]: r.key }));
                                Haptics.selectionAsync();
                              }}
                              style={({ pressed }) => [
                                styles.roleChip,
                                {
                                  backgroundColor: selected ? theme.tint : theme.backgroundTertiary,
                                  borderColor: selected ? theme.tint : theme.cardBorder,
                                  opacity: pressed ? 0.7 : 1,
                                },
                              ]}
                            >
                              <Text style={[styles.roleChipText, { color: selected ? "#fff" : theme.textSecondary }]}>{roles.displayName(r.key, lang)}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <Pressable
                        onPress={() => handleApproveUser(u.id)}
                        disabled={isProcessing}
                        style={({ pressed }) => [
                          styles.approveBtn,
                          { backgroundColor: "#16A34A", opacity: isProcessing || pressed ? 0.7 : 1 },
                        ]}
                      >
                        {isProcessing ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <>
                            <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                            <Text style={styles.approveBtnText}>{t("settings.approve", lang)}</Text>
                          </>
                        )}
                      </Pressable>
                    </View>
                  );
                })
              )}

              </>)}
              {/* ── Role Management ── */}
              <View style={[styles.adminSubHeader, { borderTopColor: theme.cardBorder, marginTop: 4 }]}>
                <Text style={[styles.adminSubtitle, { color: theme.text }]}>{t("settings.manageRoles", lang)}</Text>
              </View>

              {loadingUsers ? (
                <View style={styles.adminLoadingRow}>
                  <ActivityIndicator color={theme.tint} size="small" />
                  <Text style={[styles.adminLoadingText, { color: theme.textTertiary }]}>{t("settings.loadingUsers", lang)}</Text>
                </View>
              ) : (
                allUsers.map((u) => {
                  const cfg = roles.colors(u.role);
                  const isCurrentUser = u.id === user?.id;
                  const roleManageBtns = roles.roles;
                  const canEditRole = !isCurrentUser && canAssignRole;
                  const canRemove = !isCurrentUser && canDeleteUsers;
                  return (
                    <View key={u.id} style={[styles.adminCard, { borderColor: theme.cardBorder }]}>
                      <View style={styles.adminCardHeader}>
                        <View style={[styles.userAvatar, { backgroundColor: cfg.bg }]}>
                          <Text style={[styles.userAvatarText, { color: cfg.text }]}>
                            {formatName(u.firstName || "")[0]}{formatName(u.lastName || "")[0]}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.userName, { color: theme.text }]}>{formatFullName(u.firstName, u.lastName)}</Text>
                          <View style={[styles.smallRoleBadge, { backgroundColor: cfg.bg, alignSelf: "flex-start", marginTop: 2 }]}>
                            <Text style={[styles.smallRoleText, { color: cfg.text }]}>{roles.displayName(u.role, lang)}</Text>
                          </View>
                        </View>
                        <View style={styles.rowRight}>
                          {canCorrectProfile && !isCurrentUser && (
                            <Pressable
                              onPress={() => startCorrect(u)}
                              style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.5 : 1 }]}
                            >
                              <Ionicons name="pencil-outline" size={16} color={theme.textSecondary} />
                            </Pressable>
                          )}
                          {canRemove ? (
                            <Pressable
                              onPress={() => handleDeleteUser(u.id, formatFullName(u.firstName, u.lastName))}
                              style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.5 : 1 }]}
                            >
                              <Ionicons name="trash-outline" size={16} color={theme.danger} />
                            </Pressable>
                          ) : (
                            <View style={[styles.selfTag, { backgroundColor: theme.backgroundTertiary }]}>
                              <Text style={[styles.selfTagText, { color: theme.textTertiary }]}>{isCurrentUser ? t("common.you", lang) : ""}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      {correctingId === u.id && (
                        <View style={[styles.correctBox, { borderTopColor: theme.cardBorder }]}>
                          <View style={styles.correctField}>
                            <Text style={[styles.correctLabel, { color: theme.textSecondary }]}>{t("common.firstName", lang)}</Text>
                            <TextInput
                              value={correctFirstName}
                              onChangeText={setCorrectFirstName}
                              placeholder={t("common.firstName", lang)}
                              placeholderTextColor={theme.textTertiary}
                              style={[styles.correctInput, { backgroundColor: theme.backgroundTertiary, color: theme.text }]}
                            />
                          </View>
                          <View style={styles.correctField}>
                            <Text style={[styles.correctLabel, { color: theme.textSecondary }]}>{t("common.lastName", lang)}</Text>
                            <TextInput
                              value={correctLastName}
                              onChangeText={setCorrectLastName}
                              placeholder={t("common.lastName", lang)}
                              placeholderTextColor={theme.textTertiary}
                              style={[styles.correctInput, { backgroundColor: theme.backgroundTertiary, color: theme.text }]}
                            />
                          </View>
                          <Text style={[styles.correctHint, { color: theme.textTertiary }]}>
                            {t("settings.correctHint", lang)}
                          </Text>
                          <View style={styles.editActions}>
                            <Pressable onPress={() => setCorrectingId(null)} style={[styles.secondaryBtn, { borderColor: theme.cardBorder }]}>
                              <Text style={[styles.secondaryBtnText, { color: theme.textSecondary }]}>{t("common.cancel", lang)}</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => handleCorrect(u)}
                              disabled={correctBusy || !correctFirstName.trim() || !correctLastName.trim()}
                              style={[styles.primaryBtn, { backgroundColor: theme.tint, opacity: correctBusy || !correctFirstName.trim() || !correctLastName.trim() ? 0.5 : 1 }]}
                            >
                              {correctBusy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryBtnText}>{t("common.save", lang)}</Text>}
                            </Pressable>
                          </View>
                        </View>
                      )}
                      {canEditRole && (
                        <View style={styles.rolePicker}>
                          {roleManageBtns.map((r) => {
                            const selected = u.role === r.key;
                            return (
                              <Pressable
                                key={r.key}
                                onPress={() => handleChangeRole(u.id, r.key)}
                                style={({ pressed }) => [
                                  styles.roleChip,
                                  {
                                    backgroundColor: selected ? theme.tint : theme.backgroundTertiary,
                                    borderColor: selected ? theme.tint : theme.cardBorder,
                                    opacity: pressed ? 0.7 : 1,
                                  },
                                ]}
                              >
                                <Text style={[styles.roleChipText, { color: selected ? "#fff" : theme.textSecondary }]}>{roles.displayName(r.key, lang)}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </>
          )}
        </View>
      )}

      <Pressable
        onPress={handleLogout}
        style={({ pressed }) => [
          styles.logoutBtn,
          { backgroundColor: withAlpha(theme.danger, 0.12), opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <Ionicons name="log-out-outline" size={20} color="#EF4444" />
        <Text style={styles.logoutText}>{t("settings.logout", lang)}</Text>
      </Pressable>

      <Text style={[styles.version, { color: theme.textTertiary }]}>
        {t("settings.version", lang)} {Constants.expoConfig?.version ?? "2.0.0"} · {SCHOOL_NAME}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heading: { fontSize: 28, fontFamily: "Inter_700Bold" },
  profileCard: { padding: 16, flexDirection: "row", alignItems: "flex-start", gap: 16 },
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
  section: { padding: 16, gap: 12 },
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
  adminHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  pendingCountBadge: { backgroundColor: "#EF4444", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  pendingCountText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },
  adminSubHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 12, borderTopWidth: 1 },
  adminSubtitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  amberCountBadge: { backgroundColor: withAlpha("#F59E0B", 0.16), paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  amberCountText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#D97706" },
  adminLoadingRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  adminLoadingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  adminEmptyRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  adminEmptyIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: withAlpha("#16A34A", 0.14), alignItems: "center", justifyContent: "center" },
  pendingCard: { borderRadius: 12, borderWidth: 1.5, padding: 12, gap: 10 },
  pendingStatusPill: { backgroundColor: withAlpha("#F59E0B", 0.16), paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: withAlpha("#F59E0B", 0.3) },
  pendingStatusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  adminCard: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 10 },
  adminCardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  correctBox: { gap: 12, marginTop: 6, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  correctField: { gap: 5 },
  correctLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  correctLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  correctInput: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular" },
  verifiedPill: { flexDirection: "row", alignItems: "center", gap: 3 },
  verifiedText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  correctHint: { fontSize: 11, fontFamily: "Inter_400Regular" },
  editActions: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
  secondaryBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  secondaryBtnText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  primaryBtn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9, minWidth: 90, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  rolePicker: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  roleChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  roleChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  approveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 10 },
  approveBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  deleteBtn: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  selfTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  selfTagText: { fontSize: 11, fontFamily: "Inter_500Medium" },
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
  identityRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  identityIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  removeIdentityBtn: { width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  identityInfo: { flex: 1, marginLeft: 10 },
  identityRetry: { alignSelf: "center", borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  identityRetryText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  linkProviderRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
  linkProviderText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
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
