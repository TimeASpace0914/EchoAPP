import { describe, expect, it } from "vitest";
import {
  resolveTranscriptionLanguage,
  resolveWhisperModelSize,
} from "../server/voicebox-config";

describe("Voicebox transcription configuration", () => {
  it("uses Whisper Turbo by default", () => {
    expect(resolveWhisperModelSize("")).toBe("turbo");
  });

  it.each(["base", "small", "medium", "large", "turbo"])(
    "accepts the supported Whisper model size: %s",
    (model) => {
      expect(resolveWhisperModelSize(model)).toBe(model);
    },
  );

  it("falls back to Turbo for an unsupported model size", () => {
    expect(resolveWhisperModelSize("large-v3")).toBe("turbo");
  });

  it("uses a Chinese hint by default and accepts intentional overrides", () => {
    expect(resolveTranscriptionLanguage("")).toBe("zh");
    expect(resolveTranscriptionLanguage("ja")).toBe("ja");
  });
});
