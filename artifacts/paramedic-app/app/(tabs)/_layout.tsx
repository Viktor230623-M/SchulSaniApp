import { Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Platform } from "react-native";

import { GlasTabLeiste } from "@/components/GlasTabLeiste";
import { t } from "@/constants/i18n";
import { getTheme } from "@/constants/theme";
import { useAppStore } from "@/store/useAppStore";

export default function TabLayout() {
  const isIOS = Platform.OS === "ios";
  const lang = useAppStore((s) => s.language);
  const themeKey = useAppStore((s) => s.theme);
  const theme = getTheme(themeKey);

  return (
    <Tabs
      // Die Leiste schwebt ueber dem Inhalt; die Hauptziele tragen kurze Labels.
      // Einstellungen bleibt als sekundaerer Zugang ausserhalb der Tab-Pille.
      tabBar={(props) => (
        <GlasTabLeiste
          state={props.state}
          descriptors={props.descriptors}
          navigation={props.navigation}
          theme={theme}
          settingsLabel={t("tabs.settings", lang)}
          moreLabel={t("tabs.more", lang)}
        />
      )}
      screenOptions={{
        tabBarActiveTintColor: theme.tabBarActive,
        tabBarInactiveTintColor: theme.tabBarInactive,
        headerShown: false,
        // Kein zusaetzlicher Abstand nach unten: jeder Bildschirm haelt in
        // seinem contentContainerStyle bereits `insets.bottom + 120` frei, und
        // das reicht fuer die schwebende Leiste (LEISTE_PLATZ). Beides zusammen
        // ergaebe eine leere Flaeche von ueber 200 Punkten.
        sceneStyle: { backgroundColor: theme.background },
      }}
    >
      <Tabs.Screen
        name="news"
        options={{
          title: t("tabs.news", lang),
          tabBarLabel: t("tabs.newsShort", lang),
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
          tabBarLabel: t("tabs.loaShort", lang),
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
          tabBarLabel: t("tabs.dutyShort", lang),
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
          tabBarLabel: t("tabs.missionsShort", lang),
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
          tabBarLabel: t("tabs.notificationsShort", lang),
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
          href: null,
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
