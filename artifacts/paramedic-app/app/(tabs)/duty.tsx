import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  ActivityIndicator,
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
import { WaveBackground } from "@/components/WaveBackground";
import { useApp } from "@/context/AppContext";

export default function DutyScreen() {
  const insets = useSafeAreaInsets();
  const { dutyStatus, setDutyStatus, dutyLoading } = useApp();
  const isOnDuty = dutyStatus === "on_duty";

  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  async function handleToggle() {
    if (dutyLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    scale.value = withSpring(0.95, {}, () => {
      scale.value = withSpring(1);
    });
    await setDutyStatus(isOnDuty ? "off_duty" : "on_duty");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.container}>
      <WaveBackground color={isOnDuty ? "#DCFCE7" : "#F3F4F6"} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: topPad + 20,
            paddingBottom: insets.bottom + 120,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Dienststatus</Text>

        <View style={styles.crossContainer}>
          <MedicalCross size={80} color={isOnDuty ? "#22C55E" : "#D1D5DB"} animate={isOnDuty} />
        </View>

        <Animated.View style={animatedStyle}>
          <Pressable
            onPress={handleToggle}
            disabled={dutyLoading}
            style={[
              styles.toggleButton,
              isOnDuty ? styles.onDutyButton : styles.offDutyButton,
            ]}
          >
            {dutyLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <MaterialCommunityIcons
                  name={isOnDuty ? "shield-check" : "shield-off"}
                  size={28}
                  color="#fff"
                />
                <Text style={styles.toggleButtonText}>
                  {isOnDuty ? "Im Dienst" : "Außer Dienst"}
                </Text>
                <Text style={styles.toggleHint}>Tippen zum Wechseln</Text>
              </>
            )}
          </Pressable>
        </Animated.View>

        <View
          style={[
            styles.statusCard,
            isOnDuty ? styles.statusCardOn : styles.statusCardOff,
          ]}
        >
          <Ionicons
            name={isOnDuty ? "checkmark-circle" : "close-circle"}
            size={20}
            color={isOnDuty ? "#22C55E" : "#9CA3AF"}
          />
          <Text
            style={[
              styles.statusText,
              { color: isOnDuty ? "#16A34A" : "#6B7280" },
            ]}
          >
            {isOnDuty
              ? "Du bist verfügbar für Einsätze"
              : "Du bist nicht für Einsätze verfügbar"}
          </Text>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>Hinweise</Text>
          <InfoRow
            icon="time-outline"
            text="Dein Status wird für alle Koordinatoren sichtbar sein."
          />
          <InfoRow
            icon="notifications-outline"
            text="Du erhältst Benachrichtigungen für neue Einsätze, wenn du im Dienst bist."
          />
          <InfoRow
            icon="shield-outline"
            text="Bitte denke daran, deinen Status rechtzeitig zu aktualisieren."
          />
        </View>
      </ScrollView>
    </View>
  );
}

function InfoRow({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color="#6B7280" />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  content: {
    paddingHorizontal: 24,
    alignItems: "center",
  },
  heading: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: "#111827",
    marginBottom: 32,
    alignSelf: "flex-start",
  },
  crossContainer: {
    marginBottom: 32,
  },
  toggleButton: {
    width: 220,
    paddingVertical: 28,
    borderRadius: 24,
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
    marginBottom: 24,
  },
  onDutyButton: {
    backgroundColor: "#22C55E",
  },
  offDutyButton: {
    backgroundColor: "#9CA3AF",
  },
  toggleButtonText: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  toggleHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.75)",
  },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 32,
    width: "100%",
  },
  statusCardOn: {
    backgroundColor: "#DCFCE7",
  },
  statusCardOff: {
    backgroundColor: "#F3F4F6",
  },
  statusText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  infoSection: {
    width: "100%",
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  infoTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  infoText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    flex: 1,
    lineHeight: 20,
  },
});
