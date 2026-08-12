import { describe, expect, it } from "vitest";
import {
  normalizeReferenceText,
  validateChineseReferenceTranscript,
} from "../server/transcription-quality";

describe("reference transcript quality", () => {
  it("accepts a normal Chinese reference transcript", () => {
    expect(validateChineseReferenceTranscript("大家好，我是蔡承諺，今天很高興見到你。"))
      .toEqual({
        valid: true,
        text: "大家好，我是蔡承諺，今天很高興見到你。",
      });
  });

  it("normalizes whitespace and line endings before use", () => {
    expect(normalizeReferenceText("  大家好\r\n  我是媽媽  "))
      .toBe("大家好\n我是媽媽");
  });

  it.each([
    ["", "辨識文字過短"],
    ["嗯", "辨識文字過短"],
    ["嗯嗯嗯", "語助詞或重複字元"],
    ["哈哈哈", "語助詞或重複字元"],
    ["by bwd6", "不是中文"],
    ["12345", "未包含可用的中文字"],
  ])("rejects unreliable transcription: %s", (input, expectedReason) => {
    const result = validateChineseReferenceTranscript(input);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain(expectedReason);
  });

  it("keeps mixed Chinese and English content for names or code switching", () => {
    expect(validateChineseReferenceTranscript("我是 Amy，明天會到 EchoAPP 幫忙。"))
      .toEqual({
        valid: true,
        text: "我是 Amy，明天會到 EchoAPP 幫忙。",
      });
  });
});
