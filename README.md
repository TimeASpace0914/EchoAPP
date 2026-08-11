# 迴響 — AI 語音克隆行動應用

> 讓用戶上傳已故親友的生前音檔，輸入想讓親友說的話，透過本地 AI 模型生成親友聲音的語音，支援下載與分享。

迴響是一款基於 **React Native + Expo** 開發的語音克隆行動應用，後端整合 **Voicebox** 本地 TTS 服務，透過 Cloudflare Named Tunnel 對外暴露固定網址，實現穩定的語音克隆與生成功能。

---

## 目錄

- [技術棧](#技術棧)
- [專案結構](#專案結構)
- [快速開始](#快速開始)
- [環境變數設定](#環境變數設定)
- [Voicebox 服務設定](#voicebox-服務設定)
- [開發指令](#開發指令)
- [核心功能](#核心功能)
- [UI/UX 設計規範](#uiux-設計規範)
- [測試](#測試)
- [部署](#部署)
- [授權](#授權)

---

## 技術棧

| 類別 | 技術 | 版本 |
|------|------|------|
| **前端框架** | React Native + Expo SDK | 54 |
| **語言** | TypeScript | 5.9 |
| **路由** | Expo Router | 6 |
| **樣式** | NativeWind v4 (Tailwind CSS) | 4.2 |
| **動畫** | react-native-reanimated | 4.x |
| **後端** | Express + tRPC + Drizzle ORM | — |
| **資料庫** | PostgreSQL | — |
| **語音服務** | Voicebox (本地 TTS) | port 17493 |
| **語音轉錄** | Whisper (整合於 Voicebox) | — |
| **拼音標注** | pinyin-pro | 3.28 |
| **套件管理** | pnpm | 9.12 |
| **Node.js** | — | 22+ |

---

## 專案結構

```
echo-voice-app/
├── app/                        # Expo Router 頁面
│   ├── _layout.tsx             # 根佈局（Provider 注入）
│   ├── (tabs)/
│   │   ├── _layout.tsx         # Tab Bar 設定
│   │   ├── index.tsx           # 首頁（音檔上傳、文字輸入、情緒選擇、語速調整）
│   │   ├── history.tsx         # 回憶庫（歷史紀錄列表、搜尋、編輯、下載）
│   │   └── settings.tsx        # 設定頁（使用說明、主題切換）
│   ├── result.tsx              # 結果頁（播放、下載、分享、儲存到回憶庫）
│   └── oauth/callback.tsx      # OAuth 回調頁
├── components/                 # 共用元件
│   ├── screen-container.tsx   # SafeArea 容器
│   ├── splash-overlay.tsx     # 開場動畫（同心圓波紋 + LOGO 呼吸）
│   ├── logo.tsx               # APP Logo
│   ├── floating-generation-widget.tsx  # 懸浮生成進度小工具
│   └── ui/icon-symbol.tsx     # 圖示映射（SF Symbols → Material Icons）
├── lib/                        # 核心邏輯
│   ├── voice-service.ts       # 語音服務核心（上傳、生成、歷史紀錄 API）
│   ├── pinyin-helpers.ts      # 中文拼音提示工具（修正 G2P 發音問題）
│   ├── download-utils.ts      # 音檔下載工具（跨平台）
│   ├── generation-store.ts     # 生成狀態管理（Zustand）
│   └── theme-provider.tsx     # 主題 Context Provider
├── server/                     # 後端伺服器
│   ├── _core/
│   │   ├── index.ts            # Express 伺服器入口
│   │   ├── env.ts              # 環境變數定義
│   │   └── ...
│   ├── voicebox.ts             # Voicebox API 整合（轉錄、上傳、生成）
│   ├── db.ts                   # 資料庫連線（Drizzle ORM）
│   ├── routers.ts              # tRPC 路由
│   └── storage.ts              # 檔案儲存
├── drizzle/                    # 資料庫遷移
├── assets/images/              # APP 圖示與素材
├── tests/                      # 單元測試
├── theme.config.js             # 主題色彩設定（黑白風格）
├── app.config.ts               # Expo 應用設定
├── tailwind.config.js          # Tailwind CSS 設定
└── package.json
```

---

## 快速開始

### 系統需求

- **Node.js** 22+
- **pnpm** 9+
- **PostgreSQL**（後端資料庫，可選 — 見[環境變數設定](#環境變數設定)）
- **Voicebox** TTS 服務（本地或遠端，見[Voicebox 服務設定](#voicebox-服務設定)）

### 安裝步驟

```bash
# 1. 克隆專案
git clone https://github.com/TimeASpace0914/EchoAPP.git
cd EchoAPP

# 2. 安裝依賴
pnpm install

# 3. 建立 .env 檔案（見下方環境變數設定）

# 4. 啟動開發伺服器
pnpm dev
```

啟動後，Metro Bundler 運行於 `http://localhost:8081`，後端 API 伺服器運行於 `http://localhost:3000`。

---

## 環境變數設定

專案使用 `scripts/load-env.js` 載入環境變數，支援 `.env` 檔案與系統環境變數（系統優先）。在專案根目錄建立 `.env` 檔案：

```bash
# ============================================
# 必要變數（語音克隆核心功能）
# ============================================

# Voicebox TTS 服務網址
# 本地部署：http://localhost:17493
# Cloudflare Tunnel：https://voicebox.echo-voice.cc
VOICEBOX_URL=https://voicebox.echo-voice.cc

# ============================================
# 後端伺服器變數（認證與資料庫）
# ============================================

# PostgreSQL 連線字串（不設定則跳過資料庫功能）
DATABASE_URL=postgresql://user:password@localhost:5432/echo_voice

# JWT 密鑰（用於 Session Cookie 簽章）
JWT_SECRET=your-secret-key-here

# OAuth 伺服器網址（Manus 平台認證）
OAUTH_SERVER_URL=https://oauth.manus.im

# Manus 應用 ID
VITE_APP_ID=your-app-id

# ============================================
# 可選變數（Manus 平台整合功能）
# ============================================

# Forge API（內建 LLM / 圖片生成 / 語音轉錄）
BUILT_IN_FORGE_API_URL=
BUILT_IN_FORGE_API_KEY=

# OAuth 用戶資訊
OWNER_OPEN_ID=
OWNER_NAME=

# 前端公開變數（EXPO_PUBLIC_ 前綴）
EXPO_PUBLIC_OAUTH_PORTAL_URL=
EXPO_PUBLIC_OAUTH_SERVER_URL=
EXPO_PUBLIC_APP_ID=
EXPO_PUBLIC_OWNER_OPEN_ID=
EXPO_PUBLIC_OWNER_NAME=
EXPO_PUBLIC_API_BASE_URL=

# 開發用
PORT=3000
```

### 變數優先順序

`load-env.js` 遵循以下優先順序：

1. **系統環境變數**（最高優先 — 不會被 .env 覆蓋）
2. **`.env` 檔案**
3. **程式碼預設值**（最低）

### 變數與功能對照

| 變數 | 必要性 | 影響功能 |
|------|--------|----------|
| `VOICEBOX_URL` | **必要** | 語音克隆生成、聲音上傳、健康檢查 |
| `DATABASE_URL` | 可選 | 使用者認證、歷史紀錄跨裝置同步（不設定則使用本地 AsyncStorage） |
| `JWT_SECRET` | 可選 | Session Cookie 簽章（不設定則認證功能無效） |
| `OAUTH_SERVER_URL` | 可選 | Manus 平台 OAuth 登入 |
| `VITE_APP_ID` | 可選 | Manus 應用識別 |
| `BUILT_IN_FORGE_API_URL` | 可選 | 內建 LLM、圖片生成、語音轉錄 |
| `BUILT_IN_FORGE_API_KEY` | 可選 | 內建 API 認證金鑰 |
| `PORT` | 可選 | 後端伺服器端口（預設 3000） |

> **換設備注意事項**：只需設定 `VOICEBOX_URL` 即可使用語音克隆核心功能。其他變數視需求設定。`.env` 檔案已被 `.gitignore` 排除，不會推送到 GitHub。

---

## Voicebox 服務設定

迴響依賴 Voicebox 本地 TTS 服務進行語音克隆。Voicebox 包裝了 Qwen3-TTS 等 7 種引擎，使用 G2P（Grapheme-to-Phoneme）將文字轉音素。

### Cloudflare Named Tunnel 設定

專案使用 Cloudflare Named Tunnel 將本地 Voicebox 服務（port 17493）暴露為固定網址：

```
Tunnel ID: 1b1b008e-6f91-41e4-be14-b089ec5a889f
Tunnel 名稱: voicebox
固定網址: https://voicebox.echo-voice.cc → localhost:17493
```

### 在新設備上重建 Tunnel

```bash
# 1. 安裝 cloudflared
brew install cloudflared          # macOS
# 或 sudo apt install cloudflared  # Linux

# 2. 登入 Cloudflare
cloudflared tunnel login

# 3. 建立 Tunnel（如已存在則使用既有 ID）
cloudflared tunnel create voicebox

# 4. 設定路由
cloudflared tunnel route dns voicebox voicebox.echo-voice.cc

# 5. 建立設定檔 ~/.cloudflared/config.yml
cat > ~/.cloudflared/config.yml << 'EOF'
tunnel: 1b1b008e-6f91-41e4-be14-b089ec5a889f
credentials-file: /home/ubuntu/.cloudflared/1b1b008e-6f91-41e4-be14-b089ec5a889f.json
ingress:
  - hostname: voicebox.echo-voice.cc
    service: http://localhost:17493
  - service: http_status:404
EOF

# 6. 啟動 Tunnel
cloudflared tunnel run voicebox
```

### Voicebox API 流程

語音生成的完整流程：

1. **上傳音檔** — `POST /profiles`（建立 Profile）→ `POST /profiles/{id}/samples`（上傳音檔樣本）
2. **生成語音** — `POST /generate`（提交生成請求，含 instruct、language、speed 參數）
3. **輪詢結果** — `GET /history/{id}`（輪詢生成狀態，直到完成）
4. **取得音檔** — `GET /audio/{id}`（下載生成的語音檔案）

---

## 開發指令

```bash
# 啟動開發伺服器（前端 + 後端同時）
pnpm dev

# 單獨啟動後端
pnpm dev:server

# 單獨啟動 Metro Bundler
pnpm dev:metro

# TypeScript 型別檢查
pnpm check

# ESLint 檢查
pnpm lint

# 執行單元測試
pnpm test

# 資料庫遷移
pnpm db:push

# 格式化程式碼
pnpm format

# 建置後端
pnpm build

# iOS 模擬器啟動
pnpm ios

# Android 模擬器啟動
pnpm android
```

---

## 核心功能

### 語音克隆生成

用戶上傳親友的生前音檔（支援 MP3、WAV、M4A、AAC 等格式），輸入想讓親友說的話，系統透過 Voicebox 進行語音克隆生成。後端使用 ffmpeg 自動將音檔轉換為 16kHz 單聲道 WAV 標準格式，確保 Voicebox 最佳相容性。

### 情緒與語速控制

支援多選情緒標籤（溫柔、開心、平靜、關心、緩慢、慈祥、思念、鼓勵、激昂、生氣），每個情緒以簡潔關鍵詞形式附加到 Voicebox 的 `instruct` 參數中。語速滑條範圍 0~2，初始值 1.0。

### 中文發音修正

系統自動偵測輸入文字中的中文字片段（≥3 字），使用 `pinyin-pro` 產生帶聲調符號的拼音標注，附加到 `instruct` 參數中。這解決了 Voicebox G2P 模型將罕見人名（如「蔡承諺」）錯誤映射為其他讀音的問題。

### 回憶庫管理

歷史紀錄儲存於 AsyncStorage（本地）或 PostgreSQL（後端），支援搜尋、標籤篩選、編輯、下載與分享。

### 開場動畫

Splash 畫面包含同心圓波紋擴散動畫與 LOGO 呼吸浮動效果，使用 `react-native-reanimated` 貝茲曲線緩動，整體柔和優雅。首頁載入時有淡入過場效果。

---

## UI/UX 設計規範

### 色彩系統

專案採用**黑白極簡風格**，色彩定義於 `theme.config.js`：

| Token | 淺色模式 | 深色模式 | 用途 |
|-------|----------|----------|------|
| `primary` | `#000000` | `#FFFFFF` | 強調色（按鈕、圖示、選中狀態） |
| `background` | `#F2F2F5` | `#0A0A0A` | 主背景 |
| `surface` | `#FFFFFF` | `#1A1A1A` | 卡片底色 |
| `foreground` | `#000000` | `#F2F2F5` | 主文字 |
| `muted` | `#999999` | `#666666` | 次要文字 |
| `border` | `#E5E5E5` | `#2A2A2A` | 邊框 |

### 設計原則

- **圓潤圓角**：按鈕與卡片使用 14-20px 圓角，播放鈕統一為圓形（borderRadius = width/2）
- **點擊回饋**：所有按鈕使用 `activeOpacity` 提供觸覺回饋
- **深色模式**：自動切換，所有元件均確保深色模式可見性
- **SafeArea**：所有頁面使用 `ScreenContainer` 處理狀態列與 Home Indicator 區域

---

## 測試

```bash
# 執行所有測試
pnpm test

# 執行特定測試檔
npx vitest run tests/pinyin-helpers.test.ts
```

### 測試覆蓋範圍

| 測試檔 | 說明 |
|--------|------|
| `tests/pinyin-helpers.test.ts` | 中文拼音提示工具（14 項測試） |
| `tests/voicebox-health.test.ts` | Voicebox 服務健康檢查 |
| `tests/auth.logout.test.ts` | 使用者登出流程 |

---

## 部署

### 建置

```bash
# 後端建置
pnpm build

# 生產模式啟動
NODE_ENV=production node dist/index.js
```

### Expo 應用建置

透過 Expo 的 Publish 功能建置 APK：

1. 在開發環境中建立 checkpoint
2. 點擊 UI 中的 **Publish** 按鈕
3. 系統自動建置並生成 APK

> **重要**：不要在 sandbox 中手動建置 APK，這會導致資源耗盡。請使用 Expo 的 Publish 流程。

---

## 授權

本專案為私人專案，不對外公開授權。

---

## 相關連結

- [GitHub 儲存庫](https://github.com/TimeASpace0914/EchoAPP)
- [Expo SDK 54 文件](https://docs.expo.dev/versions/v54.0.0/)
- [Voicebox TTS 服務](https://voicebox.echo-voice.cc)
- [pinyin-pro 文件](https://github.com/zh-lx/pinyin-pro)
