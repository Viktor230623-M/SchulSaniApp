import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";

interface WaveBackgroundProps {
  color?: string;
}

export function WaveBackground({ color = "#F0FDF4" }: WaveBackgroundProps) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg
        height="100%"
        width="100%"
        style={StyleSheet.absoluteFill}
        viewBox="0 0 400 800"
        preserveAspectRatio="xMidYMid slice"
      >
        <Path
          d="M-50 150 Q 100 80 200 160 Q 300 240 450 120 L 450 0 L -50 0 Z"
          fill={color}
          opacity={0.5}
        />
        <Path
          d="M-50 300 Q 80 220 200 300 Q 320 380 450 280 L 450 150 Q 300 250 200 170 Q 100 90 -50 160 Z"
          fill={color}
          opacity={0.35}
        />
        <Path
          d="M-50 700 Q 120 620 250 700 Q 360 770 450 680 L 450 800 L -50 800 Z"
          fill={color}
          opacity={0.4}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({});
