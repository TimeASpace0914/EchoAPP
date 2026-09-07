/**
 * Voicebox REST API 代理服務
 *
 * Voicebox API 正確流程：
 * 1. POST /profiles (JSON) → 建立聲音檔案，取得 profile_id
 * 2. POST /profiles/{profile_id}/samples (multipart) → 上傳參考音檔
 * 3. POST /generate (JSON) → 啟動語音生成，取得 generation_id
 * 4. GET /history/{generation_id} → 輪詢生成狀態（generating → completed/failed）
 * 5. GET /audio/{generation_id} → 取得生成的音檔（binary）
 */

import { ENV } from "./_core/env";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";

const execFileAsync = promisify(execFile);

/**
 * 使用 ffmpeg 將音檔或手機影片中的第一個音軌轉換為 WAV。
 * Voicebox 對 WAV 格式的相容性最佳，M4A／MP4／MOV 等容器會先標準化。
 */
async function convertToWav(inputBuffer: Buffer, inputExt: string): Promise<Buffer> {
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `vb_in_${Date.now()}.${inputExt}`);
  const outputPath = path.join(tmpDir, `vb_out_${Date.now()}.wav`);

  try {
    // 寫入輸入檔案
    fs.writeFileSync(inputPath, inputBuffer);

    // 使用 ffmpeg 轉換為標準 16kHz 單聲道 WAV（Voicebox 最佳相容格式）
    await execFileAsync("ffmpeg", [
      "-y",
      "-i", inputPath,
      "-ar", "16000",   // 16kHz 採樣率
      "-ac", "1",        // 單聲道
      "-c:a", "pcm_s16le",
      "-f", "wav",
      outputPath,
    ], { timeout: 10000 });

    // 讀取轉換後的檔案
    const wavBuffer = fs.readFileSync(outputPath);
    console.log(`[Voicebox] ffmpeg converted: ${inputExt} → wav, ${inputBuffer.length}bytes → ${wavBuffer.length}bytes`);
    return wavBuffer;
  } catch (error) {
    console.warn(`[Voicebox] ffmpeg conversion failed (${inputExt}), using original:`, error instanceof Error ? error.message : error);
    return inputBuffer; // 轉換失敗時退回原始檔案
  } finally {
    // 清理暫存檔案
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
  }
}

type ReferenceAudioQuality = {
  durationSeconds: number | null;
  effectiveSpeechSeconds: number | null;
  meanVolumeDb: number | null;
  maxVolumeDb: number | null;
};

/**
 * 只做讀取式分析：保留原始音檔，並將結果用於新 Profile 的品質閘門。
 * 不在此階段做激烈降噪或覆寫，避免破壞說話者音色特徵。
 */
