import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import Slider from "@react-native-community/slider";
import * as DocumentPicker from "expo-document-picker";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { Logo } from "@/components/logo";
import { ReferenceMediaPreview } from "@/components/reference-media-preview";
import { ScreenContainer } from "@/components/screen-container";
import { Waveform } from "@/components/waveform";
import { useColors } from "@/hooks/use-colors";
import { generationStore, type GenerationState } from "@/lib/generation-store";
import { stripPronunciationMarkers } from "@/lib/pinyin-helpers";
import {
  checkVoiceboxStatus,
  generateSpeech,
  getVoiceboxProfiles,
  saveHistoryEntry,
  validateAudioFile,
  type HistoryEntry,
} from "@/lib/voice-service";
import {
  getActiveVoiceProfileId,
  getManagedVoiceProfiles,
  type ManagedVoiceProfile,
} from "@/lib/voice-profile-store";

const MAX_TEXT_LENGTH = 500;
const ACTIVE_PROFILE_LOOKUP_TIMEOUT_MS = 8000;

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([operation, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

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

type PickedReferenceMedia = {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
  size?: number | null;
};

const MAX_REFERENCE_MEDIA_BYTES = 32 * 1024 * 1024;

export default function HomeScreen() {
  const colors = useColors();
  const [text, setText] = useState("");
  const [personality, setPersonality] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedEmotion, setSelectedEmotion] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const [referenceAudioUri, setReferenceAudioUri] = useState<string | null>(null);
  const [referenceAudioName, setReferenceAudioName] = useState("");
  const [referenceAudioMimeType, setReferenceAudioMimeType] = useState<string | null>(null);
  const [referenceMediaType, setReferenceMediaType] = useState<"audio" | "video" | null>(null);
  const [referenceDescription, setReferenceDescription] = useState("");
  const [referenceText, setReferenceText] = useState("");
  const [isValidatingAudio, setIsValidatingAudio] = useState(false);
  const [activeProfile, setActiveProfile] = useState<ManagedVoiceProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [voiceboxOnline, setVoiceboxOnline] = useState<boolean | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [genStage, setGenStage] = useState("");
  const [genElapsed, setGenElapsed] = useState(0);
  const [genError, setGenError] = useState<string | null>(null);
  const [genStoreState, setGenStoreState] = useState<GenerationState>(generationStore.getState());

  const contentOpacity = useSharedValue(0);
  const contentTranslateY = useSharedValue(12);

  useEffect(() => {
    contentOpacity.value = withTiming(1, { duration: 600, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
    contentTranslateY.value = withTiming(0, { duration: 600, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
  }, [contentOpacity, contentTranslateY]);

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslateY.value }],
  }));

  useEffect(() => generationStore.subscribe(setGenStoreState), []);

  const loadActiveProfile = useCallback(async () => {
    setIsLoadingProfile(true);
    setProfileError(null);
    try {
      const [remoteProfiles, activeProfileId] = await withTimeout(
        Promise.all([getVoiceboxProfiles(), getActiveVoiceProfileId()]),
        ACTIVE_PROFILE_LOOKUP_TIMEOUT_MS,
        "確認正式聲音設定逾時",
      );
      const managedProfiles = await getManagedVoiceProfiles(remoteProfiles);
      const profile = managedProfiles.find((item) => item.id === activeProfileId && item.status === "approved") ?? null;
      setActiveProfile(profile);
      if (activeProfileId && !profile) {
        setProfileError("正式聲音設定需要由管理者重新確認。請聯繫服務人員協助。 ");
      }
    } catch (error) {
      setActiveProfile(null);
      setProfileError(
        error instanceof Error && error.message === "確認正式聲音設定逾時"
          ? "暫時無法確認正式聲音；您仍可直接上傳授權素材後生成。"
          : "暫時無法讀取聲音設定；您仍可直接上傳授權素材後生成。",
      );
    } finally {
      setIsLoadingProfile(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) {
        setVoiceboxOnline(false);
        setIsLoadingProfile(false);
      }
    }, 5000);
    checkVoiceboxStatus().then((status) => {
      if (!cancelled) {
        clearTimeout(timeout);
        setVoiceboxOnline(status.online);
        if (status.online) void loadActiveProfile();
      }
    }).catch(() => {
      if (!cancelled) {
        clearTimeout(timeout);
        setVoiceboxOnline(false);
        setIsLoadingProfile(false);
      }
    });
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [loadActiveProfile]);

  useFocusEffect(
    useCallback(() => {
      if (voiceboxOnline) void loadActiveProfile();
    }, [loadActiveProfile, voiceboxOnline]),
  );

  useEffect(() => {
    if (!isGenerating) return;
    const timer = setInterval(() => setGenElapsed((elapsed) => elapsed + 1), 1000);
    return () => clearInterval(timer);
  }, [isGenerating]);

  const acceptReferenceMedia = useCallback(async (asset: PickedReferenceMedia) => {
    setIsValidatingAudio(true);
    try {
      const displayName = asset.name || "未命名媒體";
      if (asset.size && asset.size > MAX_REFERENCE_MEDIA_BYTES) {
        Alert.alert("素材檔案過大", "目前單次上傳請控制在 32MB 內。若是手機影片，請使用「手機影片」按鈕從相簿選擇，系統會輸出較相容的影片；或先在手機中剪成 45–90 秒的片段。 ");
        return;
      }
      const validation = await validateAudioFile(asset.uri, displayName);
      if (!validation.valid) {
        Alert.alert("音檔不符合使用條件", validation.error || "請改用更清楚的音檔或影片。 ");
        return;
      }
      setReferenceAudioUri(asset.uri);
      setReferenceAudioName(displayName);
      setReferenceAudioMimeType(asset.mimeType || null);
      setReferenceMediaType(validation.mediaType || (asset.mimeType?.startsWith("video/") ? "video" : "audio"));
      if (validation.warning) {
        Alert.alert("素材品質提醒", validation.warning);
      }
      if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      Alert.alert("無法讀取媒體", "請確認檔案或影片內容完整後再試一次。 ");
    } finally {
      setIsValidatingAudio(false);
    }
  }, []);

  const pickReferenceMediaFromFiles = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["audio/*", "video/*", "audio/wav", "audio/mpeg", "audio/mp3", "audio/m4a", "audio/flac", "audio/ogg", "video/mp4", "video/quicktime", "video/3gpp", "video/webm"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      await acceptReferenceMedia(result.assets[0]);
    } catch {
      Alert.alert("無法選擇媒體", "請確認音檔或影片格式後再試一次。 ");
    }
  }, [acceptReferenceMedia]);

  const handleGenerate = useCallback(async () => {
    if (!activeProfile && !referenceAudioUri) {
      Alert.alert("尚未完成聲音設定", "請聯繫服務人員確認親友的正式聲音身份，或先上傳一段授權音檔。 ");
      return;
    }
    if (!text.trim()) {
      Alert.alert("請輸入文字", "請輸入想讓親友對您說的話。 ");
      return;
    }

    setIsGenerating(true);
    setGenProgress(0);
    setGenStage("準備中...");
    setGenElapsed(0);
    setGenError(null);
    generationStore.startGeneration();

    const primaryEmotion = selectedEmotion || undefined;
    const spokenText = stripPronunciationMarkers(text.trim());
    const isOneTimeReference = Boolean(referenceAudioUri);
    try {
      const result = await generateSpeech({
        voiceProfileId: isOneTimeReference ? undefined : activeProfile?.id,
        referenceAudioUri: referenceAudioUri || undefined,
        audioFileName: referenceAudioName || undefined,
        audioMimeType: referenceAudioMimeType || undefined,
        description: referenceDescription.trim() || undefined,
        referenceText: referenceText.trim() || undefined,
        text: text.trim(),
        language: "zh",
        instruct: personality.trim() || undefined,
        emotion: primaryEmotion,
        speed: speed !== 1 ? speed : undefined,
        onProgress: (progress, stage) => {
          setGenProgress(progress);
          setGenStage(stage);
          generationStore.updateProgress(progress, stage);
        },
      });
      const entry: HistoryEntry = {
        id: `echo_${result.createdAt}`,
        text: spokenText,
        audioUri: result.audioUri,
        referenceAudioName: isOneTimeReference ? referenceAudioName : activeProfile?.name || "已核可聲音",
        duration: result.duration,
        createdAt: result.createdAt,
        isRealVoice: result.isRealVoice,
        emotion: primaryEmotion,
        speed: speed !== 1 ? speed : undefined,
        profileId: result.profileId,
        voiceProfileName: isOneTimeReference ? referenceAudioName : activeProfile?.name,
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
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "語音生成過程中發生未知錯誤";
      setGenError(errorMessage);
      generationStore.failGeneration(errorMessage);
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsGenerating(false);
    }
  }, [activeProfile, personality, referenceAudioMimeType, referenceAudioName, referenceAudioUri, referenceDescription, referenceText, selectedEmotion, speed, text]);

  const formatElapsed = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return minutes > 0 ? `${minutes}:${remainder.toString().padStart(2, "0")}` : `${remainder}秒`;
  };

  return (
    <ScreenContainer className="flex-1">
      <View style={[styles.navBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Logo height={36} />
        <View style={{ flex: 1 }} />
        {voiceboxOnline !== null ? (
          <View style={[styles.statusBadge, { backgroundColor: voiceboxOnline ? colors.success : colors.warning }]}>
            <Text style={[styles.statusBadgeText, { color: colors.background }]}>{voiceboxOnline ? "AI 已連線" : "伺服器離線"}</Text>
          </View>
        ) : null}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <Animated.View style={[{ flex: 1 }, contentAnimatedStyle]}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={[styles.voiceStatusCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
              <View style={[styles.voiceStatusIcon, { backgroundColor: referenceAudioUri || activeProfile ? `${colors.success}15` : `${colors.muted}12` }]}>
                <IconSymbol name={referenceAudioUri || activeProfile ? "checkmark.circle.fill" : "info.circle"} size={24} color={referenceAudioUri || activeProfile ? colors.success : colors.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.voiceStatusTitle, { color: colors.foreground }]}>{referenceAudioUri ? "本次上傳素材已準備好" : isLoadingProfile ? "正在確認聲音設定" : activeProfile ? "親友的聲音已準備好" : "尚未完成聲音設定"}</Text>
                <Text style={[styles.voiceStatusText, { color: colors.muted }]}>{referenceAudioUri ? "本次會使用您選擇的素材進行克隆，不會變更管理者核可的正式聲音。" : isLoadingProfile ? "請稍候..." : activeProfile ? "已套用核可的聲音版本，您可直接輸入想說的話。" : profileError || "您也可以直接上傳一段授權音檔或影片，建立本次使用的聲音。"}</Text>
              </View>
              {!isLoadingProfile ? <TouchableOpacity onPress={() => void loadActiveProfile()} style={[styles.refreshButton, { borderColor: colors.border }]}><Text style={[styles.refreshText, { color: colors.foreground }]}>更新</Text></TouchableOpacity> : null}
            </View>

            <View style={[styles.uploadCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
              <View style={styles.uploadHeading}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]}>上傳親友音檔或影片</Text>
                  <Text style={[styles.cardHint, { color: colors.muted }]}>可選。可直接選擇手機錄製的影片；系統只會取用其中聲音，且不會更改正式聲音。</Text>
                </View>
                <IconSymbol name="cloud.fill" size={24} color={colors.primary} />
              </View>
              {referenceAudioUri ? (
                <View style={styles.selectedMediaContent}>
                  <View style={[styles.uploadedFile, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.uploadedFileName, { color: colors.foreground }]} numberOfLines={1}>{referenceAudioName}</Text>
                      <Text style={[styles.uploadedFileHint, { color: colors.muted }]}>{referenceMediaType === "video" ? "手機影片・生成時將擷取聲音" : "音檔"}・本次優先使用</Text>
                    </View>
                    <TouchableOpacity onPress={() => void pickReferenceMediaFromFiles()} activeOpacity={0.75}><Text style={[styles.fileActionText, { color: colors.primary }]}>更換</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => { setReferenceAudioUri(null); setReferenceAudioName(""); setReferenceAudioMimeType(null); setReferenceMediaType(null); setReferenceDescription(""); setReferenceText(""); }} activeOpacity={0.75}><Text style={[styles.fileActionText, { color: colors.muted }]}>移除</Text></TouchableOpacity>
                  </View>
                  <ReferenceMediaPreview uri={referenceAudioUri} isVideo={referenceMediaType === "video"} colors={colors} />
                  <View style={styles.referenceFields}>
                    <View style={styles.fieldLabelRow}>
                      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>這段聲音的特色</Text>
                      <Text style={[styles.fieldOptional, { color: colors.muted }]}>選填</Text>
                    </View>
                    <TextInput value={referenceDescription} onChangeText={(value) => setReferenceDescription(value.slice(0, 160))} placeholder="例如：爸爸在家中聊天，語氣溫和，說話速度偏慢" placeholderTextColor={colors.muted} style={[styles.referenceInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} multiline maxLength={160} textAlignVertical="top" />
                    <Text style={[styles.fieldCounter, { color: colors.muted }]}>{referenceDescription.length}/160</Text>
                    <View style={styles.fieldLabelRow}>
                      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>您知道的音檔內容</Text>
                      <Text style={[styles.fieldOptional, { color: colors.muted }]}>選填・可提升專名讀音</Text>
                    </View>
                    <TextInput value={referenceText} onChangeText={(value) => setReferenceText(value.slice(0, 500))} placeholder="若記得部分原話，可盡量逐字輸入；不知道可留白，系統會協助轉錄。" placeholderTextColor={colors.muted} style={[styles.referenceTextInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} multiline maxLength={500} textAlignVertical="top" />
                    <Text style={[styles.fieldCounter, { color: colors.muted }]}>{referenceText.length}/500</Text>
                  </View>
                </View>
              ) : (
                <TouchableOpacity onPress={() => void pickReferenceMediaFromFiles()} disabled={isValidatingAudio} activeOpacity={0.85} style={[styles.uploadButton, { borderColor: colors.primary, opacity: isValidatingAudio ? 0.6 : 1 }]}>
                  {isValidatingAudio ? <ActivityIndicator color={colors.primary} /> : <IconSymbol name="cloud.fill" size={20} color={colors.primary} />}
                  <Text style={[styles.uploadButtonText, { color: colors.primary }]}>{isValidatingAudio ? "正在檢查檔案..." : "選擇授權檔案"}</Text>
                </TouchableOpacity>
              )}
              <Text style={[styles.uploadTip, { color: colors.muted }]}>支援 MP3、WAV、M4A、MP4、MOV 等格式。短片段也可生成；若有較長、較清楚的單人說話素材，通常相似度會更穩定。</Text>
            </View>

            <View style={[styles.textCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>想讓親友對您說什麼？</Text>
              <Text style={[styles.cardHint, { color: colors.muted }]}>輸入內容，親友的聲音將為您說出這段話。</Text>
              <TextInput
                value={text}
                onChangeText={(value) => setText(value.slice(0, MAX_TEXT_LENGTH))}
                placeholder="例如：最近在幹嘛呀？有沒有好好吃飯！"
                placeholderTextColor={colors.muted}
                style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                multiline
                maxLength={MAX_TEXT_LENGTH}
                returnKeyType="done"
                textAlignVertical="top"
              />
              <Text style={[styles.charCounter, { color: colors.muted }]}>{text.length}/{MAX_TEXT_LENGTH}</Text>
              <View style={[styles.pronunciationHint, { borderColor: colors.border, backgroundColor: `${colors.muted}08` }]}>
                <IconSymbol name="info.circle" size={13} color={colors.muted} />
                <Text style={[styles.pronunciationText, { color: colors.muted }]}>可輸入「誦(ㄙㄨㄥˋ)」指定讀音；括號注音不會被朗讀或顯示於回憶庫。</Text>
              </View>
            </View>

            <View style={[styles.advancedCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
              <TouchableOpacity onPress={() => setShowAdvanced((visible) => !visible)} activeOpacity={0.8} style={styles.advancedHeader}>
                <View style={styles.advancedHeaderLeft}><IconSymbol name="info.circle" size={18} color={colors.primary} /><Text style={[styles.advancedTitle, { color: colors.foreground }]}>語氣與個性設定</Text></View>
                <IconSymbol name="chevron.right" size={16} color={colors.muted} style={showAdvanced ? { transform: [{ rotate: "90deg" }] } : undefined} />
              </TouchableOpacity>
              {showAdvanced ? (
                <View style={styles.advancedBody}>
                  <Text style={[styles.advancedHint, { color: colors.muted }]}>選擇一種主情緒，再以簡短提示補充細節；一次只會套用一種情緒。</Text>
                  <View style={styles.emotionRow}>
                    {EMOTION_OPTIONS.map((emotion) => {
                      const selected = selectedEmotion === emotion.value;
                      return <TouchableOpacity key={emotion.label} onPress={() => setSelectedEmotion(selected ? null : emotion.value)} activeOpacity={0.75} style={[styles.emotionChip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.surface }]}><Text style={[styles.emotionText, { color: selected ? colors.background : colors.foreground }]}>{emotion.label}</Text></TouchableOpacity>;
                    })}
                  </View>
                  <TextInput value={personality} onChangeText={(value) => setPersonality(value.slice(0, 100))} placeholder="自訂補充：例如帶一點笑意，但不要太誇張" placeholderTextColor={colors.muted} style={[styles.personalityInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} multiline maxLength={100} textAlignVertical="top" />
                  <Text style={[styles.personalityCounter, { color: colors.muted }]}>{personality.length}/100（可選）</Text>
                  <Text style={[styles.speedTitle, { color: colors.foreground }]}>語速調整</Text>
                  <View style={styles.speedHeader}><Text style={[styles.speedLabel, { color: colors.muted }]}>慢</Text><Text style={[styles.speedValue, { color: colors.primary }]}>{speed.toFixed(1)}x</Text><Text style={[styles.speedLabel, { color: colors.muted }]}>快</Text></View>
                  <Slider style={{ width: "100%", height: 40 }} minimumValue={0} maximumValue={2} step={0.1} value={speed} onValueChange={setSpeed} minimumTrackTintColor={colors.primary} maximumTrackTintColor={colors.border} thumbTintColor={colors.primary} />
                </View>
              ) : null}
            </View>

            {isGenerating ? (
              <View style={[styles.progressCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
                <Waveform active color={colors.primary} height={40} barCount={20} />
                <View style={styles.progressHeading}><View><Text style={[styles.progressTitle, { color: colors.foreground }]}>正在生成語音</Text><Text style={[styles.progressStage, { color: colors.muted }]}>{genStage}</Text></View><Text style={[styles.timerText, { color: colors.muted }]}>{formatElapsed(genElapsed)}</Text></View>
                <View style={[styles.progressTrack, { backgroundColor: colors.border }]}><View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${genProgress}%` }]} /></View>
                <Text style={[styles.progressHint, { color: colors.muted }]}>{genProgress}%・生成期間可離開此頁面，完成後將會通知您。</Text>
              </View>
            ) : genStoreState.status === "completed" && genStoreState.resultUri ? (
              <View style={[styles.resultCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
                <IconSymbol name="checkmark.circle.fill" size={32} color={colors.success} />
                <Text style={[styles.progressTitle, { color: colors.foreground }]}>語音生成完成</Text>
                <TouchableOpacity onPress={() => { if (genStoreState.resultUri && genStoreState.resultCreatedAt) { router.push({ pathname: "/result" as any, params: { audioUri: genStoreState.resultUri, text: genStoreState.resultText || "", duration: (genStoreState.resultDuration || 0).toString(), createdAt: genStoreState.resultCreatedAt.toString(), entryId: genStoreState.entryId || "", isRealVoice: genStoreState.resultIsRealVoice ? "1" : "0" } }); generationStore.reset(); } }} style={[styles.generateButton, { backgroundColor: colors.primary }]}><Text style={[styles.generateButtonText, { color: colors.background }]}>查看結果</Text></TouchableOpacity>
              </View>
            ) : genError || (genStoreState.status === "error" && genStoreState.error) ? (
              <View style={[styles.resultCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
                <IconSymbol name="exclamationmark.triangle" size={32} color={colors.error} />
                <Text style={[styles.progressTitle, { color: colors.error }]}>生成失敗</Text>
                <Text style={[styles.errorMessage, { color: colors.muted }]}>{genError || genStoreState.error}</Text>
                <TouchableOpacity onPress={() => { setGenError(null); generationStore.reset(); }} style={[styles.dismissButton, { borderColor: colors.border }]}><Text style={[styles.dismissButtonText, { color: colors.foreground }]}>關閉</Text></TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={handleGenerate} disabled={!activeProfile && !referenceAudioUri} activeOpacity={0.85} style={[styles.generateButton, { backgroundColor: colors.primary, opacity: activeProfile || referenceAudioUri ? 1 : 0.4 }]}><Text style={[styles.generateButtonText, { color: colors.background }]}>{referenceAudioUri || activeProfile ? "生成語音" : isLoadingProfile ? "確認聲音設定中..." : "等待聲音設定"}</Text></TouchableOpacity>
            )}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  navBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusBadgeText: { fontSize: 12, fontWeight: "700" },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, gap: 16 },
  voiceStatusCard: { minHeight: 92, borderRadius: 18, padding: 16, flexDirection: "row", alignItems: "center", gap: 12, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  voiceStatusIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  voiceStatusTitle: { fontSize: 15, fontWeight: "700" },
  voiceStatusText: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  refreshButton: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  refreshText: { fontSize: 12, fontWeight: "700" },
  uploadCard: { borderRadius: 20, padding: 20, gap: 12, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  uploadHeading: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  uploadButton: { minHeight: 52, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9 },
  uploadButtonText: { fontSize: 14, fontWeight: "700" },
  selectedMediaContent: { gap: 12 },
  uploadedFile: { minHeight: 58, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  uploadedFileName: { fontSize: 14, fontWeight: "700" },
  uploadedFileHint: { fontSize: 12, marginTop: 3 },
  fileActionText: { fontSize: 13, fontWeight: "700" },
  uploadTip: { fontSize: 12, lineHeight: 18 },
  referenceFields: { gap: 7, paddingTop: 2 },
  fieldLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  fieldLabel: { fontSize: 13, fontWeight: "700" },
  fieldOptional: { fontSize: 11 },
  referenceInput: { minHeight: 72, borderRadius: 12, borderWidth: 1, padding: 11, fontSize: 13, lineHeight: 19 },
  referenceTextInput: { minHeight: 92, borderRadius: 12, borderWidth: 1, padding: 11, fontSize: 13, lineHeight: 19 },
  fieldCounter: { alignSelf: "flex-end", fontSize: 11, marginTop: -3 },
  textCard: { borderRadius: 20, padding: 20, gap: 10, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  cardTitle: { fontSize: 19, fontWeight: "700" },
  cardHint: { fontSize: 14, lineHeight: 21 },
  textInput: { minHeight: 150, borderRadius: 14, borderWidth: 1, padding: 14, fontSize: 16, lineHeight: 24 },
  charCounter: { alignSelf: "flex-end", fontSize: 12 },
  pronunciationHint: { flexDirection: "row", gap: 8, padding: 10, borderWidth: 1, borderRadius: 12, alignItems: "flex-start" },
  pronunciationText: { flex: 1, fontSize: 12, lineHeight: 18 },
  advancedCard: { borderRadius: 20, padding: 18, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  advancedHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  advancedHeaderLeft: { flexDirection: "row", gap: 8, alignItems: "center" },
  advancedTitle: { fontSize: 16, fontWeight: "700" },
  advancedBody: { gap: 12, paddingTop: 14 },
  advancedHint: { fontSize: 13, lineHeight: 19 },
  emotionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  emotionChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  emotionText: { fontSize: 13, fontWeight: "600" },
  personalityInput: { minHeight: 72, borderRadius: 12, borderWidth: 1, padding: 12, fontSize: 14, lineHeight: 20 },
  personalityCounter: { alignSelf: "flex-end", fontSize: 12 },
  speedTitle: { fontSize: 14, fontWeight: "700", marginTop: 2 },
  speedHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  speedLabel: { fontSize: 13 },
  speedValue: { fontSize: 16, fontWeight: "700" },
  progressCard: { borderRadius: 20, padding: 20, gap: 14, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  progressHeading: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  progressTitle: { fontSize: 17, fontWeight: "700" },
  progressStage: { fontSize: 13, marginTop: 3 },
  timerText: { fontSize: 14, fontWeight: "600" },
  progressTrack: { height: 7, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4 },
  progressHint: { fontSize: 12, lineHeight: 18 },
  resultCard: { borderRadius: 20, padding: 20, gap: 12, alignItems: "center", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  errorMessage: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  generateButton: { minHeight: 54, borderRadius: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  generateButtonText: { fontSize: 16, fontWeight: "700" },
  dismissButton: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 11 },
  dismissButtonText: { fontSize: 14, fontWeight: "700" },
});
