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
 * 使用 ffmpeg 將任意音檔格式轉換為 WAV
 * 保留原始採樣率和聲道數，只轉換容器格式為 WAV。
 * Voicebox 對 WAV 格式的相容性最佳，M4A/MP4 等容器常被拒絕。
 */
async function convertToWav(inputBuffer: Buffer, inputExt: string): Promise<Buffer> {
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `vb_in_${Date.now()}.${inputExt}`);
  const outputPath = path.join(tmpDir, `vb_out_${Date.now()}.wav`);

  try {
    // 寫入輸入檔案
    fs.writeFileSync(inputPath, inputBuffer);

    // 使用 ffmpeg 轉換為標準 WAV 格式
    // 保留原始採樣率和聲道數，只轉容器格式，避免品質損失
    await execFileAsync("ffmpeg", [
      "-y",               // 覆寫輸出
      "-i", inputPath,     // 輸入
      "-c:a", "pcm_s16le",  // 音頻編碼：16-bit PCM little-endian
      "-f", "wav",          // 輸出格式
      outputPath,
    ], { timeout: 30000 });

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
  code: "CONNECTION_FAILED" | "PROFILE_NOT_FOUND" | "GENERATION_FAILED" | "UPLOAD_FAILED" | "NOT_CONFIGURED";
  details?: string;
};

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
): Promise<{ profile_id: string; name: string } | VoiceboxError> {
  const baseUrl = getVoiceboxUrl();

  // 步驟 1：建立 Profile（JSON）
  let profileId: string;
  try {
    const createRes = await fetchWithRetry(`${baseUrl}/profiles`, {
      method: "POST",
      headers: { ...NGROK_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ name, language: "zh", voice_type: "cloned" }),
    }, 30000, 2);

    if (!createRes.ok) {
      const errText = await createRes.text().catch(() => "");
      return {
        error: "建立聲音檔案失敗",
        code: "UPLOAD_FAILED",
        details: `HTTP ${createRes.status}: ${errText}`,
      };
    }

    const profile = await createRes.json() as { id: string; name: string };
    profileId = profile.id;
  } catch (error) {
    return {
      error: "無法連線至 Voicebox 服務（建立聲音檔案時）",
      code: "CONNECTION_FAILED",
      details: error instanceof Error ? error.message : "未知錯誤",
    };
  }

  // 步驟 2：上傳參考音檔（先轉換為 WAV，再構建 multipart/form-data）
  try {
    let binaryData: Buffer = Buffer.from(audioBase64, "base64");
    
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
    };
    const originalExt = extMap[mimeType] || "wav";
    
    console.log(`[Voicebox] Upload debug: mimeType=${mimeType}, originalExt=${originalExt}, audioSize=${binaryData.length}bytes`);
    
    // 如果不是 WAV，先用 ffmpeg 轉換為標準 WAV 格式
    let uploadMimeType = mimeType;
    let uploadExt = originalExt;
    if (originalExt !== "wav") {
      console.log(`[Voicebox] Converting ${originalExt} → wav via ffmpeg...`);
      const convertedBuffer = await convertToWav(binaryData, originalExt);
      if (convertedBuffer.length !== binaryData.length || !convertedBuffer.equals(binaryData)) {
        binaryData = convertedBuffer;
        uploadMimeType = "audio/wav";
        uploadExt = "wav";
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
    
    // reference_text part
    const textPart = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="reference_text"\r\n\r\n` +
      `參考音檔\r\n`
    );
    
    // ending boundary
    const endBoundary = Buffer.from(`--${boundary}--\r\n`);
    
    // 組合所有部分
    const multipartBody = Buffer.concat([fileHeader, binaryData, fileFooter, textPart, endBoundary]);
    
    console.log(`[Voicebox] Uploading sample: profile=${profileId}, file=${fileName}, size=${binaryData.length}bytes, mimeType=${uploadMimeType}`);
    
    const sampleRes = await fetchWithRetry(`${baseUrl}/profiles/${profileId}/samples`, {
      method: "POST",
      headers: {
        ...NGROK_HEADERS,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: multipartBody,
    }, 90000, 1);

    if (!sampleRes.ok) {
      const errText = await sampleRes.text().catch(() => "");
      console.error(`[Voicebox] Sample upload failed: HTTP ${sampleRes.status}: ${errText}`);
      return {
        error: "上傳參考音檔失敗",
        code: "UPLOAD_FAILED",
        details: `HTTP ${sampleRes.status}: ${errText}`,
      };
    }

    console.log(`[Voicebox] Sample uploaded successfully for profile ${profileId}`);
    return { profile_id: profileId, name };
  } catch (error) {
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
  request: { text: string; profile_id: string; speed?: number },
): Promise<{ audio: string; duration: number | null; generationId: string } | VoiceboxError> {
  const baseUrl = getVoiceboxUrl();

  // 步驟 1：啟動生成
  let generationId: string;
  try {
    const genRes = await fetchWithRetry(`${baseUrl}/generate`, {
      method: "POST",
      headers: { ...NGROK_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: request.text,
        profile_id: request.profile_id,
        ...(request.speed !== undefined && { speed: request.speed }),
      }),
    }, 120000, 3);

    if (!genRes.ok) {
      const errText = await genRes.text().catch(() => "");
      return {
        error: "啟動語音生成失敗",
        code: "GENERATION_FAILED",
        details: `HTTP ${genRes.status}: ${errText}`,
      };
    }

    const genResult = await genRes.json() as { id: string; status: string };
    generationId = genResult.id;
  } catch (error) {
    return {
      error: "無法連線至 Voicebox 服務（啟動生成時）",
      code: "CONNECTION_FAILED",
      details: error instanceof Error ? error.message : "未知錯誤",
    };
  }

  // 步驟 2：輪詢生成狀態（最多等待 5 分鐘）
  const maxPolls = 60;
  const pollInterval = 5000;
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
      error: "語音生成逾時（超過 5 分鐘）",
      code: "GENERATION_FAILED",
      details: "生成狀態持續為 generating，請稍後再試或縮短文字",
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
    }, 15000, 1);

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
