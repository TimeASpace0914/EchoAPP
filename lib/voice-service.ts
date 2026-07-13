/**
 * 語音生成服務
 *
 * 整合 Voicebox 開源語音克隆軟件的 REST API。
 * Voicebox 需在電腦上運行（http://localhost:17493），
 * 本 APP 透過後端伺服器 REST API 代理呼叫 Voicebox API。
 */

import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { getApiBaseUrl } from "@/constants/oauth";

/**
 * 建立帶超時的 AbortSignal（相容舊版裝置不支援 AbortSignal.timeout）
 */
function createTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  // 清理 timer 避免記憶體洩漏
  controller.signal.addEventListener("abort", () => clearTimeout(timer));
  return controller.signal;
}

export interface VoiceGenerationParams {
  /** 參考音檔 URI（親友生前音檔） */
  referenceAudioUri: string;
  /** 要生成的文字內容 */
  text: string;
  /** Voicebox 聲音檔案 ID（若已建立） */
  voiceProfileId?: string;
  /** 音檔 MIME type（從 DocumentPicker 取得，避免猜測） */
  audioMimeType?: string;
  /** 原始檔名（從 DocumentPicker 取得） */
  audioFileName?: string;
  /** 生成進度回調（0-100） */
  onProgress?: (progress: number, stage: string) => void;
  /** 語言（zh/en/ja...），預設 zh */
  language?: string;
  /** 個性指令（Voicebox instruct 參數，用於控制語氣/情感） */
  instruct?: string;
  /** 引擎選擇（qwen/f5等，可選） */
  engine?: string;
  /** 隨機種子（固定種子可重現相同結果） */
  seed?: number;
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

/** 支援的影片格式（保留匯出以避免破壞其他模組） */
export const SUPPORTED_VIDEO_EXTENSIONS: string[] = [];

export const ALL_SUPPORTED_EXTENSIONS = [
  ...SUPPORTED_AUDIO_EXTENSIONS,
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

  if (!isAudio) {
    return {
      valid: false,
      error: `不支援此檔案格式（.${ext}）。請使用 ${SUPPORTED_AUDIO_EXTENSIONS.join("、")} 格式。`,
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

// ─── REST API 呼叫函數 ──────────────────────────────────────────────

/**
 * 透過後端 REST API 上傳音檔並建立 Voicebox Profile
 */
async function restUploadProfile(
  name: string,
  audioBase64: string,
  mimeType: string,
): Promise<{ profileId: string; name: string }> {
  const apiBase = getApiBaseUrl();
  let response: Response;
  try {
    response = await fetch(`${apiBase}/api/voicebox/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, audioBase64, mimeType }),
      signal: createTimeoutSignal(120000),
    });
  } catch (err) {
    throw new Error(
      err instanceof Error && (err.name === "TimeoutError" || err.message.includes("abort"))
        ? "上傳音檔逾時，請確認網路連線正常後再試。"
        : `無法連接伺服器：${err instanceof Error ? err.message : "未知錯誤"}`
    );
  }

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const msg = errBody.error || `伺服器回應錯誤 (HTTP ${response.status})`;
    const details = errBody.details ? `（${errBody.details}）` : "";
    throw new Error(`聲音檔案建立失敗：${msg}${details}`);
  }

  const data = await response.json() as {
    success?: boolean;
    profileId?: string;
    name?: string;
    error?: string;
  };

  if (data.success && data.profileId) {
    return { profileId: data.profileId, name: data.name || name };
  }
  throw new Error(
    data.error || "伺服器未返回聲音檔案 ID，請確認 Voicebox 伺服器正常運作。"
  );
}

/**
 * 透過後端 REST API 生成語音
 */
async function restGenerateSpeech(
  text: string,
  profileId: string,
  options?: { language?: string; instruct?: string; engine?: string; seed?: number },
): Promise<{ audioBase64: string; duration: number | null; storageUrl: string | null }> {
  const apiBase = getApiBaseUrl();
  let response: Response;
  try {
    response = await fetch(`${apiBase}/api/voicebox/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        profileId,
        ...(options?.language && { language: options.language }),
        ...(options?.instruct && { instruct: options.instruct }),
        ...(options?.engine && { engine: options.engine }),
        ...(options?.seed !== undefined && { seed: options.seed }),
      }),
      signal: createTimeoutSignal(420000),
    });
  } catch (err) {
    throw new Error(
      err instanceof Error && (err.name === "TimeoutError" || err.message.includes("abort"))
        ? "語音生成逾時（超過 7 分鐘），請縮短文字後再試。"
        : `無法連接伺服器：${err instanceof Error ? err.message : "未知錯誤"}`
    );
  }

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const msg = errBody.error || `伺服器回應錯誤 (HTTP ${response.status})`;
    const details = errBody.details ? `（${errBody.details}）` : "";
    throw new Error(`語音生成失敗：${msg}${details}`);
  }

