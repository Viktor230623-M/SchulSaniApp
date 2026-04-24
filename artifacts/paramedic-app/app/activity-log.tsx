import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
 ActivityIndicator,
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
import type { ActivityLog } from "@/models";
import ApiService from "@/services/ApiService";
import { useAppStore } from "@/store/useAppStore";

function getActivityIcon(type: ActivityLog["activityType"]) {
 const icons = {
 login: { name: "log-in-outline", color: "#22C55E" },
 logout: { name: "log-out-outline", color: "#EF4444" },
 mission_accepted: { name: "checkmark-circle-outline", color: "#22C55E" },
 mission_rejected: { name: "close-circle-outline", color: "#EF4444" },
 mission_completed: { name: "checkmark-done-outline", color: "#3B82F6" },
 duty_status_changed: { name: "refresh-outline", color: "#8B5CF6" },
 loa_requested: { name: "document-outline", color: "#F97316" },
 loa_approved: { name: "checkmark-circle-outline", color: "#22C55E" },
 loa_rejected: { name: "close-circle-outline", color: "#EF4444" },
 news_created: { name: "create-outline", color: "#3B82F6" },
 news_approved: { name: "checkmark-circle-outline", color: "#22C55E" },
 news_rejected: { name: "close-circle-outline", color: "#EF4444" },
 }[type];

 return icons || { name: "information-circle-outline", color: "#6B7280" };
}

function formatTimestamp(timestamp: string) {
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

function ActivityItem({ activity, theme }: { activity: ActivityLog; theme: any }) {
 const icon = getActivityIcon(activity.activityType);

 return (
 <Pressable
 onPress={() => {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
 }}
 style={({ pressed }) => [
 styles.activityItem,
 {
 backgroundColor: theme.card,
 borderColor: theme.cardBorder,
 opacity: pressed ? 0.96 : 1,
 },
 ]}
 >
 <View style={styles.iconContainer}>
 <Ionicons name={icon.name as any} size={20} color={icon.color} />
 </View>
 <View style={styles.activityContent}>
 <Text style={[styles.activityDescription, { color: theme.text }]}>
 {activity.description}
 </Text>
 <Text style={[styles.activityTimestamp, { color: theme.textTertiary }]}>
 {formatTimestamp(activity.timestamp)}
 </Text>
 </View>
 </Pressable>
 );
}

function Header({ onBack, theme }: { onBack: () => void; theme: any }) {
 return (
 <View style={[styles.header, { backgroundColor: theme.background }]}>
 <Pressable
 onPress={onBack}
 style={styles.backButton}
 hitSlop={12}
 >
 <Ionicons name="arrow-back-outline" size={24} color={theme.text} />
 </Pressable>
 <Text style={[styles.headerTitle, { color: theme.text }]}>
 Mein Aktivitätslog
 </Text>
 </View>
 );
}

export default function ActivityLogScreen() {
 const insets = useSafeAreaInsets();
 const lang = useAppStore((s) => s.language);
 const themeKey = useAppStore((s) => s.theme);
 const theme = getTheme(themeKey);

 const user = useAppStore((s) => s.user);
 const [activities, setActivities] = useState<ActivityLog[]>([]);
 const [loading, setLoading] = useState(true);
 const [refreshing, setRefreshing] = useState(false);
 const [error, setError] = useState<string | null>(null);

 const loadActivities = async (isRefresh = false) => {
 if (!isRefresh) setLoading(true);
 setError(null);

 try {
 const data = await ApiService.getMyActivity();
 setActivities(Array.isArray(data) ? data : []);
 } catch (err) {
 setError(err instanceof Error ? err.message : "Failed to load activities");
 } finally {
 setLoading(false);
 setRefreshing(false);
 }
 };

 React.useEffect(() => {
 loadActivities();
 }, []);

 const onRefresh = () => {
 setRefreshing(true);
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
 loadActivities(true);
 };

 const handleBack = () => {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
 router.back();
 };

 const topPad = Platform.OS === "web" ? 67 : insets.top;

 if (loading && !refreshing) {
 return (
 <View style={[styles.container, { backgroundColor: theme.background, paddingTop: topPad + 20 }]}>
 <Header onBack={handleBack} theme={theme} />
 <View style={styles.loadingContainer}>
 <ActivityIndicator size="large" color={theme.tint} />
 </View>
 </View>
 );
 }

 return (
 <View style={[styles.container, { backgroundColor: theme.background, paddingTop: topPad + 10 }]}>
 <Header onBack={handleBack} theme={theme} />

 {error ? (
 <View style={styles.errorContainer}>
 <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
 <Text style={[styles.errorText, { color: theme.text }]}>{error}</Text>
 <Pressable
 onPress={() => loadActivities()}
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
 keyExtractor={(item) => item.id}
 renderItem={({ item }) => <ActivityItem activity={item} theme={theme} />}
 contentContainerStyle={{
 paddingBottom: insets.bottom + 100,
 paddingHorizontal: 16,
 }}
 ListEmptyComponent={
 <View style={styles.emptyContainer}>
 <Ionicons name="time-outline" size={48} color={theme.textTertiary} />
 <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
 Noch keine Aktivitäten
 </Text>
 </View>
 }
 refreshControl={
 <RefreshControl
 refreshing={refreshing}
 onRefresh={onRefresh}
 tintColor={theme.tint}
 colors={[theme.tint]}
 />
 }
 />
 )}
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
 gap: 12,
 },
 errorText: {
 fontSize: 16,
 fontFamily: "Inter_500Medium",
 textAlign: "center",
 marginBottom: 8,
 },
 retryButton: {
 paddingHorizontal: 16,
 paddingVertical: 10,
 borderRadius: 8,
 },
 retryButtonText: {
 color: "#fff",
 fontSize: 14,
 fontFamily: "Inter_600SemiBold",
 },
 emptyContainer: {
 alignItems: "center",
 justifyContent: "center",
 paddingTop: 80,
 gap: 8,
 },
 emptyText: {
 fontSize: 16,
 fontFamily: "Inter_500Medium",
 },
 activityItem: {
 flexDirection: "row",
 alignItems: "flex-start",
 padding: 16,
 borderRadius: 12,
 borderWidth: 1,
 marginBottom: 12,
 gap: 12,
 },
 iconContainer: {
 padding: 8,
 backgroundColor: "transparent",
 },
 activityContent: {
 flex: 1,
 gap: 4,
 },
 activityDescription: {
 fontSize: 15,
 fontFamily: "Inter_400Regular",
 lineHeight: 20,
 },
 activityTimestamp: {
 fontSize: 12,
 fontFamily: "Inter_500Medium",
 },
});
