// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Partial<Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "moon.fill": "nightlight-round",
  "sun.max.fill": "light-mode",
  "chevron.left": "chevron-left",
  "xmark": "close",
  "xmark.fill": "close",
  "arrow.clockwise": "refresh",
  "arrow.left": "arrow-back",
  "square.and.arrow.up": "share",
  "arrow.down.to.line": "download",
  "play.fill": "play-arrow",
  "pause.fill": "pause",
  "clock.fill": "history",
  "gear": "settings",
  "waveform": "graphic-eq",
  "cloud.up.fill": "cloud-upload",
  "cloud.fill": "cloud",
  "person.fill": "person",
  "heart.fill": "favorite",
  "trash": "delete",
  "info.circle": "info",
  "checkmark.circle": "check-circle",
  "exclamationmark.triangle": "warning",
  "tag": "label",
  "pencil": "edit",
  "folder": "folder",
  "magnifyingglass": "search",
  "gobackward.10": "replay-10",
  "goforward.10": "forward-10",
  "arrow.triangle.2.circlepath": "autorenew",
  "checkmark.circle.fill": "check-circle",
  "xmark.circle": "cancel",
  "heart.text.square": "favorite",
  "gauge.with.dots.needle.67percent": "speed",
} as unknown as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]!} style={style} />;
}
