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

## 第十二輪需求（修復上傳失敗 + 錯誤詳情顯示 + 流程優化）
- [x] 修復 voicebox.ts multipart 上傳的副檔名映射（mpeg→mp3, mp4→m4a）
- [x] voice-service.ts 錯誤訊息包含 details 讓用戶看到具體原因
- [x] 加入手動 multipart 構建替代 FormData/Blob（更可靠）
- [x] 加入詳細日誌方便排查
- [x] 端到端測試通過（upload → generate → 358KB 音檔, 5.6s）

## 第十三輪需求（修復 Voicebox 音檔驗證失敗 HTTP 400）
- [x] pickAudio 保存 asset.mimeType 並傳遞到上傳流程
- [x] generateSpeech 使用真實 mimeType 而非從副檔名猜測
- [x] voicebox.ts 根據 mimeType 正確設定副檔名和 Content-Type
- [x] 移除影片支援（Voicebox 不接受影片，APP 端無法提取音軌）
- [x] validateAudioFile 移除影片格式接受邏輯（只接受音檔）
- [x] 端到端後端測試通過（WAV 上傳 → 生成 → 取得音檔成功）
- [x] TypeScript 型別檢查通過（0 errors）

## 第十七輪需求（修復 ngrok 連線不穩 + 格式提示溢出）
- [x] 後端加入 fetchWithRetry 函數（ngrok 斷線時自動重試 2 次 + backoff）
- [x] 後端所有 Voicebox API 呼叫改用 fetchWithRetry（upload/generate/health/polling）
- [x] 後端 timeout 延長（建立 Profile 30s、上傳音檔 90s、生成 30s、輪詢 15s、下載音檔 30s）
- [x] 前端 restUploadProfile timeout 從 60s 增加到 120s
- [x] 前端 restGenerateSpeech timeout 從 180s 增加到 300s
- [x] 前端 checkVoiceboxStatus timeout 從 4s 增加到 8s
- [x] 前端 abort 錯誤訊息改善（涵蓋 abort 而非只判斷 TimeoutError）
- [x] 格式提示文字縮短為「支援 MP3、WAV、M4A、AAC 等常見音檔格式」
- [x] 後端 health 端點測試通過（online: true, profileCount: 13）

## 第十五輪需求（根本修復：ffmpeg 音檔轉換 + UI 溢出修復）
- [x] 後端加入 ffmpeg 自動轉換邏輯（非 WAV 格式自動轉為 16kHz mono WAV）
- [x] M4A 上傳測試通過（ffmpeg 轉換後 Voicebox 接受）
- [x] MP3 上傳測試通過（ffmpeg 轉換後 Voicebox 接受）
- [x] formatHintText 加入 flexShrink: 1 + flexWrap: "wrap" 防止文字溢出
- [x] formatHintRow 加入 flexWrap: "wrap" 讓整行可換行
- [x] TypeScript 型別檢查通過（0 errors）

## 第十六輪需求（音檔品質修復 + timeout 優化）
- [x] ffmpeg 轉換保留原始採樣率和聲道數（移除 -ar 16000 -ac 1，只轉容器格式）
- [x] 後端 POST /generate timeout 從 30s 增加到 120s + 重試 3 次
- [x] 前端 restGenerateSpeech timeout 從 300s 增加到 600s（10 分鐘）
- [x] 後端音檔下載加入格式驗證與診斷 log（content-type + header hex）
- [x] 後端音檔大小驗證（< 100 bytes 視為損壞）
- [x] 直撥 Voicebox API 端到端測試通過（兩次生成均正常，RMS > 5000）

## 第十七輪需求（個性設定 + timeout 修復 + 語言參數）
- [x] 後端 generateVoiceboxSpeech 加入 language/instruct/engine/seed 參數支援
- [x] 後端 REST generate 端點接收 language/instruct/engine/seed 並轉發
- [x] 前端 VoiceGenerationParams 型別加入 language/instruct/engine/seed
- [x] 前端 restGenerateSpeech 傳遞 language/instruct/engine/seed 到後端
- [x] 前端 generateSpeech 傳遞 params.language/instruct/engine/seed
- [x] 手機端加入「語氣與個性設定」可摺疊 UI（TextInput 最多 100 字）
- [x] 預設 language=zh，instruct=用戶輸入的個性描述
- [x] 後端輪詢 maxPolls 從 60 增加到 120（最長等待 10 分鐘）
- [x] 後端輪詢逾時錯誤訊息更新為「超過 10 分鐘」
- [x] TypeScript 型別檢查通過（0 errors）

