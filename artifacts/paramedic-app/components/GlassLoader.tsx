import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  interpolateColor,
  type SharedValue,
} from "react-native-reanimated";

import { MedicalCross } from "./MedicalCross";

interface GlassLoaderProps {
  /** Kantenlaenge des Quadrats, in dem die Ringe liegen. */
  size?: number;
  /** Grundfarbe des Zeichens in der Mitte. Pulsiert nach hell. */
  color?: string;
  /** Helle Ringe auf dunklem Grund statt umgekehrt. */
  dark?: boolean;
}

const DAUER = 2000;
// Fuenf Ringe, aussen nach innen. Der Anteil ist der Rand zur Kante des
// Quadrats -- 0 ist der aeusserste Ring, 0.4 der innerste. Je weiter innen,
// desto spaeter setzt die Welle ein, so laeuft sie sichtbar nach aussen.
const RINGE = [
  { anteil: 0, verzoegerung: 800, randDeckung: 0.2 },
  { anteil: 0.1, verzoegerung: 600, randDeckung: 0.4 },
  { anteil: 0.2, verzoegerung: 400, randDeckung: 0.6 },
  { anteil: 0.3, verzoegerung: 200, randDeckung: 0.8 },
  { anteil: 0.4, verzoegerung: 0, randDeckung: 1 },
];

/**
 * Ladezeichen aus konzentrischen Ringen, die von innen nach aussen pulsieren,
 * mit dem Kreuz in der Mitte.
 *
 * Die Vorlage nutzte je Ring ein `backdrop-filter`. Fuenf ineinander liegende
 * Weichzeichner kosten auf Android jedes Mal einen eigenen Durchgang und
 * ruckeln sichtbar; die Ringe sind deshalb halbdurchsichtig gefuellt statt
 * weichgezeichnet. Wer den Glaseffekt darunter will, legt eine BlurView hinter
 * diese Komponente -- das ist ein Durchgang statt fuenf.
 */
export function GlassLoader({ size = 200, color = "#22C55E", dark = false }: GlassLoaderProps) {
  const fortschritt = useSharedValue(0);

  useEffect(() => {
    fortschritt.value = withRepeat(
      withSequence(
        withTiming(1, { duration: DAUER / 2, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: DAUER / 2, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);

  const fuellung = dark ? "rgba(255,255,255,0.10)" : "rgba(120,120,120,0.14)";
  const rand = dark ? "255,255,255" : "110,110,110";

  return (
    <View style={{ width: size, height: size }}>
      {RINGE.map((ring) => (
        <Ring
          key={ring.anteil}
          size={size}
          ring={ring}
          fuellung={fuellung}
          rand={rand}
        />
      ))}
      <View style={styles.mitte} pointerEvents="none">
        <Kreuz size={size * 0.3} color={color} fortschritt={fortschritt} />
      </View>
    </View>
  );
}

function Ring({
  size,
  ring,
  fuellung,
  rand,
}: {
  size: number;
  ring: (typeof RINGE)[number];
  fuellung: string;
  rand: string;
}) {
  const skalierung = useSharedValue(1);

  useEffect(() => {
    skalierung.value = withDelay(
      ring.verzoegerung,
      withRepeat(
        withSequence(
          withTiming(1.3, { duration: DAUER / 2, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: DAUER / 2, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );
  }, []);

  const stil = useAnimatedStyle(() => ({ transform: [{ scale: skalierung.value }] }));

  const abstand = size * ring.anteil;
  const durchmesser = size - abstand * 2;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          top: abstand,
          left: abstand,
          width: durchmesser,
          height: durchmesser,
          borderRadius: durchmesser / 2,
          backgroundColor: fuellung,
          borderWidth: 1,
          borderColor: `rgba(${rand},${ring.randDeckung * 0.55})`,
          // Der Schatten sitzt in der Vorlage unter dem Ring und waechst beim
          // Aufgehen mit. In React Native laesst er sich nicht animieren, ohne
          // auf jedem Bild neu gezeichnet zu werden -- ein fester Wert kostet
          // nichts und faellt in der Bewegung nicht auf.
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.18,
          shadowRadius: 10,
          elevation: 4,
        },
        stil,
      ]}
    />
  );
}

// Das Logo hellt sich in der Vorlage im Takt der Welle auf. Hier traegt das der
// Hof hinter dem Kreuz: er pulsiert in der Akzentfarbe, das Kreuz selbst bleibt
// weiss. Ein Wechsel der Kreuzfarbe nach Weiss ginge nicht -- auf hellem Hof
// waere es unsichtbar. interpolateColor laeuft auf dem UI-Faden, also ohne
// State und ohne erneutes Rendern.
function Kreuz({
  size,
  color,
  fortschritt,
}: {
  size: number;
  color: string;
  fortschritt: SharedValue<number>;
}) {
  const stil = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + fortschritt.value * 0.06 }],
    backgroundColor: interpolateColor(
      fortschritt.value,
      [0, 1],
      [`${color}99`, color],
    ),
  }));

  return (
    <Animated.View style={[styles.kreuzHof, stil, { width: size * 1.6, height: size * 1.6, borderRadius: size * 0.8 }]}>
      <MedicalCross size={size} color="#FFFFFF" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  mitte: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  kreuzHof: {
    alignItems: "center",
    justifyContent: "center",
  },
});
