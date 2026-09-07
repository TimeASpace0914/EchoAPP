import { describe, expect, it } from "vitest";
import {
  getReferenceQualityRejection,
  getReferenceQualityWarnings,
  isUsableChineseReferenceText,
} from "../server/voicebox";

describe("getReferenceQualityRejection", () => {
  it("allows short references with a clear quality reminder", () => {
    const quality = {
      durationSeconds: 12.5,
      effectiveSpeechSeconds: 11,
      meanVolumeDb: -20,
      maxVolumeDb: -3,
    };

    expect(getReferenceQualityRejection(quality)).toBeNull();
    expect(getReferenceQualityWarnings(quality)[0]).toContain("仍可生成");
  });

  it("accepts a sufficiently long, clear and non-clipped reference", () => {
    const result = getReferenceQualityRejection({
      durationSeconds: 55,
      effectiveSpeechSeconds: 43,
      meanVolumeDb: -21,
      maxVolumeDb: -3,
    });

    expect(result).toBeNull();
  });

  it("still rejects a media file with practically no usable speech", () => {
    const result = getReferenceQualityRejection({
      durationSeconds: 10,
      effectiveSpeechSeconds: 0.5,
      meanVolumeDb: -20,
      maxVolumeDb: -3,
    });

    expect(result?.code).toBe("QUALITY_REJECTED");
  });

  it("only accepts a useful CJK transcript as automatic reference text", () => {
    expect(isUsableChineseReferenceText("今天有沒有好好吃飯")).toBe(true);
    expect(isUsableChineseReferenceText("by bwd6")).toBe(false);
    expect(isUsableChineseReferenceText("嗯")).toBe(false);
    expect(isUsableChineseReferenceText(null)).toBe(false);
  });
});
