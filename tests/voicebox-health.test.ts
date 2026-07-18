import { describe, it, expect } from "vitest";

describe("Voicebox health endpoint", () => {
  it("should return online status from the backend proxy", async () => {
    const baseUrl = process.env.API_BASE_URL || "http://localhost:3000";
    const response = await fetch(`${baseUrl}/api/voicebox/health`, {
      headers: {
        "ngrok-skip-browser-warning": "true",
      },
      signal: AbortSignal.timeout(10000),
    });

    expect(response.ok).toBe(true);
    const data = await response.json() as {
      online: boolean;
      url?: string;
      profileCount?: number;
      error?: string;
    };

    // Voicebox should be online if VOICEBOX_URL is correctly set
    expect(data).toHaveProperty("online");
    if (data.online) {
      expect(data.url).toBeDefined();
      expect(typeof data.profileCount).toBe("number");
    }
  });

  it("should have VOICEBOX_URL environment variable set", () => {
    // This verifies the secret was properly configured
    const voiceboxUrl = process.env.VOICEBOX_URL;
    expect(voiceboxUrl).toBeDefined();
    expect(voiceboxUrl).toContain("echo-voice.cc");
  });
});
