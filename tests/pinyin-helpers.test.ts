import { describe, it, expect } from "vitest";
import {
  containsChinese,
  extractChineseSegments,
  getPinyinAnnotation,
  generatePronunciationHint,
  appendPronunciationHint,
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
    expect(hint).toContain("標準普通話發音");
  });

  it("should return null for non-Chinese text", () => {
    expect(generatePronunciationHint("Hello World")).toBeNull();
  });

  it("should limit to 5 segments max", () => {
    const longText = "今天天氣很好明天也不錯後天可能下雨大後天會放晴最後一天放假";
    const hint = generatePronunciationHint(longText);
    expect(hint).not.toBeNull();
    // Should not contain more than 5 annotations
    const annotationCount = (hint?.match(/「/g) || []).length;
    expect(annotationCount).toBeLessThanOrEqual(5);
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
    expect(result).not.toContain("。");
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
