import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  TextInput,
  Modal,
  FlatList,
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
import {
  formatTimestamp,
  formatDuration,
  updateHistoryEntry,
} from "@/lib/voice-service";

export default function ResultScreen() {
  const colors = useColors();
  const params = useLocalSearchParams<{
    audioUri: string;
    text: string;
    duration: string;
    createdAt: string;
    entryId?: string;
    isRealVoice?: string;
  }>();
  const isRealVoice = params.isRealVoice === "1";

  const [isPlaying, setIsPlaying] = useState(false);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [showTitleEdit, setShowTitleEdit] = useState(false);
  const [titleInput, setTitleInput] = useState("");
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

  const handleSaveTitle = useCallback(async () => {
    const trimmed = titleInput.trim();
    if (!trimmed) {
      Alert.alert("提醒", "名稱不可為空");
      return;
    }
    setTitle(trimmed);
    setShowTitleEdit(false);
    if (params.entryId) {
      await updateHistoryEntry(params.entryId, { title: trimmed });
    }
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [titleInput, params.entryId]);

  const handleAddTag = useCallback(async () => {
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    if (tags.includes(trimmed)) {
      Alert.alert("提醒", "此標籤已存在");
      return;
    }
    if (tags.length >= 5) {
      Alert.alert("提醒", "最多可添加 5 個標籤");
      return;
    }
    const newTags = [...tags, trimmed];
    setTags(newTags);
    setTagInput("");
    setShowTagInput(false);
    if (params.entryId) {
      await updateHistoryEntry(params.entryId, { tags: newTags });
    }
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [tagInput, tags, params.entryId]);

  const handleRemoveTag = useCallback(async (tag: string) => {
    const newTags = tags.filter((t) => t !== tag);
    setTags(newTags);
    if (params.entryId) {
      await updateHistoryEntry(params.entryId, { tags: newTags });
    }
  }, [tags, params.entryId]);

  const duration = Number(params.duration) || 0;
  const createdAt = Number(params.createdAt) || Date.now();

  const renderTag = ({ item }: { item: string }) => (
    <View style={[styles.tagChip, { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}40` }]}>
      <Text style={[styles.tagText, { color: colors.primary }]}>{item}</Text>
      <TouchableOpacity onPress={() => handleRemoveTag(item)} style={styles.tagRemove}>
        <IconSymbol name="xmark" size={12} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );

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

      <FlatList
        data={[]}
        renderItem={() => null}
        ListHeaderComponent={
          <View style={styles.content}>
            {/* 語音來源標示 */}
            <View style={[styles.sourceBadge, { backgroundColor: isRealVoice ? `${colors.success}15` : `${colors.warning}15` }]}>
              <View style={[styles.sourceDot, { backgroundColor: isRealVoice ? colors.success : colors.warning }]} />
              <Text style={[styles.sourceText, { color: isRealVoice ? colors.success : colors.warning }]}>
                {isRealVoice ? "Voicebox AI 語音克隆" : "模擬語音（Voicebox 未連線）"}
              </Text>
            </View>

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

            {/* 命名與標籤卡片 */}
            <View style={[styles.nameTagCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
              {/* 命名區 */}
              <TouchableOpacity
                onPress={() => {
                  setTitleInput(title);
                  setShowTitleEdit(true);
                }}
                style={styles.nameRow}
              >
                <View style={styles.nameLeft}>
                  <IconSymbol name="pencil" size={18} color={colors.primary} />
                  <View>
                    <Text style={[styles.nameLabel, { color: colors.muted }]}>語音名稱</Text>
                    <Text style={[styles.nameValue, { color: title ? colors.foreground : colors.muted }]}>
                      {title || "點擊為這段語音命名..."}
                    </Text>
                  </View>
                </View>
                <IconSymbol name="chevron.right" size={16} color={colors.muted} />
              </TouchableOpacity>

              <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />

              {/* 標籤區 */}
              <View style={styles.tagSection}>
                <View style={styles.tagHeader}>
                  <IconSymbol name="tag" size={18} color={colors.primary} />
                  <Text style={[styles.tagTitle, { color: colors.foreground }]}>自訂標籤</Text>
                </View>
                {tags.length > 0 && (
                  <FlatList
                    data={tags}
                    renderItem={renderTag}
                    keyExtractor={(item) => item}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.tagList}
                    contentContainerStyle={{ gap: 8 }}
                  />
                )}
                <TouchableOpacity
                  onPress={() => setShowTagInput(true)}
                  style={[styles.addTagButton, { borderColor: colors.border }]}
                >
                  <IconSymbol name="chevron.left.forwardslash.chevron.right" size={14} color={colors.muted} />
                  <Text style={[styles.addTagText, { color: colors.muted }]}>
                    {tags.length > 0 ? "添加更多標籤" : "添加標籤方便日後尋找"}
                  </Text>
                </TouchableOpacity>
              </View>
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
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      />

      {/* 命名編輯 Modal */}
      <Modal
        visible={showTitleEdit}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTitleEdit(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>為這段語音命名</Text>
            <Text style={[styles.modalHint, { color: colors.muted }]}>
              取一個有意義的名稱，方便日後在回憶庫中找到它
            </Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: "#F5F5F5", borderColor: colors.border, color: colors.foreground }]}
              value={titleInput}
              onChangeText={setTitleInput}
              placeholder="例如：爸爸的生日祝福"
              placeholderTextColor="#BBBBBB"
              maxLength={30}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveTitle}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => setShowTitleEdit(false)}
                style={[styles.modalButton, { borderColor: colors.border }]}
              >
                <Text style={[styles.modalButtonText, { color: colors.muted }]}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveTitle}
                style={[styles.modalButton, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              >
                <Text style={styles.modalButtonTextActive}>儲存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 標籤輸入 Modal */}
      <Modal
        visible={showTagInput}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTagInput(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>添加標籤</Text>
            <Text style={[styles.modalHint, { color: colors.muted }]}>
              用標籤分類，例如：生日、節日、叮嚀
            </Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: "#F5F5F5", borderColor: colors.border, color: colors.foreground }]}
              value={tagInput}
              onChangeText={setTagInput}
              placeholder="輸入標籤名稱"
              placeholderTextColor="#BBBBBB"
              maxLength={10}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleAddTag}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => setShowTagInput(false)}
                style={[styles.modalButton, { borderColor: colors.border }]}
              >
                <Text style={[styles.modalButtonText, { color: colors.muted }]}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAddTag}
                style={[styles.modalButton, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              >
                <Text style={styles.modalButtonTextActive}>添加</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
  },
  content: {
    alignItems: "center",
    gap: 24,
  },
  sourceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  sourceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sourceText: {
    fontSize: 13,
    fontWeight: "500",
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
  nameTagCard: {
    width: "100%",
    borderRadius: 20,
    padding: 20,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  nameLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  nameLabel: {
    fontSize: 12,
    marginBottom: 2,
  },
  nameValue: {
    fontSize: 15,
    fontWeight: "600",
  },
  cardDivider: {
    height: 0.5,
    marginVertical: 14,
  },
  tagSection: {
    gap: 10,
  },
  tagHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tagTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  tagList: {
    paddingVertical: 4,
  },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  tagText: {
    fontSize: 13,
    fontWeight: "500",
  },
  tagRemove: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  addTagButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  addTagText: {
    fontSize: 13,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  modalCard: {
    width: "100%",
    borderRadius: 24,
    padding: 24,
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  modalHint: {
    fontSize: 13,
    marginBottom: 4,
  },
  modalInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
  },
  modalButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
  modalButtonTextActive: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
});
