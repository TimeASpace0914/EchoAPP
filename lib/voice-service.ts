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
import { appendPronunciationHint, stripPronunciationMarkers } from "@/lib/pinyin-helpers";

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
  /** 語速（0.5-2.0，1.0 為正常速度） */
  speed?: number;
  /** 情緒標籤（溫柔/開心/平靜/關心/緩慢/慈祥/思念/鼓勵等） */
  emotion?: string;
  /** 隨機種子（固定種子可重現相同結果） */
  seed?: number;
  /** 參考音檔的轉錄文字（若已知，否則後端自動轉錄） */
  referenceText?: string;
  /** 聲音描述（選填，用於 profile 名稱，如「爸爸的聲音」） */
  description?: string;
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
  /** 生成時使用的情緒設定 */
  emotion?: string;
  /** 生成時使用的語速設定 */
  speed?: number;
}

/** 支援的音檔格式 */
export const SUPPORTED_AUDIO_EXTENSIONS = [
  "mp3", "wav", "m4a", "flac", "ogg", "wma",
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

/**
 * 將「Profile 個性」與「本次生成情緒」統合成一組短且不互相打架的指令。
 * 同一份基礎指令會同時用於建立 Profile 與生成，避免 Profile 是一種風格、
 * 生成時又被另一組冗長情緒覆蓋。情緒由首頁保證只傳入一個主情緒。
 */
function buildStableVoiceInstruct(personality?: string, primaryEmotion?: string): string {
  const parts: string[] = [];
  const trimmedPersonality = personality?.trim();
  if (trimmedPersonality) parts.push(trimmedPersonality);
  if (primaryEmotion) parts.push(`主要情緒：${primaryEmotion}`);
  parts.push("使用自然的台灣國語口吻，依原文自然停頓與表達，不刻意添加語助詞");
  return parts.join("。\n");
}

// ─── REST API 呼叫函數 ──────────────────────────────────────────────

/**
 * 透過後端 REST API 上傳音檔並建立 Voicebox Profile
 */
async function restUploadProfile(
  name: string,
  audioBase64: string,
  mimeType: string,
  referenceText?: string,
  personality?: string,
  description?: string,
): Promise<{ profileId: string; name: string }> {
  const apiBase = getApiBaseUrl();
  let response: Response;
  try {
    response = await fetch(`${apiBase}/api/voicebox/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        audioBase64,
        mimeType,
        ...(referenceText && { referenceText }),
        ...(personality && { personality }),
        ...(description && { description }),
      }),
      signal: createTimeoutSignal(180000),
    });
  } catch (err) {
    throw new Error(
      err instanceof Error && (err.name === "TimeoutError" || err.message.includes("abort"))
        ? "上傳音檔逾時（超過 3 分鐘），請確認網路連線正常後再試。"
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
  options?: { language?: string; instruct?: string; engine?: string; speed?: number; seed?: number },
): Promise<{ audioBase64: string; duration: number | null; storageUrl: string | null }> {
  const apiBase = getApiBaseUrl();
  let response: Response;
  try {
    response = await fetch(`${apiBase}/api/voicebox/generate-jobs`, {
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
        ...(options?.speed !== undefined && { speed: options.speed }),
        ...(options?.seed !== undefined && { seed: options.seed }),
      }),
      // 僅等待伺服器建立背景工作；不等待 CPU 推論，避免中介層產生 HTTP 504。
      signal: createTimeoutSignal(30000),
    });
  } catch (err) {
    throw new Error(
      err instanceof Error && (err.name === "TimeoutError" || err.message.includes("abort"))
        ? "建立語音生成工作逾時，請確認伺服器連線後再試。"
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
    jobId?: string;
    status?: string;
    audioBase64?: string;
    duration?: number;
    storageUrl?: string;
    error?: string;
  };

  if (!data.success || !data.jobId) {
    throw new Error(data.error || "伺服器未返回生成工作 ID，請確認 Voicebox 伺服器正常運作。");
  }

  // 每次輪詢都是短連線；即使本機 CPU 首次模型載入較慢，也不會觸發代理層 504。
  // 必須比後端背景工作等待時間相同，才能在 Voicebox 完成後自動取得音檔。
  const maxPolls = 900;
  for (let attempt = 0; attempt < maxPolls; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    try {
      const jobResponse = await fetch(`${apiBase}/api/voicebox/generate-jobs/${data.jobId}`, {
        signal: createTimeoutSignal(20000),
      });
      const job = await jobResponse.json().catch(() => ({})) as {
        success?: boolean;
        status?: string;
        audioBase64?: string;
        duration?: number | null;
        storageUrl?: string | null;
        error?: string;
        details?: string;
      };

      if (!jobResponse.ok || !job.success) {
        const details = job.details ? `（${job.details}）` : "";
        throw new Error(`${job.error || "讀取生成工作狀態失敗"}${details}`);
      }

      if (job.status === "completed" && job.audioBase64) {
        return {
          audioBase64: job.audioBase64,
          duration: job.duration ?? null,
          storageUrl: job.storageUrl ?? null,
        };
      }

      if (job.status === "failed") {
        const details = job.details ? `（${job.details}）` : "";
        throw new Error(`語音生成失敗：${job.error || "Voicebox 回報失敗"}${details}`);
      }
    } catch (error) {
      // 短暫網路抖動不應中斷已在本機執行的任務；明確的工作失敗則立即回報。
      if (error instanceof Error && error.message.startsWith("語音生成失敗：")) {
        throw error;
      }
      if (attempt === maxPolls - 1) {
        throw new Error(`語音生成逾時（超過 30 分鐘）：${error instanceof Error ? error.message : "無法取得工作狀態"}`);
      }
    }
  }

  throw new Error("語音生成逾時（超過 30 分鐘），請確認本機 Voicebox 是否仍在運行後再試。");
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
  // 原輸入可含「字(注音)」覆寫標記：保留它用來產生 instruct，
  // 但實際送往 TTS 與保存的朗讀內容必須移除標記。
  const spokenText = stripPronunciationMarkers(params.text);
  // 將同一份精簡風格同時交給 Profile 與生成任務，避免兩階段風格不一致。
  const stableInstruct = buildStableVoiceInstruct(params.instruct, params.emotion);

  // 階段 1：讀取參考音檔
  if (onProgress) onProgress(5, "正在讀取參考音檔...");

  let voiceProfileId = params.voiceProfileId;

  // 若沒有 profile ID，先上傳音檔建立 profile
  if (!voiceProfileId) {
    if (onProgress) onProgress(10, "正在轉錄參考音檔內容...");
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
      const uploadResult = await restUploadProfile(
        profileName,
        audioBase64,
        mimeType,
        params.referenceText,
        stableInstruct,  // personality → Voicebox profile personality
        params.description,  // description → Voicebox profile name (可選)
      );
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
    "AI 正在載入語音模型...",
    "AI 正在分析聲音特徵...",
    "正在生成語音波形...",
    "正在合成語音內容...",
    "正在優化語音品質...",
    "即將完成，請稍候...",
  ];
  // chatterbox 引擎實測約 260 秒，進度推進需更慢以匹配實際耗時
  progressTimer = setInterval(() => {
    if (currentProgress < 85) {
      currentProgress += 1;
      const stageIdx = Math.min(Math.floor((currentProgress - 45) / 7), stageTexts.length - 1);
      if (onProgress) onProgress(currentProgress, stageTexts[stageIdx]);
    }
  }, 4000);
  // 使用 qwen 引擎（Qwen-TTS 語音克隆效果最佳，能仿製聲音特徵）
  // 關鍵：確保 reference_text 是真實轉錄而非假文字，避免胡言亂語
  let finalInstruct = stableInstruct;

  // 自動加入中文發音提示：偵測文字中的中文字，為罕見字/人名加上拼音標注
  // 解決 G2P 模型將「蔡承諺」錯誤映射為「蔡懲罰」等發音問題
  finalInstruct = appendPronunciationHint(finalInstruct, params.text);

  const result = await restGenerateSpeech(spokenText, voiceProfileId, {
    language: params.language,
    instruct: finalInstruct,
    engine: params.engine || "qwen",
    speed: params.speed,
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

  const estimatedDuration = result.duration ?? Math.max(2, Math.ceil(spokenText.length * 0.15));

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
