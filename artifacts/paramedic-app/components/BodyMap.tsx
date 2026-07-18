import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Ellipse, Path, Rect } from "react-native-svg";
import * as Haptics from "expo-haptics";

import { getTheme } from "@/constants/theme";
import { useAppStore } from "@/store/useAppStore";
import { hasTerm, toggleTerm } from "./ChipTextField";

const INJURED = "#EF4444";

interface Region {
  key: string;
  /** Shape of the tappable area, in the 100x260 viewBox of the silhouette. */
  shape:
    | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number }
    | { kind: "rect"; x: number; y: number; w: number; h: number; r?: number };
}

/**
 * Silhouette geometry. Both views share one viewBox so the two figures line up
 * visually; only the region sets differ.
 */
const FRONT: Region[] = [
  { key: "head", shape: { kind: "ellipse", cx: 50, cy: 20, rx: 13, ry: 16 } },
  { key: "neck", shape: { kind: "rect", x: 44, y: 36, w: 12, h: 8, r: 3 } },
  { key: "chest", shape: { kind: "rect", x: 33, y: 44, w: 34, h: 28, r: 6 } },
  { key: "abdomen", shape: { kind: "rect", x: 35, y: 72, w: 30, h: 24, r: 6 } },
  { key: "pelvis", shape: { kind: "rect", x: 36, y: 96, w: 28, h: 16, r: 6 } },
  { key: "shoulder_r", shape: { kind: "ellipse", cx: 29, cy: 50, rx: 8, ry: 7 } },
  { key: "shoulder_l", shape: { kind: "ellipse", cx: 71, cy: 50, rx: 8, ry: 7 } },
  { key: "upper_arm_r", shape: { kind: "rect", x: 20, y: 57, w: 11, h: 26, r: 5 } },
  { key: "upper_arm_l", shape: { kind: "rect", x: 69, y: 57, w: 11, h: 26, r: 5 } },
  { key: "forearm_r", shape: { kind: "rect", x: 17, y: 83, w: 10, h: 26, r: 5 } },
  { key: "forearm_l", shape: { kind: "rect", x: 73, y: 83, w: 10, h: 26, r: 5 } },
  { key: "hand_r", shape: { kind: "ellipse", cx: 21, cy: 116, rx: 6, ry: 7 } },
  { key: "hand_l", shape: { kind: "ellipse", cx: 79, cy: 116, rx: 6, ry: 7 } },
  { key: "thigh_r", shape: { kind: "rect", x: 36, y: 112, w: 13, h: 38, r: 6 } },
  { key: "thigh_l", shape: { kind: "rect", x: 51, y: 112, w: 13, h: 38, r: 6 } },
  { key: "knee_r", shape: { kind: "ellipse", cx: 42, cy: 156, rx: 7, ry: 7 } },
  { key: "knee_l", shape: { kind: "ellipse", cx: 58, cy: 156, rx: 7, ry: 7 } },
  { key: "shin_r", shape: { kind: "rect", x: 36, y: 163, w: 12, h: 38, r: 5 } },
  { key: "shin_l", shape: { kind: "rect", x: 52, y: 163, w: 12, h: 38, r: 5 } },
  { key: "foot_r", shape: { kind: "ellipse", cx: 42, cy: 208, rx: 8, ry: 7 } },
  { key: "foot_l", shape: { kind: "ellipse", cx: 58, cy: 208, rx: 8, ry: 7 } },
];