async function analyzeReferenceAudio(inputBuffer: Buffer, inputExt: string): Promise<ReferenceAudioQuality> {
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `vb_quality_${Date.now()}_${Math.random().toString(36).slice(2)}.${inputExt}`);
  const empty: ReferenceAudioQuality = {
    durationSeconds: null,
    effectiveSpeechSeconds: null,
    meanVolumeDb: null,
    maxVolumeDb: null,
  };

  try {
    fs.writeFileSync(inputPath, inputBuffer);
    const probe = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      inputPath,
    ], { timeout: 10000 });
    const durationSeconds = Number.parseFloat(probe.stdout.trim());
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return empty;

    const volume = await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-i", inputPath,
      "-af", "volumedetect",
      "-f", "null",
      "-",
    ], { timeout: 15000 });
    const volumeOutput = `${volume.stdout}\n${volume.stderr}`;
    const meanVolumeDb = Number.parseFloat(volumeOutput.match(/mean_volume:\s*(-?[\d.]+)\s*dB/)?.[1] ?? "NaN");
    const maxVolumeDb = Number.parseFloat(volumeOutput.match(/max_volume:\s*(-?[\d.]+)\s*dB/)?.[1] ?? "NaN");

    let effectiveSpeechSeconds: number | null = null;
    try {
      const silence = await execFileAsync("ffmpeg", [
        "-hide_banner",
        "-i", inputPath,
        "-af", "silencedetect=n=-38dB:d=0.7",
        "-f", "null",
        "-",
      ], { timeout: 15000 });
      const silenceOutput = `${silence.stdout}\n${silence.stderr}`;
      const silentSeconds = Array.from(silenceOutput.matchAll(/silence_duration:\s*([\d.]+)/g))
        .reduce((total, match) => total + Number.parseFloat(match[1]), 0);
      effectiveSpeechSeconds = Math.max(0, durationSeconds - Math.min(durationSeconds, silentSeconds));
    } catch {
      // 靜音分析不可用時仍保留時長與音量檢查，不讓分析工具本身阻斷有效上傳。
    }

    return {
      durationSeconds,
      effectiveSpeechSeconds,
      meanVolumeDb: Number.isFinite(meanVolumeDb) ? meanVolumeDb : null,
      maxVolumeDb: Number.isFinite(maxVolumeDb) ? maxVolumeDb : null,
    };
  } catch (error) {
    console.warn(`[Voicebox] Reference quality analysis unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return empty;
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
  }
}

function getVoiceboxUrl(): string {
  const url = (ENV as any).voiceboxUrl || process.env.VOICEBOX_URL || "http://localhost:17493";
  return url.replace(/\/+$/, "");
}

function createTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  controller.signal.addEventListener("abort", () => clearTimeout(timer));
  return controller.signal;
}

const NGROK_HEADERS = { "ngrok-skip-browser-warning": "true" };

/**
 * 使用 Voicebox 的 /transcribe 端點自動轉錄音檔，取得真實 reference_text
 * 這是解決「胡言亂語」問題的關鍵：假的 reference_text 會被 AI 當成要說的內容
 */
async function transcribeAudio(audioBuffer: Buffer, mimeType: string, hintPrompt?: string): Promise<string | null> {
  const baseUrl = getVoiceboxUrl();
  const boundary = `----TranscribeBoundary${Date.now()}`;
  const ext = mimeType.includes("wav") ? "wav" : mimeType.includes("mp3") ? "mp3" : "m4a";
  const fileName = `audio.${ext}`;

  const fileHeader = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`
  );
  const fileFooter = Buffer.from("\r\n");
  const parts: Buffer[] = [fileHeader, audioBuffer, fileFooter];

  // language part
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="language"\r\n\r\n` +
    `zh\r\n`
  ));

  // prompt part — 提供上下文給 Whisper 幫助識別中文人名和專有名詞
  if (hintPrompt && hintPrompt.trim().length > 0) {
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="prompt"\r\n\r\n` +
      `${hintPrompt.trim()}\r\n`
    ));
    console.log(`[Voicebox] Transcribe with hint prompt: "${hintPrompt.substring(0, 60)}"`);
  }

  const endBoundary = Buffer.from(`--${boundary}--\r\n`);
  parts.push(endBoundary);
  const multipartBody = Buffer.concat(parts);

  try {
    console.log(`[Voicebox] Transcribing audio for real reference_text (${audioBuffer.length} bytes)...`);
    const res = await fetchWithRetry(`${baseUrl}/transcribe`, {
      method: "POST",
      headers: {
        ...NGROK_HEADERS,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: multipartBody,
    }, 120000, 2);  // Whisper 模型冷啟動可能需要超過 60 秒

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`[Voicebox] Transcribe failed: HTTP ${res.status}: ${errText.substring(0, 200)}`);
      return null;
    }

    const result = await res.json() as { text: string; duration: number };
    const transcribedText = result.text?.trim() || null;
    console.log(`[Voicebox] Transcribed: "${transcribedText?.substring(0, 100)}" (duration: ${result.duration}s)`);
    return transcribedText;
  } catch (error) {
    console.warn(`[Voicebox] Transcribe error:`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Voicebox 會依 reference_text 對齊樣本語音；短、嘈雜或無人聲素材的轉錄容易
 * 回傳英文碎字或單一填充詞。這些內容若被當成 reference_text，會明顯增加亂語風險。
 */
export function isUsableChineseReferenceText(value: string | null | undefined): value is string {
  if (!value?.trim()) return false;
  const cjkCharacters = value.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) ?? [];
  return cjkCharacters.length >= 2;
}

/**
 * 帶重試的 fetch（ngrok 連線不穩定時自動重試）
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  retries: number = 2,
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: createTimeoutSignal(timeoutMs),
      });
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[Voicebox] fetch attempt ${attempt + 1}/${retries + 1} failed: ${lastError.message}`);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1))); // 1s, 2s backoff
      }
    }
  }
  throw lastError!;
}

/**
 * Voicebox 會先建立 history 記錄，再執行耗時的 CPU 推論。經由 Cloudflare Tunnel 時，
 * /generate 的同步回應可能先被 504 中斷，但任務其實已經在本機開始執行。因每次 APP
 * 生成都會建立新 Profile，profile_id 可安全識別這一筆剛被接受的生成任務。
 */
async function recoverAcceptedGenerationId(
  baseUrl: string,
  profileId: string,
  text: string,
): Promise<string | null> {
  try {
    const historyRes = await fetchWithRetry(`${baseUrl}/history?limit=20`, {
      headers: NGROK_HEADERS,
    }, 15000, 0);

    if (!historyRes.ok) return null;

    const payload = await historyRes.json() as {
      items?: Array<{ id?: string; profile_id?: string; text?: string; status?: string }>;
    };
    const match = payload.items?.find((entry) =>
      entry.id &&
      entry.profile_id === profileId &&
      entry.text === text &&
      entry.status !== "failed",
    );

    return match?.id ?? null;
  } catch (error) {
    console.warn(
      `[Voicebox] Could not recover accepted generation after gateway timeout: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

/**
 * APP 以時間戳建立唯一名稱。若 Voicebox 已建立 Profile、但 Tunnel 在回應前中斷，
 * 可用精確名稱找回該 Profile，避免重試時建立多個空白資料。
 */
async function recoverCreatedProfileId(baseUrl: string, name: string): Promise<string | null> {
  try {
    const response = await fetchWithRetry(`${baseUrl}/profiles`, {
      headers: NGROK_HEADERS,
    }, 15000, 1);
    if (!response.ok) return null;

    const profiles = await response.json() as Array<{ id?: string; name?: string }>;
    return profiles.find((profile) => profile.id && profile.name === name)?.id ?? null;
  } catch (error) {
    console.warn(
      `[Voicebox] Could not recover created profile: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

/**
 * 樣本上傳回應遺失時，確認剛建立的 Profile 是否已保存樣本，避免同一音檔重複上傳。
 */
async function recoverUploadedSample(baseUrl: string, profileId: string): Promise<boolean> {
  try {
    const response = await fetchWithRetry(`${baseUrl}/profiles/${profileId}/samples`, {
      headers: NGROK_HEADERS,
    }, 15000, 1);
    if (!response.ok) return false;

    const samples = await response.json() as unknown[];
    return samples.length > 0;
  } catch (error) {
    console.warn(
      `[Voicebox] Could not verify uploaded sample: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }
}

export type VoiceboxProfile = {
  id: string;
  name: string;
  language?: string;
  description?: string | null;
  voice_type?: string;
  sample_count?: number;
};

export type VoiceboxError = {
  error: string;
  code: "CONNECTION_FAILED" | "PROFILE_NOT_FOUND" | "GENERATION_FAILED" | "UPLOAD_FAILED" | "NOT_CONFIGURED" | "QUALITY_REJECTED";
  details?: string;
};

/** 僅攔截幾乎沒有可用人聲的素材；短片段仍可由家屬選擇繼續生成。 */
export function getReferenceQualityRejection(quality: ReferenceAudioQuality): VoiceboxError | null {
  if (quality.effectiveSpeechSeconds !== null && quality.effectiveSpeechSeconds < 1) {
    return {
      error: "參考素材幾乎沒有可用人聲",
      code: "QUALITY_REJECTED",
      details: `偵測到約 ${quality.effectiveSpeechSeconds.toFixed(1)} 秒有效人聲。請確認素材不是空白、只有音樂或完全沒有說話內容。`,
    };
  }
  return null;
}

/** 將不阻斷生成的品質風險轉為可顯示提醒。 */
export function getReferenceQualityWarnings(quality: ReferenceAudioQuality): string[] {
  const warnings: string[] = [];
  if (quality.durationSeconds !== null && quality.durationSeconds < 20) {
    warnings.push(`素材長度約 ${quality.durationSeconds.toFixed(1)} 秒，仍可生成；若結果不夠相似，可改用 20 秒以上的單人語音再比較。`);
  }
  if (quality.effectiveSpeechSeconds !== null && quality.effectiveSpeechSeconds < 15 && quality.effectiveSpeechSeconds >= 1) {
    warnings.push(`有效人聲約 ${quality.effectiveSpeechSeconds.toFixed(1)} 秒，仍可繼續；移除長靜音、音樂或他人插話有助提高相似度。`);
  }
  if (quality.meanVolumeDb !== null && quality.meanVolumeDb < -42) {
    warnings.push("素材音量偏低，仍可生成；較清楚、靠近麥克風的片段通常效果更好。");
  }
  if (quality.maxVolumeDb !== null && quality.maxVolumeDb >= -0.1) {
    warnings.push("素材可能有爆音或破音，仍可生成；若聲音失真，建議再換較清楚的片段。");
  }
  return warnings;
}

function isVoiceboxError(r: unknown): r is VoiceboxError {
  return typeof r === "object" && r !== null && "error" in r && "code" in r;
}

/**
 * 取得所有可用的聲音檔案
 */
export async function getVoiceboxProfiles(): Promise<VoiceboxProfile[] | VoiceboxError> {
  try {
    const baseUrl = getVoiceboxUrl();
    const response = await fetchWithRetry(`${baseUrl}/profiles`, {
      headers: NGROK_HEADERS,
    }, 15000, 1);

    if (!response.ok) {
      return {
        error: "無法取得聲音檔案列表",
        code: "GENERATION_FAILED",
        details: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const profiles = await response.json() as VoiceboxProfile[];
    return profiles;
  } catch (error) {
    return {
      error: "無法連線至 Voicebox 服務",
      code: "CONNECTION_FAILED",
      details: error instanceof Error ? error.message : "未知錯誤",
    };
  }
}

/**
 * 建立聲音檔案 + 上傳參考音檔
 *
 * 步驟：
 * 1. POST /profiles (JSON: name, language) → 取得 profile_id
 * 2. POST /profiles/{profile_id}/samples (multipart: file, reference_text) → 上傳音檔
 */
export async function uploadVoiceProfile(
  name: string,
  audioBase64: string,
  mimeType: string = "audio/wav",
  referenceText?: string,
  personality?: string,
  description?: string,
): Promise<{ profile_id: string; name: string; qualityWarnings: string[] } | VoiceboxError> {
  const baseUrl = getVoiceboxUrl();
  const inputExt = mimeType.includes("wav") ? "wav"
    : mimeType.includes("mp3") || mimeType.includes("mpeg") ? "mp3"
      : mimeType.includes("flac") ? "flac"
        : mimeType.includes("ogg") ? "ogg"
          : mimeType.includes("aac") ? "aac"
            : mimeType.includes("quicktime") ? "mov"
              : mimeType.includes("3gpp") ? "3gp"
                : mimeType.includes("webm") ? "webm"
                  : mimeType.includes("video/mp4") ? "mp4"
                    : "m4a";
  const quality = await analyzeReferenceAudio(Buffer.from(audioBase64, "base64"), inputExt);
  const qualityRejection = getReferenceQualityRejection(quality);
  if (qualityRejection) {
    console.warn(`[Voicebox] Reference rejected before Profile creation: ${qualityRejection.error} (${qualityRejection.details})`);
    return qualityRejection;
  }
  const qualityWarnings = getReferenceQualityWarnings(quality);
  if (qualityWarnings.length > 0) {
    console.warn(`[Voicebox] Reference quality reminders: ${qualityWarnings.join(" | ")}`);
  }
  console.log(`[Voicebox] Reference quality accepted: duration=${quality.durationSeconds?.toFixed(1) ?? "unknown"}s, effective=${quality.effectiveSpeechSeconds?.toFixed(1) ?? "unknown"}s, mean=${quality.meanVolumeDb?.toFixed(1) ?? "unknown"}dB, peak=${quality.maxVolumeDb?.toFixed(1) ?? "unknown"}dB`);

  // 步驟 1：建立 Profile（JSON），若有個性設定或聲音描述則一同送出
  let profileId: string;
  try {
    const profileBody: Record<string, string> = { name, language: "zh", voice_type: "cloned" };
    if (personality) {
      profileBody.personality = personality;
    }
    if (description) {
      profileBody.description = description;
    }
    // 不重試 POST：Voicebox 若已建立 Profile 但 Tunnel 中斷，重試會留下重複空白資料。
    const createRes = await fetchWithRetry(`${baseUrl}/profiles`, {
      method: "POST",
      headers: { ...NGROK_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify(profileBody),
    }, 90000, 0);

    if (!createRes.ok) {
      const errText = await createRes.text().catch(() => "");
      const recoveredProfileId =
        createRes.status === 504 || createRes.status === 522 || createRes.status === 524
          ? await recoverCreatedProfileId(baseUrl, name)
          : null;

      if (recoveredProfileId) {
        console.warn(
          `[Voicebox] /profiles returned HTTP ${createRes.status}, but recovered profile ${recoveredProfileId}`,
        );
        profileId = recoveredProfileId;
      } else {
        return {
          error: "建立聲音檔案失敗",
          code: "UPLOAD_FAILED",
          details: `HTTP ${createRes.status}: ${errText}`,
        };
      }
    } else {
      const profile = await createRes.json() as { id: string; name: string };
      profileId = profile.id;
    }
  } catch (error) {
    const recoveredProfileId = await recoverCreatedProfileId(baseUrl, name);
    if (recoveredProfileId) {
      console.warn(`[Voicebox] /profiles response lost, recovered profile ${recoveredProfileId}`);
      profileId = recoveredProfileId;
    } else {
      return {
        error: "無法連線至 Voicebox 服務（建立聲音檔案時）",
        code: "CONNECTION_FAILED",
        details: error instanceof Error ? error.message : "未知錯誤",
      };
    }
  }

  // 步驟 2：上傳參考音檔（先轉換為 WAV，再構建 multipart/form-data）
  try {
    let binaryData: Buffer = Buffer.from(audioBase64, "base64");
    const isVideoReference = mimeType.startsWith("video/");
    
    // 正確映射 MIME type 到副檔名
    const extMap: Record<string, string> = {
      "audio/wav": "wav",
      "audio/x-wav": "wav",
      "audio/mpeg": "mp3",
      "audio/mp3": "mp3",
      "audio/mp4": "m4a",
      "audio/x-m4a": "m4a",
      "audio/aac": "aac",
      "audio/x-aac": "aac",
      "audio/flac": "flac",
      "audio/ogg": "ogg",
      "audio/x-wma": "wma",
      "audio/webm": "webm",
      "video/mp4": "mp4",
      "video/quicktime": "mov",
      "video/x-m4v": "m4v",
      "video/3gpp": "3gp",
      "video/webm": "webm",
    };
    const originalExt = extMap[mimeType] || "wav";
    
    console.log(`[Voicebox] Upload debug: mimeType=${mimeType}, originalExt=${originalExt}, audioSize=${binaryData.length}bytes`);
    
    // 非 WAV 格式用 ffmpeg 快速轉換（僅容器轉換，不加濾鏡，避免超時）
    let uploadMimeType = mimeType;
    let uploadExt = originalExt;
    if (originalExt !== "wav") {
      console.log(`[Voicebox] Quick converting ${originalExt} → wav (no filters)...`);
      const convertedBuffer = await convertToWav(binaryData, originalExt);
      if (convertedBuffer.length !== binaryData.length || !convertedBuffer.equals(binaryData)) {
        binaryData = convertedBuffer;
        uploadMimeType = "audio/wav";
        uploadExt = "wav";
      } else if (isVideoReference) {
        return {
          error: "影片音軌擷取失敗",
          code: "UPLOAD_FAILED",
          details: "此影片找不到可用的聲音軌，或其編碼格式不支援。請改用含有人聲的 MP4／MOV，或先從影片匯出音檔。",
        };
      }
    }
    
    const fileName = `reference.${uploadExt}`;
    
    // 手動構建 multipart/form-data
    const boundary = `----VoiceboxBoundary${Date.now()}${Math.random().toString(36).slice(2)}`;
    
    // file part
    const fileHeader = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: ${uploadMimeType}\r\n\r\n`
    );
    const fileFooter = Buffer.from("\r\n");
    
    // reference_text 是 Voicebox 必填欄位
    // 關鍵修復：使用 Voicebox /transcribe 端點自動轉錄音檔，取得真實的 reference_text
    // 之前送假的 reference_text（「這是一段語音錄音」）導致 AI 把這段假文字也唸出來（胡言亂語）
    let actualReferenceText = (referenceText && referenceText.trim().length > 0)
      ? referenceText
      : null;

    // 若沒有提供真實的 reference_text，用 Voicebox 自動轉錄。
    // 只接受至少兩個 CJK 字元，避免短素材與雜訊被轉錄成英文碎字後帶來亂語。
    if (!actualReferenceText) {
      console.log(`[Voicebox] No reference_text provided, auto-transcribing audio...`);
      // 用 profile 名稱和描述作為 Whisper 的 prompt 提示，幫助識別人名和專有名詞
      const hintParts = [name, description].filter((s) => s && s.trim().length > 0);
      const hintPrompt = hintParts.length > 0 ? hintParts.join("，") : undefined;
      const transcript = await transcribeAudio(binaryData, uploadMimeType, hintPrompt);
      if (isUsableChineseReferenceText(transcript)) {
        actualReferenceText = transcript.trim();
      } else {
        const rejectedTranscript = String(transcript ?? "empty").slice(0, 80);
        console.warn(`[Voicebox] Unsafe reference transcription rejected: "${rejectedTranscript}"`);
        return {
          error: "無法確認參考音檔的實際內容",
          code: "UPLOAD_FAILED",
          details: "為避免生成亂語，請在首頁「您知道的音檔內容」盡量輸入這段素材說的原話後再生成；短片段也可以使用。",
        };
      }
    }
    
    const endBoundary = Buffer.from(`--${boundary}--\r\n`);
    const textPart = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="reference_text"\r\n\r\n` +
      `${actualReferenceText}\r\n`
    );
    const multipartBody = Buffer.concat([fileHeader, binaryData, fileFooter, textPart, endBoundary]);
    console.log(`[Voicebox] Uploading sample with reference_text: "${actualReferenceText.substring(0, 50)}"`);
    // 不重試 POST：若遠端已保存樣本但回應遺失，改以樣本列表確認，避免重複上傳。
    const sampleRes = await fetchWithRetry(`${baseUrl}/profiles/${profileId}/samples`, {
      method: "POST",
      headers: {
        ...NGROK_HEADERS,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: multipartBody,
    }, 120000, 0);

    if (!sampleRes.ok) {
      const errText = await sampleRes.text().catch(() => "");
      const recoveredSample =
        sampleRes.status === 504 || sampleRes.status === 522 || sampleRes.status === 524
          ? await recoverUploadedSample(baseUrl, profileId)
          : false;

      if (recoveredSample) {
        console.warn(
          `[Voicebox] sample upload returned HTTP ${sampleRes.status}, but a sample exists on ${profileId}`,
        );
        return { profile_id: profileId, name, qualityWarnings };
      }
      console.error(`[Voicebox] Sample upload failed: HTTP ${sampleRes.status}: ${errText.substring(0, 200)}`);
      return {
        error: "上傳參考音檔失敗",
        code: "UPLOAD_FAILED",
        details: `HTTP ${sampleRes.status}: ${errText}`,
      };
    }

    console.log(`[Voicebox] Sample uploaded successfully for profile ${profileId}`);
    return { profile_id: profileId, name, qualityWarnings };
  } catch (error) {
    const recoveredSample = await recoverUploadedSample(baseUrl, profileId);
    if (recoveredSample) {
      console.warn(`[Voicebox] sample upload response lost, recovered saved sample on ${profileId}`);
      return { profile_id: profileId, name, qualityWarnings };
    }
    console.error(`[Voicebox] Sample upload error:`, error instanceof Error ? error.message : error);
    return {
      error: "上傳參考音檔時發生錯誤",
      code: "UPLOAD_FAILED",
      details: error instanceof Error ? error.message : "未知錯誤",
    };
  }
}

/**
 * 生成語音（非同步流程）
 *
 * 步驟：
 * 1. POST /generate (JSON: profile_id, text) → 取得 generation_id
 * 2. 輪詢 GET /history/{generation_id} 直到 status = completed/failed
 * 3. GET /audio/{generation_id} → 取得音檔 binary → 轉 base64
 */
export async function generateVoiceboxSpeech(
  request: { text: string; profile_id: string; speed?: number; language?: string; instruct?: string; engine?: string; seed?: number },
): Promise<{ audio: string; duration: number | null; generationId: string } | VoiceboxError> {
  const baseUrl = getVoiceboxUrl();

  // 步驟 1：啟動生成
  let generationId: string;
  try {
    // 不重試 POST /generate：若 Tunnel 在 Voicebox 已接收任務後才回傳 504，重試會建立
    // 重複的耗時生成任務。下方會改以 profile_id 從 history 找回已接受的任務。
    const genRes = await fetchWithRetry(`${baseUrl}/generate`, {
      method: "POST",
      headers: { ...NGROK_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: request.text,
        profile_id: request.profile_id,
        language: request.language || "zh",
        ...(request.speed !== undefined && { speed: request.speed }),
        ...(request.instruct && { instruct: request.instruct }),
        ...(request.engine && { engine: request.engine }),
        ...(request.seed !== undefined && { seed: request.seed }),
      }),
    }, 90000, 0);

    if (!genRes.ok) {
      const errText = await genRes.text().catch(() => "");
      const recoveredGenerationId =
        genRes.status === 504 || genRes.status === 522 || genRes.status === 524
          ? await recoverAcceptedGenerationId(baseUrl, request.profile_id, request.text)
          : null;

      if (recoveredGenerationId) {
        console.warn(
          `[Voicebox] /generate returned HTTP ${genRes.status}, but recovered accepted task ${recoveredGenerationId} from history`,
        );
        generationId = recoveredGenerationId;
      } else {
      return {
        error: "啟動語音生成失敗",
        code: "GENERATION_FAILED",
        details: `HTTP ${genRes.status}: ${errText}`,
      };
      }
    } else {
      const genResult = await genRes.json() as { id: string; status: string };
      generationId = genResult.id;
    }
  } catch (error) {
    return {
      error: "無法連線至 Voicebox 服務（啟動生成時）",
      code: "CONNECTION_FAILED",
      details: error instanceof Error ? error.message : "未知錯誤",
    };
  }

  // 步驟 2：輪詢生成狀態（最多等待 30 分鐘，每 2 秒查詢一次）。
  // Windows CPU 首次載入模型與較長文字可能超過 6 分鐘；Voicebox 即使仍在生成，
  // 也不能提早結束背景工作，否則完成的音檔會只留在 Voicebox history。
  const maxPolls = 900;
  const pollInterval = 2000;
  let finalStatus: string = "generating";
  let duration: number | null = null;
  let errorMsg: string | null = null;

  for (let i = 0; i < maxPolls; i++) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    try {
      const statusRes = await fetchWithRetry(`${baseUrl}/history/${generationId}`, {
        headers: NGROK_HEADERS,
      }, 15000, 1);

      if (statusRes.ok) {
        const status = await statusRes.json() as {
          status: string;
          duration?: number | null;
          error?: string | null;
        };
        finalStatus = status.status;
        duration = status.duration ?? null;
        errorMsg = status.error ?? null;

        if (finalStatus === "completed" || finalStatus === "failed") {
          break;
        }
      }
    } catch {
      // 輪詢失敗不中斷，繼續重試
    }
  }

  if (finalStatus === "failed") {
    return {
      error: "語音生成失敗",
      code: "GENERATION_FAILED",
      details: errorMsg || "Voicebox 回報生成失敗",
    };
  }

  if (finalStatus !== "completed") {
    return {
        error: "語音生成逾時（超過 30 分鐘）",
      code: "GENERATION_FAILED",
        details: "生成狀態持續為 generating，Voicebox 仍可能在本機處理中，請稍後再試或縮短文字",
    };
  }

  // 步驟 3：取得音檔（binary → base64）
  try {
    const audioRes = await fetchWithRetry(`${baseUrl}/audio/${generationId}`, {
      headers: NGROK_HEADERS,
    }, 30000, 2);

    if (!audioRes.ok) {
      const errText = await audioRes.text().catch(() => "");
      return {
        error: "取得生成音檔失敗",
        code: "GENERATION_FAILED",
        details: `HTTP ${audioRes.status}: ${errText}`,
      };
    }

    const audioBuffer = await audioRes.arrayBuffer();
    const audioBytes = Buffer.from(audioBuffer);
    
    // 記錄音檔格式資訊，便於診斷
    const contentType = audioRes.headers.get("content-type") || "unknown";
    const headerHex = audioBytes.slice(0, 16).toString("hex");
    console.log(`[Voicebox] Audio downloaded: ${audioBytes.length}bytes, content-type=${contentType}, header=${headerHex}`);
    
    // 驗證音檔有效性：必須有足夠的大小且包含有效的音檔 header
    if (audioBytes.length < 100) {
      console.error(`[Voicebox] Audio too small: ${audioBytes.length}bytes, likely corrupted`);
      return {
        error: "生成的音檔資料不完整，請重試",
        code: "GENERATION_FAILED",
        details: `Audio size only ${audioBytes.length} bytes`,
      };
    }
    
    // 檢查是否為有效的音檔格式（WAV RIFF header 或 MP3 ID3 tag）
    const isWav = audioBytes.slice(0, 4).toString("ascii") === "RIFF";
    const isMp3 = audioBytes[0] === 0x49 && audioBytes[1] === 0x44 && audioBytes[2] === 0x33; // ID3
    
    if (!isWav && !isMp3) {
      console.warn(`[Voicebox] Unknown audio format, header=${headerHex}, size=${audioBytes.length}`);
      // 不阻擋，但記錄警告 — Voicebox 可能回傳非標準格式
    }
    
    const audioBase64 = audioBytes.toString("base64");

    return {
      audio: audioBase64,
      duration,
      generationId,
    };
  } catch (error) {
    return {
      error: "下載生成音檔時發生錯誤",
      code: "GENERATION_FAILED",
      details: error instanceof Error ? error.message : "未知錯誤",
    };
  }
}

/**
 * 檢查 Voicebox 服務是否正在運行
 */
export async function checkVoiceboxHealth(): Promise<{
  online: boolean;
  url: string;
  profileCount?: number;
  error?: string;
}> {
  const url = getVoiceboxUrl();
  try {
    const response = await fetchWithRetry(`${url}/profiles`, {
      headers: NGROK_HEADERS,
    // 健康檢查只負責快速回報連線狀態；不應因重試而卡住首頁或 API 測試。
    }, 6000, 0);

    if (response.ok) {
      const profiles = await response.json() as VoiceboxProfile[];
      return {
        online: true,
        url,
        profileCount: profiles.length,
      };
    }

    return {
      online: false,
      url,
      error: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      online: false,
      url,
      error: error instanceof Error ? error.message : "連線失敗",
    };
  }
}
