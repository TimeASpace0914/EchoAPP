import { useEffect, useState } from "react";
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

// 柔和的貝茲曲線緩動
const SOFT_EASE = Easing.bezier(0.25, 0.1, 0.25, 1);
const SOFT_OUT = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * 啟動動畫覆蓋層 — 波浪圓形樣式（柔和版）
 *
 * LOGO 從中心淡入並微微放大，周圍三圈同心圓波紋由內向外緩慢擴散，
 * 底部波浪 bar 柔和起伏，整體節奏優雅不急促。
 */
export function SplashOverlay({
  onAnimationComplete,
  duration = 3000,
}: SplashOverlayProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.85);
  const overlayOpacity = useSharedValue(1);
  const [isDone, setIsDone] = useState(false);

  // 三圈波紋 — 初始 scale 極小、opacity 為 0（完全不可見）
  const ring1Scale = useSharedValue(0.12);
  const ring1Opacity = useSharedValue(0);
  const ring2Scale = useSharedValue(0.12);
  const ring2Opacity = useSharedValue(0);
  const ring3Scale = useSharedValue(0.12);
  const ring3Opacity = useSharedValue(0);

  const accentColor = isDark ? "#FFFFFF" : "#000000";
  const bgColor = isDark ? "#0A0A0A" : "#F2F2F5";

  // ★ 所有 useAnimatedStyle 必須在條件 return 之前呼叫（Rules of Hooks）
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

  useEffect(() => {
    // 1. LOGO 柔和淡入 + 微放大
    logoOpacity.value = withTiming(1, {
      duration: 1000,
      easing: SOFT_OUT,
    });
    logoScale.value = withTiming(1, {
      duration: 1200,
      easing: SOFT_OUT,
    });

    // 2. 三圈波紋 — 淡入 → 擴散 → 淡出，循環
    // 修正「突然出現」問題：每個循環從 opacity 0 開始柔和淡入，不再用 duration:0 瞬間跳回
    const ringAnim = (
      scale: any,
      opacity: any,
      delay: number,
      peakOpacity: number
    ) => {
      // 一個完整循環：淡入(400ms) → 擴散淡出(2000ms) → 停留不可見(200ms)
      const cycleScale = withSequence(
        // 淡入階段：scale 從 0.12 緩慢增到 0.25
        withTiming(0.25, { duration: 400, easing: SOFT_EASE }),
        // 擴散階段：scale 從 0.25 擴散到 1.4
        withTiming(1.4, { duration: 2000, easing: SOFT_EASE }),
        // 停留不可見
        withTiming(0.12, { duration: 200 })
      );

      const cycleOpacity = withSequence(
        // 淡入：opacity 從 0 升到 peakOpacity
        withTiming(peakOpacity, { duration: 400, easing: SOFT_EASE }),
        // 淡出：opacity 從 peakOpacity 降到 0
        withTiming(0, { duration: 2000, easing: SOFT_EASE }),
        // 保持不可見
        withTiming(0, { duration: 200 })
      );

      scale.value = withDelay(delay, withRepeat(cycleScale, -1, false));
      opacity.value = withDelay(delay, withRepeat(cycleOpacity, -1, false));
    };

    ringAnim(ring1Scale, ring1Opacity, 0, 0.5);
    ringAnim(ring2Scale, ring2Opacity, 550, 0.35);
    ringAnim(ring3Scale, ring3Opacity, 1100, 0.2);

    // 3. 整體柔和淡出
    overlayOpacity.value = withDelay(
      duration,
      withTiming(0, {
        duration: 700,
        easing: SOFT_EASE,
      })
    );

    // 4. 完成回調
    const timeout = setTimeout(() => {
      cancelAnimation(ring1Scale);
      cancelAnimation(ring2Scale);
      cancelAnimation(ring3Scale);
      setIsDone(true);
      runOnJS(onAnimationComplete)();
    }, duration + 800);

    return () => {
      clearTimeout(timeout);
      cancelAnimation(ring1Scale);
      cancelAnimation(ring2Scale);
      cancelAnimation(ring3Scale);
    };
  }, []);

  if (isDone) return null;

  // 縮小波紋尺寸：220 → 160
  const RING_SIZE = 160;

  return (
    <Animated.View style={[styles.overlay, { backgroundColor: bgColor }, overlayAnimatedStyle]}>
      <View style={styles.content}>
        {/* 波紋 + LOGO 的容器 — LOGO 置中於波紋圓心 */}
        <View style={styles.centerStage}>
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

          {/* LOGO 疊在波紋正中央 */}
          <Animated.View style={[styles.logoWrap, logoAnimatedStyle]}>
            <Logo height={130} variant={isDark ? "white" : "black"} />
          </Animated.View>
        </View>

        {/* 底部波浪 bar 動畫 */}
        <View style={styles.waveBarRow}>
          {Array.from({ length: 7 }).map((_, i) => (
            <WaveBar key={i} index={i} color={accentColor} delay={i * 140} />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

/** 單個波浪 bar — 柔和上下起伏 */
function WaveBar({
  index,
  color,
  delay,
}: {
  index: number;
  color: string;
  delay: number;
}) {
  const barHeight = useSharedValue(5);

  useEffect(() => {
    barHeight.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(18 + (index % 3) * 5, {
            duration: 650,
            easing: SOFT_EASE,
          }),
          withTiming(5, {
            duration: 650,
            easing: SOFT_EASE,
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
        { backgroundColor: color, opacity: 0.12 + (index % 3) * 0.08 },
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
    gap: 48,
  },
  // 縮小容器：220 → 160
  centerStage: {
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
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
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  waveBarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    height: 24,
  },
  waveBar: {
    width: 4,
    borderRadius: 2,
  },
});
