import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { istDunklesThema, type ThemeColors } from "@/constants/theme";
import { LiquidGlassView, nativeGlassAvailable } from "@/modules/liquid-glass/src/LiquidGlassView";

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
 * Platz, den ein Bildschirm unten freilassen muss, damit sein letztes Element
 * nicht unter der schwebenden Leiste verschwindet. Der Sicherheitsabstand des
 * Geraets kommt beim Verwenden dazu.
 */
export const LEISTE_PLATZ = HOEHE + 24;

/** `#RRGGBB` mit Deckung als `rgba(...)`. Andere Schreibweisen bleiben, wie sie sind. */
function mitDeckung(farbe: string, deckung: number): string {
  const treffer = /^#([0-9a-f]{6})$/i.exec(farbe.trim());
  if (!treffer) return farbe;
  const wert = parseInt(treffer[1]!, 16);
  return `rgba(${(wert >> 16) & 255},${(wert >> 8) & 255},${wert & 255},${deckung})`;
}

/**
 * Schwebende Leiste aus Glas statt der durchgehenden Leiste am unteren Rand.
 *
 * Aufteilung wie in der Vorlage: die ersten Eintraege liegen in einer Pille,
 * der letzte sitzt als eigener runder Knopf daneben. Sechs Symbole in einer
 * Pille waeren auf einem schmalen Telefon unter 50 Punkten je Feld -- zu wenig
 * fuer eine sichere Beruehrung.
 *
 * Drei Schichten machen das Material glaessig statt matt: der Weichzeichner
 * (auf iOS das native Apple-Material, im Web blur mit Saettigung), die helle
 * Oberkante, auf die das Licht faellt, und der diagonale Specular-Schein.
 * Auf Android gibt es bis heute keinen brauchbaren Flaechenweichzeichner; dort
 * traegt eine halbdurchsichtige Flaeche zusammen mit Schein und Kante den
 * Look. Auf iOS mit Dev-Build uebernimmt ein nativer SwiftUI-View mit dem
 * echten Liquid-Glass-Material (iOS 26) -- siehe modules/liquid-glass.
 */
export function GlasTabLeiste({
  state,
  descriptors,
  navigation,
  theme,
}: TabLeisteProps & { theme: ThemeColors }) {
  const insets = useSafeAreaInsets();
  const dunkel = istDunklesThema(theme.background);

  const inPille = state.routes.slice(0, -1);
  const abgesetzt = state.routes[state.routes.length - 1];
  const abgesetztAktiv = state.index === state.routes.length - 1;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.rahmen, { paddingBottom: Math.max(insets.bottom, 12) }]}
    >
      <Glasflaeche theme={theme} dunkel={dunkel} radius={HOEHE / 2} intensity={dunkel ? 60 : 50} style={styles.pille}>
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
          intensity={dunkel ? 45 : 35}
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
  intensity,
  style,
  children,
}: {
  theme: ThemeColors;
  dunkel: boolean;
  radius: number;
  /** Blur-Intensitaet der BlurView; die groessere Pille liest dicker als der Knopf. */
  intensity: number;
  style?: any;
  children: React.ReactNode;
}) {
  const nativ = Platform.OS === "ios" && nativeGlassAvailable;
  const weichzeichner = !nativ && (Platform.OS === "ios" || Platform.OS === "web");

  return (
    <View
      style={[
        styles.glas,
        {
          borderRadius: radius,
          // Alles aus dem Thema, nichts fest verdrahtet: sonst haengt ueber
          // jedem Thema dieselbe weisse Leiste.
          borderColor: theme.tabBarBorder,
          // Licht faellt von oben auf das Material: die Oberkante ist heller
          // als der Rest der Kante.
          borderTopColor: dunkel ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.55)",
          // Ohne Weichzeichner traegt die Farbe allein und muss deutlich
          // dichter sein, sonst wird die Leiste vor hellem Inhalt unlesbar.
          backgroundColor: weichzeichner || nativ ? "transparent" : mitDeckung(theme.card, 0.86),
          shadowColor: dunkel ? "#000" : theme.tabBarBorder,
        },
        style,
      ]}
    >
      {nativ && (
        <LiquidGlassView
          cornerRadius={radius}
          dark={dunkel}
          style={StyleSheet.absoluteFill}
        />
      )}

      {weichzeichner && (
        <>
          {Platform.OS === "web" ? (
            // Web: ein Durchgang mit Saettigung statt BlurView -- der
            // Saettigungsschub gehoert zum Glass-Look, die native BlurView auf
            // iOS bringt ihn von selbst mit.
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                { borderRadius: radius, backdropFilter: "blur(24px) saturate(180%)" },
              ] as any}
            />
          ) : (
            <BlurView
              intensity={intensity}
              tint={dunkel ? "dark" : "light"}
              style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
              pointerEvents="none"
            />
          )}
          {/* Der Farbton liegt ueber dem Weichzeichner, nicht darunter. Als
              Hintergrund der Elternflaeche wuerde ihn die BlurView verdecken,
              die den Untergrund neu zeichnet -- die Leiste saehe in jedem
              Thema gleich aus. */}
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { borderRadius: radius, backgroundColor: mitDeckung(theme.card, 0.5) },
            ]}
          />
        </>
      )}

      {/* Ueber dem nativen Glas nur eine leichte Toenung, damit das
          Themengruen oder -blau durchscheint; Kanten und Glanz bringt der
          Glass-Effekt selbst mit. */}
      {nativ && (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: radius, backgroundColor: mitDeckung(theme.card, 0.35) },
          ]}
        />
      )}

      {/* Diagonaler heller Verlauf: der Specular-Schein, der das Material als
          Glas lesbar macht statt als matte Scheibe. Ueber dem nativen Glas
          bleibt er aus -- der Glass-Effekt bringt seinen eigenen Glanz mit. */}
      {!nativ && (
        <LinearGradient
        colors={
          dunkel
            ? ["rgba(255,255,255,0.10)", "rgba(255,255,255,0.02)", "rgba(255,255,255,0)"]
            : ["rgba(255,255,255,0.18)", "rgba(255,255,255,0.04)", "rgba(255,255,255,0)"]
        }
          start={{ x: 0, y: 0 }}
          end={{ x: 0.7, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
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
  // Absolut gesetzt und ohne eigene Flaeche: die Leiste liegt ueber dem Inhalt,
  // der ungehindert darunter durchlaeuft. Damit sie das letzte Element einer
  // Liste nicht verdeckt, gibt der Navigator jedem Bildschirm unten den Platz
  // aus LEISTE_PLATZ mit -- siehe app/(tabs)/_layout.tsx.
  rahmen: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SEITENRAND,
    flexDirection: "row",
    alignItems: "center",
  },
  glas: {
    borderWidth: 1,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 12,
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