  const data = await response.json() as {
    success?: boolean;
    audioBase64?: string;
    duration?: number;
    storageUrl?: string;
    error?: string;
  };

  if (data.success && data.audioBase64) {
    return {
      audioBase64: data.audioBase64,
      duration: data.duration ?? null,
      storageUrl: data.storageUrl ?? null,
    };
  }
  throw new Error(
    data.error || "伺服器未返回音檔，請確認 Voicebox 伺服器正常運作。"
  );
}

/**
 * 檢查 Voicebox 服務是否在線（透過後端 REST API）
 */
export async function checkVoiceboxStatus(): Promise<{
  online: boolean;
  profileCount?: number;
  url?: string;
}> {
  try {
    const apiBase = getApiBaseUrl();
    const response = await fetch(`${apiBase}/api/voicebox/health`, {
      signal: createTimeoutSignal(8000),
    });

    if (!response.ok) return { online: false };

    const data = await response.json() as {
      online?: boolean;
      profileCount?: number;
      url?: string;
    };

    return {
      online: data.online ?? false,
      profileCount: data.profileCount,
      url: data.url,
    };
  } catch {
    return { online: false };
  }
}

/**
 * 生成語音
 *
 * 流程：
 * 1. 讀取參考音檔並上傳至後端 → 建立 Voicebox 聲音檔案
 * 2. 呼叫後端生成 API → 取得 base64 音檔
 * 3. 儲存至本地 FileSystem
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
  if (onProgress) onProgress(5, "正在讀取參考音檔...");

  let voiceProfileId = params.voiceProfileId;

  // 若沒有 profile ID，先上傳音檔建立 profile
  if (!voiceProfileId) {
    if (onProgress) onProgress(15, "正在分析聲音特徵...");
    try {
      // 使用 picker 提供的真實 mimeType，否則從副檔名推導
      const ext = getExtension(params.audioFileName || params.referenceAudioUri);
      const mimeType = params.audioMimeType
        || (ext === "mp3" ? "audio/mpeg"
          : ext === "wav" ? "audio/wav"
          : ext === "m4a" ? "audio/mp4"
          : ext === "aac" ? "audio/aac"
          : ext === "flac" ? "audio/flac"
          : ext === "ogg" ? "audio/ogg"
          : "audio/wav");

      const audioBase64 = await readAudioAsBase64(params.referenceAudioUri);
      if (onProgress) onProgress(25, "正在上傳聲音檔案至伺服器...");

      const profileName = `echo_${timestamp}`;
      const uploadResult = await restUploadProfile(profileName, audioBase64, mimeType);
      voiceProfileId = uploadResult?.profileId ?? undefined;

      if (!voiceProfileId) {
        throw new Error("無法建立聲音檔案，請確認語音克隆伺服器正常運作後再試。");
      }
    } catch (err) {
      // 如果已經是具體錯誤訊息，直接往上拋
      if (err instanceof Error && err.message.length > 10) {
        throw err;
      }
      throw new Error(`讀取或上傳音檔時發生錯誤：${err instanceof Error ? err.message : "未知錯誤"}`);
    }
  }

  // 階段 2：生成語音
  if (onProgress) onProgress(40, "AI 正在學習聲音特徵...");

  // 模擬進度推進，讓用戶感覺有在動
  let progressTimer: ReturnType<typeof setInterval> | null = null;
  let currentProgress = 45;
  const stageTexts = [
    "AI 正在分析聲音特徵...",
    "正在生成語音波形...",
    "正在合成語音內容...",
    "正在優化語音品質...",
    "即將完成，請稍候...",
  ];
  progressTimer = setInterval(() => {
    if (currentProgress < 85) {
      currentProgress += 1;
      const stageIdx = Math.min(Math.floor((currentProgress - 45) / 8), stageTexts.length - 1);
      if (onProgress) onProgress(currentProgress, stageTexts[stageIdx]);
    }
  }, 3000);

  const result = await restGenerateSpeech(params.text, voiceProfileId, {
    language: params.language,
    instruct: params.instruct,
    engine: params.engine,
    seed: params.seed,
  });

  if (progressTimer) clearInterval(progressTimer);

  if (!result) {
    if (onProgress) onProgress(100, "生成失敗");
    throw new Error("語音生成失敗：伺服器未返回音檔資料。");
  }

  // 階段 3：儲存音檔
  if (onProgress) onProgress(85, "正在處理音質優化...");

  if (onProgress) onProgress(92, "正在儲存音檔...");

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
