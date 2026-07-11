import { useEffect, useState } from "react";
import { View, StyleSheet, Dimensions, useColorScheme } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { Logo } from "@/components/logo";

interface SplashOverlayProps {
  onAnimationComplete: () => void;
  duration?: number;
}

const SCREEN_WIDTH = Dimensions.get("window").width;

/**
 * 啟動動畫覆蓋層
 *
 * LOGO 從透明淡入，底部暖橘進度條從 0% 填充至 100%，
 * 完成後整體淡出，觸發 onAnimationComplete 回調。
 */
export function SplashOverlay({
  onAnimationComplete,
  duration = 2500,
}: SplashOverlayProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.8);
  const progressWidth = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    // 1. LOGO 淡入 + 微縮放
    logoOpacity.value = withTiming(1, {
      duration: 800,
      easing: Easing.out(Easing.ease),
    });
    logoScale.value = withTiming(1, {
      duration: 800,
      easing: Easing.out(Easing.ease),
    });

    // 2. 進度條填充（延遲 400ms 開始）
    progressWidth.value = withDelay(
      400,
      withTiming(SCREEN_WIDTH * 0.7, {
        duration: duration - 800,
        easing: Easing.inOut(Easing.ease),
      })
    );

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
      setIsDone(true);
      runOnJS(onAnimationComplete)();
    }, duration + 600);

    return () => clearTimeout(timeout);
  }, []);

  if (isDone) return null;

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: progressWidth.value,
  }));

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  return (
    <Animated.View style={[styles.overlay, { backgroundColor: isDark ? "#1E1E1E" : "#EFEFEF" }, overlayAnimatedStyle]}>
      <View style={styles.content}>
        <Animated.View style={logoAnimatedStyle}>
          <Logo height={200} variant={isDark ? "white" : "black"} />
        </Animated.View>
        <Animated.View
          style={[styles.progressTrack, progressAnimatedStyle]}
        />
      </View>
    </Animated.View>
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
    gap: 32,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E8A87C",
  },
});
