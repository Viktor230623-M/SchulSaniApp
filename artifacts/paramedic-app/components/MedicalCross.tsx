import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

interface MedicalCrossProps {
  size?: number;
  color?: string;
  animate?: boolean;
}

export function MedicalCross({
  size = 60,
  color = "#22C55E",
  animate = false,
}: MedicalCrossProps) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (animate) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 800 }),
          withTiming(1, { duration: 800 })
        ),
        -1,
        false
      );
    }
  }, [animate]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const armThick = size * 0.33;
  const armLength = size;

  return (
    <Animated.View style={[animatedStyle]}>
      <View style={{ width: size, height: size, position: "relative" }}>
        <View
          style={[
            styles.arm,
            {
              width: armThick,
              height: armLength,
              backgroundColor: color,
              left: (size - armThick) / 2,
              top: 0,
              borderRadius: 4,
            },
          ]}
        />
        <View
          style={[
            styles.arm,
            {
              width: armLength,
              height: armThick,
              backgroundColor: color,
              top: (size - armThick) / 2,
              left: 0,
              borderRadius: 4,
            },
          ]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  arm: {
    position: "absolute",
  },
});
