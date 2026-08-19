import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GlassLoader } from "@/components/GlassLoader";
import { recordCrash } from "@/services/crashReporter";
import { getTheme, istDunklesThema } from "@/constants/theme";
import ApiService, { setAuthToken } from "@/services/ApiService";
import {
  addNotificationResponseListener,
  listenForTokenRefresh,
  registerForPushNotificationsAsync,
} from "@/services/PushNotificationService";
import { useAppStore } from "@/store/useAppStore";

SplashScreen.preventAutoHideAsync();

// Oeffentliche Vorschau: faengt die API-Aufrufe ab, bevor die erste Anfrage
// laeuft. Metro setzt die Variable als Text ein, im normalen Build faellt der
// Block samt Daten aus dem Bundle.
if (process.env["EXPO_PUBLIC_DEMO"] === "1") {
  require("@/services/demo/mockFetch").installiereVorschau();
}

const queryClient = new QueryClient();

function notificationTarget(type: string): 
  | "/(tabs)/missions"
  | "/(tabs)/news"
  | "/(tabs)/loa"
  | "/(tabs)/notifications"
  | null {
  if (type.startsWith("mission_") || type === "high_priority_alert") return "/(tabs)/missions";
  if (type === "news") return "/(tabs)/news";
  if (type === "loa_update") return "/(tabs)/loa";
  return "/(tabs)/notifications";
}

function RootLayoutNav() {
  const authStatus = useAppStore((s) => s.authStatus);
  const token = useAppStore((s) => s.token);
  const setAuthStatus = useAppStore((s) => s.setAuthStatus);
  const login = useAppStore((s) => s.login);
  const setToken = useAppStore((s) => s.setToken);
  const theme = getTheme(useAppStore((s) => s.theme));
  const user = useAppStore((s) => s.user);
  const cryptoLocked = useAppStore((s) => s.cryptoLocked);
  const profileConfirmedAt = user?.profileConfirmedAt;
  const needsProfileConfirmation = authStatus === "authed" && profileConfirmedAt === null;
  const needsPasswordChange = authStatus === "authed" && user?.mustChangePassword === true;

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

  // Tokens werden von APNs/FCM unabhaengig vom App-Start rotiert. Der Listener
  // meldet ein neues Token an den Server, solange eine Sitzung besteht.
  useEffect(() => {
    const subscription = listenForTokenRefresh();
    return () => subscription.remove();
  }, []);

  // Tap auf eine Benachrichtigung fuehrt zum passenden Tab. Ist die App noch
  // gesperrt oder niemand angemeldet, wird das Ziel vorgemerkt und nach der
  // Entsperrung abgerufen.
  useEffect(() => {
    const subscription = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data ?? {};
      const type = typeof data.type === "string" ? data.type : "";
      const target = notificationTarget(type);
      if (!target) return;
      const state = useAppStore.getState();
      if (state.authStatus === "authed" && !state.cryptoLocked) {
        router.navigate(target);
      } else {
        state.setPendingNotificationRoute(target);
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const pending = useAppStore.getState().pendingNotificationRoute;
    if (authStatus === "authed" && !cryptoLocked && pending) {
      useAppStore.getState().setPendingNotificationRoute(null);
      router.navigate(pending as Parameters<typeof router.navigate>[0]);
    }
  }, [authStatus, cryptoLocked]);

  // Solange die Sitzung geprueft wird, weder Anwendung noch Anmeldung zeigen —
  // ein angemeldeter Nutzer soll dabei nicht kurz den Login-Bildschirm sehen.
  // Der Splash-Screen ist zu diesem Zeitpunkt in aller Regel schon ausgeblendet
  // (das haengt in RootLayout allein an fontsLoaded/fontError), hier lag deshalb
  // bisher eine leere Flaeche.
  if (authStatus === "loading") {
    return (
      <View style={[styles.laden, { backgroundColor: theme.background }]}>
        <GlassLoader size={200} color={theme.tint} dark={istDunklesThema(theme.background)} />
      </View>
    );
  }

  // Stack.Protected statt eines Redirect: Routen ausserhalb des aktiven Guards
  // werden gar nicht erst gematcht. Ein <Redirect> als Kind eines <Stack> wird
  // dagegen nie gemountet — genau daran scheiterte der Guard bisher.
  return (
    <Stack
      screenOptions={{
        headerBackTitle: "Zurück",
        // Ohne diese Angabe malt die Navigation ihre eigene Standardfarbe --
        // Weiss, in jedem Thema. Sichtbar wird sie ueberall dort, wo ein
        // Bildschirm nicht selbst deckt, etwa im Sicherheitsabstand unten.
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Protected guard={authStatus === "authed" && !needsPasswordChange && !cryptoLocked && !needsProfileConfirmation}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="report/index" options={{ headerShown: false }} />
        <Stack.Screen name="report/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="admin/sani-activity" options={{ headerShown: false }} />
        <Stack.Screen name="admin/roles" options={{ headerShown: false }} />
        <Stack.Screen name="admin/exports" options={{ headerShown: false }} />
        <Stack.Screen name="admin/crypto" options={{ headerShown: false }} />
        <Stack.Screen name="activity-log" />
      </Stack.Protected>
      <Stack.Protected guard={needsPasswordChange}>
        <Stack.Screen name="passwort-wechseln" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={cryptoLocked && !needsPasswordChange}>
        <Stack.Screen name="entsperren" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={needsProfileConfirmation && !needsPasswordChange && !cryptoLocked}>
        <Stack.Screen name="name-bestaetigen" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={authStatus === "anon"}>
        <Stack.Screen name="start" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="registrieren" options={{ headerShown: false }} />
        <Stack.Screen name="email-bestaetigen" options={{ headerShown: false }} />
        <Stack.Screen name="freischaltung-warten" options={{ headerShown: false }} />
        <Stack.Screen name="schul-code" options={{ headerShown: false }} />
        <Stack.Screen name="schul-id" options={{ headerShown: false }} />
        <Stack.Screen name="lizenz" options={{ headerShown: false }} />
        <Stack.Screen name="passwort-vergessen" options={{ headerShown: false }} />
        <Stack.Screen name="passwort-zuruecksetzen" options={{ headerShown: false }} />
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
      <ErrorBoundary onError={(error, stack) => recordCrash(error, stack)}>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <RootLayoutNav />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  laden: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
