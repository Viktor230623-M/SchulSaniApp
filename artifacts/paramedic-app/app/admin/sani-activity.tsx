import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
 ActivityIndicator,
 Alert,
 FlatList,
 Platform,
 Pressable,
 RefreshControl,
 StyleSheet,
 Text,
 View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { t } from "@/constants/i18n";
import { getTheme } from "@/constants/theme";
import type { ActivityLog, ActivitySummary, User } from "@/models";
import ApiService from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";

const ROLE_CONFIG: Record<User["role"], { label: string; bg: string; text: string }> = {
 cto: { label: "CTO", bg: "#CCFBF1", text: "#0F766E" },
 admin: { label: "Administrator", bg: "#FEF2F2", text: "#DC2626" },
 sanitaeter_leitung_admin: { label: "Sanitäter Leitung", bg: "#EFF6FF", text: "#2563EB" },
 sanitaeter_leitung: { label: "Sanitäter Leitung", bg: "#EFF6FF", text: "#2563EB" },
 teacher: { label: "Lehrer", bg: "#FFF7ED", text: "#EA580C" },
 student_paramedic: { label: "Sanitäter", bg: "#F0FDF4", text: "#16A34A" },
};

function formatLastActivity(timestamp: string) {
 const date = new Date(timestamp);
 const now = new Date();
 const diffMs = now.getTime() - date.getTime();
 const diffMins = Math.floor(diffMs / 60000);
 const diffHours = Math.floor(diffMs / 3600000);
 const diffDays = Math.floor(diffMs / 86400000);

 if (diffMins < 1) return "Gerade eben";
 if (diffMins < 60) return `${diffMins} min`;
 if (diffHours < 24) return `${diffHours} h`;
 if (diffDays < 7) return `${diffDays} Tag${diffDays > 1 ? "e" : ""}`;

 return date.toLocaleDateString("de-DE", { month: "short", day: "numeric" });
}

function UserActivityItem({
 summary,
 onPress,
 theme,
}: {
 summary: ActivitySummary;
 onPress: (userId: string) => void;
 theme: any;
}) {
 const cfg = ROLE_CONFIG[summary.role] || { label: summary.role, bg: "#F3F4F6", text: "#6B7280" };

 return (
 <Pressable
 onPress={() => onPress(summary.userId)}
 style={({ pressed }) => [
 styles.userItem,
 {
 backgroundColor: theme.card,
 borderColor: theme.cardBorder,
 opacity: pressed ? 0.96 : 1,
 },
 ]}
 >
 <View style={[styles.userAvatar, { backgroundColor: cfg.bg }]}>
 <Text style={[styles.userAvatarText, { color: cfg.text }]}>
 {summary.userName.split(" ").map((n) => n[0]).join("")}
 </Text>
 </View>

 <View style={styles.userInfo}>
 <Text style={[styles.userName, { color: theme.text }]}>{summary.userName}</Text>
 <View style={styles.statsContainer}>
 <View style={[styles.statItem, { backgroundColor: theme.tint + "20" }]}>
 <Ionicons name="document-text-outline" size={14} color={theme.tint} />
 <Text style={[styles.statText, { color: theme.tint }]}>
 {summary.activityCount} Einträge
 </Text>
 </View>
 <View style={styles.statSeparator} />
 <Text style={[styles.lastActivityText, { color: theme.textTertiary }]}>
 Zuletzt: {formatLastActivity(summary.lastActivity)}
 </Text>
 </View>
 </View>

 <Ionicons
 name="chevron-forward-outline"
 size={20}
 color={theme.textTertiary}
 />
 </Pressable>
 );
}

function Header({
 onBack,
 title,
 theme,
}: {
 onBack: () => void;
 title: string;
 theme: any;
}) {
 return (
 <View style={[styles.header, { backgroundColor: theme.background }]}>
 <Pressable onPress={onBack} style={styles.backButton} hitSlop={12}>
 <Ionicons name="arrow-back-outline" size={24} color={theme.text} />
 </Pressable>
 <Text style={[styles.headerTitle, { color: theme.text }]}>{title}</Text>
 </View>
 );
}

