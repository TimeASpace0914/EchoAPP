/**
 * Voicebox REST API 代理服務
 * 
 * Voicebox 是開源本地語音克隆軟件，在電腦上運行 FastAPI 後端（預設 http://localhost:17493）
 * 本模組作為代理，讓行動 APP 能透過後端伺服器呼叫 Voicebox API
 * 
 * Voicebox API 端點：
 * - GET  /profiles          — 列出所有聲音檔案
 * - POST /generate          — 生成語音（text + profile_id）
 * - POST /transcribe        — 語音轉文字
 * 
 * 設定方式：在環境變數中設定 VOICEBOX_URL（預設 http://localhost:17493）
 */

import { ENV } from "./_core/env";

// Voicebox 後端 URL（可透過環境變數覆蓋）
function getVoiceboxUrl(): string {
  const url = (ENV as any).voiceboxUrl || process.env.VOICEBOX_URL || "http://localhost:17493";
  return url.replace(/\/+$/, "");
}

export type VoiceboxProfile = {
  id: string;
  name: string;
  engine?: string;
  language?: string;
  description?: string;
};

export type VoiceboxGenerateRequest = {
  text: string;
  profile_id: string;
  speed?: number;   // 0.5 ~ 2.0，預設 1.0
  seed?: number;
};

export type VoiceboxGenerateResponse = {
  audio: string;       // base64 編碼的 WAV 音檔
  duration?: number;   // 秒
  profile_id: string;
  text: string;
};

export type VoiceboxError = {
  error: string;
  code: "CONNECTION_FAILED" | "PROFILE_NOT_FOUND" | "GENERATION_FAILED" | "NOT_CONFIGURED";
  details?: string;
};

/**
 * 取得所有可用的聲音檔案
 */
export async function getVoiceboxProfiles(): Promise<VoiceboxProfile[] | VoiceboxError> {
  try {
    const baseUrl = getVoiceboxUrl();
    const response = await fetch(`${baseUrl}/profiles`, {
      signal: AbortSignal.timeout(5000),
    });

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
    const isConnectionError =
      error instanceof TypeError ||
      (error instanceof Error && error.message.includes("fetch"));

    return {
      error: isConnectionError
        ? "無法連線至 Voicebox 服務，請確認 Voicebox 已在電腦上啟動"
        : "取得聲音檔案失敗",
      code: "CONNECTION_FAILED",
      details: error instanceof Error ? error.message : "未知錯誤",
    };
  }
}

/**
 * 使用 Voicebox 生成語音
 * @param text 要生成的文字
 * @param profileId 聲音檔案 ID
 * @param referenceAudioBase64 參考音檔的 base64（若 Voicebox 支援直接上傳）
 */
export async function generateVoiceboxSpeech(
  request: VoiceboxGenerateRequest,
): Promise<VoiceboxGenerateResponse | VoiceboxError> {
  try {
    const baseUrl = getVoiceboxUrl();

    const response = await fetch(`${baseUrl}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: request.text,
        profile_id: request.profile_id,
        ...(request.speed !== undefined && { speed: request.speed }),
        ...(request.seed !== undefined && { seed: request.seed }),
      }),
      signal: AbortSignal.timeout(120000), // 語音生成最多等待 2 分鐘
    });

    if (response.status === 404) {
      return {
        error: "找不到指定的聲音檔案",
        code: "PROFILE_NOT_FOUND",
        details: `Profile ID: ${request.profile_id}`,
      };
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        error: "語音生成失敗",
        code: "GENERATION_FAILED",
        details: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const result = await response.json() as VoiceboxGenerateResponse;
    return result;
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "TimeoutError";
    const isConnectionError =
      error instanceof TypeError ||
      (error instanceof Error && error.message.includes("fetch"));

    if (isTimeout) {
      return {
        error: "語音生成逾時，請稍後再試",
        code: "GENERATION_FAILED",
        details: "請求超過 2 分鐘未回應",
      };
    }

    return {
      error: isConnectionError
        ? "無法連線至 Voicebox 服務，請確認 Voicebox 已在電腦上啟動"
        : "語音生成時發生錯誤",
      code: "CONNECTION_FAILED",
      details: error instanceof Error ? error.message : "未知錯誤",
    };
  }
}

/**
 * 上傳音檔並建立聲音檔案（透過 Voicebox 的 profile 建立 API）
 * 注意：Voicebox 目前主要透過桌面 UI 建立 profile，此為備用方案
 */
export async function uploadVoiceProfile(
  name: string,
  audioBase64: string,
  mimeType: string = "audio/wav",
): Promise<{ profile_id: string; name: string } | VoiceboxError> {
  try {
    const baseUrl = getVoiceboxUrl();

    // 將 base64 轉換為 Blob
    const binaryData = Buffer.from(audioBase64, "base64");
    const formData = new FormData();
    const ext = mimeType.split("/")[1] || "wav";
    const audioBlob = new Blob([binaryData], { type: mimeType });
    formData.append("file", audioBlob, `reference.${ext}`);
    formData.append("name", name);

    const response = await fetch(`${baseUrl}/profiles`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        error: "建立聲音檔案失敗",
        code: "GENERATION_FAILED",
        details: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const result = await response.json() as { id: string; name: string };
    return { profile_id: result.id, name: result.name };
  } catch (error) {
    return {
      error: "無法連線至 Voicebox 服務",
      code: "CONNECTION_FAILED",
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
    const response = await fetch(`${url}/profiles`, {
      signal: AbortSignal.timeout(3000),
    });

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
