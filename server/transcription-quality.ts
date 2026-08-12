/**
 * 參考逐字稿品質檢核。
 *
 * Voice cloning 會將 reference_text 與參考音檔對齊；錯誤、過短或語言不符的
 * 文字比「沒有文字」更容易讓後續模型產生錯讀。因此在送至 Voicebox 前，
 * 先以保守規則阻擋明顯不可信的自動轉錄，並要求使用者改填實際內容。
 */

export type TranscriptValidation = {
  valid: boolean;
  text?: string;
  reason?: string;
};

const CJK_CHARACTER = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u;
const LATIN_CHARACTER = /[A-Za-z]/u;
const ONLY_FILLERS_OR_PUNCTUATION = /^[\s，。！？、,.!?～~嗯啊喔哦欸誒哈]+$/u;
const REPEATED_CHARACTER = /^(.)\1{2,}$/u;

/**
 * 移除控制字元並統一空白，讓同一份文字可安全送往 multipart 欄位。
 */
export function normalizeReferenceText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

/**
 * 驗證以繁體中文為主要語言的參考逐字稿是否足以安全地用於聲音克隆。
 *
 * 這不是 ASR 信心分數；它只負責拒絕已知會嚴重破壞音文對齊的結果，例如
 * 空字串、單一語助詞、純英文字串與明顯重複的幻覺輸出。
 */
export function validateChineseReferenceTranscript(value: string): TranscriptValidation {
  const text = normalizeReferenceText(value);

  if (text.length < 2) {
    return {
      valid: false,
      reason: "辨識文字過短，無法確認是否與音檔內容相符。",
    };
  }

  if (ONLY_FILLERS_OR_PUNCTUATION.test(text) || REPEATED_CHARACTER.test(text)) {
    return {
      valid: false,
      reason: "辨識結果只有語助詞或重複字元，可能不是可靠的逐字稿。",
    };
  }

  // EchoAPP 目前將參考音檔固定交給中文 Voicebox profile 處理。若完全沒有
  // 中日韓文字而只有拉丁字母，通常是 Whisper 將中文誤判為英文的症狀。
  if (!CJK_CHARACTER.test(text) && LATIN_CHARACTER.test(text)) {
    return {
      valid: false,
      reason: "辨識結果看起來不是中文，請手動輸入音檔實際說的文字。",
    };
  }

  if (!CJK_CHARACTER.test(text)) {
    return {
      valid: false,
      reason: "辨識結果未包含可用的中文字，請手動輸入音檔實際說的文字。",
    };
  }

  return { valid: true, text };
}
