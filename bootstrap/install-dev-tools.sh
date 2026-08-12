#!/usr/bin/env bash
# EchoAPP 開發工具前置檢查與安裝器。
# 預設只檢查；使用 --install 才會執行套件管理器安裝。

set -Eeuo pipefail

REQUIRED_NODE_MAJOR=22
REQUIRED_PNPM_MAJOR=9
MODE="check"
ASSUME_YES=false

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
RESET='\033[0m'

info() { printf "${BLUE}[INFO]${RESET} %s\n" "$*"; }
ok() { printf "${GREEN}[ OK ]${RESET} %s\n" "$*"; }
warn() { printf "${YELLOW}[WARN]${RESET} %s\n" "$*"; }
fail() { printf "${RED}[FAIL]${RESET} %s\n" "$*" >&2; }

usage() {
  cat <<'EOF'
用法：
  bash bootstrap/install-dev-tools.sh --check
  bash bootstrap/install-dev-tools.sh --install [--yes]

選項：
  --check    僅檢查 git、Node.js 22+、pnpm 9+、ffmpeg（預設）。
  --install  自動安裝缺少或版本不足的必要工具。
  --yes      與 --install 一起使用，略過安裝前確認。
  --help     顯示此說明。

注意：本腳本不會下載 Voicebox 桌面應用程式或模型。請先依
bootstrap/README.md 下載 Voicebox，再以 voicebox-models.sh 預下載模型。
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) MODE="check" ;;
    --install) MODE="install" ;;
    --yes) ASSUME_YES=true ;;
    --help|-h) usage; exit 0 ;;
    *) fail "未知選項：$1"; usage; exit 2 ;;
  esac
  shift
done

OS="$(uname -s)"
case "$OS" in
  Darwin) PLATFORM="macos" ;;
  Linux) PLATFORM="linux" ;;
  MINGW*|MSYS*|CYGWIN*) PLATFORM="windows-bash" ;;
  *) PLATFORM="unknown" ;;
esac

confirm_install() {
  if [[ "$MODE" != "install" ]]; then
    return 1
  fi
  if [[ "$ASSUME_YES" == true ]]; then
    return 0
  fi
  read -r -p "將使用系統套件管理器安裝或升級工具，是否繼續？ [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]]
}

require_command() {
  local command="$1"
  local label="$2"
  if command -v "$command" >/dev/null 2>&1; then
    ok "$label：$(command -v "$command")"
    return 0
  fi
  warn "$label 尚未安裝"
  return 1
}

node_is_supported() {
  command -v node >/dev/null 2>&1 || return 1
  local major
  major="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
  [[ "$major" =~ ^[0-9]+$ && "$major" -ge "$REQUIRED_NODE_MAJOR" ]]
}

pnpm_is_supported() {
  command -v pnpm >/dev/null 2>&1 || return 1
  local major
  major="$(pnpm --version | cut -d. -f1)"
  [[ "$major" =~ ^[0-9]+$ && "$major" -ge "$REQUIRED_PNPM_MAJOR" ]]
}

install_with_brew() {
  if ! command -v brew >/dev/null 2>&1; then
    fail "找不到 Homebrew。請先至 https://brew.sh 安裝後再重新執行本腳本。"
    return 1
  fi
  info "使用 Homebrew 安裝：$*"
  brew install "$@"
}

install_with_apt() {
  info "使用 apt 安裝：$*"
  sudo apt-get update
  sudo apt-get install -y "$@"
}

install_with_dnf() {
  info "使用 dnf 安裝：$*"
  sudo dnf install -y "$@"
}

install_with_pacman() {
  info "使用 pacman 安裝：$*"
  sudo pacman -S --needed --noconfirm "$@"
}

install_node_22_linux() {
  if command -v apt-get >/dev/null 2>&1; then
    info "設定 NodeSource Node.js 22 套件來源..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf module reset -y nodejs || true
    sudo dnf module enable -y nodejs:22
    sudo dnf install -y nodejs
  elif command -v pacman >/dev/null 2>&1; then
    install_with_pacman nodejs npm
  else
    fail "找不到支援的 Linux 套件管理器。請手動安裝 Node.js ${REQUIRED_NODE_MAJOR}+。"
    return 1
  fi
}

