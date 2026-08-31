# EchoAPP 新 AI／開發者交接指南

> **目標：先維持 Voicebox 的穩定生成與家屬體驗，再做低風險的品質強化。**請勿把此專案當成單純的前端 APP；它同時依賴 Windows 本機 Voicebox、Cloudflare Tunnel、模型快取與裝置端 Profile 狀態。

## 1. 接手前 15 分鐘的閱讀與驗證順序

請先閱讀 [`README.md`](../README.md)、[`PROJECT_ARCHITECTURE_OVERVIEW.md`](PROJECT_ARCHITECTURE_OVERVIEW.md)、[`todo.md`](../todo.md) 與本文件。接著執行以下指令，確認套件、單元測試與 TypeScript 與目前提交一致。

```bash
pnpm install
pnpm test
pnpm check
git status
```

若要測試實際生成，必須先確認 Windows 主機的 Voicebox 正在 `17493` 埠運作，且 Cloudflare Tunnel 的固定網址 `https://voicebox.echo-voice.cc` 可連線。不要將家屬音檔、Profile 快取、Tunnel JSON 憑證或 `.env` 提交到 GitHub。

## 2. 不能違反的產品與技術原則

| 原則 | 接手後的要求 |
|---|---|
| 聲音授權 | 僅處理具有合法使用授權的聲音；不可用 YouTube 網紅或可識別真人的未授權素材做克隆測試。 |
| 正式引擎 | 目前正式路徑維持 Windows Voicebox／Qwen 1.7B Base；不要直接更換底層引擎。 |
| Tunnel 定位 | Tunnel 只負責安全傳輸；模型、Profile 與推論維持在使用者的 Windows 本機。 |
| 已核可聲音保護 | 新樣本只能成為候選 Profile，不能覆蓋現有核可 Profile。 |
| 讀音顯示 | 合成可使用同音代理字或注音覆寫；客戶畫面、結果與回憶庫必須保留原始正字。 |
| 長工作處理 | 保持背景任務與輪詢設計；不可為了簡化而把 CPU 推論重新塞回單一長 HTTP 請求。 |
| UI 語言與風格 | 繁體中文、黑白極簡、圓角約 14–20px；所有按鈕要有點擊回饋，深色模式內容需可見。 |

## 3. Voicebox 優化進度

### 已完成且應保留

| 項目 | 實作位置 | 交接說明 |
|---|---|---|
| 固定 Tunnel 與本機推論 | Windows Voicebox + Cloudflare 設定 | `voicebox.echo-voice.cc` 對外傳輸至本機 `17493`；不把模型搬入 APP 雲端後端。 |
| 504 容錯 | `server/_core/index.ts`、`server/voicebox.ts`、`lib/voice-service.ts` | 建立生成工作後即回覆，APP 短輪詢；Voicebox 已接受請求但 HTTP 回應失敗時，會嘗試從 history 找回工作。 |
| 30 分鐘輪詢 | `lib/voice-service.ts`、`lib/generation-store.ts` | CPU 推論較長時，使用者可離開畫面而不立即視為失敗。 |
| Whisper Large 轉錄與參考文字 | `server/voicebox.ts` | 目標是讓參考逐字稿對齊原始音檔，避免錯誤文字污染聲音克隆。 |
| 中文讀音修正 | `lib/pinyin-helpers.ts` 與測試 | 已支援同音代理與 `字(注音)`；既有詞庫包含「日日誦經、祝禱加持、蔡承諺」等已知案例。 |
| 單一主情緒與自訂提示 | `app/(tabs)/index.tsx`、`lib/voice-service.ts` | 只傳一個主要情緒，避免多個互相矛盾的風格描述降低穩定性。 |
| 已核可 Profile 重用 | `lib/voice-profile-store.ts`、首頁 | 可選擇既有核可聲音直接生成，避免每次上傳都重新建立 Profile。 |
| 候選版本與三段核可 | 首頁、`voice-profile-store.ts` | 新樣本需完成日常、關懷、專名三段預覽後才可核可。 |
| 音檔品質閘門 | `server/voicebox.ts`、`tests/reference-audio-quality.test.ts` | 於建立 Profile 前檢查時長、有效語音、平均音量、峰值 clipping；不合格回傳 HTTP 422。 |
| 下載／分享與深色模式修復 | `app/result.tsx`、`history.tsx` | 生成音檔可儲存、下載及分享；播放按鈕已統一為圓形。 |

### 尚未完成，請依此優先序處理

