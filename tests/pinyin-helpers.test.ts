import { describe, it, expect } from "vitest";
import {
  containsChinese,
  extractChineseSegments,
  getPinyinAnnotation,
  generatePronunciationHint,
  appendPronunciationHint,
  createPhoneticSurrogateText,
  stripPronunciationMarkers,
} from "../lib/pinyin-helpers";

describe("containsChinese", () => {
  it("should detect Chinese characters", () => {
    expect(containsChinese("蔡承諺")).toBe(true);
    expect(containsChinese("我是蔡承諺")).toBe(true);
    expect(containsChinese("Hello 世界")).toBe(true);
  });

  it("should return false for non-Chinese text", () => {
    expect(containsChinese("Hello World")).toBe(false);
    expect(containsChinese("12345")).toBe(false);
    expect(containsChinese("")).toBe(false);
  });
});

describe("extractChineseSegments", () => {
  it("should extract continuous Chinese segments (>= 2 chars)", () => {
    const segments = extractChineseSegments("我是蔡承諺，今天天氣很好");
    expect(segments).toContain("我是蔡承諺");
    expect(segments).toContain("今天天氣很好");
  });

  it("should return empty array for non-Chinese text", () => {
    expect(extractChineseSegments("Hello World")).toEqual([]);
  });

  it("should ignore single Chinese characters", () => {
    expect(extractChineseSegments("A B C")).toEqual([]);
  });
});

describe("getPinyinAnnotation", () => {
  it("should convert Chinese to pinyin with tone symbols", () => {
    const result = getPinyinAnnotation("蔡承諺");
    expect(result).not.toBeNull();
    expect(result).toContain("cài");
    expect(result).toContain("chéng");
    expect(result).toContain("yàn");
  });

  it("should return null for non-Chinese text", () => {
    expect(getPinyinAnnotation("Hello")).toBeNull();
  });
});

describe("generatePronunciationHint", () => {
  it("should generate pronunciation hint for Chinese text", () => {
    const hint = generatePronunciationHint("我是蔡承諺");
    expect(hint).not.toBeNull();
    expect(hint).toContain("蔡承諺");
    expect(hint).toContain("cài");
    expect(hint).toContain("chéng");
    expect(hint).toContain("yàn");
    expect(hint).toContain("強制讀音規則");
  });

  it("should not annotate ordinary Chinese phrases as names", () => {
    expect(generatePronunciationHint("十方福報陪伴每一份思念")).toBeNull();
    expect(generatePronunciationHint("今天天氣很好，祝福大家平安順心")).toBeNull();
  });

  it("should return null for non-Chinese text", () => {
    expect(generatePronunciationHint("Hello World")).toBeNull();
  });

  it("should limit to 2 detected names max", () => {
    const longText = "蔡承諺與陳小明、林大華一起參加活動";
    const hint = generatePronunciationHint(longText);
    expect(hint).not.toBeNull();
    // Should not contain more than 2 automatically guessed names
    const annotationCount = (hint?.match(/讀作/g) || []).length;
    expect(annotationCount).toBeLessThanOrEqual(2);
  });
});

describe("appendPronunciationHint", () => {
  it("should append hint to existing instruct", () => {
    const result = appendPronunciationHint("溫柔地說話", "我是蔡承諺");
    expect(result).toContain("溫柔地說話");
    expect(result).toContain("蔡承諺");
    expect(result).toContain("cài");
  });

  it("should return hint only when instruct is empty", () => {
    const result = appendPronunciationHint("", "我是蔡承諺");
    expect(result).toContain("蔡承諺");
    expect(result).toContain("cài");
    expect(result).toContain("強制讀音規則");
  });

  it("should return original instruct for non-Chinese text", () => {
    const result = appendPronunciationHint("溫柔地說話", "Hello World");
    expect(result).toBe("溫柔地說話");
  });

  it("should return empty string for empty instruct and non-Chinese text", () => {
    const result = appendPronunciationHint("", "Hello World");
    expect(result).toBe("");
  });
});

describe("強制讀音詞庫與手動注音覆寫", () => {
  it("should force known rare words and the known name", () => {
    const hint = generatePronunciationHint("日日誦經，祝禱加持，蔡承諺為大家祝福");
    expect(hint).toContain("rì rì sòng jīng");
    expect(hint).toContain("zhù dǎo jiā chí");
    expect(hint).toContain("cài chéng yàn");
  });

  it("should honor manual zhuyin overrides", () => {
    const hint = generatePronunciationHint("日日誦(ㄙㄨㄥˋ)經，祝禱(ㄉㄠˇ)加持");
    expect(hint).toContain("「誦」固定讀作「ㄙㄨㄥˋ（sòng）」");
    expect(hint).toContain("「禱」固定讀作「ㄉㄠˇ（dǎo）」");
  });

  it("should treat a single zhuyin annotation as the immediately preceding character", () => {
    const hint = generatePronunciationHint("蔡承諺(ㄧㄢˋ)歡迎您");
    expect(hint).toContain("「諺」固定讀作「ㄧㄢˋ（yàn）」");
  });

  it("should remove markers from the customer-visible spoken text", () => {
    expect(stripPronunciationMarkers("日日誦(ㄙㄨㄥˋ)經，蔡承諺(ㄧㄢˋ)")).toBe("日日誦經，蔡承諺");
  });

  it("should use tested homophone proxies only for the Qwen synthesis text", () => {
    expect(createPhoneticSurrogateText("日日誦(ㄙㄨㄥˋ)經，祝禱(ㄉㄠˇ)加持，蔡承諺(ㄧㄢˋ)"))
      .toBe("日日送經，祝島加持，菜成燕");
  });
});
