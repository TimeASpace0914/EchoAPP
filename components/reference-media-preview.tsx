import { useCallback, useEffect } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { VideoView, useVideoPlayer } from "expo-video";
import * as Haptics from "expo-haptics";

import { IconSymbol } from "@/components/ui/icon-symbol";

type PreviewColors = {
  background: string;
  border: string;
  foreground: string;
  muted: string;
  primary: string;
};

type ReferenceMediaPreviewProps = {
  uri: string;
  isVideo: boolean;
  colors: PreviewColors;
};

function formatSeconds(seconds: number) {
  const wholeSeconds = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(wholeSeconds / 60)}:${(wholeSeconds % 60).toString().padStart(2, "0")}`;
}

function AudioPreview({ uri, colors }: Omit<ReferenceMediaPreviewProps, "isVideo">) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const duration = status.duration || 0;
  const currentTime = status.currentTime || 0;

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  const togglePlay = useCallback(() => {
    try {
      if (status.playing) {
        player.pause();
      } else {
        if (duration > 0 && currentTime >= duration - 0.4) player.seekTo(0);
        player.play();
        if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch {
      // Keep the picker flow available even when a device cannot preview a source codec.
    }
  }, [currentTime, duration, player, status.playing]);

  return (
    <View style={[styles.audioPreview, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <TouchableOpacity onPress={togglePlay} activeOpacity={0.78} style={[styles.playButton, { backgroundColor: colors.primary }]}>
        <IconSymbol name={status.playing ? "pause.fill" : "play.fill"} size={21} color={colors.background} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={[styles.previewTitle, { color: colors.foreground }]}>{status.playing ? "正在試聽這段音檔" : "點擊即可試聽這段音檔"}</Text>
        <Text style={[styles.previewMeta, { color: colors.muted }]}>{formatSeconds(currentTime)} / {duration > 0 ? formatSeconds(duration) : "載入中"}</Text>
      </View>
      <IconSymbol name="waveform" size={22} color={colors.muted} />
    </View>
  );
}

function VideoPreview({ uri, colors }: Omit<ReferenceMediaPreviewProps, "isVideo">) {
  const player = useVideoPlayer(uri, (videoPlayer) => {
    videoPlayer.muted = false;
  });

  return (
    <View style={[styles.videoPreview, { borderColor: colors.border, backgroundColor: "#171717" }]}>
      <VideoView style={styles.video} player={player} nativeControls contentFit="contain" allowsFullscreen />
      <View style={[styles.videoCaption, { backgroundColor: colors.background }]}>
        <IconSymbol name="waveform" size={16} color={colors.primary} />
        <Text style={[styles.previewMeta, { color: colors.muted, flex: 1 }]}>可播放影片確認內容；生成時系統只會擷取其中的聲音。</Text>
      </View>
    </View>
  );
}

export function ReferenceMediaPreview({ uri, isVideo, colors }: ReferenceMediaPreviewProps) {
  return isVideo ? <VideoPreview uri={uri} colors={colors} /> : <AudioPreview uri={uri} colors={colors} />;
}

const styles = StyleSheet.create({
  audioPreview: { minHeight: 62, borderWidth: 1, borderRadius: 14, padding: 10, flexDirection: "row", alignItems: "center", gap: 11 },
  playButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  previewTitle: { fontSize: 13, fontWeight: "700" },
  previewMeta: { fontSize: 12, lineHeight: 18, marginTop: 2 },
  videoPreview: { overflow: "hidden", borderRadius: 14, borderWidth: 1 },
  video: { width: "100%", height: 180 },
  videoCaption: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8 },
});
