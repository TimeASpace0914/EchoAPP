import { Image, type ImageStyle } from "react-native";
import { useColorScheme } from "@/hooks/use-color-scheme";

type LogoVariant = "auto" | "black" | "white" | "amber";

interface LogoProps {
  height?: number;
  variant?: LogoVariant;
  style?: ImageStyle;
}

/**
 * 迴響書法 LOGO 元件
 * - auto: 根據色彩模式自動選擇黑色或白色版本
 * - black: 深色筆畫（適用淺色背景）
 * - white: 白色筆畫（適用深色背景）
 * - amber: 暖橘色筆畫（強調用途）
 */
export function Logo({ height = 40, variant = "auto", style }: LogoProps) {
  const colorScheme = useColorScheme();

  const resolvedVariant =
    variant === "auto"
      ? colorScheme === "dark"
        ? "white"
        : "black"
      : variant;

  const source =
    resolvedVariant === "white"
      ? require("@/assets/images/logo-white.png")
      : resolvedVariant === "amber"
        ? require("@/assets/images/logo-amber.png")
        : require("@/assets/images/logo.png");

  return (
    <Image
      source={source}
      style={{ height, resizeMode: "contain", ...style }}
    />
  );
}
