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
 * 1. 只辨識「常見姓氏 + 1~2 個姓名字」的疑似中文姓名
 * 2. 不替一般片語、標語或完整句子加入拼音，避免干擾語句韻律
 * 3. 組合成簡潔提示字串
 */
export function generatePronunciationHint(text: string): string | null {
  if (!containsChinese(text)) {
    return null;
  }

  // 台灣常見姓氏。這裡刻意採保守策略；沒有足夠把握時寧可不加提示，
  // 也不要把「十方福報」等一般片語誤當成人名，破壞模型的自然節奏。
  const commonSurnames = "陳林黃張李王吳劉蔡楊許鄭謝郭洪邱曾廖賴徐周葉蘇莊呂江何蕭羅高潘簡朱鍾彭游詹胡施沈余趙梁柯翁魏孫戴范宋方鄧杜傅侯曹薛丁溫紀";
  // 中文沒有天然斷詞，不能單靠「姓氏 + 兩個字」猜測人名；例如「十方福報」
  // 會被錯認為「方福報」。因此只接受句首、標點之後或姓名引導詞之後的候選字串。
  const namePattern = new RegExp(
    `(?:^|[，。！？、；：\\s]|我是|我叫|名叫|叫做|姓名是|名字是|的)([${commonSurnames}][\\u4e00-\\u9fff]{1,2})`,
    "g",
  );
  const candidates = Array.from(text.matchAll(namePattern), (match) => match[1]);
  const names = [...new Set(candidates)].slice(0, 2);

  if (names.length === 0) {
    return null;
  }

  const annotations: string[] = [];
  for (const name of names) {
    const pinyinStr = getPinyinAnnotation(name);
    if (pinyinStr) {
      annotations.push(`${name}=${pinyinStr}`);
    }
  }

  if (annotations.length === 0) {
    return null;
  }

  // 簡潔提示：只標注拼音，不加多餘描述
  const hint = `人名發音：${annotations.join("、")}`;
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
