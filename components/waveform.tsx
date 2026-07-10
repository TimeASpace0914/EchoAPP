import { useEffect, useRef } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";

interface WaveformProps {
  active: boolean;
  barCount?: number;
  color?: string;
  height?: number;
}

// 預計算每個 bar 的隨機高度種子（使用正弦波 + 雜訊）
function getSeedHeight(index: number, total: number): number {
  const base = Math.sin((index / total) * Math.PI) * 0.6 + 0.3;
  const noise = Math.sin(index * 2.5) * 0.2;
  return Math.max(0.15, Math.min(1, base + noise));
}

/**
 * 音波視覺化元件
 * active=true 時呈現動態跳動的音波動畫
 * active=false 時呈現靜態的音波圖案
 */
export function Waveform({
  active,
  barCount = 40,
  color = "#E8A87C",
  height = 80,
}: WaveformProps) {
  const seeds = useRef(
    Array.from({ length: barCount }, (_, i) => getSeedHeight(i, barCount))
  ).current;

  return (
    <View style={[styles.container, { height }]}>
      {seeds.map((seed, i) => (
        <WaveBar
          key={i}
          index={i}
          seed={seed}
          active={active}
          color={color}
          maxHeight={height}
        />
      ))}
    </View>
  );
}

function WaveBar({
  index,
  seed,
  active,
  color,
  maxHeight,
}: {
  index: number;
  seed: number;
  active: boolean;
  color: string;
  maxHeight: number;
}) {
  const animatedHeight = useSharedValue(active ? seed * maxHeight : 6);

  useEffect(() => {
    if (active) {
      const targetHeight = seed * maxHeight;
      animatedHeight.value = withRepeat(
        withSequence(
          withTiming(targetHeight * 0.35, {
            duration: 200 + (index % 3) * 80,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(targetHeight, {
            duration: 250 + (index % 4) * 60,
            easing: Easing.inOut(Easing.ease),
          })
        ),
        -1,
        true
      );
    } else {
      cancelAnimation(animatedHeight);
      animatedHeight.value = withTiming(6, { duration: 300 });
    }
  }, [active, animatedHeight, index, seed, maxHeight]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: animatedHeight.value,
  }));

  return (
    <Animated.View
      style={[
        styles.bar,
        { backgroundColor: color, opacity: 0.35 + seed * 0.65 },
        animatedStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    width: "100%",
  },
  bar: {
    width: 3,
    borderRadius: 1.5,
  },
});
