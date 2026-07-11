# 迴響 APP - 開發待辦事項

## 核心功能
- [x] 主題配色系統（灰白主調 + 暖橘點綴）
- [x] 圖示映射系統（新增所有所需圖示）
- [x] LOGO 資源導入（黑色/白色/暖橘版）
- [x] Tab 導覽架構（首頁/回憶庫/設定）
- [x] 啟動頁（Splash Screen 動畫）
- [x] 主控台頁面（上傳音檔 + 文字輸入 + 生成按鈕）
- [x] 播放結果頁（音波視覺化 + 播放/下載/分享）
- [x] 回憶庫頁面（歷史紀錄列表）
- [x] 設定頁面
- [x] 音檔上傳功能（DocumentPicker）
- [x] 語音生成模擬（本地推理介面）
- [x] 音檔播放功能（expo-audio）
- [x] 下載功能（FileSystem）
- [x] 分享功能（expo-sharing）
- [x] 歷史紀錄本地儲存（AsyncStorage）
- [x] APP 品牌設定（app.config.ts）

## 第二輪需求
- [x] 修復 Tab 導覽跳轉問題（首頁/回憶庫無法切換）
- [x] 啟動動畫（LOGO 淡入 + 暖橘進度條）
- [x] 音檔品質驗證（時長 ≥ 3 秒、格式檢查、溫馨提示）
- [x] 上傳格式提示（標明支援 mp3、wav、m4a 等）
- [x] 語音命名與自訂標籤功能（播放結果頁 + 回憶庫）

## 第三輪需求
- [x] 上傳音檔預覽播放功能（試聽確認後再生成）
- [x] 回憶庫搜尋列（依名稱或標籤關鍵字篩選）
- [x] 回憶庫編輯功能（修改名稱與標籤）
- [x] 生成語音動畫與實際音檔產出
- [x] 關於迴響頁面（環保葬理念、撫慰家屬）
- [x] 隱私政策頁面（強調尊重逝者隱私）
- [x] 使用說明頁面（上傳→生成→建立連結）

## 第四輪需求
- [x] 首頁 LOGO 移到左邊避免被擋住
- [x] 輸入範例改為日常對話語句
- [x] 深色模式切換功能
- [x] 完善下載與分享功能（結果頁 + 回憶庫）
- [x] 實際引進語音克隆 API（Voicebox 後端代理）

## 第五輪需求（Voicebox 語音克隆 API 整合）
- [x] 後端伺服器建立 Voicebox 代理 API 路由
- [x] 建立 /api/voicebox/* 後端 API 端點（健康檢查、聲音檔案、生成）
- [x] APP 前端更新呼叫後端 API 實現真實語音克隆
- [x] 結果頁顯示語音來源標示（Voicebox AI / 模擬語音）

## 第六輪需求（Voicebox 直連架構）
- [x] 前端語音服務改為直接呼叫 Voicebox REST API
- [x] 設定頁面加入 Voicebox URL 輸入框與連線測試
- [x] 主控台顯示 Voicebox 連線狀態（使用設定中的 URL）
- [x] AsyncStorage 儲存 Voicebox URL 設定
- [x] wifi 圖示映射加入 icon-symbol.tsx
- [x] 主控台使用 useFocusEffect 在返回時重新檢查連線狀態

## 第七輪需求（固定伺服器 + 修復生成 + LOGO 放大）
- [x] 移除設定頁面的 Voicebox URL 輸入功能（用戶不可修改）
- [x] voice-service.ts 改為透過後端伺服器 REST API 呼叫 Voicebox（不暴露伺服器位址）
- [x] 後端加入 Voicebox REST 端點（health/upload/generate）
- [x] 修復語音生成功能使其能實際產出音檔
- [x] 放大啟動動畫 LOGO（80→120）

## 第八輪需求（ngrok 整合 + 完整修復生成 + LOGO 再放大）
- [x] 設定 ngrok URL 到後端環境變數
- [x] 後端 Voicebox API 呼叫加入 ngrok-skip-browser-warning header
- [x] 修復前端 native 平台 API base URL（native 無法使用相對路徑）
- [x] 放大啟動動畫 LOGO（120→160）
- [x] 移除模擬音檔 fallback，生成失敗時報錯而非靜默產出假音檔

## 第九輪需求（進度提示 + 播放器 + 下載分享 + LOGO再放大）
- [x] 改善生成進度提示：改用 REST API 直呼，加入不確定進度動畫
- [x] 結果頁播放器使用 useAudioPlayerStatus 顯示真實播放進度
- [x] 結果頁進度條可拖動 seek
- [x] 確認下載與分享功能正常運作
- [x] 啟動動畫 LOGO 再放大（160→200）

## 第十輪需求（音波脈動動畫 + 修復 Voicebox 連線 + 錯誤提示）
- [x] 生成等待畫面加入音波脈動動態效果
- [x] 修復 cloud.fill 圖示映射
- [x] Voicebox 連線超時時顯示明確錯誤訊息（而非靜默失敗）
- [x] 生成失敗時顯示具體錯誤原因（連線失敗/逾時/Profile 建立失敗）
- [x] REST API 函數改為拋出具體錯誤而非靜默返回 null
- [x] Voicebox health check timeout 從 3 秒增加到 10 秒

## 第十一輪需求（修復 Voicebox API 流程 + 鍵盤避開 + 預設淺色）
- [x] 後端 voicebox.ts 改用正確 API 流程：POST /profiles (JSON) → POST /profiles/{id}/samples (multipart) → POST /generate → 輪詢 /history/{id} → GET /audio/{id}
- [x] 前端 voice-service.ts 對應新流程（已使用 REST API 呼叫後端）
- [x] 加入 KeyboardAvoidingView 解決鍵盤擋住輸入框
- [x] 預設改為淺色模式
- [x] 端到端測試通過（upload → generate → 取得音檔 348KB, 5.44s）