## 第十八輪需求（UI 優化 + 音檔品質 + 流程加速）
- [x] 生成等待動畫加入旋轉載入圖示（ActivityIndicator large）
- [x] 生成進度卡片加入即時計時器（格式化分:秒）
- [x] 進度卡片加入預估時間提示「語音生成約需 1-3 分鐘，請耐心等待」
- [x] 預設情緒標籤快速帶入（溫柔/開心/平靜/關心/緩慢/慈祥/思念/鼓勵）
- [x] 情緒標籤可點選切換（選中為主色填充，再點取消）
- [x] 前端移除不必要 setTimeout 延遲（200ms+400ms+300ms）
- [x] 後端 ffmpeg 加入靜音裁剪（silenceremove）+ 降噪（afftdn）+ 音量標準化（loudnorm）
- [x] 後端生成音檔後處理：裁剪開頭雜訊 + 輕微降噪
- [x] 後端 reference_text 改為更精確描述「這是一段親友生前的語音錄音」
- [x] TypeScript 型別檢查通過（0 errors）

## 第十九輪需求（生成流程優化 + 排版修復）
- [x] ffmpeg 簡化：移除 afftdn 降噪和 loudnorm 音量標準化（太重導致延遲）
- [x] ffmpeg 只保留 silenceremove（裁剪開頭靜音），timeout 從 30s 降到 15s
- [x] 移除生成後音檔後處理（避免額外 ffmpeg 延遲）
- [x] 後端 storagePut 改為非阻塞（不等待 storage 上傳完成才回應）
- [x] 後端輪詢間隔從 5s 縮短到 3s（更快偵測完成狀態）
- [x] 後端 POST /generate 重試次數從 3 增加到 5
- [x] 前端 timeout 從 600s 降到 420s（配合後端 6 分鐘輪詢 + 餘裕）
- [x] 前端加入模擬進度推進（每 3 秒 +1%，5 階段文字提示）
- [x] 生成進度卡片排版修復（padding 28→20、gap 20→16）
- [x] generatingHeader 改為 row 佈局（標題左、計時器右）
- [x] genProgressInfoRow 改為垂直排列（避免窄螢幕溢出）
- [x] generatingAnimRow 加入 width 100% 和 waveContainerSmall maxWidth 200
- [x] personalityHeader 加入 width 100% 和 flexShrink
- [x] 端到端測試通過（上傳 5s + 生成 103s = 總計 108s，RMS=3693.9）

## 第二十輪需求（語音內容不正確修正）
- [x] Whisper 轉錄加入 CJK 字元驗證（純英文短字串如 "by bwd6" 是幻覺，不使用）
- [x] 無有效轉錄時使用通用 fallback「這是一段親友生前的語音錄音」
- [x] profile 建立時加入 personality 欄位（若用戶有提供 instruct）
- [x] multipart 上傳邏輯重構（移除重複程式碼，使用 let sampleRes）
- [x] TypeScript 型別檢查通過（0 errors）
- [x] 端到端測試通過（fallback reference_text 上傳成功 + 生成成功）

## 第二十一輪需求（個性設定同步 + 聲音描述欄位 + 格式提示修復 + 生成加速）
- [x] 後端 upload 端點加入 personality 和 description 參數接收與轉發
- [x] 前端 restUploadProfile 加入 personality 和 description 參數傳遞
- [x] 前端 VoiceGenerationParams 介面加入 description 欄位
- [x] 前端 generateSpeech 傳遞 instruct（personality）和 description 到 restUploadProfile
- [x] 前端 handleGenerate 傳遞 voiceDescription 到 generateSpeech
- [x] 新增「聲音描述」選填欄位 UI（在上傳音檔後顯示，最多 30 字）
- [x] 修復格式提示版面：formatHintBox 加入 alignSelf stretch，formatHintRow 移除 flexWrap 改用 flexShrink，formatHintText 加入 flex:1
- [x] 生成速度優化：移除 Whisper 轉錄阻塞流程，直接使用通用 reference_text 上傳
- [x] TypeScript 型別檢查通過（0 errors）

## 第二十二輪需求（格式提示還原 + 跳過 ffmpeg + description 改為 design_prompt）
- [x] 格式提示樣式還原為上一版（formatHintBox 移除 alignSelf stretch，formatHintRow 恢復 flexWrap，formatHintText 恢復 fontSize 12 + flexShrink）
- [x] 跳過 ffmpeg 音檔轉換（直接上傳原始音檔給 Voicebox，避免轉換超時）
- [x] 後端 upload 端點：description 不再作為 profile name，改為傳給 uploadVoiceProfile 第六參數
- [x] uploadVoiceProfile 加入 description 參數，映射到 Voicebox 的 design_prompt 欄位
- [x] 聲音描述 placeholder 改為「例如：中年男性，聲音低沉溫厚」，字數上限 50 字
- [x] TypeScript 型別檢查通過（0 errors）