interface DetailModalProps {
 userId: string;
 userName: string;
 isVisible: boolean;
 onClose: () => void;
}

function UserActivityDetail({ userId, userName, isVisible, onClose }: DetailModalProps) {
 const lang = useAppStore((s) => s.language);
 const themeKey = useAppStore((s) => s.theme);
 const theme = getTheme(themeKey);

 const [activities, setActivities] = useState<ActivityLog[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);

 const loadUserActivity = async () => {
 setLoading(true);
 setError(null);

 try {
 const data = await ApiService.getUserActivity(userId);
 setActivities(Array.isArray(data) ? data : []);
 } catch (err) {
 setError(err instanceof Error ? err.message : "Failed to load user activity");
 } finally {
 setLoading(false);
 }
 };

 React.useEffect(() => {
 if (isVisible) {
 loadUserActivity();
 } else {
 setActivities([]);
 };
 }, [isVisible, userId]);

 if (!isVisible) return null;

 return (
 <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
 <View style={[styles.modalHeader, { borderBottomColor: theme.cardBorder }]}>
 <Pressable onPress={onClose} style={styles.modalBackButton} hitSlop={12}>
 <Ionicons name="arrow-back-outline" size={24} color={theme.text} />
 </Pressable>
 <Text style={[styles.modalTitle, { color: theme.text }]}>{userName}</Text>
 </View>

 {loading ? (
 <View style={styles.modalContent}>
 <ActivityIndicator size="large" color={theme.tint} />
 </View>
 ) : error ? (
 <View style={styles.modalContent}>
 <Text style={[styles.errorText, { color: theme.text }]}>{error}</Text>
 <Pressable
 onPress={loadUserActivity}
 style={({ pressed }) => [
 styles.retryButton,
 { backgroundColor: theme.tint, opacity: pressed ? 0.8 : 1 },
 ]}
 >
 <Text style={styles.retryButtonText}>Erneut versuchen</Text>
 </Pressable>
 </View>
 ) : (
 <FlatList
 data={activities}
 style={styles.modalContent}
 keyExtractor={(item) => item.id}
 renderItem={({ item }) => (
 <View
 style={[
 styles.activityItem,
 { backgroundColor: theme.card, borderColor: theme.cardBorder },
 ]}
 >
 <Ionicons
 name={getActivityIcon(item.activityType).name as any}
 size={20}
 color={getActivityIcon(item.activityType).color}
 />
 <View style={styles.activityContent}>
 <Text style={[styles.activityDescription, { color: theme.text }]}>
 {item.description}
 </Text>
 <Text style={[styles.activityTimestamp, { color: theme.textTertiary }]}>
 {formatLastActivity(item.timestamp)}
 </Text>
 </View>
 </View>
 )}
 ListEmptyComponent={
 <View style={styles.emptyContainer}>
 <Ionicons name="time-outline" size={48} color={theme.textTertiary} />
 <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
 Noch keine Aktivitäten
 </Text>
 </View>
 }
 />
 )}
 </View>
 );
}

