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
      // Die Leiste schwebt jetzt ueber dem Inhalt statt ihn abzuschneiden.
      // Beschriftungen entfallen: in einer Pille mit sechs Eintraegen bliebe je
      // Feld weniger als eine Zeile Platz, und die Symbole tragen allein.
      tabBar={(props) => (
        <GlasTabLeiste
          state={props.state}
          descriptors={props.descriptors}
          navigation={props.navigation}
          theme={theme}
        />
      )}
      screenOptions={{
        tabBarActiveTintColor: theme.tabBarActive,
        tabBarInactiveTintColor: theme.tabBarInactive,
        headerShown: false,
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
