import { useEffect, useState, useRef } from "react";
import { View, StyleSheet, useColorScheme } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
  runOnJS,
  cancelAnimation,
} from "react-native-reanimated";
import { Logo } from "@/components/logo";

interface SplashOverlayProps {
  onAnimationComplete: () => void;
  duration?: number;
}

/**
 * 啟動動畫覆蓋層 — 波浪圓形樣式
 *
 * LOGO 淡入，周圍環繞數個同心圓波紋由內向外擴散，
 * 底部波浪 bar 依序跳動，完成後整體淡出。
 */
export function SplashOverlay({
  onAnimationComplete,
  duration = 2500,
}: SplashOverlayProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.8);
  const overlayOpacity = useSharedValue(1);
  const [isDone, setIsDone] = useState(false);

  // 三圈波紋的 scale 和 opacity
  const ring1Scale = useSharedValue(0.3);
  const ring1Opacity = useSharedValue(0.6);
  const ring2Scale = useSharedValue(0.3);
  const ring2Opacity = useSharedValue(0.4);
  const ring3Scale = useSharedValue(0.3);
  const ring3Opacity = useSharedValue(0.2);

  const accentColor = isDark ? "#FFFFFF" : "#000000";
  const bgColor = isDark ? "#0A0A0A" : "#F2F2F5";

  useEffect(() => {
    // 1. LOGO 淡入 + 微縮放
    logoOpacity.value = withTiming(1, {
      duration: 700,
      easing: Easing.out(Easing.ease),
    });
    logoScale.value = withTiming(1, {
      duration: 700,
      easing: Easing.out(Easing.ease),
    });

    // 2. 三圈波紋循環擴散
    const ringAnim = (scale: any, opacity: any, delay: number) => {
      scale.value = withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(1.8, { duration: 1400, easing: Easing.out(Easing.ease) }),
            withTiming(1.8, { duration: 0 })
          ),
          -1,
          false
        )
      );
      opacity.value = withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
            withTiming(0.6, { duration: 0 })
          ),
          -1,
          false
        )
      );
    };

    ringAnim(ring1Scale, ring1Opacity, 0);
    ringAnim(ring2Scale, ring2Opacity, 350);
    ringAnim(ring3Scale, ring3Opacity, 700);

    // 3. 整體淡出
    overlayOpacity.value = withDelay(
      duration,
      withTiming(0, {
        duration: 500,
        easing: Easing.inOut(Easing.ease),
      })
    );

    // 4. 完成回調
    const timeout = setTimeout(() => {
      cancelAnimation(ring1Scale);
      cancelAnimation(ring2Scale);
      cancelAnimation(ring3Scale);
      setIsDone(true);
      runOnJS(onAnimationComplete)();
    }, duration + 600);

    return () => {
      clearTimeout(timeout);
      cancelAnimation(ring1Scale);
      cancelAnimation(ring2Scale);
      cancelAnimation(ring3Scale);
    };
  }, []);

  if (isDone) return null;

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const ring1Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring1Scale.value }],
    opacity: ring1Opacity.value,
  }));

  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring2Scale.value }],
    opacity: ring2Opacity.value,
  }));

  const ring3Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring3Scale.value }],
    opacity: ring3Opacity.value,
  }));

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const RING_SIZE = 160;

  return (
    <Animated.View style={[styles.overlay, { backgroundColor: bgColor }, overlayAnimatedStyle]}>
      <View style={styles.content}>
        {/* 同心圓波紋 */}
        <View style={styles.ringContainer}>
          <Animated.View
            style={[
              styles.ring,
              {
                width: RING_SIZE,
                height: RING_SIZE,
                borderRadius: RING_SIZE / 2,
                borderColor: accentColor,
              },
              ring1Style,
            ]}
          />
          <Animated.View
            style={[
              styles.ring,
              {
                width: RING_SIZE,
                height: RING_SIZE,
                borderRadius: RING_SIZE / 2,
                borderColor: accentColor,
              },
              ring2Style,
            ]}
          />
          <Animated.View
            style={[
              styles.ring,
              {
                width: RING_SIZE,
                height: RING_SIZE,
                borderRadius: RING_SIZE / 2,
                borderColor: accentColor,
              },
              ring3Style,
            ]}
          />
        </View>

        {/* LOGO 置中 */}
        <Animated.View style={[styles.logoWrap, logoAnimatedStyle]}>
          <Logo height={80} variant={isDark ? "white" : "black"} />
        </Animated.View>

        {/* 底部波浪 bar 動畫 */}
        <View style={styles.waveBarRow}>
          {Array.from({ length: 7 }).map((_, i) => (
            <WaveBar key={i} index={i} color={accentColor} delay={i * 100} />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

/** 單個波浪 bar — 上下跳動動畫 */
function WaveBar({
  index,
  color,
  delay,
}: {
  index: number;
  color: string;
  delay: number;
}) {
  const barHeight = useSharedValue(6);

  useEffect(() => {
    barHeight.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(20 + (index % 3) * 6, {
            duration: 400,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(6, {
            duration: 400,
            easing: Easing.inOut(Easing.ease),
          })
        ),
        -1,
        true
      )
    );

    return () => cancelAnimation(barHeight);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    height: barHeight.value,
  }));

  return (
    <Animated.View
      style={[
        styles.waveBar,
        { backgroundColor: color, opacity: 0.15 + (index % 3) * 0.1 },
        animatedStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    alignItems: "center",
    gap: 40,
  },
  ringContainer: {
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    borderWidth: 1.5,
  },
  logoWrap: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  waveBarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    height: 24,
  },
  waveBar: {
    width: 4,
    borderRadius: 2,
  },
});
