import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Expo Go on Android SDK 53+ logs an error as soon as expo-notifications is
 * imported because it cannot provide remote push functionality. Keep the
 * import lazy, so the family-facing app can still open in Expo Go while
 * production and development builds retain completion notifications.
 */
type NotificationsModule = typeof import("expo-notifications");

type GenerationNotification = {
  title: string;
  body: string;
  data: Record<string, string>;
};

let notificationModule: NotificationsModule | null | undefined;

export function isExpoGoRuntime(): boolean {
  return Constants.appOwnership === "expo";
}

function getNotificationsModule(): NotificationsModule | null {
  if (Platform.OS === "web" || isExpoGoRuntime()) {
    return null;
  }

  if (notificationModule !== undefined) {
    return notificationModule;
  }

  try {
    notificationModule = require("expo-notifications") as NotificationsModule;
  } catch (error) {
    notificationModule = null;
    console.warn("[Notifications] 通知功能目前無法載入：", error);
  }

  return notificationModule;
}

export function configureGenerationNotifications(): void {
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === "android") {
    void Notifications.setNotificationChannelAsync("default", {
      name: "生成通知",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    }).catch((error) => {
      console.warn("[Notifications] 無法建立 Android 通知頻道：", error);
    });
  }
}

export async function sendGenerationNotification({
  title,
  body,
  data,
}: GenerationNotification): Promise<void> {
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        data,
      },
      trigger: null,
    });
  } catch (error) {
    console.warn("[Notifications] 通知發送失敗：", error);
  }
}
