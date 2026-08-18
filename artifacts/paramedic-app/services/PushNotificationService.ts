import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import ApiService from "./ApiService";

// Native Benachrichtigungen laufen ueber die zentralen Konten des Anbieters:
// APNs (iOS) bzw. FCM (Android). Der Client registriert nur noch das native
// Device-Token -- es gibt keinen Expo-Push-Token und keine Abhaengigkeit vom
// Expo-Push-Dienst mehr. Die Payloads sind inhaltsleer; den Inhalt laedt und
// entschluesselt die App selbst nach.

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let deviceToken: string | null = null;

// Das Token uebersteht App-Neustarts: Bei einer Abmeldung nach einem Kaltstart
// ist es nicht mehr im Speicher, aber der Server kennt es noch.
const TOKEN_STORAGE_KEY = "push-device-token";

async function rememberToken(token: string | null): Promise<void> {
  if (token) await AsyncStorage.setItem(TOKEN_STORAGE_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!Device.isDevice) {
    console.log("Push notifications require a physical device");
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("Notification permission not granted");
    return false;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });

    await Notifications.setNotificationChannelAsync("high-priority", {
      name: "High Priority",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
      sound: "alarm.wav",
    });
  }

  return true;
}

/**
 * Native Device-Token holen. Auf iOS ist es das APNs-Token, auf Android das
 * FCM-Token aus der Firebase-Konfiguration des Anbieters (google-services.json
 * im nativen Build). `data` kann je nach Plattform/Version ein String oder ein
 * Objekt `{ type, data }` sein -- beide Formen werden normalisiert.
 */
function normalizeToken(data: unknown): string | null {
  if (typeof data === "string" && data.length > 0) return data;
  if (data && typeof data === "object") {
    const inner = (data as { data?: unknown }).data;
    if (typeof inner === "string" && inner.length > 0) return inner;
  }
  return null;
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      return null;
    }

    const { data } = await Notifications.getDevicePushTokenAsync();
    const token = normalizeToken(data);
    if (!token) {
      console.log("Push notifications: no device token available");
      return null;
    }

    deviceToken = token;
    await rememberToken(token);
    const platform: "ios" | "android" | "web" = Platform.OS === "ios" ? "ios" : "android";

    try {
      await ApiService.registerDeviceToken(token, platform);
    } catch (err) {
      console.error("Failed to register token with backend:", err);
    }

    return token;
  } catch (err) {
    console.error("Failed to register for push notifications:", err);
    return null;
  }
}

export async function unregisterPushNotifications(): Promise<void> {
  // Nach einem Kaltstart steht das Token nur noch im Speicher des Geraets.
  const token = deviceToken ?? (await AsyncStorage.getItem(TOKEN_STORAGE_KEY));
  if (token) {
    try {
      await ApiService.unregisterDeviceToken(token);
    } catch (err) {
      console.error("Failed to unregister token:", err);
    }
    deviceToken = null;
    await rememberToken(null);
  }
}

/**
 * Registriert das Fortfuehren eines neuen Geraete-Tokens beim Backend. APNs
 * und FCM rotieren Tokens unabhaengig vom App-Start; ohne diese Meldung
 * wuerde Push nach einer Rotation stumm bleiben, bis der Nutzer sich neu
 * anmeldet.
 */
export function listenForTokenRefresh(): Notifications.EventSubscription {
  return Notifications.addPushTokenListener(async ({ data }) => {
    if (Platform.OS !== "ios" && Platform.OS !== "android") return;
    const token = normalizeToken(data);
    if (!token) return;
    const { useAppStore } = await import("@/store/useAppStore");
    if (useAppStore.getState().authStatus !== "authed") return;
    deviceToken = token;
    await rememberToken(token);
    try {
      await ApiService.registerDeviceToken(token, Platform.OS === "ios" ? "ios" : "android");
    } catch (err) {
      console.error("Failed to register refreshed token:", err);
    }
  });
}

export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationReceivedListener(callback);
}

export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

export async function getBadgeCount(): Promise<number> {
  return await Notifications.getBadgeCountAsync();
}

export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}

export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<string> {
  return await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
    },
    trigger: null,
  });
}

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export { Notifications };
