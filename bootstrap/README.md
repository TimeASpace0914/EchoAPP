# EchoAPP 本機重建工具包

此資料夾讓新電腦能從 GitHub 重建 EchoAPP 的開發與語音測試環境。它保存的是**可版本控制、可審閱、可重現的腳本與設定**，而不是 Node.js、ffmpeg、Voicebox 或模型權重的二進位檔。這些程式與模型大小大、版本更新頻繁，或各自受原始發行者的下載與授權機制管理；將下載流程自動化，比直接提交到 GitHub 更安全可靠。

## 內容與使用順序

| 檔案 | 用途 | 何時使用 |
|---|---|---|
| `install-dev-tools.sh` | 檢查或安裝 Node.js 22+、pnpm 9+、ffmpeg | 新電腦第一次設定 |
| `voicebox-models.sh` | 對已開啟的本機 Voicebox 預下載 Whisper 與 Qwen TTS 模型 | Voicebox 安裝完成後 |
| `../.env.example` | EchoAPP／Voicebox 本機設定範例 | 下載程式碼並安裝依賴後 |
| `../setup.sh` | 安裝依賴、建立 `.env`、啟動或檢查專案 | 每次重建或快速啟動 |

> **先後順序：** 工具 → Voicebox 桌面程式 → Voicebox 模型 → `.env` → EchoAPP 後端與 Expo。

## 一次建好：最短流程

在 macOS 或 Linux 終端機執行以下指令；Windows 請使用 Git Bash 或 WSL 執行 Bash 腳本，並以 PowerShell 安裝 Windows 原生工具。

```bash
git clone https://github.com/TimeASpace0914/EchoAPP.git
cd EchoAPP

# 必要開發工具：預設僅檢查；加上 --install 才會進行安裝。
bash bootstrap/install-dev-tools.sh --install

# 取得專案依賴並建立本機設定。
pnpm install --frozen-lockfile
cp .env.example .env

# 安裝並啟動 Voicebox 桌面應用程式後，預下載建議模型。
bash bootstrap/voicebox-models.sh --profile balanced --wait

# 啟動 EchoAPP 後端與 Expo Web。
pnpm dev
```

若你要使用目前的 Whisper 逐字稿品質保護修正，請切換至對應分支：

```bash
git fetch origin fix/transcription-quality-gate
git switch --track origin/fix/transcription-quality-gate
```

## Voicebox 安裝與模型下載

