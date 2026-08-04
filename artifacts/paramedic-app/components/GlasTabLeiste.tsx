import { BlurView } from "expo-blur";
import React from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ThemeColors } from "@/constants/theme";

// `@react-navigation/bottom-tabs` haengt nur mittelbar ueber expo-router im
// Baum und laesst sich aus diesem Paket nicht aufloesen. Die Form, die
// expo-router an `tabBar` uebergibt, steht deshalb hier -- absichtlich locker
// gehalten, damit sie nicht bricht, wenn die Navigation weitere Felder
// mitschickt.
interface TabRoute {
  key: string;
  name: string;
  params?: object | undefined;
}

interface TabLeisteProps {
  state: { index: number; routes: TabRoute[] };
  descriptors: Record<string, { options: TabOptionen }>;
  navigation: {
    emit: (ereignis: any) => any;
    navigate: (...args: any[]) => void;
  };
}

interface TabOptionen {
  title?: string | undefined;
  tabBarAccessibilityLabel?: string | undefined;
  tabBarIcon?: ((props: { color: string; focused: boolean; size: number }) => React.ReactNode) | undefined;
}

const SEITENRAND = 16;
const HOEHE = 62;
const ABSTAND_ZUM_KNOPF = 10;

/**
 * Schwebende Leiste aus Glas statt der durchgehenden Leiste am unteren Rand.
 *
 * Aufteilung wie in der Vorlage: die ersten Eintraege liegen in einer Pille,
 * der letzte sitzt als eigener runder Knopf daneben. Sechs Symbole in einer
 * Pille waeren auf einem schmalen Telefon unter 50 Punkten je Feld -- zu wenig
 * fuer eine sichere Beruehrung.
 *
 * Der Weichzeichner kommt von expo-blur. Auf Android ist er bis heute
 * ausdruecklich als "experimental" gefuehrt und kostet je Bild einen eigenen
 * Durchgang; dort liegt deshalb eine halbdurchsichtige Flaeche statt eines
 * echten Weichzeichners. Der Unterschied faellt kaum auf, weil darunter ohnehin
 * Inhalt durchscheint.
 */
export function GlasTabLeiste({
  state,
  descriptors,
  navigation,
  theme,
  dunkel,
}: TabLeisteProps & { theme: ThemeColors; dunkel: boolean }) {
  const insets = useSafeAreaInsets();

  const inPille = state.routes.slice(0, -1);
  const abgesetzt = state.routes[state.routes.length - 1];
  const abgesetztAktiv = state.index === state.routes.length - 1;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.rahmen, { paddingBottom: Math.max(insets.bottom, 12) }]}
    >
      <Glasflaeche theme={theme} dunkel={dunkel} radius={HOEHE / 2} style={styles.pille}>
        {inPille.map((route, index) => (
          <Feld
            key={route.key}
            route={route}
            aktiv={state.index === index}
            descriptors={descriptors}
            navigation={navigation}
            theme={theme}
          />
        ))}
      </Glasflaeche>

      {abgesetzt && (
        <Glasflaeche
          theme={theme}
          dunkel={dunkel}
          radius={HOEHE / 2}
          style={[styles.knopf, { marginLeft: ABSTAND_ZUM_KNOPF }]}
        >
          <Feld
            route={abgesetzt}
            aktiv={abgesetztAktiv}
            descriptors={descriptors}
            navigation={navigation}
            theme={theme}
            fuellendeBreite
          />
        </Glasflaeche>
      )}
    </View>
  );
}

