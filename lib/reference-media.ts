/** 可直接送往 Voicebox 或由伺服器擷取音軌的家屬參考媒體格式。 */
export const SUPPORTED_AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "flac", "ogg", "wma"];
export const SUPPORTED_VIDEO_EXTENSIONS = ["mp4", "mov", "m4v", "3gp", "webm"];
export const ALL_SUPPORTED_EXTENSIONS = [...SUPPORTED_AUDIO_EXTENSIONS, ...SUPPORTED_VIDEO_EXTENSIONS];

export type ReferenceMediaType = "audio" | "video";

function getExtension(fileNameOrUri: string): string {
  const clean = fileNameOrUri.split("?")[0].split("#")[0];
  const parts = clean.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

export function getReferenceMediaType(fileNameOrUri: string): ReferenceMediaType | null {
  const extension = getExtension(fileNameOrUri);
  if (SUPPORTED_AUDIO_EXTENSIONS.includes(extension)) return "audio";
  if (SUPPORTED_VIDEO_EXTENSIONS.includes(extension)) return "video";
  return null;
}
