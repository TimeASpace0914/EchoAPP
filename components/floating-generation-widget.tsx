/**
 * 全域懸浮進度小工具
 *
 * 在所有頁面顯示生成進度的浮動 widget，
 * 訂閱 generationStore 狀態，生成中時顯示在畫面底部。
 */

import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { generationStore, type GenerationState } from "@/lib/generation-store";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";

export function FloatingGenerationWidget() {
  const colors = useColors();
  const router = useRouter();
  const [state, setState] = useState<GenerationState>(generationStore.getState());

  useEffect(() => {
    return generationStore.subscribe(setState);
  }, []);

  // 只在生成中或剛完成/失敗時顯示
  if (state.status === "idle") return null;

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}:${sec.toString().padStart(2, "0")}` : `${sec}秒`;
  };

  const handlePress = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (state.status === "completed" && state.resultUri) {
      router.push({
        pathname: "/result" as any,
        params: {
          audioUri: state.resultUri,
          text: state.resultText || "",
          duration: (state.resultDuration || 0).toString(),
          createdAt: (state.resultCreatedAt || 0).toString(),
          entryId: state.entryId || "",
          isRealVoice: state.resultIsRealVoice ? "1" : "0",
        },
      });
      generationStore.reset();
    }
  };

  const handleDismiss = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    generationStore.reset();
  };

  const isCompleted = state.status === "completed";
  const isError = state.status === "error";
  const isGenerating = state.status === "uploading" || state.status === "generating";

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: isCompleted ? colors.success : isError ? colors.error : colors.primary,
          shadowColor: "#000",
        },
      ]}
    >
      <TouchableOpacity onPress={handlePress} style={styles.mainContent} activeOpacity={0.8}>
        {/* 左側圖示 */}
        <View
          style={[
            styles.iconWrap,
            {
              backgroundColor: isCompleted
                ? `${colors.success}20`
                : isError
                ? `${colors.error}20`
                : `${colors.primary}20`,
            },
          ]}
        >
          <IconSymbol
            name={isCompleted ? "checkmark.circle.fill" : isError ? "exclamationmark.triangle" : "waveform"}
            size={20}
            color={isCompleted ? colors.success : isError ? colors.error : colors.primary}
          />
        </View>

        {/* 中間內容 */}
        <View style={styles.contentBody}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
            {isCompleted ? "語音生成完成" : isError ? "生成失敗" : "正在生成語音"}
          </Text>
          {isGenerating ? (
            <View style={styles.progressRow}>
              <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.progressFill,
                    { backgroundColor: colors.primary, width: `${state.progress}%` },
                  ]}
                />
              </View>
              <Text style={[styles.progressText, { color: colors.muted }]}>
                {state.progress}% · {formatElapsed(state.elapsed)}
              </Text>
            </View>
          ) : (
            <Text style={[styles.subtitle, { color: colors.muted }]} numberOfLines={1}>
              {isCompleted ? "點擊查看結果" : state.error?.substring(0, 40)}
            </Text>
          )}
        </View>
      </TouchableOpacity>

      {/* 右側關閉按鈕 */}
      <TouchableOpacity onPress={handleDismiss} style={styles.closeButton} activeOpacity={0.6}>
        <IconSymbol name="xmark" size={16} color={colors.muted} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 90,
    left: 16,
    right: 16,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  mainContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  contentBody: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 12,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  progressText: {
    fontSize: 11,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
    flexShrink: 0,
  },
  closeButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexShrink: 0,
  },
});
