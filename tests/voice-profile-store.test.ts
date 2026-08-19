import { describe, expect, it } from "vitest";
import { mergeManagedVoiceProfiles } from "../lib/voice-profile-store";

describe("mergeManagedVoiceProfiles", () => {
  it("keeps approved profiles ahead of candidate and unmanaged Voicebox profiles", () => {
    const profiles = mergeManagedVoiceProfiles(
      [
        { id: "raw", name: "raw-profile", sampleCount: 1 },
        { id: "candidate", name: "candidate-profile", sampleCount: 1 },
        { id: "approved", name: "approved-profile", sampleCount: 2 },
      ],
      [
        { profileId: "candidate", name: "candidate-profile", status: "candidate", createdAt: 1, completedPreviewKeys: ["daily", "care"] },
        { profileId: "approved", name: "approved-profile", status: "approved", createdAt: 1, approvedAt: 2 },
      ],
    );

    expect(profiles.map((profile) => profile.id)).toEqual(["approved", "candidate", "raw"]);
    expect(profiles[0].status).toBe("approved");
    expect(profiles[1].status).toBe("candidate");
    expect(profiles[2].status).toBe("unmanaged");
    expect(profiles[1].previewCount).toBe(2);
  });
});
