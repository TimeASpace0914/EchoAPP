import { describe, expect, it } from "vitest";
import { getReferenceQualityRejection } from "../server/voicebox";

describe("getReferenceQualityRejection", () => {
  it("rejects a short reference before a Voicebox Profile is created", () => {
    const result = getReferenceQualityRejection({
      durationSeconds: 12.5,
      effectiveSpeechSeconds: 11,
      meanVolumeDb: -20,
      maxVolumeDb: -3,
    });

    expect(result?.code).toBe("QUALITY_REJECTED");
    expect(result?.error).toContain("過短");
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
});
