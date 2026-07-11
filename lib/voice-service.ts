/**
 * 語音生成服務
 *
 * 整合 Voicebox 開源語音克隆軟件的 REST API。
 * Voicebox 需在電腦上運行（http://localhost:17493），
 * 本 APP 透過後端伺服器代理呼叫 Voicebox API。
 *
 * 若 Voicebox 未連線，則回退至模擬音檔（供測試用）。
 */

import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { getApiBaseUrl } from "@/constants/oauth";

export interface VoiceGenerationParams {
  /** 參考音檔 URI（親友生前音檔） */
  referenceAudioUri: string;
  /** 要生成的文字內容 */
  text: string;
  /** Voicebox 聲音檔案 ID（若已建立） */
  voiceProfileId?: string;
  /** 生成進度回調（0-100） */
  onProgress?: (progress: number, stage: string) => void;
}

export interface VoiceGenerationResult {
  /** 生成的音檔 URI */
  audioUri: string;
  /** 音檔時長（秒） */
  duration: number;
  /** 生成時間戳 */
  createdAt: number;
  /** 是否使用 Voicebox 真實生成 */
  isRealVoice: boolean;
}

export interface HistoryEntry {
  id: string;
  /** 用戶自訂名稱（可選） */
  title?: string;
  /** 用戶自訂標籤（可選） */
  tags?: string[];
  text: string;
  audioUri: string;
  referenceAudioName: string;
  duration: number;
  createdAt: number;
  /** 是否為真實語音克隆 */
  isRealVoice?: boolean;
}

/** 支援的音檔格式 */
export const SUPPORTED_AUDIO_EXTENSIONS = [
  "mp3", "wav", "m4a", "aac", "flac", "ogg", "wma",
];

/** 支援的影片格式（可從中提取音軌） */
export const SUPPORTED_VIDEO_EXTENSIONS = [
  "mp4", "mov", "avi", "mkv", "webm",
];

export const ALL_SUPPORTED_EXTENSIONS = [
  ...SUPPORTED_AUDIO_EXTENSIONS,
  ...SUPPORTED_VIDEO_EXTENSIONS,
];

/** 最低音檔時長（秒） */
export const MIN_AUDIO_DURATION = 3;

/** 音檔驗證結果 */
export interface AudioValidationResult {
  valid: boolean;
  error?: string;
  duration?: number;
}

const HISTORY_KEY = "@echo_history";
const AUDIO_DIR = `${FileSystem.documentDirectory}generated_audio/`;

/**
 * 確保音檔儲存目錄存在
 */
async function ensureAudioDir() {
  const info = await FileSystem.getInfoAsync(AUDIO_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(AUDIO_DIR, { intermediates: true });
  }
}

/**
 * 從檔名或 URI 中提取副檔名
 */
function getExtension(uriOrName: string): string {
  const clean = uriOrName.split("?")[0].split("#")[0];
  const parts = clean.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

/**
 * 驗證音檔格式與時長
 */
export async function validateAudioFile(
  uri: string,
  fileName: string
): Promise<AudioValidationResult> {
  const ext = getExtension(fileName || uri);
  if (!ext) {
    return {
      valid: false,
      error: "無法識別檔案格式，請確認檔案副檔名正確。",
    };
  }

  const isAudio = SUPPORTED_AUDIO_EXTENSIONS.includes(ext);
  const isVideo = SUPPORTED_VIDEO_EXTENSIONS.includes(ext);

  if (!isAudio && !isVideo) {
    return {
      valid: false,
      error: `不支援此檔案格式（.${ext}）。請使用 ${SUPPORTED_AUDIO_EXTENSIONS.join("、")} 或 ${SUPPORTED_VIDEO_EXTENSIONS.join("、")} 格式。`,
    };
  }

  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists || (fileInfo.size !== undefined && fileInfo.size < 1000)) {
      return {
        valid: false,
        error: "檔案似乎為空或過小，請確認音檔內容完整。",
      };
    }
  } catch {
    // 跳過大小檢查
  }

  if (Platform.OS === "web") {
    return { valid: true };
  }

  try {
    const duration = await getAudioDuration(uri);
    if (duration < MIN_AUDIO_DURATION) {
      return {
        valid: false,
        duration,
        error: `音檔長度僅 ${duration.toFixed(1)} 秒，建議至少 ${MIN_AUDIO_DURATION} 秒以上，才能獲得更好的語音克隆效果。`,
      };
    }
    return { valid: true, duration };
  } catch {
    return { valid: true };
  }
}