| 優先度 | 待辦 | 完成定義 |
|---|---|---|
| 高 | **實際品質基準盤點** | 用同一份已授權音檔、逐字稿、三段固定文案，記錄 Profile、音色、讀音、情緒、等待時間與家屬核可結果。 |
| 高 | **自動說話者分離與片段試聽** | 不是只顯示提醒；系統能產生候選單人片段、播放片段，並由家屬選定目標聲音後才建立 Profile。 |
| 高 | **家庭工作區隔離** | Profile、授權文件、音檔、輸出與核可紀錄能依家庭／案件隔離，不能讓不同家屬看到彼此資料。 |
| 中 | **Profile 命名與分類** | 將目前自動 `echo_<timestamp>` 改為可安全命名的家屬內部識別，並仍保留不可衝突的 ID。 |
| 中 | **持久化生成工作** | 將記憶體 `Map` 改為可恢復的資料表或工作佇列，讓 API 重啟後仍可取得工作結果。 |
| 中 | **園區專用讀音詞庫管理介面** | 讓授權管理者維護特定人名／地名／宗教用語的讀音，不直接破壞核心轉換函式。 |
| 低 | **自建推論服務旁路測試** | 依 [`SELF_HOSTED_VOICE_SERVICE_ARCHITECTURE.md`](SELF_HOSTED_VOICE_SERVICE_ARCHITECTURE.md) 建立獨立 `17494` 測試服務；未通過盲測前不得取代 Voicebox。 |

## 4. 已知限制與避免誤判

目前品質閘門能判斷時長、靜音比例、音量與 clipping，**不能自動辨識多人對話中誰是目標親友**。首頁目前要求家屬確認單一主要說話者，這是風險控制，不等於已完成說話者分離。

候選／核可狀態與三段預覽紀錄保存在 APP 的 AsyncStorage；Voicebox 本身只保存 Profile。這代表不同手機或重新安裝 APP 後，需重新建立／同步這些管理狀態，直到家庭工作區與後端持久化資料模型完成。

背景生成任務的結果也仍以 Base64 傳回 APP，並暫存於 Express 的記憶體 Map 中。它可處理目前的 504 情境，但不適合當作長期多家屬、高併發服務的最終架構。不要宣稱音檔可以在任何雜亂素材下「完全與亡者一模一樣」；應以品質閘門、候選版本與家屬核可機制管理期望。

## 5. 變更守則與測試要求

對 `server/voicebox.ts`、`server/_core/index.ts`、`lib/voice-service.ts`、`lib/pinyin-helpers.ts` 或 `lib/voice-profile-store.ts` 的每次修改，至少要完成：

1. `pnpm test` 與 `pnpm check` 均通過。
2. 不使用家屬資料的單元測試，覆蓋新規則的成功與拒絕案例。
3. 使用授權測試音檔完成 Windows 端的候選建立、三段預覽、核可與既有 Profile 重用。
4. 確認既有已核可 Profile 未被新樣本覆蓋，回憶庫與結果頁仍顯示原始正字。
5. 寫入 `todo.md`，更新相應 `docs/`，再建立 checkpoint 與 GitHub 提交。

避免直接大量重寫現有生成流程。優先將新行為包裝成可測試的純函式與小型適配層，再接入 UI；前後端欄位名稱必須一致，Profile ID、工作 ID、原始文字與合成用文字要明確分開。

## 6. 本機環境、文件與排錯入口

| 問題類型 | 首先閱讀／檢查 |
|---|---|
| 無法連 Voicebox、504 或生成一直轉圈 | `server/voicebox.ts`、`server/_core/index.ts`、Windows Voicebox 日誌、Tunnel Service 狀態。 |
| 中文人名或罕見字念錯 | `lib/pinyin-helpers.ts`、`tests/pinyin-helpers.test.ts`；確認使用者原文是否使用 `字(注音)`。 |
| 新音檔被拒絕 | `getReferenceQualityRejection()`、`tests/reference-audio-quality.test.ts`，再依提示檢查時長、有效語音、音量和破音。 |
| 已核可聲音不見或候選狀態錯誤 | `lib/voice-profile-store.ts`；先釐清是否更換裝置或清除 AsyncStorage。 |
| 搬遷至新 Windows 電腦 | [`MIGRATION_GUIDE.md`](MIGRATION_GUIDE.md)、[`WINDOWS_NEW_PC_TUNNEL_SETUP.md`](WINDOWS_NEW_PC_TUNNEL_SETUP.md)、`scripts/collect-voicebox-diagnostics.ps1`。 |
| 自建低延遲服務評估 | [`SELF_HOSTED_VOICE_SERVICE_ARCHITECTURE.md`](SELF_HOSTED_VOICE_SERVICE_ARCHITECTURE.md)。 |

## 7. GitHub 交接方式

GitHub 儲存庫為 <https://github.com/TimeASpace0914/EchoAPP>。接手者應先從 `main` 建立功能分支，保留原有提交紀錄；每個可驗證功能完成後，同步更新 `todo.md`、文件、測試與 GitHub。若要還原 WebDev 專案狀態，使用既有 checkpoint 機制，不要以破壞性 Git 指令處理未知狀態。
