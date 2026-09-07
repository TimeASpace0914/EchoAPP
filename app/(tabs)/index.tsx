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

import { IconSymbol } from "@/components/ui/icon-symbol";
import { Logo } from "@/components/logo";
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
  type HistoryEntry,
} from "@/lib/voice-service";
import {
  getActiveVoiceProfileId,
  getManagedVoiceProfiles,
  type ManagedVoiceProfile,
} from "@/lib/voice-profile-store";

const MAX_TEXT_LENGTH = 500;

const EMOTION_OPTIONS = [
  { label: "溫柔", value: "溫柔深情，聲線柔軟，句尾微微放慢，讓關懷清楚可聽見" },
  { label: "開心", value: "開心喜悅，聲音明亮有笑意，節奏輕快自然" },
  { label: "平靜", value: "平靜安穩，呼吸穩定，語速從容，情緒不起伏過大" },
  { label: "關心", value: "關心牽掛，語氣真摯，重點字清楚而帶有體貼感" },
  { label: "緩慢", value: "緩慢柔和，明顯放慢節奏，每個字咬字清楚" },
  { label: "慈祥", value: "慈祥溫暖，如長輩親切叮嚀，聲線厚實安定" },
  { label: "思念", value: "思念感傷，情緒含蓄低迴，句尾帶有不捨但不哭腔" },
  { label: "鼓勵", value: "鼓勵振奮，語氣堅定有力量，讓人感到被支持" },
] as const;

export default function HomeScreen() {
  const colors = useColors();
  const [text, setText] = useState("");
  const [personality, setPersonality] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedEmotion, setSelectedEmotion] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
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
      const [remoteProfiles, activeProfileId] = await Promise.all([
        getVoiceboxProfiles(),
        getActiveVoiceProfileId(),
      ]);
      const managedProfiles = await getManagedVoiceProfiles(remoteProfiles);
      const profile = managedProfiles.find((item) => item.id === activeProfileId && item.status === "approved") ?? null;
      setActiveProfile(profile);
      if (activeProfileId && !profile) {
        setProfileError("正式聲音設定需要由管理者重新確認。請聯繫服務人員協助。 ");
      }
    } catch {
      setActiveProfile(null);
      setProfileError("暫時無法讀取聲音設定，請確認連線後再試。 ");
    } finally {
      setIsLoadingProfile(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) setVoiceboxOnline(false);
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

  const handleGenerate = useCallback(async () => {
    if (!activeProfile) {
      Alert.alert("尚未完成聲音設定", "請聯繫服務人員確認親友的正式聲音身份已設定完成。 ");
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
    try {
      const result = await generateSpeech({
        voiceProfileId: activeProfile.id,
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
        referenceAudioName: activeProfile.name,
        duration: result.duration,
        createdAt: result.createdAt,
        isRealVoice: result.isRealVoice,
        emotion: primaryEmotion,
        speed: speed !== 1 ? speed : undefined,
        profileId: result.profileId,
        voiceProfileName: activeProfile.name,
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
  }, [activeProfile, personality, selectedEmotion, speed, text]);

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
              <View style={[styles.voiceStatusIcon, { backgroundColor: activeProfile ? `${colors.success}15` : `${colors.muted}12` }]}>
                <IconSymbol name={activeProfile ? "checkmark.circle.fill" : "info.circle"} size={24} color={activeProfile ? colors.success : colors.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.voiceStatusTitle, { color: colors.foreground }]}>{isLoadingProfile ? "正在確認聲音設定" : activeProfile ? "親友的聲音已準備好" : "尚未完成聲音設定"}</Text>
                <Text style={[styles.voiceStatusText, { color: colors.muted }]}>{isLoadingProfile ? "請稍候..." : activeProfile ? "已套用核可的聲音版本，您可直接輸入想說的話。" : profileError || "請聯繫服務人員協助完成聲音設定。"}</Text>
              </View>
              {!isLoadingProfile ? <TouchableOpacity onPress={() => void loadActiveProfile()} style={[styles.refreshButton, { borderColor: colors.border }]}><Text style={[styles.refreshText, { color: colors.foreground }]}>更新</Text></TouchableOpacity> : null}
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
              <TouchableOpacity onPress={handleGenerate} disabled={!activeProfile || isLoadingProfile} activeOpacity={0.85} style={[styles.generateButton, { backgroundColor: colors.primary, opacity: activeProfile && !isLoadingProfile ? 1 : 0.4 }]}><Text style={[styles.generateButtonText, { color: colors.background }]}>{isLoadingProfile ? "確認聲音設定中..." : activeProfile ? "生成語音" : "等待聲音設定"}</Text></TouchableOpacity>
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
