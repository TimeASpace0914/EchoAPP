#!/usr/bin/env bash
# ============================================================
# 迴響 (Echo Voice App) — 一鍵安裝與啟動腳本
# ============================================================
# 用法：
#   chmod +x setup.sh
#   ./setup.sh          # 安裝依賴 + 建立 .env + 啟動開發伺服器
#   ./setup.sh --dev    # 僅啟動開發伺服器（跳過安裝）
#   ./setup.sh --check  # 僅執行型別檢查與測試
# ============================================================

set -euo pipefail

# ---- 色彩輸出 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $1"; exit 1; }

# ---- 專案根目錄 ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---- 參數解析 ----
MODE="full"
if [[ "${1:-}" == "--dev" ]]; then
  MODE="dev"
elif [[ "${1:-}" == "--check" ]]; then
  MODE="check"
fi

# ============================================================
# 1. 環境檢查
# ============================================================
check_prerequisites() {
  info "檢查系統環境..."

  # Node.js
  if ! command -v node &>/dev/null; then
    fail "未安裝 Node.js（需要 v22+）。請至 https://nodejs.org/ 安裝。"
  fi
  NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
  if [[ "$NODE_VERSION" -lt 22 ]]; then
    warn "Node.js 版本為 v$NODE_VERSION，建議升級至 v22+。"
  else
    ok "Node.js $(node -v)"
  fi

  # pnpm
  if ! command -v pnpm &>/dev/null; then
    warn "未安裝 pnpm，正在安裝..."
    npm install -g pnpm@9 || fail "pnpm 安裝失敗"
  fi
  ok "pnpm $(pnpm -v)"

  # ffmpeg（後端音檔轉換用，可選）
  if command -v ffmpeg &>/dev/null; then
    ok "ffmpeg $(ffmpeg -version 2>&1 | head -1 | awk '{print $3}')"
  else
    warn "未安裝 ffmpeg（後端音檔轉換功能將無法使用）"
    warn "  macOS:   brew install ffmpeg"
    warn "  Ubuntu:   sudo apt install ffmpeg"
  fi

  # git
  if ! command -v git &>/dev/null; then
    fail "未安裝 git。"
  fi
  ok "git $(git --version | awk '{print $3}')"
}

# ============================================================
# 2. 安裝依賴
# ============================================================
install_dependencies() {
  info "安裝 npm 依賴..."
  pnpm install
  ok "依賴安裝完成"
}

# ============================================================
# 3. 建立 .env 檔案
# ============================================================
create_env_file() {
  if [[ -f ".env" ]]; then
    ok ".env 已存在，跳過建立"
    return
  fi

  info "建立 .env 檔案..."

  cat > .env << 'ENVEOF'
# ============================================
# 迴響 (Echo Voice App) 環境設定
# ============================================
# 此檔案由 setup.sh 自動產生，請依實際環境修改。
# .env 已被 .gitignore 排除，不會推送到 GitHub。

# --------------------------------------------
# 必要：Voicebox TTS 服務網址
# --------------------------------------------
# 本地部署：http://127.0.0.1:17493
# Cloudflare Tunnel：https://voicebox.echo-voice.cc（僅在完成本機測試後使用）
VOICEBOX_URL=http://127.0.0.1:17493

# Whisper 轉錄模型：base / small / medium / large / turbo
# 中文參考音檔建議使用 turbo；若音檔雜訊嚴重且硬體足夠，可改為 large。
VOICEBOX_WHISPER_MODEL=turbo

# 對短中文參考音檔提供明確語言提示，避免錯判為英文。
VOICEBOX_TRANSCRIPTION_LANGUAGE=zh

# --------------------------------------------
# 可選：PostgreSQL 資料庫（跨裝置同步用）
# --------------------------------------------
# 不設定則使用 AsyncStorage 本地儲存
# DATABASE_URL=postgresql://user:password@localhost:5432/echo_voice

# --------------------------------------------
# 可選：JWT 密鑰（OAuth 認證用）
# --------------------------------------------
# JWT_SECRET=your-secret-key-here

# --------------------------------------------
# 可選：Manus 平台 OAuth
# --------------------------------------------
# OAUTH_SERVER_URL=https://oauth.manus.im
# VITE_APP_ID=your-app-id

# --------------------------------------------
# 可選：Forge API（內建 LLM / 圖片生成）
# --------------------------------------------
# BUILT_IN_FORGE_API_URL=
# BUILT_IN_FORGE_API_KEY=

# --------------------------------------------
# 開發用
# --------------------------------------------
PORT=3000
ENVEOF

  ok ".env 已建立（預設使用本機 Voicebox：http://127.0.0.1:17493）"
  warn "請檢查 .env 內容，確認 Voicebox 服務網址正確"
}

# ============================================================
# 4. 型別檢查與測試
# ============================================================
run_checks() {
  info "執行 TypeScript 型別檢查..."
  if npx tsc --noEmit 2>&1; then
    ok "TypeScript 型別檢查通過"
  else
    fail "TypeScript 型別檢查失敗"
  fi

  info "執行單元測試..."
  if npx vitest run 2>&1; then
    ok "所有測試通過"
  else
    warn "部分測試未通過（不影響啟動）"
  fi
}

# ============================================================
# 5. 啟動開發伺服器
# ============================================================
start_dev() {
  info "啟動開發伺服器..."
  echo ""
  echo "  ┌─────────────────────────────────────────────┐"
  echo "  │  Metro Bundler:  http://localhost:8081       │"
  echo "  │  API Server:     http://localhost:3000       │"
  echo "  │  Voicebox:       \$VOICEBOX_URL              │"
  echo "  └─────────────────────────────────────────────┘"
  echo ""
  echo "  按 Ctrl+C 停止伺服器"
  echo ""

  pnpm dev
}

# ============================================================
# 主流程
# ============================================================
echo ""
echo "  ╔═══════════════════════════════════════════╗"
echo "  ║   迴響 (Echo Voice App) — 啟動腳本        ║"
echo "  ╚═══════════════════════════════════════════╝"
echo ""

case "$MODE" in
  full)
    check_prerequisites
    echo ""
    install_dependencies
    echo ""
    create_env_file
    echo ""
    run_checks
    echo ""
    start_dev
    ;;
  dev)
    start_dev
    ;;
  check)
    check_prerequisites
    echo ""
    run_checks
    ;;
esac
