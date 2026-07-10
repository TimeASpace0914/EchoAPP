import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Waveform } from "@/components/waveform";
import { useColors } from "@/hooks/use-colors";
import { formatTimestamp, formatDuration } from "@/lib/voice-service";

export default function ResultScreen() {
  const colors = useColors();
  const params = useLocalSearchParams<{
    audioUri: string;
    text: string;
    duration: string;
    createdAt: string;
  }>();

  const [isPlaying, setIsPlaying] = useState(false);
  const player = useAudioPlayer({ uri: params.audioUri });

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  const togglePlay = useCallback(async () => {
    try {
      if (isPlaying) {
        player.pause();
        setIsPlaying(false);
      } else {
        player.play();
        setIsPlaying(true);
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }
    } catch (err) {
      Alert.alert("播放錯誤", "無法播放此音檔");
    }
  }, [isPlaying, player]);

  const handleDownload = useCallback(async () => {
      try {
      const fileName = `迴響_${formatTimestamp(Number(params.createdAt)).replace(/[^\d]/g, "")}.wav`;
      const downloadDir = `${FileSystem.documentDirectory}downloads/`;
      const info = await FileSystem.getInfoAsync(downloadDir);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(downloadDir, { intermediates: true });
      }
      const destPath = `${downloadDir}${fileName}`;
      await FileSystem.copyAsync({ from: params.audioUri, to: destPath });

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Alert.alert("下載完成", `音檔已儲存至：${destPath}`);
    } catch (err) {
      Alert.alert("下載失敗", "無法下載此音檔");
    }
  }, [params.audioUri, params.createdAt]);

  const handleShare = useCallback(async () => {
    try {
      if (Platform.OS === "web") {
        if (!(await Sharing.isAvailableAsync())) {
          Alert.alert("提醒", "此平台不支援分享功能");
          return;
        }
      }
      await Sharing.shareAsync(params.audioUri, {
        dialogTitle: "分享親友的聲音",
        mimeType: "audio/wav",
        UTI: "com.microsoft.waveform",
      });
    } catch (err) {
      Alert.alert("分享失敗", "無法分享此音檔");
    }
  }, [params.audioUri]);

  const handleRegenerate = useCallback(() => {
    router.back();
  }, []);

  const duration = Number(params.duration) || 0;
  const createdAt = Number(params.createdAt) || Date.now();

  return (
    <ScreenContainer className="flex-1" edges={["top", "bottom", "left", "right"]}>
      {/* 導覽列 */}
      <View style={[styles.navBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.navButton}
        >
          <IconSymbol name="chevron.left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.foreground }]}>生成完成</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.navButton}
        >
          <IconSymbol name="xmark" size={24} color={colors.muted} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* 音波視覺化卡片 */}
        <View style={[styles.waveCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
          <Waveform active={isPlaying} color={colors.primary} height={100} />
          <Text style={[styles.generatedText, { color: colors.foreground }]}>
            {params.text}
          </Text>
        </View>

        {/* 進度條 */}
        <View style={styles.progressSection}>
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, { backgroundColor: colors.primary, width: isPlaying ? "60%" : "0%" }]} />
          </View>
          <View style={styles.timeRow}>
            <Text style={[styles.timeText, { color: colors.muted }]}>0:00</Text>
            <Text style={[styles.timeText, { color: colors.muted }]}>
              {formatDuration(duration)}
            </Text>
          </View>
        </View>

        {/* 播放按鈕 */}
        <TouchableOpacity
          onPress={togglePlay}
          style={[styles.playButton, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
        >
          <IconSymbol
            name={isPlaying ? "pause.fill" : "play.fill"}
            size={36}
            color="#FFFFFF"
          />
        </TouchableOpacity>

        {/* 操作按鈕列 */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            onPress={handleDownload}
            style={[styles.actionButton, { backgroundColor: colors.surface, shadowColor: "#000" }]}
          >
            <IconSymbol name="arrow.down.to.line" size={24} color={colors.foreground} />
            <Text style={[styles.actionLabel, { color: colors.muted }]}>下載</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleShare}
            style={[styles.actionButton, { backgroundColor: colors.surface, shadowColor: "#000" }]}
          >
            <IconSymbol name="square.and.arrow.up" size={24} color={colors.foreground} />
            <Text style={[styles.actionLabel, { color: colors.muted }]}>分享</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleRegenerate}
            style={[styles.actionButton, { backgroundColor: colors.surface, shadowColor: "#000" }]}
          >
            <IconSymbol name="arrow.clockwise" size={24} color={colors.foreground} />
            <Text style={[styles.actionLabel, { color: colors.muted }]}>重新生成</Text>
          </TouchableOpacity>
        </View>

        {/* 資訊卡 */}
        <View style={[styles.infoCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.muted }]}>生成時間</Text>
            <Text style={[styles.infoValue, { color: colors.foreground }]}>
              {formatTimestamp(createdAt)}
            </Text>
          </View>
          <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.muted }]}>音檔時長</Text>
            <Text style={[styles.infoValue, { color: colors.foreground }]}>
              {formatDuration(duration)}
            </Text>
          </View>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  navButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  navTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
    alignItems: "center",
    gap: 24,
  },
  waveCard: {
    width: "100%",
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    gap: 20,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  generatedText: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
    fontWeight: "500",
  },
  progressSection: {
    width: "100%",
    gap: 8,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  timeText: {
    fontSize: 13,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 5,
  },
  actionRow: {
    flexDirection: "row",
    gap: 20,
  },
  actionButton: {
    width: 76,
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: "center",
    gap: 8,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  infoCard: {
    width: "100%",
    borderRadius: 20,
    padding: 20,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 14,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  infoDivider: {
    height: 0.5,
    marginVertical: 8,
  },
});
