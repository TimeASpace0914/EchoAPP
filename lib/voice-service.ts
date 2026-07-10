/**
 * 語音生成服務
 *
 * 此模組封裝了語音克隆的推理邏輯。
 * 目前為模擬實作，未來整合 Qwen3-TTS / ExecuTorch 本地模型時，
 * 僅需替換 `generateSpeech` 內部邏輯，上層介面不變。
 */

import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

export interface VoiceGenerationParams {
  /** 參考音檔 URI（親友生前音檔） */
  referenceAudioUri: string;
  /** 要生成的文字內容 */
  text: string;
}

export interface VoiceGenerationResult {
  /** 生成的音檔 URI */
  audioUri: string;
  /** 音檔時長（秒） */
  duration: number;
  /** 生成時間戳 */
  createdAt: number;
}

export interface HistoryEntry {
  id: string;
  text: string;
  audioUri: string;
  referenceAudioName: string;
  duration: number;
  createdAt: number;
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
 * 生成語音
 *
 * 目前為模擬實作：生成一段靜音音檔作為佔位。
 * 未來替換為實際的本地 TTS 模型推理邏輯。
 *
 * @param params 參考音檔 URI 與目標文字
 * @returns 生成的音檔 URI 與元資料
 */
export async function generateSpeech(
  params: VoiceGenerationParams
): Promise<VoiceGenerationResult> {
  await ensureAudioDir();

  const timestamp = Date.now();
  const fileName = `echo_${timestamp}.wav`;
  const outputPath = `${AUDIO_DIR}${fileName}`;

  // === 模擬生成 ===
  // 模擬推理延遲
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // 建立一個最小的 WAV 檔案作為佔位
  // 未來這裡會替換為實際的模型推理輸出
  const sampleRate = 16000;
  const estimatedDuration = Math.max(2, Math.ceil(params.text.length * 0.15));
  const numSamples = sampleRate * estimatedDuration;
  const dataSize = numSamples * 2; // 16-bit = 2 bytes per sample

  // WAV 檔頭 (44 bytes) + 音訊資料
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"

  // fmt chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  // data chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataSize, true);

  // 填入靜音資料（全零）
  // 已由 ArrayBuffer 初始化為零

  // 轉換為 base64
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  await FileSystem.writeAsStringAsync(outputPath, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return {
    audioUri: outputPath,
    duration: estimatedDuration,
    createdAt: timestamp,
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
