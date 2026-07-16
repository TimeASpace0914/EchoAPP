/**
 * 生成狀態共享 Store
 *
 * 讓用戶可以在生成過程中離開頁面，生成完成後透過本地通知提醒。
 * 使用模組級單例模式，狀態在整個 APP 生命週期內持久存在。
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export type GenerationStatus = "idle" | "uploading" | "generating" | "completed" | "error";

export interface GenerationState {
  status: GenerationStatus;
  progress: number;
  stage: string;
  elapsed: number;
  error: string | null;
  // 完成後的結果
  resultUri: string | null;
  resultText: string | null;
  resultDuration: number | null;
  resultCreatedAt: number | null;
  resultIsRealVoice: boolean;
  entryId: string | null;
}

type Listener = (state: GenerationState) => void;

class GenerationStoreClass {
  private state: GenerationState = {
    status: "idle",
    progress: 0,
    stage: "",
    elapsed: 0,
    error: null,
    resultUri: null,
    resultText: null,
    resultDuration: null,
    resultCreatedAt: null,
    resultIsRealVoice: false,
    entryId: null,
  };

  private listeners: Set<Listener> = new Set();
  private elapsedTimer: ReturnType<typeof setInterval> | null = null;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state); // 立即推送當前狀態
    return () => this.listeners.delete(listener);
  }

  getState(): GenerationState {
    return this.state;
  }

  private setState(updates: Partial<GenerationState>) {
    this.state = { ...this.state, ...updates };
    this.listeners.forEach((l) => l(this.state));
  }

  startGeneration() {
    this.setState({
      status: "uploading",
      progress: 0,
      stage: "準備中...",
      elapsed: 0,
      error: null,
      resultUri: null,
      resultText: null,
      resultDuration: null,
      resultCreatedAt: null,
      resultIsRealVoice: false,
      entryId: null,
    });

    // 啟動計時器
    if (this.elapsedTimer) clearInterval(this.elapsedTimer);
    this.elapsedTimer = setInterval(() => {
      this.setState({ elapsed: this.state.elapsed + 1 });
    }, 1000);
  }

  updateProgress(progress: number, stage: string) {
    this.setState({ progress, stage, status: progress >= 100 ? "completed" : "generating" });
  }

  completeGeneration(result: {
    audioUri: string;
    text: string;
    duration: number;
    createdAt: number;
    isRealVoice: boolean;
    entryId: string;
  }) {
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
    this.setState({
      status: "completed",
      progress: 100,
      stage: "完成",
      resultUri: result.audioUri,
      resultText: result.text,
      resultDuration: result.duration,
      resultCreatedAt: result.createdAt,
      resultIsRealVoice: result.isRealVoice,
      entryId: result.entryId,
    });

    // 發送本地通知
    this.sendCompletionNotification();
  }

  failGeneration(error: string) {
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
    this.setState({ status: "error", error });
    this.sendErrorNotification(error);
  }

  reset() {
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
    this.setState({
      status: "idle",
      progress: 0,
      stage: "",
      elapsed: 0,
      error: null,
      resultUri: null,
      resultText: null,
      resultDuration: null,
      resultCreatedAt: null,
      resultIsRealVoice: false,
      entryId: null,
    });
  }

  private async sendCompletionNotification() {
    if (Platform.OS === "web") return;
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "語音生成完成",
          body: "親友的聲音已準備好，點擊查看",
          sound: true,
          data: { type: "generation_complete" },
        },
        trigger: null, // 立即發送
      });
    } catch (e) {
      console.warn("[GenerationStore] 通知發送失敗:", e);
    }
  }

  private async sendErrorNotification(error: string) {
    if (Platform.OS === "web") return;
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "語音生成失敗",
          body: error.substring(0, 100),
          sound: true,
          data: { type: "generation_error" },
        },
        trigger: null,
      });
    } catch (e) {
      console.warn("[GenerationStore] 錯誤通知發送失敗:", e);
    }
  }
}

export const generationStore = new GenerationStoreClass();
