import { useState, useCallback } from "react";
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
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { Logo } from "@/components/logo";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import {
  generateSpeech,
  saveHistoryEntry,
  type HistoryEntry,
} from "@/lib/voice-service";

const MAX_TEXT_LENGTH = 500;

export default function HomeScreen() {
  const colors = useColors();
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [audioName, setAudioName] = useState<string>("");
  const [text, setText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const pickAudio = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["audio/*", "audio/wav", "audio/mpeg", "audio/mp3", "audio/m4a", "audio/aac"],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setAudioUri(asset.uri);
        setAudioName(asset.name || "未命名音檔");
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }
    } catch (err) {
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
    try {
      const result = await generateSpeech({
        referenceAudioUri: audioUri,
        text: text.trim(),
      });

      const entry: HistoryEntry = {
        id: `echo_${result.createdAt}`,
        text: text.trim(),
        audioUri: result.audioUri,
        referenceAudioName: audioName,
        duration: result.duration,
        createdAt: result.createdAt,
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
        },
      });
    } catch (err) {
      Alert.alert("生成失敗", "語音生成過程中發生錯誤，請重試");
    } finally {
      setIsGenerating(false);
    }
  }, [audioUri, text, audioName]);

  return (
    <ScreenContainer className="flex-1">
      {/* 導覽列 */}
      <View style={[styles.navBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={{ width: 40 }} />
        <Logo height={36} />
        <TouchableOpacity
          onPress={() => router.push("/settings" as any)}
          style={{ width: 40, alignItems: "center" }}
        >
          <IconSymbol name="gear" size={24} color={colors.muted} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
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
                上傳音檔
              </Text>
              <Text style={[styles.uploadSubtitle, { color: colors.muted }]}>
                上傳親友生前的聲音，讓 AI 學習他的聲音
              </Text>
              <TouchableOpacity
                onPress={pickAudio}
                style={[
                  styles.selectButton,
                  { backgroundColor: colors.primary },
                ]}
              >
                <Text style={styles.selectButtonText}>選擇音檔</Text>
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
                backgroundColor: "#F5F5F5",
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
            value={text}
            onChangeText={(val) => setText(val.slice(0, MAX_TEXT_LENGTH))}
            placeholder="例如：孩子，你要好好的，我會一直在你身邊..."
            placeholderTextColor="#BBBBBB"
            multiline
            maxLength={MAX_TEXT_LENGTH}
            returnKeyType="done"
            textAlignVertical="top"
          />
          <Text style={[styles.charCounter, { color: colors.muted }]}>
            {text.length}/{MAX_TEXT_LENGTH}
          </Text>
        </View>

        {/* 生成按鈕 */}
        <TouchableOpacity
          onPress={handleGenerate}
          disabled={isGenerating}
          style={[
            styles.generateButton,
            {
              backgroundColor: colors.primary,
              opacity: isGenerating ? 0.7 : 1,
              shadowColor: colors.primary,
            },
          ]}
        >
          {isGenerating ? (
            <View style={styles.generatingContent}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.generateButtonText}>生成中...</Text>
            </View>
          ) : (
            <Text style={styles.generateButtonText}>生成語音</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
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
});
