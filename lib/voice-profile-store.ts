import type { VoiceboxProfileSummary } from "@/lib/voice-service";

const VOICE_PROFILE_STORE_KEY = "@echo_voice_profiles";

export type VoiceProfileStatus = "candidate" | "approved";

export interface StoredVoiceProfile {
  profileId: string;
  name: string;
  status: VoiceProfileStatus;
  createdAt: number;
  approvedAt?: number;
  sourceAudioName?: string;
  referenceText?: string;
  completedPreviewKeys?: string[];
}

export interface ManagedVoiceProfile extends VoiceboxProfileSummary {
  status: VoiceProfileStatus | "unmanaged";
  createdAt?: number;
  approvedAt?: number;
  sourceAudioName?: string;
  referenceText?: string;
  previewCount: number;
  completedPreviewKeys?: string[];
}

async function readStoredVoiceProfiles(): Promise<StoredVoiceProfile[]> {
  const AsyncStorage = await import("@react-native-async-storage/async-storage");
  const raw = await AsyncStorage.default.getItem(VOICE_PROFILE_STORE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((profile): profile is StoredVoiceProfile =>
      Boolean(
        profile &&
          typeof profile === "object" &&
          typeof (profile as StoredVoiceProfile).profileId === "string" &&
          typeof (profile as StoredVoiceProfile).name === "string" &&
          ((profile as StoredVoiceProfile).status === "candidate" ||
            (profile as StoredVoiceProfile).status === "approved"),
      ),
    );
  } catch {
    return [];
  }
}

async function writeStoredVoiceProfiles(profiles: StoredVoiceProfile[]) {
  const AsyncStorage = await import("@react-native-async-storage/async-storage");
  await AsyncStorage.default.setItem(VOICE_PROFILE_STORE_KEY, JSON.stringify(profiles));
}

/**
 * 將 Voicebox 原始 Profile 與 APP 本機的候選／核可狀態合併。
 * Voicebox 不提供「核可」概念；狀態由 APP 保管，避免新上傳樣本覆蓋既有最佳 Profile。
 */
export function mergeManagedVoiceProfiles(
  remoteProfiles: VoiceboxProfileSummary[],
  storedProfiles: StoredVoiceProfile[],
): ManagedVoiceProfile[] {
  const storedById = new Map(storedProfiles.map((profile) => [profile.profileId, profile]));
  return remoteProfiles
    .map((profile) => {
      const local = storedById.get(profile.id);
      const status: ManagedVoiceProfile["status"] = local?.status ?? "unmanaged";
      return {
        ...profile,
        status,
        createdAt: local?.createdAt,
        approvedAt: local?.approvedAt,
        sourceAudioName: local?.sourceAudioName,
        referenceText: local?.referenceText,
        previewCount: local?.completedPreviewKeys?.length ?? 0,
        completedPreviewKeys: local?.completedPreviewKeys ?? [],
      };
    })
    .sort((a, b) => {
      const rank = (profile: ManagedVoiceProfile) =>
        profile.status === "approved" ? 0 : profile.status === "candidate" ? 1 : 2;
      return rank(a) - rank(b) || a.name.localeCompare(b.name, "zh-Hant");
    });
}

export async function getManagedVoiceProfiles(
  remoteProfiles: VoiceboxProfileSummary[],
): Promise<ManagedVoiceProfile[]> {
  return mergeManagedVoiceProfiles(remoteProfiles, await readStoredVoiceProfiles());
}

/** 記錄新建立的候選聲音；既有核可狀態絕不會被新的候選版本覆蓋。 */
export async function registerCandidateVoiceProfile(input: {
  profileId: string;
  name: string;
  sourceAudioName?: string;
  referenceText?: string;
}) {
  const existing = await readStoredVoiceProfiles();
  const previous = existing.find((profile) => profile.profileId === input.profileId);
  const nextProfile: StoredVoiceProfile = {
    profileId: input.profileId,
    name: input.name,
    status: previous?.status ?? "candidate",
    createdAt: previous?.createdAt ?? Date.now(),
    approvedAt: previous?.approvedAt,
    sourceAudioName: input.sourceAudioName ?? previous?.sourceAudioName,
    referenceText: input.referenceText ?? previous?.referenceText,
    completedPreviewKeys: previous?.completedPreviewKeys ?? [],
  };
  await writeStoredVoiceProfiles([
    nextProfile,
    ...existing.filter((profile) => profile.profileId !== input.profileId),
  ]);
}

export async function approveVoiceProfile(profileId: string, fallbackName: string) {
  const existing = await readStoredVoiceProfiles();
  const previous = existing.find((profile) => profile.profileId === profileId);
  const approved: StoredVoiceProfile = {
    profileId,
    name: previous?.name || fallbackName,
    status: "approved",
    createdAt: previous?.createdAt ?? Date.now(),
    approvedAt: Date.now(),
    sourceAudioName: previous?.sourceAudioName,
    referenceText: previous?.referenceText,
    completedPreviewKeys: previous?.completedPreviewKeys ?? [],
  };
  await writeStoredVoiceProfiles([
    approved,
    ...existing.filter((profile) => profile.profileId !== profileId),
  ]);
}

/** 記錄候選聲音完成的固定預覽；同一段多次生成只會計算一次。 */
export async function recordVoiceProfilePreview(
  profileId: string,
  fallbackName: string,
  previewKey: string,
) {
  const existing = await readStoredVoiceProfiles();
  const previous = existing.find((profile) => profile.profileId === profileId);
  const completedPreviewKeys = Array.from(new Set([...(previous?.completedPreviewKeys ?? []), previewKey]));
  const updated: StoredVoiceProfile = {
    profileId,
    name: previous?.name || fallbackName,
    status: previous?.status ?? "candidate",
    createdAt: previous?.createdAt ?? Date.now(),
    approvedAt: previous?.approvedAt,
    sourceAudioName: previous?.sourceAudioName,
    referenceText: previous?.referenceText,
    completedPreviewKeys,
  };
  await writeStoredVoiceProfiles([
    updated,
    ...existing.filter((profile) => profile.profileId !== profileId),
  ]);
}
