/**
 * 下載工具函數 — 將音檔儲存到用戶手機本地的媒體庫
 *
 * 使用 expo-media-library 的 saveToLibraryAsync 將音檔存到用戶手機的音樂/媒體資料夾，
 * 而非 APP 沙箱內部。iOS 11+ 不需額外權限即可使用 saveToLibraryAsync。
 */

import { Platform, Alert } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import * as Haptics from "expo-haptics";

/**
 * 將音檔儲存到用戶手機媒體庫
 * - iOS: 使用 saveToLibraryAsync 存到「音樂」資料夾
 * - Android: 使用 saveToLibraryAsync 存到媒體庫
 * - Web: 使用 Sharing 分享
 */
export async function saveAudioToDevice(
  audioUri: string,
  fileName: string,
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    // Web 平台使用 Sharing 作為替代
    if (Platform.OS === "web") {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(audioUri, {
          dialogTitle: "儲存音檔",
          mimeType: "audio/wav",
          UTI: "com.microsoft.waveform",
        });
        return { success: true };
      }
      return { success: false, error: "此平台不支援下載功能" };
    }

    // 確保檔案有正確的副檔名（saveToLibraryAsync 需要副檔名）
    let localUri = audioUri;
    if (!audioUri.endsWith(".wav")) {
      // 複製到暫存目錄並加上 .wav 副檔名
      const tmpPath = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.copyAsync({ from: audioUri, to: tmpPath });
      localUri = tmpPath;
    }

    // 請求媒體庫寫入權限
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== "granted") {
      // 權限被拒絕時，退回使用 Sharing 讓用戶自行選擇儲存位置
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(localUri, {
          dialogTitle: "儲存音檔到...",
          mimeType: "audio/wav",
          UTI: "com.microsoft.waveform",
        });
        return { success: true };
      }
      return { success: false, error: "需要媒體庫權限才能儲存音檔" };
    }

    // 儲存到用戶手機媒體庫
    await MediaLibrary.saveToLibraryAsync(localUri);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    return { success: true, path: "已儲存至手機媒體庫" };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "未知錯誤";
    // 嘗試退回 Sharing 作為 fallback
    try {
      if (Platform.OS !== "web" && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(audioUri, {
          dialogTitle: "儲存音檔到...",
          mimeType: "audio/wav",
          UTI: "com.microsoft.waveform",
        });
        return { success: true };
      }
    } catch {
      // Sharing 也失敗了
    }
    return { success: false, error: errMsg };
  }
}
