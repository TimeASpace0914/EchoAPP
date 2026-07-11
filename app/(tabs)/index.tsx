import { useState, useCallback, useEffect } from "react";
import {
  ScrollView,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";

import { ScreenContainer } from "@/components/screen-container";
import { Logo } from "@/components/logo";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Waveform } from "@/components/waveform";
import { useColors } from "@/hooks/use-colors";
import {
  generateSpeech,
  saveHistoryEntry,
  validateAudioFile,
  checkVoiceboxStatus,
  ALL_SUPPORTED_EXTENSIONS,
  SUPPORTED_AUDIO_EXTENSIONS,
  type HistoryEntry,
} from "@/lib/voice-service";

const MAX_TEXT_LENGTH = 500;

export default function HomeScreen() {
  const colors = useColors();
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [audioName, setAudioName] = useState<string>("");
  const [audioMimeType, setAudioMimeType] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationWarning, setValidationWarning] = useState<string | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [genStage, setGenStage] = useState("");
  const [voiceboxOnline, setVoiceboxOnline] = useState<boolean | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  // 檢查 Voicebox 連線狀態（非阻塞，不影響 APP 啟動）
  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) setVoiceboxOnline(false);
    }, 5000); // 最多等 5 秒，超時直接設為離線
    checkVoiceboxStatus().then((status) => {
      if (!cancelled) {
        clearTimeout(timeout);
        setVoiceboxOnline(status.online);
      }
    }).catch(() => {
      if (!cancelled) {
        clearTimeout(timeout);
        setVoiceboxOnline(false);
      }
    });
    return () => { cancelled = true; clearTimeout(timeout); };
  }, []);

  const previewPlayer = useAudioPlayer(audioUri ? { uri: audioUri } : null);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  const togglePreview = useCallback(() => {
    try {
      if (isPreviewPlaying) {
        previewPlayer.pause();
        setIsPreviewPlaying(false);
      } else {
        previewPlayer.play();
        setIsPreviewPlaying(true);
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        setTimeout(() => setIsPreviewPlaying(false), 10000);
      }
    } catch {
      Alert.alert("播放錯誤", "無法播放此音檔，請確認檔案格式正確");
    }
  }, [isPreviewPlaying, previewPlayer]);

  const pickAudio = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "audio/*",
          "audio/wav",
          "audio/mpeg",
          "audio/mp3",
          "audio/m4a",
          "audio/aac",
          "audio/flac",
          "audio/ogg",
        ],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setValidationWarning(null);
        setIsValidating(true);
        setIsPreviewPlaying(false);

        const validation = await validateAudioFile(asset.uri, asset.name || "");

        setIsValidating(false);

        if (!validation.valid) {
          Alert.alert(
            "音檔提醒",
            validation.error || "此音檔不符合要求，請重新選擇。",
            [
              { text: "重新選擇", onPress: () => pickAudio() },
              {
                text: "仍要使用",
                  onPress: () => {
                    setAudioUri(asset.uri);
                    setAudioName(asset.name || "未命名音檔");
                    setAudioMimeType(asset.mimeType || null);
                    setValidationWarning(validation.error || null);
                  },
              },
            ]
          );
          return;
        }

        setAudioUri(asset.uri);
        setAudioName(asset.name || "未命名音檔");
        setAudioMimeType(asset.mimeType || null);

        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }
    } catch {
      Alert.alert("錯誤", "無法選擇音檔，請重試");
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!audioUri) {
      Alert.alert("提醒", "請先上傳親友生前的音檔");
      return;
    }
    if (!text.trim()) {
      Alert.alert("提醒", "請輸入想讓親友說的話");
      return;
    }

    setIsGenerating(true);
    setGenProgress(0);
    setGenStage("準備中...");
    setGenError(null);

    try {
      const result = await generateSpeech({
        referenceAudioUri: audioUri,
        text: text.trim(),
        audioMimeType: audioMimeType || undefined,
        audioFileName: audioName || undefined,
        onProgress: (progress, stage) => {
          setGenProgress(progress);
          setGenStage(stage);
        },
      });

      const entry: HistoryEntry = {
        id: `echo_${result.createdAt}`,
        text: text.trim(),
        audioUri: result.audioUri,
        referenceAudioName: audioName,
        duration: result.duration,
        createdAt: result.createdAt,
        isRealVoice: result.isRealVoice,
      };
      await saveHistoryEntry(entry);

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      router.push({
        pathname: "/result" as any,
        params: {
          audioUri: result.audioUri,
          text: text.trim(),
          duration: result.duration.toString(),
          createdAt: result.createdAt.toString(),
          entryId: entry.id,
          isRealVoice: result.isRealVoice ? "1" : "0",
        },
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "語音生成過程中發生未知錯誤";
      setGenError(errorMsg);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setIsGenerating(false);
      // 保留進度條和錯誤訊息讓用戶看到，不立即清除
    }
  }, [audioUri, text, audioName, audioMimeType]);

  const formatHint = `支援 ${SUPPORTED_AUDIO_EXTENSIONS.join("、")} 格式`;

  return (
    <ScreenContainer className="flex-1">
      {/* 導覽列 */}
      <View style={[styles.navBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Logo height={36} />
        <View style={{ flex: 1 }} />
        {voiceboxOnline !== null && (
          <View style={[styles.statusDot, { backgroundColor: voiceboxOnline ? "#4CAF50" : "#FF9800" }]}>
            <Text style={styles.statusDotText}>
              {voiceboxOnline ? "AI 已連線" : "伺服器離線"}
            </Text>
          </View>
        )}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* 上傳卡片 */}
        <View
          style={[
            styles.uploadCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.primary,
              shadowColor: "#000",
            },
          ]}
        >
          {audioUri ? (
            <View style={styles.uploadedContent}>
              <View style={[styles.audioFileIcon, { backgroundColor: `${colors.primary}20` }]}>
                <IconSymbol name="waveform" size={32} color={colors.primary} />
              </View>
              <Text style={[styles.audioFileName, { color: colors.foreground }]} numberOfLines={1}>
                {audioName}
              </Text>
              <Text style={[styles.audioFileHint, { color: colors.muted }]}>
                音檔已就緒
              </Text>

              {validationWarning && (
                <View style={[styles.warningBox, { backgroundColor: `${colors.warning}15` }]}>
                  <IconSymbol name="exclamationmark.triangle" size={14} color={colors.warning} />
                  <Text style={[styles.warningText, { color: colors.warning }]}>
                    {validationWarning}
                  </Text>
                </View>
              )}

              {/* 預覽播放區 */}
              <View style={[styles.previewBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <TouchableOpacity
                  onPress={togglePreview}
                  style={[styles.previewPlayButton, { backgroundColor: colors.primary }]}
                >
                  <IconSymbol
                    name={isPreviewPlaying ? "pause.fill" : "play.fill"}
                    size={20}
                    color="#FFFFFF"
                  />
                </TouchableOpacity>
                <View style={styles.previewInfo}>
                  <Text style={[styles.previewLabel, { color: colors.foreground }]}>
                    {isPreviewPlaying ? "試聽中..." : "試聽音檔"}
                  </Text>
                  <Text style={[styles.previewHint, { color: colors.muted }]}>
                    確認音檔內容無誤後再生成
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={pickAudio}
                style={[
                  styles.changeButton,
                  { borderColor: colors.border },
                ]}
              >
                <Text style={[styles.changeButtonText, { color: colors.muted }]}>
                  更換音檔
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.uploadPlaceholder}>
              <View style={[styles.uploadIconWrap, { backgroundColor: `${colors.primary}15` }]}>
                <IconSymbol name="cloud.fill" size={48} color={colors.primary} />
              </View>
              <Text style={[styles.uploadTitle, { color: colors.foreground }]}>
                上傳親友音檔
              </Text>
              <Text style={[styles.uploadSubtitle, { color: colors.muted }]}>
                上傳親友生前的聲音，讓 AI 學習他的聲音特徵
              </Text>

              <View style={[styles.formatHintBox, { backgroundColor: `${colors.muted}10`, borderColor: colors.border }]}>
                <View style={styles.formatHintRow}>
                  <IconSymbol name="info.circle" size={14} color={colors.muted} />
                  <Text style={[styles.formatHintText, { color: colors.muted }]}>
                    {formatHint}
                  </Text>
                </View>
                <Text style={[styles.formatHintSub, { color: colors.muted }]}>
                  建議音檔長度至少 3 秒以上
                </Text>
              </View>

              <TouchableOpacity
                onPress={pickAudio}
                disabled={isValidating}
                style={[
                  styles.selectButton,
                  { backgroundColor: colors.primary },
                  isValidating && { opacity: 0.6 },
                ]}
              >
                {isValidating ? (
                  <View style={styles.generatingContent}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.selectButtonText}>驗證中...</Text>
                  </View>
                ) : (
                  <Text style={styles.selectButtonText}>選擇音檔</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* 文字輸入卡片 */}
        <View
          style={[
            styles.textCard,
            {
              backgroundColor: colors.surface,
              shadowColor: "#000",
            },
          ]}
        >
          <Text style={[styles.textCardTitle, { color: colors.foreground }]}>
            想讓親友對您說什麼？
          </Text>
          <Text style={[styles.textCardHint, { color: colors.muted }]}>
            輸入內容，親友的聲音將為您說出這段話
          </Text>
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
            value={text}
            onChangeText={(val) => setText(val.slice(0, MAX_TEXT_LENGTH))}
            placeholder="例如：最近在幹嘛呀？有沒有好好吃飯！"
            placeholderTextColor={colors.muted}
            multiline
            maxLength={MAX_TEXT_LENGTH}
            returnKeyType="done"
            textAlignVertical="top"
          />
          <Text style={[styles.charCounter, { color: colors.muted }]}>
            {text.length}/{MAX_TEXT_LENGTH}
          </Text>
        </View>

        {/* 生成按鈕 / 生成進度 / 錯誤提示 */}
        {isGenerating ? (
          <View style={[styles.generatingCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
            {/* 音波脈動動畫 */}
            <View style={styles.waveContainer}>
              <Waveform active={true} color={colors.primary} height={80} barCount={32} />
            </View>

            <View style={styles.generatingHeader}>
              <View style={styles.generatingInfo}>
                <Text style={[styles.generatingTitle, { color: colors.foreground }]}>
                  正在生成語音
                </Text>
                <Text style={[styles.generatingStage, { color: colors.muted }]}>
                  {genStage}
                </Text>
              </View>
            </View>

            {/* 進度條 */}
            <View style={[styles.genProgressBar, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.genProgressFill,
                  { backgroundColor: colors.primary, width: `${genProgress}%` },
                ]}
              />
            </View>
            <Text style={[styles.genProgressText, { color: colors.muted }]}>
              {genProgress}%
            </Text>
          </View>
        ) : genError ? (
          <View style={[styles.errorCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
            <View style={[styles.errorIconWrap, { backgroundColor: `${colors.error}15` }]}>
              <IconSymbol name="exclamationmark.triangle" size={32} color={colors.error} />
            </View>
            <Text style={[styles.errorTitle, { color: colors.error }]}>
              生成失敗
            </Text>
            <Text style={[styles.errorMessage, { color: colors.muted }]}>
              {genError}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setGenError(null);
                setGenProgress(0);
                setGenStage("");
                handleGenerate();
              }}
              style={[styles.retryButton, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.retryButtonText}>重試</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setGenError(null);
                setGenProgress(0);
                setGenStage("");
              }}
              style={[styles.dismissButton, { borderColor: colors.border }]}
            >
              <Text style={[styles.dismissButtonText, { color: colors.muted }]}>關閉</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={handleGenerate}
            style={[
              styles.generateButton,
              {
                backgroundColor: colors.primary,
                shadowColor: colors.primary,
              },
            ]}
          >
            <Text style={styles.generateButtonText}>生成語音</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
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
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 16,
  },
  uploadCard: {
    borderRadius: 24,
    borderWidth: 2,
    borderStyle: "dashed",
    padding: 32,
    alignItems: "center",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  uploadPlaceholder: {
    alignItems: "center",
    gap: 12,
  },
  uploadIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  uploadTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  uploadSubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  formatHintBox: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
    width: "100%",
  },
  formatHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  formatHintText: {
    fontSize: 12,
    fontWeight: "500",
  },
  formatHintSub: {
    fontSize: 11,
    textAlign: "center",
  },
  selectButton: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 20,
    marginTop: 8,
  },
  selectButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  uploadedContent: {
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  audioFileIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  audioFileName: {
    fontSize: 16,
    fontWeight: "600",
    maxWidth: 240,
  },
  audioFileHint: {
    fontSize: 13,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    maxWidth: 280,
  },
  warningText: {
    fontSize: 11,
    flexShrink: 1,
  },
  previewBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    width: "100%",
    marginTop: 4,
  },
  previewPlayButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  previewInfo: {
    flex: 1,
    gap: 2,
  },
  previewLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  previewHint: {
    fontSize: 12,
  },
  changeButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 4,
  },
  changeButtonText: {
    fontSize: 14,
  },
  textCard: {
    borderRadius: 24,
    padding: 20,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  textCardTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  textCardHint: {
    fontSize: 12,
    marginBottom: 16,
  },
  textInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    minHeight: 120,
    lineHeight: 22,
  },
  charCounter: {
    fontSize: 12,
    textAlign: "right",
    marginTop: 8,
  },
  generateButton: {
    borderRadius: 20,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  generateButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  generatingContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  generatingCard: {
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    gap: 20,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  waveContainer: {
    width: "100%",
    alignItems: "center",
    paddingVertical: 8,
  },
  generatingHeader: {
    alignItems: "center",
  },
  generatingInfo: {
    alignItems: "center",
    gap: 4,
  },
  generatingTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  generatingStage: {
    fontSize: 13,
  },
  genProgressBar: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  genProgressFill: {
    height: "100%",
    borderRadius: 3,
  },
  genProgressText: {
    fontSize: 13,
    fontWeight: "600",
  },
  statusDot: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDotText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
  },
  // 錯誤卡片樣式
  errorCard: {
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    gap: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  errorIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  errorMessage: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  retryButton: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 16,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  dismissButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  dismissButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
});
