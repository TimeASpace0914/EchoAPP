import { describe, expect, it } from "vitest";
import { getReferenceMediaType } from "../lib/reference-media";

describe("getReferenceMediaType", () => {
  it("accepts common mobile video formats for server-side audio extraction", () => {
    expect(getReferenceMediaType("family-memory.mp4")).toBe("video");
    expect(getReferenceMediaType("iphone-recording.MOV")).toBe("video");
    expect(getReferenceMediaType("short-clip.3gp")).toBe("video");
  });

  it("keeps supported audio and rejects unrelated documents", () => {
    expect(getReferenceMediaType("voice-message.m4a")).toBe("audio");
    expect(getReferenceMediaType("letter.pdf")).toBeNull();
  });
});
