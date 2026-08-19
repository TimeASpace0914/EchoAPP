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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";

import { ScreenContainer } from "@/components/screen-container";
import { Logo } from "@/components/logo";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Waveform } from "@/components/waveform";
import { WaveDecoration } from "@/components/wave-decoration";
import { useColors } from "@/hooks/use-colors";
import {
  generateSpeech,
  saveHistoryEntry,
  validateAudioFile,
  checkVoiceboxStatus,
  getVoiceboxProfiles,
  ALL_SUPPORTED_EXTENSIONS,
  SUPPORTED_AUDIO_EXTENSIONS,
  type HistoryEntry,
} from "@/lib/voice-service";
import { generationStore, type GenerationState } from "@/lib/generation-store";
import { stripPronunciationMarkers } from "@/lib/pinyin-helpers";
import {
  approveVoiceProfile,
  getManagedVoiceProfiles,
  registerCandidateVoiceProfile,
  recordVoiceProfilePreview,
  type ManagedVoiceProfile,
} from "@/lib/voice-profile-store";
import Slider from "@react-native-community/slider";

const MAX_TEXT_LENGTH = 500;

/** 情緒選項（對應 Voicebox instruct 中的情緒描述） */
const EMOTION_OPTIONS = [
  { label: "溫柔", value: "溫柔深情，聲線柔軟，句尾微微放慢，讓關懷清楚可聽見" },
  { label: "開心", value: "開心喜悅，聲音明亮有笑意，節奏輕快自然" },
  { label: "平靜", value: "平靜安穩，呼吸穩定，語速從容，情緒不起伏過大" },
  { label: "關心", value: "關心牽掛，語氣真摯，重點字清楚而帶有體貼感" },
  { label: "緩慢", value: "緩慢柔和，明顯放慢節奏，每個字咬字清楚" },
  { label: "慈祥", value: "慈祥溫暖，如長輩親切叮嚀，聲線厚實安定" },
  { label: "思念", value: "思念感傷，情緒含蓄低迴，句尾帶有不捨但不哭腔" },
  { label: "鼓勵", value: "鼓勵振奮，語氣堅定有力量，讓人感到被支持" },
  { label: "激昂", value: "激昂熱血，音量與起伏明顯，節奏有推進感" },
  { label: "生氣", value: "生氣憤怒，語氣壓低且有力度，咬字短促明確" },
] as const;