/**
 * 透過 expo-audio 取得音檔時長
 */
async function getAudioDuration(uri: string): Promise<number> {
  const { createAudioPlayer } = await import("expo-audio");
  return new Promise<number>((resolve, reject) => {
    try {
      const player = createAudioPlayer({ uri });
      const timeout = setTimeout(() => {
        player.remove();
        reject(new Error("timeout"));
      }, 5000);

      setTimeout(() => {
        clearTimeout(timeout);
        const duration = player.duration || 0;
        player.remove();
        if (duration > 0) {
          resolve(duration);
        } else {
          reject(new Error("no duration"));
        }
      }, 800);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * 將本地音檔 URI 讀取為 base64
 */
async function readAudioAsBase64(uri: string): Promise<string> {
  // Web 平台使用 fetch
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // 移除 data:xxx;base64, 前綴
        resolve(result.split(",")[1] || result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // 原生平台使用 FileSystem
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64;
}

/**
 * 呼叫後端 tRPC API 生成語音
 */
async function callVoiceGenerateAPI(
  text: string,
  profileId: string,
): Promise<{ audioBase64: string; duration: number | null } | null> {
  try {
    const apiBase = getApiBaseUrl();
    const response = await fetch(`${apiBase}/api/trpc/voice.generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        json: { text, profileId },
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) return null;

    const data = await response.json() as {
      result?: { data?: { json?: { success?: boolean; audioBase64?: string; duration?: number } } }
    };
    const result = data?.result?.data?.json;

    if (result?.success && result.audioBase64) {
      return {
        audioBase64: result.audioBase64,
        duration: result.duration ?? null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 呼叫後端 tRPC API 上傳音檔並建立 Voicebox Profile
 */
async function callUploadProfileAPI(
  name: string,
  audioBase64: string,
  mimeType: string,
): Promise<string | null> {
  try {
    const apiBase = getApiBaseUrl();
    const response = await fetch(`${apiBase}/api/trpc/voice.uploadProfile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        json: { name, audioBase64, mimeType },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) return null;

    const data = await response.json() as {
      result?: { data?: { json?: { success?: boolean; profileId?: string } } }
    };
    const result = data?.result?.data?.json;

    if (result?.success && result.profileId) {
      return result.profileId;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 檢查 Voicebox 服務是否在線
 */
export async function checkVoiceboxStatus(): Promise<{
  online: boolean;
  profileCount?: number;
  url?: string;
}> {
  try {
    const apiBase = getApiBaseUrl();
    const response = await fetch(`${apiBase}/api/trpc/voice.health`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return { online: false };

    const data = await response.json() as {
      result?: { data?: { json?: { online?: boolean; profileCount?: number; url?: string } } }
    };
    const result = data?.result?.data?.json;

    return {
      online: result?.online ?? false,
      profileCount: result?.profileCount,
      url: result?.url,
    };
  } catch {
    return { online: false };
  }
}

/**
 * 生成語音
 *
 * 流程：
 * 1. 嘗試呼叫後端 Voicebox API（若已連線）
 * 2. 若 Voicebox 未連線，回退至模擬音檔
 */
export async function generateSpeech(
  params: VoiceGenerationParams
): Promise<VoiceGenerationResult> {
  await ensureAudioDir();

  const timestamp = Date.now();
  const fileName = `echo_${timestamp}.wav`;
  const outputPath = `${AUDIO_DIR}${fileName}`;

  const { onProgress } = params;

  // 階段 1：讀取參考音檔
  if (onProgress) onProgress(10, "讀取參考音檔...");
  await new Promise((resolve) => setTimeout(resolve, 300));

  // 嘗試使用 Voicebox 真實生成
  let voiceProfileId = params.voiceProfileId;

  // 若沒有 profile ID，先上傳音檔建立 profile
  if (!voiceProfileId) {
    if (onProgress) onProgress(20, "分析聲音特徵...");
    try {
      const ext = getExtension(params.referenceAudioUri);
      const mimeType = ext === "mp3" ? "audio/mpeg"
        : ext === "wav" ? "audio/wav"
        : ext === "m4a" ? "audio/mp4"
        : "audio/wav";

      const audioBase64 = await readAudioAsBase64(params.referenceAudioUri);
      const profileName = `echo_${timestamp}`;
      voiceProfileId = await callUploadProfileAPI(profileName, audioBase64, mimeType) ?? undefined;
    } catch {
      // 上傳失敗，繼續使用模擬
    }
  }

  if (voiceProfileId) {
    // === Voicebox 真實語音克隆 ===
    if (onProgress) onProgress(35, "提取音色與語調...");
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (onProgress) onProgress(50, "AI 語音克隆生成中...");

    const result = await callVoiceGenerateAPI(params.text, voiceProfileId);

    if (result) {
      if (onProgress) onProgress(85, "後處理音質優化...");
      await new Promise((resolve) => setTimeout(resolve, 300));

      if (onProgress) onProgress(95, "儲存音檔...");

      // 儲存 base64 音檔到本地
      await FileSystem.writeAsStringAsync(outputPath, result.audioBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (onProgress) onProgress(100, "完成");

      const estimatedDuration = result.duration ?? Math.max(2, Math.ceil(params.text.length * 0.15));

      return {
        audioUri: outputPath,
        duration: estimatedDuration,
        createdAt: timestamp,
        isRealVoice: true,
      };
    }
  }

  // Voicebox 未連線或生成失敗，拋出錯誤（不再產生模擬音檔）
  if (onProgress) onProgress(100, "生成失敗");
  throw new Error(
    voiceProfileId
      ? "語音生成失敗，請確認 Voicebox 伺服器正常運作後再試。"
      : "無法連接語音克隆伺服器，請稍後再試。"
  );
}

/**
 * 儲存歷史紀錄到 AsyncStorage
 */
export async function saveHistoryEntry(entry: HistoryEntry): Promise<void> {
  const AsyncStorage = await import("@react-native-async-storage/async-storage");
  const existing = await getHistory();
  const updated = [entry, ...existing];
  await AsyncStorage.default.setItem(HISTORY_KEY, JSON.stringify(updated));
}

/**
 * 取得所有歷史紀錄
 */
export async function getHistory(): Promise<HistoryEntry[]> {
  const AsyncStorage = await import("@react-native-async-storage/async-storage");
  const data = await AsyncStorage.default.getItem(HISTORY_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data) as HistoryEntry[];
  } catch {
    return [];
  }
}

/**
 * 更新歷史紀錄（命名或標籤）
 */
export async function updateHistoryEntry(
  id: string,
  updates: Partial<Pick<HistoryEntry, "title" | "tags">>
): Promise<void> {
  const existing = await getHistory();
  const updated = existing.map((e) =>
    e.id === id ? { ...e, ...updates } : e
  );
  const AsyncStorage = await import("@react-native-async-storage/async-storage");
  await AsyncStorage.default.setItem(HISTORY_KEY, JSON.stringify(updated));
}

/**
 * 刪除單筆歷史紀錄
 */
export async function deleteHistoryEntry(id: string): Promise<void> {
  const existing = await getHistory();
  const updated = existing.filter((e) => e.id !== id);
  const AsyncStorage = await import("@react-native-async-storage/async-storage");
  await AsyncStorage.default.setItem(HISTORY_KEY, JSON.stringify(updated));
}

/**
 * 清除所有歷史紀錄
 */
export async function clearHistory(): Promise<void> {
  const AsyncStorage = await import("@react-native-async-storage/async-storage");
  await AsyncStorage.default.removeItem(HISTORY_KEY);
}

/**
 * 格式化時間戳為可讀字串
 */
export function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${month}月${day}日 ${hours}:${minutes}`;
}

/**
 * 格式化秒數為 mm:ss
 */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
