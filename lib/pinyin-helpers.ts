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
 * 已確認會被 Qwen G2P 誤讀的園區／人名用詞。
 * 此詞庫優先於自動姓名猜測；僅在原文真的包含詞條時才加入指令，避免干擾一般句子。
 */
const FORCED_PRONUNCIATION_LEXICON: ReadonlyArray<{
  term: string;
  pinyin: string;
  zhuyin: string;
}> = [
  { term: "日日誦經", pinyin: "rì rì sòng jīng", zhuyin: "ㄖˋ ㄖˋ ㄙㄨㄥˋ ㄐㄧㄥ" },
  { term: "祝禱加持", pinyin: "zhù dǎo jiā chí", zhuyin: "ㄓㄨˋ ㄉㄠˇ ㄐㄧㄚ ㄔˊ" },
  { term: "蔡承諺", pinyin: "cài chéng yàn", zhuyin: "ㄘㄞˋ ㄔㄥˊ ㄧㄢˋ" },
];

/** 已知注音到拼音的精準對照，只供使用者標注的三個易錯字使用。 */
const KNOWN_MANUAL_PRONUNCIATIONS: Readonly<Record<string, { pinyin: string; zhuyin: string }>> = {
  誦: { pinyin: "sòng", zhuyin: "ㄙㄨㄥˋ" },
  禱: { pinyin: "dǎo", zhuyin: "ㄉㄠˇ" },
  諺: { pinyin: "yàn", zhuyin: "ㄧㄢˋ" },
};

/**
 * Qwen Base 的 instruction control 無法可靠覆寫罕見中文字的 G2P。
 * 下列代理字皆為日常常用、且與原字同音同調；只在送往 TTS 前暫時替換，
 * UI、回憶庫與結果頁仍保留原始正字。此映射已以 Voicebox 實測回讀驗證。
 */
const PHONETIC_SURROGATE_LEXICON: ReadonlyArray<{ source: string; surrogate: string }> = [
  { source: "日日誦經", surrogate: "日日送經" },
  { source: "祝禱加持", surrogate: "祝島加持" },
  { source: "蔡承諺", surrogate: "菜成燕" },
];

/**
 * 將使用者用於指定讀音的括號標記移除，確保注音不會被當成文字朗讀或出現在回憶庫。
 * 支援「誦(ㄙㄨㄥˋ)」與「蔡承諺(ㄘㄞˋ ㄔㄥˊ ㄧㄢˋ)」兩種格式。
 */
export function stripPronunciationMarkers(text: string): string {
  return text.replace(/([\u4e00-\u9fff]{1,8})[（(]([ㄅ-ㄩ˙ˊˇˋ\s]+)[）)]/g, "$1");
}

/**
 * 建立只供 Qwen 合成使用的同音代理文字。
 * 因 Base 克隆模型無可靠的單字音素覆寫介面，這是目前可重現的正確發音做法。
 */
export function createPhoneticSurrogateText(text: string): string {
  let synthesisText = stripPronunciationMarkers(text);
  for (const { source, surrogate } of PHONETIC_SURROGATE_LEXICON) {
    synthesisText = synthesisText.split(source).join(surrogate);
  }
  return synthesisText;
}

/** 擷取使用者明確標注的「字或詞(注音)」讀音覆寫規則。 */
function extractManualPronunciationOverrides(text: string): Array<{ term: string; zhuyin: string }> {
  const pattern = /([\u4e00-\u9fff]{1,8})[（(]([ㄅ-ㄩ˙ˊˇˋ\s]+)[）)]/g;
  const overrides: Array<{ term: string; zhuyin: string }> = [];
  for (const match of text.matchAll(pattern)) {
    const precedingText = match[1];
    const zhuyin = match[2].replace(/\s+/g, " ").trim();
    // 常用格式是「日日誦(ㄙㄨㄥˋ)經」：括號只標記緊鄰的最後一個字。
    // 若提供空格分隔且數量等於字數的多音節注音，才視為整段詞語覆寫。
    const characters = Array.from(precedingText);
    const syllableCount = zhuyin.split(" ").filter(Boolean).length;
    const term = syllableCount > 1 && syllableCount === characters.length
      ? precedingText
      : (characters.at(-1) ?? precedingText);
    if (term && zhuyin) overrides.push({ term, zhuyin });
  }
  return overrides;
}

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
  const spokenText = stripPronunciationMarkers(text);
  if (!containsChinese(spokenText)) {
    return null;
  }

  const rules: string[] = [];
  const coveredTerms = new Set<string>();

  // 1. 先處理使用者手動指定的注音；這是最高優先權規則。
  for (const override of extractManualPronunciationOverrides(text)) {
    const known = KNOWN_MANUAL_PRONUNCIATIONS[override.term];
    const pronunciation = known && known.zhuyin === override.zhuyin
      ? `${known.zhuyin}（${known.pinyin}）`
      : override.zhuyin;
    rules.push(`「${override.term}」固定讀作「${pronunciation}」`);
    coveredTerms.add(override.term);
  }

  // 2. 再套用已驗證的詞庫，避免 Qwen 對罕見字或人名自行猜音。
  for (const entry of FORCED_PRONUNCIATION_LEXICON) {
    if (spokenText.includes(entry.term) && !coveredTerms.has(entry.term)) {
      rules.push(`「${entry.term}」讀作「${entry.pinyin}」`);
      coveredTerms.add(entry.term);
    }
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
  const candidates = Array.from(spokenText.matchAll(namePattern), (match) => match[1]);
  const names = [...new Set(candidates)].slice(0, 2);

  const annotations: string[] = [];
  for (const name of names) {
    if (coveredTerms.has(name)) continue;
    const pinyinStr = getPinyinAnnotation(name);
    if (pinyinStr) {
      annotations.push(`「${name}」讀作「${pinyinStr}」`);
    }
  }
  rules.push(...annotations);

  if (rules.length === 0) {
    return null;
  }

  return `【強制讀音規則】${rules.join("；")}。以上規則優先於模型預設發音；只朗讀原文，不朗讀括號、注音或拼音標記`;
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