install_pnpm() {
  if command -v corepack >/dev/null 2>&1; then
    info "透過 Corepack 啟用 pnpm@${REQUIRED_PNPM_MAJOR}..."
    corepack enable
    corepack prepare "pnpm@${REQUIRED_PNPM_MAJOR}.12.0" --activate
  elif command -v npm >/dev/null 2>&1; then
    info "透過 npm 安裝 pnpm@${REQUIRED_PNPM_MAJOR}..."
    npm install -g "pnpm@${REQUIRED_PNPM_MAJOR}"
  else
    fail "未找到 corepack 或 npm，無法安裝 pnpm。"
    return 1
  fi
}

install_ffmpeg() {
  case "$PLATFORM" in
    macos) install_with_brew ffmpeg ;;
    linux)
      if command -v apt-get >/dev/null 2>&1; then install_with_apt ffmpeg
      elif command -v dnf >/dev/null 2>&1; then install_with_dnf ffmpeg
      elif command -v pacman >/dev/null 2>&1; then install_with_pacman ffmpeg
      else fail "請以你的 Linux 套件管理器手動安裝 ffmpeg。"; return 1
      fi ;;
    windows-bash)
      fail "請使用系統管理員 PowerShell 執行：winget install --id Gyan.FFmpeg -e"
      return 1 ;;
    *) fail "不支援的作業系統：$OS"; return 1 ;;
  esac
}

install_node() {
  case "$PLATFORM" in
    macos) install_with_brew node@22 ;;
    linux) install_node_22_linux ;;
    windows-bash)
      fail "請使用系統管理員 PowerShell 執行：winget install OpenJS.NodeJS.LTS"
      return 1 ;;
    *) fail "不支援的作業系統：$OS"; return 1 ;;
  esac
}

info "EchoAPP 開發工具檢查：平台=${PLATFORM}，模式=${MODE}"
MISSING=0

if require_command git "Git"; then :; else MISSING=1; fi

if node_is_supported; then
  ok "Node.js $(node --version)（符合 ${REQUIRED_NODE_MAJOR}+）"
else
  warn "需要 Node.js ${REQUIRED_NODE_MAJOR}+；目前為：$(node --version 2>/dev/null || printf '未安裝')"
  MISSING=1
  if confirm_install; then install_node; fi
fi

if pnpm_is_supported; then
  ok "pnpm $(pnpm --version)（符合 ${REQUIRED_PNPM_MAJOR}+）"
else
  warn "需要 pnpm ${REQUIRED_PNPM_MAJOR}+；目前為：$(pnpm --version 2>/dev/null || printf '未安裝')"
  MISSING=1
  if confirm_install; then install_pnpm; fi
fi

if command -v ffmpeg >/dev/null 2>&1; then
  ok "ffmpeg $(ffmpeg -version 2>/dev/null | head -n 1)"
else
  warn "ffmpeg 尚未安裝；非 WAV 參考音檔無法可靠轉換。"
  MISSING=1
  if confirm_install; then install_ffmpeg; fi
fi

if [[ "$MODE" == "install" ]]; then
  info "重新檢查安裝結果..."
  node_is_supported || { fail "Node.js 尚未符合需求。"; exit 1; }
  pnpm_is_supported || { fail "pnpm 尚未符合需求。"; exit 1; }
  command -v ffmpeg >/dev/null 2>&1 || { fail "ffmpeg 尚未安裝。"; exit 1; }
  ok "必要開發工具已就緒。"
elif [[ "$MISSING" -eq 0 ]]; then
  ok "所有必要開發工具已就緒。"
else
  warn "仍有工具缺少或版本不足。請執行：bash bootstrap/install-dev-tools.sh --install"
  exit 1
fi