const BACK: Region[] = [
  { key: "back_head", shape: { kind: "ellipse", cx: 50, cy: 20, rx: 13, ry: 16 } },
  { key: "nape", shape: { kind: "rect", x: 44, y: 36, w: 12, h: 8, r: 3 } },
  { key: "shoulder_blade_r", shape: { kind: "rect", x: 33, y: 44, w: 16, h: 20, r: 5 } },
  { key: "shoulder_blade_l", shape: { kind: "rect", x: 51, y: 44, w: 16, h: 20, r: 5 } },
  { key: "upper_back", shape: { kind: "rect", x: 35, y: 64, w: 30, h: 18, r: 5 } },
  { key: "lower_back", shape: { kind: "rect", x: 36, y: 82, w: 28, h: 22, r: 5 } },
  { key: "elbow_r", shape: { kind: "ellipse", cx: 22, cy: 84, rx: 7, ry: 7 } },
  { key: "elbow_l", shape: { kind: "ellipse", cx: 78, cy: 84, rx: 7, ry: 7 } },
  { key: "buttocks", shape: { kind: "rect", x: 36, y: 104, w: 28, h: 18, r: 8 } },
  { key: "hamstring_r", shape: { kind: "rect", x: 36, y: 122, w: 13, h: 32, r: 6 } },
  { key: "hamstring_l", shape: { kind: "rect", x: 51, y: 122, w: 13, h: 32, r: 6 } },
  { key: "calf_r", shape: { kind: "rect", x: 36, y: 158, w: 12, h: 38, r: 6 } },
  { key: "calf_l", shape: { kind: "rect", x: 52, y: 158, w: 12, h: 38, r: 6 } },
  { key: "heel_r", shape: { kind: "ellipse", cx: 42, cy: 205, rx: 7, ry: 7 } },
  { key: "heel_l", shape: { kind: "ellipse", cx: 58, cy: 205, rx: 7, ry: 7 } },
];

/** Outline drawn behind the regions so the figure reads as a body, not a pile of boxes. */
const OUTLINE =
  "M50 4 C57 4 63 10 63 19 C63 26 60 31 57 34 L57 40 " +
  "L72 46 C78 49 81 55 82 62 L84 108 L76 110 L72 78 L69 78 L69 110 " +
  "L66 152 L64 208 L54 210 L52 156 L50 130 L48 156 L46 210 L36 208 " +
  "L34 152 L31 110 L31 78 L28 78 L24 110 L16 108 L18 62 " +
  "C19 55 22 49 28 46 L43 40 L43 34 C40 31 37 26 37 19 C37 10 43 4 50 4 Z";

interface Props {
  /** Comma-separated free text — the single source of truth for the selection. */
  value: string;
  onChange: (next: string) => void;
  labelFor: (key: string) => string;
  frontLabel: string;
  backLabel: string;
  editable?: boolean;
}

export default function BodyMap({
  value,
  onChange,
  labelFor,
  frontLabel,
  backLabel,
  editable = true,
}: Props) {
  const themeKey = useAppStore((s) => s.theme);
  const theme = getTheme(themeKey);

  const onRegionPress = (key: string) => {
    if (!editable) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(toggleTerm(value, labelFor(key)));
  };

  const renderFigure = (regions: Region[], caption: string) => (
    <View style={styles.figure}>
      <Svg viewBox="0 0 100 220" style={styles.svg}>
        <Path
          d={OUTLINE}
          fill={theme.card}
          stroke={theme.cardBorder}
          strokeWidth={1.5}
        />
        {regions.map((r) => {
          const active = hasTerm(value, labelFor(r.key));
          const fill = active ? INJURED : "transparent";
          const stroke = active ? INJURED : theme.cardBorder;
          const common = {
            fill,
            fillOpacity: active ? 0.75 : 0,
            stroke,
            strokeWidth: active ? 1.2 : 0.6,
            strokeOpacity: active ? 1 : 0.45,
            onPress: () => onRegionPress(r.key),
          };
          return r.shape.kind === "ellipse" ? (
            <Ellipse
              key={r.key}
              cx={r.shape.cx}
              cy={r.shape.cy}
              rx={r.shape.rx}
              ry={r.shape.ry}
              {...common}
            />
          ) : (
            <Rect
              key={r.key}
              x={r.shape.x}
              y={r.shape.y}
              width={r.shape.w}
              height={r.shape.h}
              rx={r.shape.r ?? 4}
              {...common}
            />
          );
        })}
      </Svg>
      <Text style={[styles.caption, { color: theme.textSecondary }]}>{caption}</Text>
    </View>
  );

  return (
    <View style={styles.row}>
      {renderFigure(FRONT, frontLabel)}
      {renderFigure(BACK, backLabel)}
    </View>
  );
}

export const BODY_REGION_KEYS = [
  ...FRONT.map((r) => r.key),
  ...BACK.map((r) => r.key),
];

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, marginBottom: 12 },
  figure: { flex: 1, alignItems: "center" },
  svg: { width: "100%", aspectRatio: 100 / 220 },
  caption: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 6 },
});