const PROFILE_PREVIEW_SCRIPTS = [
  { key: "daily", label: "第 1 段・日常", text: "今天過得好嗎？記得好好吃飯，也要早一點休息。" },
  { key: "care", label: "第 2 段・關懷", text: "看到你平安、把自己照顧好，我就很放心。" },
  { key: "name", label: "第 3 段・專名", text: "請把常用稱呼、人名或需要特別確認讀音的詞填在這裡。" },
] as const;

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
  const [personality, setPersonality] = useState("");
  const [voiceDescription, setVoiceDescription] = useState("");
  const [referenceText, setReferenceText] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [genElapsed, setGenElapsed] = useState(0);
  const [speed, setSpeed] = useState(1.0);
  const [selectedEmotion, setSelectedEmotion] = useState<string | null>(null);
  const [genStoreState, setGenStoreState] = useState<GenerationState>(generationStore.getState());
  const [voiceProfiles, setVoiceProfiles] = useState<ManagedVoiceProfile[]>([]);
  const [selectedVoiceProfileId, setSelectedVoiceProfileId] = useState<string | null>(null);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [isSingleSpeakerConfirmed, setIsSingleSpeakerConfirmed] = useState(false);
  const [activePreviewKey, setActivePreviewKey] = useState<string | null>(null);

  // 首頁淡入過場動畫
  const contentOpacity = useSharedValue(0);
  const contentTranslateY = useSharedValue(12);

  useEffect(() => {
    contentOpacity.value = withTiming(1, { duration: 600, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
    contentTranslateY.value = withTiming(0, { duration: 600, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
  }, []);

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslateY.value }],
  }));

  // 訂閱 generationStore 狀態變化
  useEffect(() => {
    return generationStore.subscribe(setGenStoreState);
  }, []);

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

  const loadVoiceProfiles = useCallback(async () => {
    setIsLoadingProfiles(true);
    setProfileLoadError(null);
    try {
      const remoteProfiles = await getVoiceboxProfiles();
      const managedProfiles = await getManagedVoiceProfiles(remoteProfiles);
      setVoiceProfiles(managedProfiles);
    } catch (error) {
      setProfileLoadError(error instanceof Error ? error.message : "無法載入聲音身份");
    } finally {
      setIsLoadingProfiles(false);
    }
  }, []);

  useEffect(() => {
    if (voiceboxOnline) {
      void loadVoiceProfiles();
    }
  }, [voiceboxOnline, loadVoiceProfiles]);

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

          "audio/flac",
          "audio/ogg",
        ],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        // 新音檔會建立候選版本；不會覆蓋使用者目前選擇的已核可 Profile。
        setSelectedVoiceProfileId(null);
        setIsSingleSpeakerConfirmed(false);
        setValidationWarning(null);
        setIsValidating(true);
        setIsPreviewPlaying(false);

        const validation = await validateAudioFile(asset.uri, asset.name || "");

        setIsValidating(false);

        if (!validation.valid) {
          Alert.alert(
            "音檔提醒",
            validation.error || "此音檔不符合要求，請重新選擇。",
            [{ text: "重新選擇", onPress: () => pickAudio() }],
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

  const selectedVoiceProfile = voiceProfiles.find((profile) => profile.id === selectedVoiceProfileId) ?? null;

  const handleApproveProfile = useCallback(async (profile: ManagedVoiceProfile) => {
    if (profile.previewCount < PROFILE_PREVIEW_SCRIPTS.length) {
      Alert.alert("尚未完成預覽", `請先完成 ${PROFILE_PREVIEW_SCRIPTS.length} 段固定預覽，確認文字、音色與情緒後再核可。`);
      return;
    }
    try {
      await approveVoiceProfile(profile.id, profile.name);
      await loadVoiceProfiles();
      setSelectedVoiceProfileId(profile.id);
      setAudioUri(null);
      setAudioName("");
      setAudioMimeType(null);
      setValidationWarning(null);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      Alert.alert("無法核可聲音身份", "請確認裝置儲存空間後再試一次。");
    }
  }, [loadVoiceProfiles]);

  const handleGenerate = useCallback(async () => {
    if (!audioUri && !selectedVoiceProfile) {
      Alert.alert("提醒", "請先上傳親友生前的音檔，或選擇已核可的聲音身份");
      return;
    }
    if (audioUri && !selectedVoiceProfile && !isSingleSpeakerConfirmed) {
      Alert.alert("請先確認音檔內容", "建立新的聲音身份前，請確認這段音檔主要只有一位親友說話；若有多人對話，請先裁切出目標親友的單人片段。");
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
    setGenElapsed(0);
    generationStore.startGeneration();

    // 注音標記只用來約束模型發音；歷史、結果頁與客戶可見文字皆使用乾淨原文。
    const spokenText = stripPronunciationMarkers(text.trim());

    try {
      // 一次只傳入一個主情緒，讓模型有明確的表達方向。
      const primaryEmotion = selectedEmotion || undefined;
      const result = await generateSpeech({
        referenceAudioUri: audioUri || undefined,
        voiceProfileId: selectedVoiceProfile?.id,
        text: text.trim(),
        audioMimeType: audioMimeType || undefined,
        audioFileName: audioName || undefined,
        language: "zh",
        instruct: personality.trim() || undefined,
        description: voiceDescription.trim() || undefined,
        referenceText: referenceText.trim() || undefined,
        speed: speed !== 1.0 ? speed : undefined,
        emotion: primaryEmotion,
        onProgress: (progress, stage) => {
          setGenProgress(progress);
          setGenStage(stage);
          generationStore.updateProgress(progress, stage);
        },
      });

      // 新音檔只會留下候選 Profile；已核可 Profile 不會被新樣本覆蓋。
      if (!selectedVoiceProfile && result.profileId) {
        await registerCandidateVoiceProfile({
          profileId: result.profileId,
          name: voiceDescription.trim() || `候選聲音 ${audioName || "未命名"}`,
          sourceAudioName: audioName || undefined,
          referenceText: referenceText.trim() || undefined,
        });
        void loadVoiceProfiles();
      }

      const activePreview = PROFILE_PREVIEW_SCRIPTS.find((preview) => preview.key === activePreviewKey);
      if (
        selectedVoiceProfile?.status === "candidate" &&
        activePreview &&
        text.trim() === activePreview.text
      ) {
        await recordVoiceProfilePreview(result.profileId, selectedVoiceProfile.name, activePreview.key);
        setActivePreviewKey(null);
        void loadVoiceProfiles();
      }

      const entry: HistoryEntry = {
        id: `echo_${result.createdAt}`,
        text: spokenText,
        audioUri: result.audioUri,
        referenceAudioName: selectedVoiceProfile?.name || audioName,
        duration: result.duration,
        createdAt: result.createdAt,
        isRealVoice: result.isRealVoice,
        emotion: primaryEmotion,
        speed: speed !== 1.0 ? speed : undefined,
        profileId: result.profileId,
        voiceProfileName: selectedVoiceProfile?.name || voiceDescription.trim() || audioName,
      };
      await saveHistoryEntry(entry);

      generationStore.completeGeneration({
        audioUri: result.audioUri,
        text: spokenText,
        duration: result.duration,
        createdAt: result.createdAt,
        isRealVoice: result.isRealVoice,
        entryId: entry.id,
      });

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      // 生成完成後自動導航到結果頁
      router.push({
        pathname: "/result" as any,
        params: {
          audioUri: result.audioUri,
          text: spokenText,
          duration: result.duration.toString(),
          createdAt: result.createdAt.toString(),
          entryId: entry.id,
          isRealVoice: result.isRealVoice ? "1" : "0",
        },
      });
      generationStore.reset();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "語音生成過程中發生未知錯誤";
      setGenError(errorMsg);
      generationStore.failGeneration(errorMsg);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setIsGenerating(false);
      // 保留進度條和錯誤訊息讓用戶看到，不立即清除
    }
  }, [audioUri, text, audioName, audioMimeType, personality, voiceDescription, referenceText, speed, selectedEmotion, selectedVoiceProfile, isSingleSpeakerConfirmed, isGenerating, loadVoiceProfiles, activePreviewKey]);

  // 生成計時器
  useEffect(() => {
    if (!isGenerating) return;
    const timer = setInterval(() => {
      setGenElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isGenerating]);

  const formatHint = "支援 MP3、WAV、M4A 等常見音檔格式";

  const EMOTION_PRESETS = [
    "溫柔", "開心", "平靜", "關心", "緩慢", "慈祥", "思念", "鼓勵",
  ];

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}:${sec.toString().padStart(2, "0")}` : `${sec}秒`;
  };

  return (
    <ScreenContainer className="flex-1">
      {/* 導覽列 */}
      <View style={[styles.navBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Logo height={36} />
        <View style={{ flex: 1 }} />
        {voiceboxOnline !== null && (
          <View style={[styles.statusDot, { backgroundColor: voiceboxOnline ? "#4CAF50" : "#FF9800" }]}>
            <Text style={[styles.statusDotText, { color: colors.background }]}>
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
      <Animated.View style={[{ flex: 1 }, contentAnimatedStyle]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* 聲音身份：正式生成應優先重用已核可的最佳 Profile。 */}
        <View style={[styles.voiceIdentityCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
          <View style={styles.voiceIdentityHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.voiceIdentityTitle, { color: colors.foreground }]}>聲音身份</Text>
              <Text style={[styles.voiceIdentityHint, { color: colors.muted }]}>選用已核可聲音可維持音色穩定；新音檔只會建立候選版本</Text>
            </View>
            <TouchableOpacity
              onPress={() => void loadVoiceProfiles()}
              disabled={isLoadingProfiles}
              style={[styles.profileRefreshButton, { borderColor: colors.border }]}
            >
              <Text style={[styles.profileRefreshText, { color: colors.foreground }]}>{isLoadingProfiles ? "載入中" : "更新"}</Text>
            </TouchableOpacity>
          </View>
          {profileLoadError ? (
            <Text style={[styles.profileErrorText, { color: colors.warning }]}>{profileLoadError}</Text>
          ) : voiceProfiles.length === 0 && !isLoadingProfiles ? (
            <Text style={[styles.voiceIdentityHint, { color: colors.muted }]}>尚未載入既有聲音身份；您可先上傳授權音檔建立候選版本。</Text>
          ) : (
            <View style={styles.voiceProfileList}>
              {voiceProfiles.map((profile) => {
                const selected = profile.id === selectedVoiceProfileId;
                const approved = profile.status === "approved";
                const statusText = approved ? "已核可" : profile.status === "candidate" ? "候選" : "未核可";
                return (
                  <View key={profile.id} style={[styles.voiceProfileItem, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? `${colors.primary}10` : colors.background }]}>
                    <TouchableOpacity
                      onPress={() => {
                        const nextProfileId = selected ? null : profile.id;
                        setSelectedVoiceProfileId(nextProfileId);
                        if (nextProfileId) {
                          setAudioUri(null);
                          setAudioName("");
                          setAudioMimeType(null);
                          setValidationWarning(null);
                        }
                      }}
                      style={styles.voiceProfileSelectArea}
                    >
                      <Text style={[styles.voiceProfileName, { color: colors.foreground }]} numberOfLines={1}>{profile.name}</Text>
                      <Text style={[styles.voiceProfileMeta, { color: approved ? colors.success : colors.muted }]}>{statusText} · {profile.sampleCount ?? 0} 份樣本</Text>
                    </TouchableOpacity>
                    {approved ? (
                      <Text style={[styles.profileApprovedText, { color: colors.success }]}>{selected ? "使用中" : "選用"}</Text>
                    ) : (
                      <TouchableOpacity onPress={() => void handleApproveProfile(profile)} style={[styles.profileApproveButton, { borderColor: colors.primary }]}>
                        <Text style={[styles.profileApproveText, { color: colors.primary }]}>核可</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}
          {selectedVoiceProfile && (
            <Text style={[styles.selectedProfileHint, { color: colors.success }]}>目前會重用「{selectedVoiceProfile.name}」，不會重新上傳或改寫它。</Text>
          )}
          {selectedVoiceProfile?.status === "candidate" && (
            <View style={[styles.previewGateBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Text style={[styles.previewGateTitle, { color: colors.foreground }]}>三段預覽驗收 · {selectedVoiceProfile.previewCount}/{PROFILE_PREVIEW_SCRIPTS.length}</Text>
              <Text style={[styles.previewGateHint, { color: colors.muted }]}>依序生成三段固定文字；第 3 段請改填家屬姓名或專用詞，並確認讀音。</Text>
              <View style={styles.previewButtons}>
                {PROFILE_PREVIEW_SCRIPTS.map((preview) => {
                  const completed = selectedVoiceProfile.completedPreviewKeys?.includes(preview.key) ?? false;
                  return (
                    <TouchableOpacity
                      key={preview.key}
                      onPress={() => {
                        setText(preview.key === "name" ? "" : preview.text);
                        setActivePreviewKey(preview.key);
                      }}
                      style={[styles.previewButton, { borderColor: activePreviewKey === preview.key ? colors.primary : colors.border, backgroundColor: activePreviewKey === preview.key ? `${colors.primary}10` : colors.surface }]}
                    >
                      <Text style={[styles.previewButtonText, { color: colors.foreground }]}>{preview.label}{completed ? " ✓" : ""}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
          <TouchableOpacity
            onPress={() => {
              setSelectedVoiceProfileId(null);
              void pickAudio();
            }}
            style={[styles.useNewSampleButton, { borderColor: colors.border }]}
          >
            <Text style={[styles.useNewSampleText, { color: colors.foreground }]}>使用新音檔建立候選聲音</Text>
          </TouchableOpacity>
        </View>

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

              <TouchableOpacity
                onPress={() => setIsSingleSpeakerConfirmed((current) => !current)}
                style={[styles.singleSpeakerCheck, { borderColor: isSingleSpeakerConfirmed ? colors.primary : colors.border, backgroundColor: isSingleSpeakerConfirmed ? `${colors.primary}10` : colors.background }]}
              >
                <View style={[styles.singleSpeakerCheckMark, { borderColor: isSingleSpeakerConfirmed ? colors.primary : colors.muted, backgroundColor: isSingleSpeakerConfirmed ? colors.primary : "transparent" }]}>
                  {isSingleSpeakerConfirmed && <Text style={styles.singleSpeakerCheckSymbol}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.singleSpeakerCheckTitle, { color: colors.foreground }]}>此片段主要只有一位親友說話</Text>
                  <Text style={[styles.singleSpeakerCheckHint, { color: colors.muted }]}>有多人、電視聲或音樂時，請先裁切出單人且清楚的片段</Text>
                </View>
              </TouchableOpacity>

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

              {/* 聲音描述（選填） */}
              <View style={[styles.descriptionBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.descriptionLabel, { color: colors.foreground }]}>
                  聲音描述（選填）
                </Text>
                <TextInput
                  style={[styles.descriptionInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  value={voiceDescription}
                  onChangeText={(val) => setVoiceDescription(val.slice(0, 50))}
                  placeholder="例如：中年男性，聲音低沉溫厚"
                  placeholderTextColor={colors.muted}
                  maxLength={50}
                  returnKeyType="done"
                />
              </View>

              {/* 參考文字（重要！） */}
              <View style={[styles.descriptionBox, { backgroundColor: colors.background, borderColor: colors.border, marginTop: 10 }]}>
                <Text style={[styles.descriptionLabel, { color: colors.foreground }]}>
                  音檔內容文字（重要）
                </Text>
                <Text style={[styles.descriptionHint, { color: colors.muted }]}>
                  輸入音檔中實際說的文字，可大幅提升語音克隆精準度，避免人名識別錯誤
                </Text>
                <TextInput
                  style={[styles.descriptionInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, minHeight: 60 }]}
                  value={referenceText}
                  onChangeText={(val) => setReferenceText(val.slice(0, 200))}
                  placeholder="例如：大家好，我是蔡承諺，今天很高興..."
                  placeholderTextColor={colors.muted}
                  maxLength={200}
                  returnKeyType="done"
                  multiline
                  textAlignVertical="top"
                />
              </View>

              <TouchableOpacity
                onPress={pickAudio}
                style={[
                  styles.changeButton,
                  { borderColor: colors.primary },
                ]}
              >
                <Text style={[styles.changeButtonText, { color: colors.primary }]}>
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
                  至少 20 秒；建議 45–90 秒的單人自然說話
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
                    <Text style={[styles.selectButtonText, { color: colors.background }]}>驗證中...</Text>
                  </View>
                ) : (
                  <Text style={[styles.selectButtonText, { color: colors.background }]}>選擇音檔</Text>
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
          {/* 發音提示說明 */}
          <View style={[styles.pronunciationHintBox, { backgroundColor: `${colors.muted}08`, borderColor: colors.border }]}>
            <View style={styles.pronunciationHintRow}>
              <IconSymbol name="info.circle" size={13} color={colors.muted} />
              <Text style={[styles.pronunciationHintText, { color: colors.muted }]}>
                可輸入「誦(ㄙㄨㄥˋ)」指定讀音；括號注音不會被朗讀或顯示於回憶庫
              </Text>
            </View>
          </View>
        </View>

        {/* 個性設定（可選） */}
        <View style={[styles.personalityCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
          <TouchableOpacity
            onPress={() => setShowAdvanced(!showAdvanced)}
            style={styles.personalityHeader}
          >
            <View style={styles.personalityHeaderLeft}>
              <IconSymbol name="info.circle" size={18} color={colors.primary} />
              <Text style={[styles.personalityTitle, { color: colors.foreground }]}>
                語氣與個性設定
              </Text>
            </View>
            <IconSymbol
              name="chevron.right"
              size={16}
              color={colors.muted}
              style={showAdvanced ? { transform: [{ rotate: "90deg" }] } : undefined}
            />
          </TouchableOpacity>
          {showAdvanced && (
            <View style={styles.personalityBody}>
              <Text style={[styles.personalityHint, { color: colors.muted }]}> 
                選擇一種主情緒，再用下方提示補充細節；一次只會套用一種情緒
              </Text>
              {/* 情緒標籤 */}
              <View style={styles.emotionSelectorRow}>
                {EMOTION_OPTIONS.map((emo) => {
                  const isSelected = selectedEmotion === emo.value;
                  return (
                    <TouchableOpacity
                      key={emo.value}
                      onPress={() => {
                        if (Platform.OS !== "web") {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }
                        setSelectedEmotion(isSelected ? null : emo.value);
                      }}
                      style={[
                        styles.emotionChip,
                        {
                          backgroundColor: isSelected ? colors.primary : colors.surface,
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.emotionChipText,
                          { color: isSelected ? colors.background : colors.foreground },
                        ]}
                      >
                        {emo.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput
                style={[
                  styles.personalityInput,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    color: colors.foreground,
                  },
                ]}
                value={personality}
                onChangeText={setPersonality}
                placeholder="自訂補充：例如帶一點笑意，但不要太誇張"
                placeholderTextColor={colors.muted}
                multiline
                maxLength={100}
                returnKeyType="done"
                textAlignVertical="top"
              />
              <Text style={[styles.personalityCounter, { color: colors.muted }]}>
                {personality.length}/100（可選）
              </Text>

              {/* 語速控制 */}
              <Text style={[styles.emotionSectionLabel, { color: colors.foreground }]}>
                語速調整
              </Text>
              <View style={styles.speedControlBox}>
                <Text style={[styles.speedLabel, { color: colors.muted }]}>慢</Text>
                <Text style={[styles.speedValue, { color: colors.primary }]}>
                  {speed.toFixed(1)}x
                </Text>
                <Text style={[styles.speedLabel, { color: colors.muted }]}>快</Text>
              </View>
              <View style={styles.speedSliderWrap}>
                <Slider
                  style={{ width: "100%", height: 40 }}
                  minimumValue={0}
                  maximumValue={2}
                  step={0.1}
                  value={speed}
                  onValueChange={setSpeed}
                  minimumTrackTintColor={colors.primary}
                  maximumTrackTintColor={colors.border}
                  thumbTintColor={colors.primary}
                />
              </View>
            </View>
          )}
        </View>

        {/* 生成按鈕 / 生成進度 / 錯誤提示 */}
        {isGenerating ? (
          <View style={[styles.generatingCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
            {/* 音波脈動 */}
            <View style={styles.waveContainer}>
              <Waveform active={true} color={colors.primary} height={40} barCount={20} />
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
              {/* 計時器 */}
              <View style={styles.genTimerWrap}>
                <Text style={[styles.genTimerText, { color: colors.muted }]}>
                  {formatElapsed(genElapsed)}
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
            <View style={styles.genProgressInfoRow}>
              <Text style={[styles.genProgressText, { color: colors.muted }]}>
                {genProgress}%
              </Text>
              <Text style={[styles.genProgressHint, { color: colors.muted }]}>
                語音生成約需 2-4 分鐘，可離開此頁面
              </Text>
            </View>
            <View style={styles.backgroundHintBox}>
              <IconSymbol name="info.circle" size={12} color={colors.muted} />
              <Text style={[styles.backgroundHintText, { color: colors.muted }]}>
                生成過程中可離開此頁面，完成後將會通知您
              </Text>
            </View>
          </View>
        ) : genStoreState.status === "completed" && genStoreState.resultUri && !isGenerating ? (
          <View style={[styles.generatingCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
            <View style={[styles.errorIconWrap, { backgroundColor: `${colors.success}15` }]}>
              <IconSymbol name="checkmark.circle.fill" size={32} color={colors.success} />
            </View>
            <Text style={[styles.errorTitle, { color: colors.foreground }]}>
              語音生成完成
            </Text>
            <Text style={[styles.errorMessage, { color: colors.muted }]}>
              {genStoreState.resultText}
            </Text>
            <TouchableOpacity
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (genStoreState.resultUri && genStoreState.resultCreatedAt) {
                  router.push({
                    pathname: "/result" as any,
                    params: {
                      audioUri: genStoreState.resultUri,
                      text: genStoreState.resultText || "",
                      duration: (genStoreState.resultDuration || 0).toString(),
                      createdAt: genStoreState.resultCreatedAt.toString(),
                      entryId: genStoreState.entryId || "",
                      isRealVoice: genStoreState.resultIsRealVoice ? "1" : "0",
                    },
                  });
                  generationStore.reset();
                }
              }}
              style={[styles.retryButton, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.retryButtonText}>查看結果</Text>
            </TouchableOpacity>
          </View>
        ) : genStoreState.status === "error" && !isGenerating && !genError ? (
          <View style={[styles.errorCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
            <View style={[styles.errorIconWrap, { backgroundColor: `${colors.error}15` }]}>
              <IconSymbol name="exclamationmark.triangle" size={32} color={colors.error} />
            </View>
            <Text style={[styles.errorTitle, { color: colors.error }]}>
              生成失敗
            </Text>
            <Text style={[styles.errorMessage, { color: colors.muted }]}>
              {genStoreState.error}
            </Text>
            <TouchableOpacity
              onPress={() => generationStore.reset()}
              activeOpacity={0.7}
              style={[styles.dismissButton, { borderColor: colors.border }]}
            >
              <Text style={[styles.dismissButtonText, { color: colors.muted }]}>關閉</Text>
            </TouchableOpacity>
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
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                handleGenerate();
              }}
              activeOpacity={0.7}
              style={[styles.retryButton, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.retryButtonText, { color: colors.background }]}>重試</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setGenError(null);
                setGenProgress(0);
                setGenStage("");
              }}
              activeOpacity={0.7}
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
            <Text style={[styles.generateButtonText, { color: colors.background }]}>生成語音</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      </Animated.View>
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
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: "dashed",
    padding: 28,
    alignItems: "center",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  voiceIdentityCard: {
    borderRadius: 20,
    padding: 16,
    gap: 12,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  voiceIdentityHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  voiceIdentityTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  voiceIdentityHint: {
    fontSize: 12,
    lineHeight: 18,
  },
  profileRefreshButton: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  profileRefreshText: {
    fontSize: 12,
    fontWeight: "600",
  },
  profileErrorText: {
    fontSize: 12,
    lineHeight: 18,
  },
  voiceProfileList: {
    gap: 8,
  },
  voiceProfileItem: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: 14,
    paddingLeft: 12,
    paddingRight: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  voiceProfileSelectArea: {
    flex: 1,
    gap: 3,
  },
  voiceProfileName: {
    fontSize: 13,
    fontWeight: "600",
  },
  voiceProfileMeta: {
    fontSize: 11,
  },
  profileApprovedText: {
    fontSize: 12,
    fontWeight: "700",
  },
  profileApproveButton: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  profileApproveText: {
    fontSize: 12,
    fontWeight: "700",
  },
  selectedProfileHint: {
    fontSize: 12,
    lineHeight: 18,
  },
  useNewSampleButton: {
    borderWidth: 1,
    borderRadius: 14,
    alignItems: "center",
    paddingVertical: 10,
  },
  useNewSampleText: {
    fontSize: 13,
    fontWeight: "600",
  },
  previewGateBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  previewGateTitle: {
    fontSize: 12,
    fontWeight: "700",
  },
  previewGateHint: {
    fontSize: 11,
    lineHeight: 16,
  },
  previewButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  previewButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  previewButtonText: {
    fontSize: 11,
    fontWeight: "600",
  },
  uploadPlaceholder: {
    alignItems: "center",
    gap: 12,
    width: "100%",
  },
  uploadIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
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
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
    width: "100%",
    maxWidth: "100%",
  },
  formatHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  formatHintText: {
    fontSize: 12,
    fontWeight: "500",
    flexShrink: 1,
    flex: 1,
  },
  formatHintSub: {
    fontSize: 11,
    textAlign: "center",
  },
  selectButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 16,
    marginTop: 8,
  },
  selectButtonText: {
    fontSize: 16,
    fontWeight: "700",
  },
  uploadedContent: {
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  audioFileIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
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
  singleSpeakerCheck: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  singleSpeakerCheckMark: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  singleSpeakerCheckSymbol: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 16,
  },
  singleSpeakerCheckTitle: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 2,
  },
  singleSpeakerCheckHint: {
    fontSize: 11,
    lineHeight: 16,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
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
    width: 36,
    height: 36,
    borderRadius: 18,
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
    borderRadius: 18,
    borderWidth: 1.5,
    marginTop: 4,
  },
  changeButtonText: {
    fontSize: 14,
  },
  descriptionBox: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
    marginTop: 4,
  },
  descriptionLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  descriptionHint: {
    fontSize: 11,
    fontWeight: "400",
    marginTop: 2,
    marginBottom: 6,
    lineHeight: 16,
  },
  descriptionInput: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  textCard: {
    borderRadius: 20,
    padding: 20,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
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
    borderRadius: 14,
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
  pronunciationHintBox: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 0.5,
  },
  pronunciationHintRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  pronunciationHintText: {
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },
  personalityCard: {
    borderRadius: 20,
    padding: 16,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  personalityHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  personalityHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  personalityTitle: {
    fontSize: 14,
    fontWeight: "600",
    flexShrink: 1,
  },
  personalityBody: {
    marginTop: 12,
    gap: 8,
  },
  personalityHint: {
    fontSize: 12,
    lineHeight: 18,
  },
  personalityInput: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 60,
    lineHeight: 20,
  },
  personalityCounter: {
    fontSize: 11,
    textAlign: "right",
  },
  generateButton: {
    borderRadius: 16,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  generateButtonText: {
    fontSize: 18,
    fontWeight: "700",
  },
  generatingAnimRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    width: "100%",
  },
  waveContainerSmall: {
    flex: 1,
    alignItems: "center",
    maxWidth: 200,
  },
  genTimerWrap: {
    backgroundColor: "rgba(0,0,0,0.05)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  genTimerText: {
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  genProgressInfoRow: {
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
    width: "100%",
  },
  genProgressHint: {
    fontSize: 11,
    textAlign: "center",
  },
  emotionTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  emotionTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  emotionTagText: {
    fontSize: 13,
    fontWeight: "500",
  },
  generatingContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  generatingCard: {
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    gap: 16,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  waveContainer: {
    width: "100%",
    alignItems: "center",
    paddingVertical: 8,
  },
  generatingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  generatingInfo: {
    alignItems: "flex-start",
    gap: 4,
    flexShrink: 1,
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
    borderRadius: 14,
  },
  statusDotText: {
    fontSize: 11,
    fontWeight: "600",
  },
  // 錯誤卡片樣式
  errorCard: {
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    gap: 16,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  errorIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 20,
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
  backgroundHintBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  backgroundHintText: {
    fontSize: 11,
    flexShrink: 1,
  },
  speedControlBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 8,
  },
  speedLabel: {
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 0,
  },
  speedValue: {
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    minWidth: 40,
    textAlign: "right",
  },
  speedSliderWrap: {
    width: "100%",
    marginTop: 4,
  },
  emotionSelectorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  emotionChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
  },
  emotionChipText: {
    fontSize: 13,
    fontWeight: "500",
  },
  emotionSectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 2,
  },
});
