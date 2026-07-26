/**
 * 中文注音/拼音提示工具
 *
 * 解決 Voicebox TTS 引擎的 G2P（Grapheme-to-Phoneme）模型在遇到罕見字時
 * 根據形聲字規則猜測發音，導致人名被唸錯的問題。
 *
 * 例如：「蔡承諺」可能被 G2P 模型錯誤映射為「蔡懲罰」的音素。
 *
 * 解決方案：在生成語音前，自動偵測輸入文字中的中文字，
 * 為每個字/詞產生拼音標注，附加到 instruct 參數中，
 * 讓 TTS 引擎知道正確的發音。
 */

import { pinyin } from "pinyin-pro";

/**
 * 偵測文字中是否包含中文字
 */
export function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

/**
 * 從文字中提取連續的中文字片段
 * 回傳所有連續中文字片段的陣列（長度 ≥ 2，避免單字噪音）
 */
export function extractChineseSegments(text: string): string[] {
  const matches = text.match(/[\u4e00-\u9fff]{2,}/g);
  return matches || [];
}

/**
 * 為一段中文文字產生帶聲調符號的拼音標注
 *
 * 例如：「蔡承諺」→「cài chéng yàn」
 *
 * @param text 中文文字
 * @returns 拼音字串（以空格分隔每個字的拼音），若無法轉換則回傳 null
 */
export function getPinyinAnnotation(text: string): string | null {
  try {
    // 使用 surname 模式，讓姓氏字優先匹配姓氏讀音
    const pinyinResult = pinyin(text, {
      toneType: "symbol",
      type: "array",
      mode: "surname",
      surname: "head",
      nonZh: "removed",
    });
    if (pinyinResult && pinyinResult.length > 0) {
      const filtered = pinyinResult.filter((p) => p && p.trim());
      if (filtered.length > 0) {
        return filtered.join(" ");
      }
    }
  } catch {
    // 轉換失敗
  }
  return null;
}

/**
 * 為輸入文字產生發音提示字串，可附加到 instruct 參數中
 *
 * 策略：
 * 1. 提取文字中所有連續中文字片段（≥2字）
 * 2. 對每個片段產生拼音標注
 * 3. 組合成提示字串
 *
 * 例如輸入「我是蔡承諺，今天天氣很好」
 * 產生提示：「『蔡承諺』的拼音是『cài chéng yàn』，『今天』的拼音是『jīn tiān』，請按照標準普通話發音朗讀，遇到人名請特別注意正確發音」
 *
 * 為避免提示過長，最多只標注前 5 個片段
 */
export function generatePronunciationHint(text: string): string | null {
  if (!containsChinese(text)) {
    return null;
  }

  const segments = extractChineseSegments(text);
  if (segments.length === 0) {
    return null;
  }

  // 限制最多標注 5 個片段，避免 instruct 過長
  const maxSegments = 5;
  const segmentsToAnnotate = segments.slice(0, maxSegments);

  const annotations: string[] = [];
  for (const segment of segmentsToAnnotate) {
    const pinyinStr = getPinyinAnnotation(segment);
    if (pinyinStr) {
      annotations.push(`「${segment}」的拼音是「${pinyinStr}」`);
    }
  }

  if (annotations.length === 0) {
    return null;
  }

  // 組合提示字串
  const hint = `請按照標準普通話發音朗讀，${annotations.join("，")}，遇到人名請特別注意正確發音，不要猜測罕見字的讀音`;
  return hint;
}

/**
 * 將發音提示附加到既有的 instruct 字串中
 *
 * @param instruct 既有的 instruct 字串（可為空）
 * @param text 要生成語音的文字
 * @returns 附加了發音提示的 instruct 字串
 */
export function appendPronunciationHint(instruct: string, text: string): string {
  const hint = generatePronunciationHint(text);
  if (!hint) {
    return instruct;
  }

  return instruct
    ? `${instruct}。${hint}`
    : hint;
}
