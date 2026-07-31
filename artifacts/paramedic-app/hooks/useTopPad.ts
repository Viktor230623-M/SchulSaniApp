import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Abstand zum oberen Bildschirmrand.
 *
 * Im Browser mit Adressleiste meldet react-native-safe-area-context 0, weil der
 * sichtbare Bereich schon unterhalb der Systemleisten beginnt; dort trug bisher
 * ein fester Wert von 67 den Abstand. Auf dem Startbildschirm laeuft die App
 * dagegen ohne Browserleiste, und der Bereich unter der Statusleiste gehoert zur
 * Seite — dann liefert der Inset einen echten Wert, der zu verwenden ist.
 *
 * Die Zahl steht bewusst nur hier. Vorher lag sie zwoelfmal im Code, was jede
 * Korrektur zu einer Suchaktion machte.
 */
const WEB_BROWSER_FALLBACK = 67;

export function useTopPad(): number {
  const insets = useSafeAreaInsets();
  if (Platform.OS !== "web") return insets.top;
  return insets.top > 0 ? insets.top : WEB_BROWSER_FALLBACK;
}
