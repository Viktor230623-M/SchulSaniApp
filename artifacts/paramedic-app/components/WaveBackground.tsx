import React from "react";
import { StyleSheet, View, StatusBar } from "react-native";
import Svg, { Path } from "react-native-svg";

interface WaveBackgroundProps {
  color?: string;
}

function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export function WaveBackground({ color = "#F0FDF4" }: WaveBackgroundProps) {
  const waveColor = adjustColor(color, -30);

  return (
    <>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: color }]} pointerEvents="none">
        <Svg
          height="100%"
          width="100%"
          viewBox="0 0 400 800"
          preserveAspectRatio="xMidYMid slice"
        >
          <Path
            d="M-50 150 Q 100 80 200 160 Q 300 240 450 120 L 450 0 L -50 0 Z"
            fill={waveColor}
            opacity={0.6}
          />
          <Path
            d="M-50 300 Q 80 220 200 300 Q 320 380 450 280 L 450 150 Q 300 250 200 170 Q 100 90 -50 160 Z"
            fill={waveColor}
            opacity={0.4}
          />
          <Path
            d="M-50 700 Q 120 620 250 700 Q 360 770 450 680 L 450 800 L -50 800 Z"
            fill={waveColor}
            opacity={0.5}
          />
        </Svg>
      </View>
    </>
  );
}
