export const WHISPER_MODEL_SIZES = [
  "base",
  "small",
  "medium",
  "large",
  "turbo",
] as const;

export type WhisperModelSize = (typeof WHISPER_MODEL_SIZES)[number];

const DEFAULT_WHISPER_MODEL: WhisperModelSize = "turbo";
const DEFAULT_TRANSCRIPTION_LANGUAGE = "zh";

/**
 * 將環境變數限制為 Voicebox 支援的 Whisper 模型尺寸。
 * 使用 turbo 作為中文參考音檔的預設值，在品質、速度與記憶體間取得平衡。
 */
export function resolveWhisperModelSize(
  value: string | undefined = process.env.VOICEBOX_WHISPER_MODEL,
): WhisperModelSize {
  const normalized = value?.trim().toLowerCase();
  return WHISPER_MODEL_SIZES.includes(normalized as WhisperModelSize)
    ? (normalized as WhisperModelSize)
    : DEFAULT_WHISPER_MODEL;
}

/**
 * EchoAPP 目前的聲音 profile 以中文為主。對短參考音檔提供明確語言提示，
 * 可避免 Whisper 將中文錯判為英文；未來多語支援時可在 .env 覆寫。
 */
export function resolveTranscriptionLanguage(
  value: string | undefined = process.env.VOICEBOX_TRANSCRIPTION_LANGUAGE,
): string {
  const normalized = value?.trim().toLowerCase();
  return normalized || DEFAULT_TRANSCRIPTION_LANGUAGE;
}
