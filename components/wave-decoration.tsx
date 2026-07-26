import { View, StyleSheet } from "react-native";
import { useColors } from "@/hooks/use-colors";

/**
 * 波浪裝飾元素 — 用於卡片邊緣的設計感點綴
 * 黑白風格的波浪線條，放在卡片頂部或底部邊緣
 */
export function WaveDecoration({
  variant = "top",
  height = 12,
  opacity = 0.08,
}: {
  variant?: "top" | "bottom";
  height?: number;
  opacity?: number;
}) {
  const colors = useColors();

  return (
    <View
      style={[
        styles.container,
        {
          height,
          opacity,
          borderTopWidth: variant === "top" ? 0 : 0,
          borderBottomWidth: variant === "bottom" ? 0 : 0,
        },
      ]}
      pointerEvents="none"
    >
      <View style={styles.waveRow}>
        {Array.from({ length: 24 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.bar,
              {
                backgroundColor: colors.primary,
                height: height * (0.3 + Math.sin(i * 0.8) * 0.35 + 0.35),
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * 側邊波浪裝飾 — 垂直波浪線條
 */
export function SideWaveDecoration({
  side = "left",
  width = 4,
  opacity = 0.06,
}: {
  side?: "left" | "right";
  width?: number;
  opacity?: number;
}) {
  const colors = useColors();

  return (
    <View
      style={[
        styles.sideContainer,
        {
          width,
          opacity,
          left: side === "left" ? 0 : undefined,
          right: side === "right" ? 0 : undefined,
        },
      ]}
      pointerEvents="none"
    >
      {Array.from({ length: 16 }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.sideBar,
            {
              backgroundColor: colors.primary,
              width: width * (0.3 + Math.sin(i * 0.7) * 0.35 + 0.35),
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    overflow: "hidden",
  },
  waveRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 2,
    flex: 1,
  },
  bar: {
    width: 3,
    borderRadius: 1.5,
  },
  sideContainer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  sideBar: {
    height: 3,
    borderRadius: 1.5,
  },
});