function Glasflaeche({
  theme,
  dunkel,
  radius,
  style,
  children,
}: {
  theme: ThemeColors;
  dunkel: boolean;
  radius: number;
  style?: any;
  children: React.ReactNode;
}) {
  const echterWeichzeichner = Platform.OS === "ios" || Platform.OS === "web";

  return (
    <View
      style={[
        styles.glas,
        {
          borderRadius: radius,
          borderColor: dunkel ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.55)",
          // Ohne Weichzeichner traegt die Farbe allein -- dann darf sie nicht so
          // durchsichtig sein, sonst wird die Leiste vor hellem Inhalt unlesbar.
          backgroundColor: echterWeichzeichner
            ? dunkel
              ? "rgba(255,255,255,0.10)"
              : "rgba(255,255,255,0.35)"
            : dunkel
              ? "rgba(30,30,30,0.82)"
              : "rgba(255,255,255,0.88)",
          shadowColor: dunkel ? "#000" : "#0d2626",
        },
        style,
      ]}
    >
      {echterWeichzeichner && (
        <BlurView
          intensity={dunkel ? 40 : 30}
          tint={dunkel ? "dark" : "light"}
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
          pointerEvents="none"
        />
      )}
      {children}
    </View>
  );
}

function Feld({
  route,
  aktiv,
  descriptors,
  navigation,
  theme,
  fuellendeBreite = false,
}: {
  route: TabRoute;
  aktiv: boolean;
  descriptors: TabLeisteProps["descriptors"];
  navigation: TabLeisteProps["navigation"];
  theme: ThemeColors;
  fuellendeBreite?: boolean;
}) {
  const { options } = descriptors[route.key]!;
  const druck = useSharedValue(0);
  const hebung = useSharedValue(aktiv ? 1 : 0);

  React.useEffect(() => {
    hebung.value = withSpring(aktiv ? 1 : 0, { damping: 16, stiffness: 220 });
  }, [aktiv]);

  const stil = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 - druck.value * 0.12 },
      // Das aktive Symbol steigt leicht an, wie in der Vorlage beim Zeiger.
      // Auf dem Telefon gibt es kein Ueberfahren, also traegt es hier den
      // aktiven Zustand statt einer Beruehrungsvorschau.
      { translateY: -hebung.value * 2 },
    ],
  }));

  const hofStil = useAnimatedStyle(() => ({
    opacity: hebung.value,
    transform: [{ scale: 0.8 + hebung.value * 0.2 }],
  }));

  function beiDruck() {
    const ereignis = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (!aktiv && !ereignis.defaultPrevented) {
      navigation.navigate(route.name, route.params);
    }
  }

  const farbe = aktiv ? theme.tabBarActive : theme.tabBarInactive;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={aktiv ? { selected: true } : {}}
      accessibilityLabel={options.tabBarAccessibilityLabel ?? options.title}
      onPress={beiDruck}
      onPressIn={() => (druck.value = withTiming(1, { duration: 90 }))}
      onPressOut={() => (druck.value = withTiming(0, { duration: 140 }))}
      style={[styles.feld, fuellendeBreite ? styles.feldVoll : styles.feldAnteilig]}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.hof, { backgroundColor: `${theme.tabBarActive}22` }, hofStil]}
      />
      <Animated.View style={stil}>
        {options.tabBarIcon?.({ color: farbe, focused: aktiv, size: 22 })}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Bewusst nicht absolut gesetzt. Mit einer eigenen `tabBar` misst die
  // Navigation deren Hoehe und haelt den Inhalt darueber frei; eine absolut
  // gesetzte Leiste haette die Hoehe null und laege ueber dem letzten Eintrag
  // jeder Liste. Der schwebende Eindruck entsteht durch die seitlichen
  // Abstaende und den Schatten, nicht durch die Ueberlagerung.
  rahmen: {
    paddingHorizontal: SEITENRAND,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  glas: {
    borderWidth: 1,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 8,
  },
  pille: {
    flex: 1,
    height: HOEHE,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  knopf: {
    width: HOEHE,
    height: HOEHE,
    alignItems: "center",
    justifyContent: "center",
  },
  feld: {
    alignItems: "center",
    justifyContent: "center",
    height: HOEHE - 12,
  },
  feldAnteilig: { flex: 1 },
  feldVoll: { width: "100%" },
  hof: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
  },
});
