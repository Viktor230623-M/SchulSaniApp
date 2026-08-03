import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import ApiService, { setAuthToken } from "@/services/ApiService";
import { registerForPushNotificationsAsync } from "@/services/PushNotificationService";
import { useAppStore } from "@/store/useAppStore";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const authStatus = useAppStore((s) => s.authStatus);
  const token = useAppStore((s) => s.token);
  const setAuthStatus = useAppStore((s) => s.setAuthStatus);
  const login = useAppStore((s) => s.login);
  const setToken = useAppStore((s) => s.setToken);

  useEffect(() => {
    if (token) setAuthToken(token);
  }, [token]);

  // Einmalig beim Start: Sitzung aus dem httpOnly-Cookie wiederherstellen.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const restored = await ApiService.restoreSession();
      if (cancelled) return;
      if (restored) {
        setToken(restored.token);
        login(restored.user);
      } else {
        setAuthStatus("anon");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [login, setAuthStatus, setToken]);

  useEffect(() => {
    if (authStatus === "authed") {
      registerForPushNotificationsAsync();
    }
  }, [authStatus]);

  // Solange geprueft wird, nichts rendern. Der Splash-Screen ist zu diesem
  // Zeitpunkt in aller Regel schon ausgeblendet (das haengt in RootLayout allein
  // an fontsLoaded/fontError, nicht an authStatus) — es erscheint also kurz eine
  // leere Flaeche. Bewusst so: ein angemeldeter Nutzer soll dabei nicht kurz den
  // Login-Screen sehen.
  if (authStatus === "loading") return null;

  // Stack.Protected statt eines Redirect: Routen ausserhalb des aktiven Guards
  // werden gar nicht erst gematcht. Ein <Redirect> als Kind eines <Stack> wird
  // dagegen nie gemountet — genau daran scheiterte der Guard bisher.
  return (
    <Stack screenOptions={{ headerBackTitle: "Zurück" }}>
      <Stack.Protected guard={authStatus === "authed"}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="report/index" options={{ headerShown: false }} />
        <Stack.Screen name="report/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="admin/database" options={{ headerShown: false }} />
        <Stack.Screen name="admin/sani-activity" options={{ headerShown: false }} />
        <Stack.Screen name="admin/roles" options={{ headerShown: false }} />
        <Stack.Screen name="activity-log" />
      </Stack.Protected>
      <Stack.Protected guard={authStatus === "anon"}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider style={{ flex: 1 }}>
              <RootLayoutNav />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