EchoAPP 使用 [Voicebox](https://voicebox.sh/) 的本機 REST API，預設位置是 `http://127.0.0.1:17493`。Voicebox 有 macOS Apple Silicon、macOS Intel 與 Windows 的桌面下載版；Linux 則需依其官方指引建置。[1] 在 Voicebox 開啟後，先確認以下網址可開啟，再執行模型下載腳本：

```text
http://127.0.0.1:17493/docs
```

`voicebox-models.sh` 會呼叫 Voicebox 的 `/models/download` API，由 Voicebox 從其模型來源下載並快取。Voicebox 官方文件列出此 API、模型狀態查詢與預下載機制；模型預設存在系統的 Hugging Face 快取，亦可透過 `VOICEBOX_MODELS_DIR` 改到容量較大的磁碟。[2]

| 模式 | Whisper ASR | Qwen TTS | 適用情境 | 取捨 |
|---|---|---|---|---|
| `balanced` | `whisper-turbo` | `qwen-tts-1.7B` | **預設推薦**；乾淨到一般的中文參考音檔 | 兼顧辨識品質與速度 |
| `accuracy` | `whisper-large` | `qwen-tts-1.7B` | 雜訊多、口音較重或需要離線驗證最高準確度 | 速度慢且需要較多記憶體 |
| `low-memory` | `whisper-small` | `qwen-tts-0.6B` | CPU-only、低 VRAM、先確認流程 | 較容易出現錯字或人名誤辨 |

```bash
# 推薦的中文測試設定
bash bootstrap/voicebox-models.sh --profile balanced --wait

# 雜訊較多的音檔，且機器資源足夠時
bash bootstrap/voicebox-models.sh --profile accuracy --wait

# 低記憶體電腦先驗證流程
bash bootstrap/voicebox-models.sh --profile low-memory --wait
```

## Whisper 的中文準確度設定

EchoAPP 目前會將參考音檔提供給 Voicebox 作為中文聲音 profile。短音檔若使用自動語言偵測，較容易被錯判，因此專案預設傳遞 `zh` 語言提示與 `turbo` 模型尺寸。Voicebox 文件指出，短片段提供語言提示可改善辨識，並建議對雜訊音檔使用 Turbo 或 Large；Voicebox 也會將輸入轉成單聲道 16kHz，這與 Whisper 的預期格式一致。[3]

請把下列設定放在 EchoAPP 根目錄的 `.env`：

```dotenv
VOICEBOX_URL=http://127.0.0.1:17493
VOICEBOX_WHISPER_MODEL=turbo
VOICEBOX_TRANSCRIPTION_LANGUAGE=zh
PORT=3000
```

| 設定 | 建議值 | 說明 |
|---|---|---|
| `VOICEBOX_WHISPER_MODEL` | `turbo` | 中文參考音檔的預設；相較 Large 更快，適合大多數測試 |
| `VOICEBOX_WHISPER_MODEL` | `large` | 僅在較難的音檔上比較使用；應先確認電腦有足夠記憶體／VRAM |
| `VOICEBOX_TRANSCRIPTION_LANGUAGE` | `zh` | 中文 profile 的明確提示；不要留白交給短音檔自動判別 |
| `VOICEBOX_URL` | `http://127.0.0.1:17493` | 本機測試使用；不要一開始就依賴舊電腦的 Tunnel 網址 |

> **不要把 `zh` 當作台語、粵語、日語或中英混合音檔的萬用設定。** 若你要有意測試另一種主要語言，才將 `VOICEBOX_TRANSCRIPTION_LANGUAGE` 改成相對應的 Whisper 語言碼，重啟 EchoAPP 後端，再用該語言的 profile 與對應逐字稿進行測試。

Whisper Turbo 是 `large-v3` 的精簡版本，速度更高但相對有輕微品質取捨；正式決定模型前，應以你實際的中文樣本比較結果，而不是只以模型尺寸判斷。[4] Whisper 的已知限制包含背景雜訊、短音檔、口音與低資源語言情況下可能產生未實際說出的文字，因此 EchoAPP 仍保留「音檔內容文字」手動校正欄位與逐字稿品質檢核。[5]

## 音檔與逐字稿的操作準則

語音克隆的 `reference_text` 必須和參考音檔內容相符。Voicebox 文件建議使用乾淨音訊、正確對應逐字稿，並指出多個樣本可以提升克隆品質。[6] 對 EchoAPP，請遵守下列流程：

1. 優先使用只有一人說話、背景音樂低、約 5–20 秒的中文音檔。
2. 有已知逐字稿時，直接貼到「音檔內容文字」欄位；這是避免人名與罕見字錯字的最有效作法。
3. 沒有逐字稿時才讓 Voicebox 自動辨識；若系統拒絕過短、非中文或無意義結果，請改以手動文字校正，而不是反覆生成。
4. 針對同一段音檔，以 `turbo` 與 `large` 各測一次，記錄是否有錯字、錯讀或需要手動校正，再決定是否值得使用較大的模型。

## 完整測試流程

先開啟 Voicebox，再以兩個終端機啟動 EchoAPP：

```bash
# 終端機 A：EchoAPP API server
pnpm dev:server

# 終端機 B：Expo Web 或 Expo Go LAN 開發伺服器
npx expo start --lan
```

接著逐層驗證：

```bash
# Voicebox 本機 API
curl http://127.0.0.1:17493/models/status

# EchoAPP API
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:3000/api/voicebox/health

# 型別與本地單元測試
pnpm check
pnpm exec vitest run \
  tests/pinyin-helpers.test.ts \
  tests/transcription-quality.test.ts \
  tests/voicebox-config.test.ts \
  tests/auth.logout.test.ts
```

真實手機測試時，請在 `.env` 加上新電腦的 LAN IP，然後重啟 Expo：

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.50:3000
```

手機與新電腦必須在同一個 Wi-Fi；不要在手機使用 `localhost`，因為它會指向手機本身，而不是電腦。

## 為什麼不把程式和模型直接放進 GitHub？

| 項目 | 是否提交到 EchoAPP | 原因 | 取代方式 |
|---|---:|---|---|
| EchoAPP 原始碼、`.env.example`、Bash 腳本、文件 | 是 | 小型、可審閱、可版本控制 | 已放在此儲存庫 |
| Node.js、pnpm、ffmpeg 安裝檔 | 否 | 平台相依、體積大、需跟隨安全更新 | `install-dev-tools.sh` 使用官方／系統套件管理器安裝 |
| Voicebox 桌面應用程式 | 否 | 有自己的版本與發行流程 | 由 [Voicebox 官方下載頁](https://voicebox.sh/) 安裝 |
| Whisper／Qwen 模型權重 | 否 | 模型檔大、模型版本與快取由 Voicebox 管理 | `voicebox-models.sh` 呼叫本機 Voicebox 預下載 |
| `.env`、Cloudflare 憑證、OAuth／資料庫密碼 | **絕對不可以** | 可能包含私密憑證 | 僅保存於本機密碼管理器或安全的 secrets 管理工具 |

因此，從 GitHub clone 後執行上述兩個 Bash 腳本，就能在新電腦重新取得所需工具與模型，而不會讓儲存庫帶入巨型檔案或敏感資料。

## References

[1] [Voicebox official downloads and local API](https://voicebox.sh/)  
[2] [Voicebox — Model Management](https://docs.voicebox.sh/developer/model-management)  
[3] [Voicebox — Transcription](https://docs.voicebox.sh/developer/transcription)  
[4] [Hugging Face — Whisper large-v3-turbo model card](https://huggingface.co/openai/whisper-large-v3-turbo)  
[5] [OpenAI Whisper — model sizes and limitations](https://github.com/openai/whisper)  
[6] [Voicebox — Voice Profiles and sample-quality practices](https://docs.voicebox.sh/developer/voice-profiles)
