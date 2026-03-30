import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { t } from "@/constants/i18n";
import { getTheme } from "@/constants/theme";
import { useAppStore } from "@/store/useAppStore";

function NativeTabLayout() {
  const lang = useAppStore((s) => s.language);
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="news">
        <Icon sf={{ default: "newspaper", selected: "newspaper.fill" }} />
        <Label>{t("tabs.news", lang)}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="loa">
        <Icon sf={{ default: "calendar.badge.clock", selected: "calendar.badge.clock" }} />
        <Label>{t("tabs.loa", lang)}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="duty">
        <Icon sf={{ default: "cross.circle", selected: "cross.circle.fill" }} />
        <Label>{t("tabs.duty", lang)}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="missions">
        <Icon sf={{ default: "bolt", selected: "bolt.fill" }} />
        <Label>{t("tabs.missions", lang)}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="notifications">
        <Icon sf={{ default: "bell", selected: "bell.fill" }} />
        <Label>{t("tabs.notifications", lang)}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} />
        <Label>{t("tabs.settings", lang)}</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.language);
  const themeKey = useAppStore((s) => s.theme);
  const theme = getTheme(themeKey);
  const isDark = themeKey === "dark";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.tabBarActive,
        tabBarInactiveTintColor: theme.tabBarInactive,
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : theme.tabBar,
          borderTopWidth: 1,
          borderTopColor: theme.tabBarBorder,
          elevation: 0,
          paddingBottom: insets.bottom,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: "Inter_500Medium",
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: theme.tabBar }]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="news"
        options={{
          title: t("tabs.news", lang),
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="newspaper" tintColor={color} size={22} />
            ) : (
              <Ionicons name="newspaper-outline" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="loa"
        options={{
          title: t("tabs.loa", lang),
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="calendar.badge.clock" tintColor={color} size={22} />
            ) : (
              <Ionicons name="calendar-outline" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="duty"
        options={{
          title: t("tabs.duty", lang),
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="cross.circle" tintColor={color} size={22} />
            ) : (
              <MaterialCommunityIcons name="medical-bag" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="missions"
        options={{
          title: t("tabs.missions", lang),
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="bolt" tintColor={color} size={22} />
            ) : (
              <Ionicons name="flash-outline" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: t("tabs.notifications", lang),
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="bell" tintColor={color} size={22} />
            ) : (
              <Ionicons name="notifications-outline" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("tabs.settings", lang),
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="gearshape" tintColor={color} size={22} />
            ) : (
              <Ionicons name="settings-outline" size={22} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
