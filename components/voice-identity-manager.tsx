import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import {
  createVoiceProfile,
  generateSpeech,
  getVoiceboxProfiles,
  validateAudioFile,
} from "@/lib/voice-service";
import {
  approveVoiceProfile,
  getActiveVoiceProfileId,
  getManagedVoiceProfiles,
  recordVoiceProfilePreview,
  registerCandidateVoiceProfile,
  setActiveVoiceProfileId,
  type ManagedVoiceProfile,
} from "@/lib/voice-profile-store";

const PREVIEW_SCRIPTS = [
  { key: "daily", label: "第 1 段・日常", text: "今天過得好嗎？記得好好吃飯，也要早一點休息。" },
  { key: "care", label: "第 2 段・關懷", text: "看到你平安、把自己照顧好，我就很放心。" },
  { key: "name", label: "第 3 段・專名", text: "" },
] as const;

/**
 * 只掛載在設定頁的開發者選項中。
 * Profile 建立與核可在此集中管理，首頁僅重用已指定的正式 Profile。
 */
export function VoiceIdentityManager() {
  const colors = useColors();
  const [profiles, setProfiles] = useState<ManagedVoiceProfile[]>([]);
  const [activeProfileId, setActiveProfileIdState] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [audioName, setAudioName] = useState("");
  const [audioMimeType, setAudioMimeType] = useState<string | null>(null);
  const [isSingleSpeakerConfirmed, setIsSingleSpeakerConfirmed] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [referenceText, setReferenceText] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [creationStage, setCreationStage] = useState("");
  const [customNamePreview, setCustomNamePreview] = useState("");
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewLabel, setPreviewLabel] = useState("");
  const previewPlayer = useAudioPlayer(previewUri ? { uri: previewUri } : null);

  const loadProfiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [remoteProfiles, storedActiveId] = await Promise.all([
        getVoiceboxProfiles(),
        getActiveVoiceProfileId(),
      ]);
      const managedProfiles = await getManagedVoiceProfiles(remoteProfiles);
      setProfiles(managedProfiles);
      setActiveProfileIdState(storedActiveId);
      setSelectedProfileId((current) => current ?? storedActiveId ?? managedProfiles[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "無法載入聲音身份");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfiles();
    void setAudioModeAsync({ playsInSilentMode: true });
  }, [loadProfiles]);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );

  const pickAudio = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["audio/*", "audio/wav", "audio/mpeg", "audio/mp3", "audio/m4a", "audio/flac", "audio/ogg"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const validation = await validateAudioFile(asset.uri, asset.name || "");
      if (!validation.valid) {
        Alert.alert("音檔不符合建立條件", validation.error || "請改用更清楚的單人音檔。");
        return;
      }

      setAudioUri(asset.uri);
      setAudioName(asset.name || "未命名音檔");
      setAudioMimeType(asset.mimeType || null);
      setIsSingleSpeakerConfirmed(false);
      if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      Alert.alert("無法選擇音檔", "請確認檔案格式後再試一次。");
    }
  }, []);

  const createCandidate = useCallback(async () => {
    if (!audioUri) {
      Alert.alert("請先選擇授權音檔", "建立候選聲音前，請選擇至少 20 秒的單人自然說話音檔。");
      return;
    }
    if (!isSingleSpeakerConfirmed) {
      Alert.alert("請確認單一說話者", "請先確認此片段主要只有一位親友說話，避免多人聲音混入候選 Profile。");
      return;
    }
    if (!profileName.trim()) {
      Alert.alert("請填寫聲音名稱", "例如：爸爸・2026 年 8 月核可版本。名稱只供管理者辨識。 ");
      return;
    }
    if (!referenceText.trim()) {
      Alert.alert("請填寫音檔內容文字", "請盡量逐字填入原始音檔內容，以提升克隆的穩定度與專名讀音。 ");
      return;
    }

    setIsCreating(true);
    setCreationStage("正在準備候選聲音...");
    try {
      const result = await createVoiceProfile({
        referenceAudioUri: audioUri,
        audioMimeType: audioMimeType || undefined,
        audioFileName: audioName || undefined,
        referenceText: referenceText.trim(),
        description: profileName.trim(),
        onProgress: (_progress, stage) => setCreationStage(stage),
      });
      await registerCandidateVoiceProfile({
        profileId: result.profileId,
        name: profileName.trim(),
        sourceAudioName: audioName,
        referenceText: referenceText.trim(),
      });
      setSelectedProfileId(result.profileId);
      setAudioUri(null);
      setAudioName("");
      setAudioMimeType(null);
      setProfileName("");
      setReferenceText("");
      setIsSingleSpeakerConfirmed(false);
      await loadProfiles();
      Alert.alert("候選聲音已建立", "請完成下方三段預覽，確認音色、情緒與專名讀音後再核可。 ");
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (creationError) {
      Alert.alert("建立候選聲音失敗", creationError instanceof Error ? creationError.message : "請確認 Voicebox 與網路連線後重試。");
    } finally {
      setIsCreating(false);
      setCreationStage("");
    }
  }, [audioMimeType, audioName, audioUri, isSingleSpeakerConfirmed, loadProfiles, profileName, referenceText]);

  const generatePreview = useCallback(async (key: (typeof PREVIEW_SCRIPTS)[number]["key"]) => {
    if (!selectedProfile || selectedProfile.status !== "candidate") {
      Alert.alert("請選擇候選聲音", "三段預覽只適用於尚未核可的候選 Profile。");
      return;
    }
    const script = PREVIEW_SCRIPTS.find((item) => item.key === key);
    const previewText = key === "name" ? customNamePreview.trim() : script?.text;
    if (!previewText) {
      Alert.alert("請填寫專名測試文字", "請輸入家屬常用稱呼、人名或需確認讀音的詞。 ");
      return;
    }

    setIsGeneratingPreview(true);
    setPreviewLabel(script?.label || "預覽");
    try {
      const result = await generateSpeech({
        voiceProfileId: selectedProfile.id,
        text: previewText,
        language: "zh",
        speed: 1,
      });
      setPreviewUri(result.audioUri);
      await recordVoiceProfilePreview(selectedProfile.id, selectedProfile.name, key);
      await loadProfiles();
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (previewError) {
      Alert.alert("預覽生成失敗", previewError instanceof Error ? previewError.message : "請確認 Voicebox 狀態後重試。");
    } finally {
      setIsGeneratingPreview(false);
    }
  }, [customNamePreview, loadProfiles, selectedProfile]);

  const approveCandidate = useCallback(async () => {
    if (!selectedProfile || selectedProfile.status !== "candidate") return;
    if (selectedProfile.previewCount < PREVIEW_SCRIPTS.length) {
      Alert.alert("尚未完成三段預覽", `請完成 ${PREVIEW_SCRIPTS.length} 段固定預覽後再核可。`);
      return;
    }
    try {
      await approveVoiceProfile(selectedProfile.id, selectedProfile.name);
      await setActiveVoiceProfileId(selectedProfile.id);
      setActiveProfileIdState(selectedProfile.id);
      await loadProfiles();
      Alert.alert("已核可並指定為首頁聲音", "家屬首頁後續會直接重用此聲音，不會顯示或修改聲音身份管理。 ");
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("無法核可候選聲音", "請確認裝置儲存空間後重試。 ");
    }
  }, [loadProfiles, selectedProfile]);

  const useApprovedProfile = useCallback(async (profile: ManagedVoiceProfile) => {
    if (profile.status !== "approved") return;
    await setActiveVoiceProfileId(profile.id);
    setActiveProfileIdState(profile.id);
    setSelectedProfileId(profile.id);
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  return (
    <View style={styles.container}>
      <View style={[styles.notice, { backgroundColor: `${colors.warning}12`, borderColor: `${colors.warning}40` }]}>
        <IconSymbol name="exclamationmark.triangle" size={18} color={colors.warning} />
        <Text style={[styles.noticeText, { color: colors.foreground }]}>僅限取得聲音使用授權的管理者操作。新樣本一律為候選版本，不會覆蓋既有核可聲音。</Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
        <View style={styles.cardHeading}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>首頁正式聲音</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>家屬首頁只會重用此處指定的已核可版本</Text>
          </View>
          <TouchableOpacity onPress={() => void loadProfiles()} disabled={isLoading} style={[styles.refresh, { borderColor: colors.border }]}>
            <Text style={[styles.refreshText, { color: colors.foreground }]}>{isLoading ? "載入中" : "更新"}</Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
        {profiles.length === 0 && !isLoading ? (
          <Text style={[styles.emptyText, { color: colors.muted }]}>尚無可管理的 Voicebox Profile。請以下方流程建立第一個候選聲音。</Text>
        ) : null}
        <View style={styles.profileList}>
          {profiles.map((profile) => {
            const selected = profile.id === selectedProfileId;
            const isActive = profile.id === activeProfileId;
            const isApproved = profile.status === "approved";
            return (
              <TouchableOpacity
                key={profile.id}
                onPress={() => setSelectedProfileId(profile.id)}
                activeOpacity={0.75}
                style={[styles.profileRow, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? `${colors.primary}0D` : colors.background }]}
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[styles.profileName, { color: colors.foreground }]} numberOfLines={1}>{profile.name}</Text>
                  <Text style={[styles.profileMeta, { color: isApproved ? colors.success : colors.muted }]}>
                    {isActive ? "首頁使用中" : isApproved ? "已核可" : profile.status === "candidate" ? `候選・預覽 ${profile.previewCount}/3` : "未管理"}
                  </Text>
                </View>
                {isApproved ? (
                  <TouchableOpacity
                    onPress={() => void useApprovedProfile(profile)}
                    style={[styles.inlineButton, { backgroundColor: isActive ? colors.primary : colors.background, borderColor: colors.primary }]}
                  >
                    <Text style={[styles.inlineButtonText, { color: isActive ? colors.background : colors.primary }]}>{isActive ? "使用中" : "設為首頁"}</Text>
                  </TouchableOpacity>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>建立候選聲音</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>請使用至少 20 秒、建議 45–90 秒的單人自然說話片段，並輸入與音檔相符的文字。</Text>

        {audioUri ? (
          <View style={[styles.fileBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <IconSymbol name="waveform" size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.fileName, { color: colors.foreground }]} numberOfLines={1}>{audioName}</Text>
              <Text style={[styles.fileHint, { color: colors.muted }]}>音檔已通過前端格式與時長檢查</Text>
            </View>
            <TouchableOpacity onPress={() => void pickAudio()}><Text style={[styles.changeText, { color: colors.primary }]}>更換</Text></TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => void pickAudio()} activeOpacity={0.8} style={[styles.pickButton, { borderColor: colors.primary }]}>
            <IconSymbol name="cloud.fill" size={20} color={colors.primary} />
            <Text style={[styles.pickButtonText, { color: colors.primary }]}>選擇授權參考音檔</Text>
          </TouchableOpacity>
        )}

        {audioUri ? (
          <TouchableOpacity onPress={() => setIsSingleSpeakerConfirmed((value) => !value)} activeOpacity={0.8} style={[styles.confirmBox, { borderColor: isSingleSpeakerConfirmed ? colors.primary : colors.border, backgroundColor: isSingleSpeakerConfirmed ? `${colors.primary}0D` : colors.background }]}>
            <View style={[styles.checkbox, { backgroundColor: isSingleSpeakerConfirmed ? colors.primary : "transparent", borderColor: isSingleSpeakerConfirmed ? colors.primary : colors.muted }]}>
              {isSingleSpeakerConfirmed ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.confirmTitle, { color: colors.foreground }]}>此片段主要只有一位授權親友說話</Text>
              <Text style={[styles.confirmHint, { color: colors.muted }]}>多人談話、電視聲或音樂請先裁切，否則可能降低克隆相似度。</Text>
            </View>
          </TouchableOpacity>
        ) : null}

        <TextInput
          value={profileName}
          onChangeText={(value) => setProfileName(value.slice(0, 50))}
          placeholder="管理名稱，例如：爸爸・正式候選 A"
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
          maxLength={50}
          returnKeyType="done"
        />
        <TextInput
          value={referenceText}
          onChangeText={(value) => setReferenceText(value.slice(0, 500))}
          placeholder="逐字填入這段音檔實際說的內容（建議必填）"
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.multilineInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
          multiline
          textAlignVertical="top"
          maxLength={500}
        />
        <TouchableOpacity onPress={() => void createCandidate()} disabled={isCreating} activeOpacity={0.85} style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: isCreating ? 0.65 : 1 }]}>
          {isCreating ? <ActivityIndicator color={colors.background} /> : <Text style={[styles.primaryButtonText, { color: colors.background }]}>{creationStage || "建立候選聲音"}</Text>}
        </TouchableOpacity>
      </View>

      {selectedProfile?.status === "candidate" ? (
        <View style={[styles.card, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>三段預覽與核可</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>請以耳朵確認音色、說話自然度與專名讀音；完成三段後才可核可為首頁正式聲音。</Text>
          <TextInput
            value={customNamePreview}
            onChangeText={(value) => setCustomNamePreview(value.slice(0, 80))}
            placeholder="第 3 段專名，例如：蔡承諺，記得保重身體"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            maxLength={80}
            returnKeyType="done"
          />
          <View style={styles.previewList}>
            {PREVIEW_SCRIPTS.map((script) => {
              const complete = selectedProfile.completedPreviewKeys?.includes(script.key) ?? false;
              return (
                <TouchableOpacity key={script.key} onPress={() => void generatePreview(script.key)} disabled={isGeneratingPreview} activeOpacity={0.8} style={[styles.previewRow, { borderColor: complete ? colors.success : colors.border, backgroundColor: colors.background }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.previewTitle, { color: colors.foreground }]}>{script.label}{complete ? "・已完成" : ""}</Text>
                    <Text style={[styles.previewText, { color: colors.muted }]} numberOfLines={2}>{script.key === "name" ? "使用上方輸入的姓名或專用詞" : script.text}</Text>
                  </View>
                  {isGeneratingPreview ? <ActivityIndicator color={colors.primary} /> : <Text style={[styles.previewAction, { color: colors.primary }]}>生成</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
          {previewUri ? (
            <TouchableOpacity onPress={() => { previewPlayer.seekTo(0); previewPlayer.play(); }} activeOpacity={0.85} style={[styles.playPreviewButton, { borderColor: colors.primary }]}>
              <IconSymbol name="play.fill" size={18} color={colors.primary} />
              <Text style={[styles.playPreviewText, { color: colors.primary }]}>播放最新預覽：{previewLabel}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={() => void approveCandidate()} disabled={selectedProfile.previewCount < PREVIEW_SCRIPTS.length} activeOpacity={0.85} style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: selectedProfile.previewCount < PREVIEW_SCRIPTS.length ? 0.4 : 1 }]}>
            <Text style={[styles.primaryButtonText, { color: colors.background }]}>核可並設為首頁正式聲音</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16, paddingHorizontal: 16, paddingBottom: 40 },
  notice: { flexDirection: "row", gap: 10, padding: 14, borderWidth: 1, borderRadius: 14, alignItems: "flex-start" },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 19 },
  card: { borderRadius: 18, padding: 16, gap: 12, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  cardHeading: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  title: { fontSize: 17, fontWeight: "700" },
  subtitle: { fontSize: 13, lineHeight: 19 },
  refresh: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  refreshText: { fontSize: 13, fontWeight: "600" },
  errorText: { fontSize: 13, lineHeight: 19 },
  emptyText: { fontSize: 13, lineHeight: 19 },
  profileList: { gap: 8 },
  profileRow: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  profileName: { fontSize: 14, fontWeight: "700" },
  profileMeta: { fontSize: 12 },
  inlineButton: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  inlineButtonText: { fontSize: 12, fontWeight: "700" },
  fileBox: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: "row", gap: 10, alignItems: "center" },
  fileName: { fontSize: 14, fontWeight: "600" },
  fileHint: { fontSize: 12, marginTop: 2 },
  changeText: { fontSize: 13, fontWeight: "700" },
  pickButton: { minHeight: 54, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 14, alignItems: "center", justifyContent: "center", gap: 8, flexDirection: "row" },
  pickButtonText: { fontSize: 14, fontWeight: "700" },
  confirmBox: { flexDirection: "row", gap: 10, padding: 12, borderWidth: 1, borderRadius: 14, alignItems: "center" },
  checkbox: { width: 22, height: 22, borderWidth: 1.5, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  checkmark: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },
  confirmTitle: { fontSize: 13, fontWeight: "700" },
  confirmHint: { fontSize: 12, lineHeight: 18, marginTop: 2 },
  input: { borderWidth: 1, borderRadius: 12, minHeight: 48, paddingHorizontal: 13, fontSize: 14 },
  multilineInput: { minHeight: 92, paddingVertical: 11 },
  primaryButton: { minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  primaryButtonText: { fontSize: 15, fontWeight: "700" },
  previewList: { gap: 8 },
  previewRow: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: "row", gap: 10, alignItems: "center" },
  previewTitle: { fontSize: 14, fontWeight: "700" },
  previewText: { fontSize: 12, lineHeight: 18, marginTop: 2 },
  previewAction: { fontSize: 13, fontWeight: "700" },
  playPreviewButton: { borderWidth: 1, borderRadius: 14, minHeight: 46, paddingHorizontal: 14, flexDirection: "row", gap: 8, justifyContent: "center", alignItems: "center" },
  playPreviewText: { fontSize: 13, fontWeight: "700" },
});
