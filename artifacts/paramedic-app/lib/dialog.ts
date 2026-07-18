import { Alert, Platform } from "react-native";

/**
 * Cross-platform dialogs.
 *
 * react-native-web does not implement Alert's button list — on web the callbacks
 * simply never fire, so any action behind a confirmation silently does nothing.
 * These helpers use the browser's own dialogs there and Alert on native.
 */

/** Shows a message. Resolves once the user has acknowledged it. */
export function notify(title: string, message?: string): Promise<void> {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    window.alert(message ? `${title}\n\n${message}` : title);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [{ text: "OK", onPress: () => resolve() }]);
  });
}

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/** Asks for confirmation. Resolves true only if the user agreed. */
export function confirmAction({
  title,
  message,
  confirmLabel = "OK",
  cancelLabel = "Abbrechen",
  destructive = false,
}: ConfirmOptions): Promise<boolean> {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    return Promise.resolve(window.confirm(message ? `${title}\n\n${message}` : title));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: "cancel", onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? "destructive" : "default",
        onPress: () => resolve(true),
      },
    ]);
  });
}