export default function SaniActivityScreen() {
 const insets = useSafeAreaInsets();
 const lang = useAppStore((s) => s.language);
 const themeKey = useAppStore((s) => s.theme);
 const theme = getTheme(themeKey);
 const user = useAppStore((s) => s.user);

 const [activityUsers, setActivityUsers] = useState<ActivitySummary[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [refreshing, setRefreshing] = useState(false);
 const [selectedUser, setSelectedUser] = useState<{ id: string; name: string } | null>(null);

 const hasAccess = ["cto", "admin", "sanitaeter_leitung", "sanitaeter_leitung_admin"].includes(
 user?.role || ""
 );

 const loadActivityUsers = async (isRefresh = false) => {
 if (!isRefresh) setLoading(true);
 setError(null);

 try {
 const data = await ApiService.getActivityUsers();
 setActivityUsers(Array.isArray(data) ? data : []);
 } catch (err) {
 setError(err instanceof Error ? err.message : "Failed to load user activities");
 } finally {
 setLoading(false);
 setRefreshing(false);
 }
 };

 React.useEffect(() => {
 if (hasAccess) {
 loadActivityUsers();
 } else {
 setError("Du hast keine Berechtigung, diese Seite zu sehen");
 setLoading(false);
 }
 }, [hasAccess]);

 const handleRefresh = () => {
 setRefreshing(true);
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
 loadActivityUsers(true);
 };

 const handleBack = () => {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
 router.back();
 };

 const handleUserPress = (userId: string) => {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
 const userSummary = activityUsers.find((u) => u.userId === userId);
 if (userSummary) {
 setSelectedUser({ id: userId, name: userSummary.userName });
 }
 };

 const handleModalClose = () => {
 setSelectedUser(null);
 };

 const topPad = Platform.OS === "web" ? 67 : insets.top;

 if (!hasAccess) {
 return (
 <View style={[styles.container, { backgroundColor: theme.background, paddingTop: topPad + 20 }]}>
 <Header onBack={handleBack} title="Sani-Aktivität" theme={theme} />
 <View style={styles.errorContainer}>
 <Ionicons name="lock-closed-outline" size={48} color="#EF4444" />
 <Text style={[styles.errorText, { color: theme.text }]}>
 Zugriff verweigert
 </Text>
 <Text style={[styles.errorMessage, { color: theme.textTertiary }]}>
 Du hast keine Berechtigung, diese Seite zu sehen.
 </Text>
 </View>
 </View>
 );
 }

 if (loading && !refreshing) {
 return (
 <View style={[styles.container, { backgroundColor: theme.background, paddingTop: topPad + 20 }]}>
 <Header onBack={handleBack} title="Sani-Aktivität" theme={theme} />
 <View style={styles.loadingContainer}>
 <ActivityIndicator size="large" color={theme.tint} />
 </View>
 </View>
 );
 }

 return (
 <View style={[styles.container, { backgroundColor: theme.background, paddingTop: topPad + 10 }]}>
 <Header onBack={handleBack} title="Sani-Aktivität" theme={theme} />

 {error ? (
 <View style={styles.errorContainer}>
 <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
 <Text style={[styles.errorText, { color: theme.text }]}>{error}</Text>
 <Pressable
 onPress={() => loadActivityUsers()}
 style={({ pressed }) => [
 styles.retryButton,
 { backgroundColor: theme.tint, opacity: pressed ? 0.8 : 1 },
 ]}
 >
 <Text style={styles.retryButtonText}>Erneut versuchen</Text>
 </Pressable>
 </View>
 ) : (
 <FlatList
 data={activityUsers}
 keyExtractor={(item) => item.userId}
 renderItem={({ item }) => (
 <UserActivityItem
 summary={item}
 onPress={handleUserPress}
 theme={theme}
 />
 )}
 contentContainerStyle={{
 paddingBottom: insets.bottom + 100,
 paddingHorizontal: 16,
 }}
 ListEmptyComponent={
 <View style={styles.emptyContainer}>
 <Ionicons name="people-outline" size={48} color={theme.textTertiary} />
 <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
 Noch keine Aktivitäten verfügbar
 </Text>
 </View>
 }
 refreshControl={
 <RefreshControl
 refreshing={refreshing}
 onRefresh={handleRefresh}
 tintColor={theme.tint}
 colors={[theme.tint]}
 />
 }
 />
 )}

 <UserActivityDetail
 userId={selectedUser?.id || ""}
 userName={selectedUser?.name || ""}
 isVisible={!!selectedUser}
 onClose={handleModalClose}
 />
 </View>
 );
}

const styles = StyleSheet.create({
 container: {
 flex: 1,
 },
 header: {
 flexDirection: "row",
 alignItems: "center",
 paddingVertical: 12,
 paddingHorizontal: 4,
 borderBottomWidth: 1,
 },
 backButton: {
 padding: 4,
 },
 headerTitle: {
 fontSize: 20,
 fontFamily: "Inter_600SemiBold",
 marginLeft: 8,
 },
 loadingContainer: {
 flex: 1,
 alignItems: "center",
 justifyContent: "center",
 marginTop: 40,
 },
 errorContainer: {
 flex: 1,
 alignItems: "center",
 justifyContent: "center",
 paddingHorizontal: 32,
 gap: 8,
 },
 errorText: {
 fontSize: 18,
 fontFamily: "Inter_600SemiBold",
 textAlign: "center",
 marginBottom: 8,
 },
 errorMessage: {
 fontSize: 14,
 fontFamily: "Inter_400Regular",
 textAlign: "center",
 },
 retryButton: {
 paddingHorizontal: 16,
 paddingVertical: 10,
 borderRadius: 8,
 marginTop: 8,
 },
 retryButtonText: {
 color: "#fff",
 fontSize: 14,
 fontFamily: "Inter_600SemiBold",
 },
 emptyContainer: {
 alignItems: "center",
 justifyContent: "center",
 paddingTop: 60,
 gap: 8,
 },
 emptyText: {
 fontSize: 16,
 fontFamily: "Inter_500Medium",
 },
 userItem: {
 flexDirection: "row",
 alignItems: "center",
 padding: 16,
 borderRadius: 12,
 borderWidth: 1,
 marginBottom: 12,
 gap: 12,
 },
 userAvatar: {
 width: 44,
 height: 44,
 borderRadius: 12,
 alignItems: "center",
 justifyContent: "center",
 },
 userAvatarText: {
 fontSize: 15,
 fontFamily: "Inter_700Bold",
 },
 userInfo: {
 flex: 1,
 gap: 6,
 },
 userName: {
 fontSize: 16,
 fontFamily: "Inter_600SemiBold",
 },
 statsContainer: {
 flexDirection: "row",
 alignItems: "center",
 gap: 8,
 },
 statItem: {
 flexDirection: "row",
 alignItems: "center",
 paddingHorizontal: 8,
 paddingVertical: 4,
 borderRadius: 6,
 gap: 4,
 },
 statText: {
 fontSize: 12,
 fontFamily: "Inter_500Medium",
 },
 statSeparator: {
 width: 1,
 height: 12,
 backgroundColor: "#D1D5DB",
 marginHorizontal: 4,
 },
 lastActivityText: {
 fontSize: 13,
 fontFamily: "Inter_400Regular",
 },
 modalContainer: {
 position: "absolute",
 top: 0,
 left: 0,
 right: 0,
 bottom: 0,
 zIndex: 1000,
 },
 modalHeader: {
 flexDirection: "row",
 alignItems: "center",
 paddingVertical: 12,
 paddingHorizontal: 16,
 borderBottomWidth: 1,
 },
 modalBackButton: {
 padding: 4,
 },
 modalTitle: {
 fontSize: 20,
 fontFamily: "Inter_600SemiBold",
 marginLeft: 8,
 },
 modalContent: {
 flex: 1,
 padding: 16,
 },
 activityItem: {
 flexDirection: "row",
 alignItems: "flex-start",
 padding: 12,
 borderRadius: 8,
 borderWidth: 1,
 marginBottom: 8,
 gap: 12,
 },
 activityContent: {
 flex: 1,
 gap: 4,
 },
 activityDescription: {
 fontSize: 14,
 fontFamily: "Inter_400Regular",
 lineHeight: 18,
 },
 activityTimestamp: {
 fontSize: 12,
 fontFamily: "Inter_500Medium",
 },
});