## 第二十三輪需求（description 欄位修正 + icon 跑掉修復 + 移除旋轉讀條）
- [x] Voicebox cloned profile 不支援 design_prompt，改用 description 欄位
- [x] 格式提示 icon 手機端跑掉修復：移除 flexWrap（避免圖示換行到下一行），加入 flex:1 讓文字收縮
- [x] 移除生成語音的旋轉讀條（ActivityIndicator），只保留音波脈動動畫
- [x] TypeScript 型別檢查通過（0 errors）

## 第二十四輪需求（恢復 ffmpeg 快速轉換 + 格式提示寬度修復）
- [x] 恢復 ffmpeg 轉換但移除 silenceremove 濾鏡，只做純容器轉換（pcm_s16le），timeout 降為 10 秒
- [x] 格式提示寬度修復：uploadPlaceholder 加入 width 100%，formatHintBox 加入 maxWidth 100%
- [x] TypeScript 型別檢查通過（0 errors）

## 第二十五輪需求（根本修復：reference_text + ffmpeg 標準化 + 重試削減）
- [x] 移除假的 reference_text（"這是一段親友生前的語音錄音"），改為不送此欄位讓 Voicebox 自行分析音檔特徵
- [x] ffmpeg 加入 -ar 16000 -ac 1 產生標準 16kHz 單聲道 WAV（Voicebox 最佳相容格式）
- [x] generate 重試從 5 次降為 2 次，timeout 從 120s 降為 60s
- [x] 輪詢間隔從 3 秒降為 2 秒，最多等待 4 分鐘（原 6 分鐘）
- [x] sample upload timeout 從 90s 降為 60s，重試從 3 次降為 2 次
- [x] 前端移除「正在轉錄語音內容」進度文字（不再做轉錄）
- [x] TypeScript 型別檢查通過（0 errors）

## 第二十六輪需求（恢復 reference_text 必填欄位）
- [x] Voicebox 的 reference_text 是必填欄位（不送會 422），恢復通用 reference_text
- [x] 之前 400 錯誤的真正原因是跳過 ffmpeg 轉換導致音檔格式不被接受，現在已恢復 ffmpeg 16kHz 單聲道標準轉換
- [x] TypeScript 型別檢查通過（0 errors）

## 第二十七輪需求（生成速度診斷 + VOICEBOX_URL 更新 + 前端體驗優化）
- [x] 更新 VOICEBOX_URL 為今日新的 Cloudflare Tunnel URL
- [x] 實測完整生成流程：總耗時 134 秒，瓶頸在 Voicebox AI 模型載入(27s)和語音合成(91s)，佔 88%
- [x] 前端 timeout 從 420s 降為 300s（5 分鐘，足夠涵蓋正常生成時間）
- [x] 進度提示文字更新為「語音生成約需 2-3 分鐘，AI 正在學習聲音特徵」
- [x] 格式提示版面修復確認

## 第二十八輪需求（胡言亂語根本修復 + timeout 延長）

- [x] 使用 Voicebox /transcribe 端點自動轉錄音檔，取得真實 reference_text
- [x] 移除假的 reference_text（「這是一段語音錄音」），改為自動轉錄
- [x] 轉錄失敗時使用最小化 fallback「嗯」而非完整假句子
- [x] 後端輪詢 timeout 從 4 分鐘延長至 6 分鐘（實測 qwen/1.7B 需 165 秒）
- [x] 前端 timeout 從 5 分鐘延長至 10 分鐘
- [x] 進度提示新增「AI 正在載入語音模型...」階段
- [x] TypeScript 0 errors

## 第二十九輪需求（chatterbox 引擎修復 - 胡言亂語根本解決）

- [x] 實測所有可用引擎：qwen（胡言亂語）、chatterbox（內容完美正確）、chatterbox_turbo（英文幻覺）、kokoro（不支援 cloned）、tada（太慢）
- [x] 前端預設引擎改為 chatterbox（唯一能正確生成中文內容的引擎）
- [x] 後端 generate 端點預設引擎改為 chatterbox
- [x] 進度推進間隔從 3 秒改為 4 秒（匹配 chatterbox 約 260 秒的實際耗時）
- [x] 等待時間提示從「1-3 分鐘」改為「3-5 分鐘」
- [x] TypeScript 0 errors
