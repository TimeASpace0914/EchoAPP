#!/usr/bin/env bash
# 透過 Voicebox 本機 API 預下載 EchoAPP 所需的 ASR 與 TTS 模型。
# Voicebox 必須已啟動於 VOICEBOX_URL（預設 http://127.0.0.1:17493）。

set -Eeuo pipefail

VOICEBOX_URL="${VOICEBOX_URL:-http://127.0.0.1:17493}"
PROFILE="balanced"
WAIT=false

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
  bash bootstrap/voicebox-models.sh [--profile balanced|accuracy|low-memory] [--wait]

預設 profile：balanced
  balanced   Whisper Turbo + Qwen TTS 1.7B（推薦，多數中文測試機）
  accuracy   Whisper Large + Qwen TTS 1.7B（音檔雜訊較多、硬體資源充足）
  low-memory Whisper Small + Qwen TTS 0.6B（RAM / VRAM 較低時）

選項：
  --wait          輪詢模型狀態直到下載完成或逾時。
  --voicebox-url  覆寫 Voicebox 位址，例如 http://127.0.0.1:17493。
  --help          顯示此說明。

環境變數：
  VOICEBOX_URL    Voicebox API 位址，預設 http://127.0.0.1:17493。
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      PROFILE="${2:-}"
      shift 2 ;;
    --wait) WAIT=true; shift ;;
    --voicebox-url)
      VOICEBOX_URL="${2:-}"
      shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) fail "未知選項：$1"; usage; exit 2 ;;
  esac
done

VOICEBOX_URL="${VOICEBOX_URL%/}"
command -v curl >/dev/null 2>&1 || { fail "找不到 curl。請先安裝 curl。"; exit 1; }

case "$PROFILE" in
  balanced)
    ASR_MODEL="whisper-turbo"
    TTS_MODEL="qwen-tts-1.7B"
    ;;
  accuracy)
    ASR_MODEL="whisper-large"
    TTS_MODEL="qwen-tts-1.7B"
    ;;
  low-memory)
    ASR_MODEL="whisper-small"
    TTS_MODEL="qwen-tts-0.6B"
    ;;
  *)
    fail "不支援的 profile：$PROFILE"
    usage
    exit 2
    ;;
esac

if ! curl --fail --silent --show-error --max-time 10 "${VOICEBOX_URL}/models/status" >/dev/null; then
  fail "無法連線至 Voicebox：${VOICEBOX_URL}"
  printf '%s\n' "請先開啟 Voicebox 應用程式，並確認 http://127.0.0.1:17493/docs 可開啟。" >&2
  exit 1
fi

request_download() {
  local model_name="$1"
  info "要求 Voicebox 預下載 ${model_name}..."
  curl --fail --silent --show-error \
    -X POST "${VOICEBOX_URL}/models/download" \
    -H "Content-Type: application/json" \
    --data "{\"model_name\":\"${model_name}\"}" \
    | sed 's/^/[Voicebox] /'
  printf '\n'
}

show_status() {
  info "目前模型狀態："
  local status
  status="$(curl --fail --silent --show-error "${VOICEBOX_URL}/models/status")"
  if command -v jq >/dev/null 2>&1; then
    printf '%s\n' "$status" | jq --arg asr "$ASR_MODEL" --arg tts "$TTS_MODEL" \
      '.models[] | select(.model_name == $asr or .model_name == $tts) | {model_name, downloaded, downloading, loaded, size_mb}'
  else
    printf '%s\n' "$status"
    warn "若安裝 jq，可看到較易讀的模型狀態。"
  fi
}

request_download "$ASR_MODEL"
request_download "$TTS_MODEL"
show_status

if [[ "$WAIT" != true ]]; then
  ok "下載工作已送交 Voicebox。可執行同一指令加上 --wait，或在 Voicebox 介面查看進度。"
  exit 0
fi

info "等待模型下載完成（最多 30 分鐘）..."
for _ in $(seq 1 180); do
  status="$(curl --fail --silent --show-error "${VOICEBOX_URL}/models/status")"
  if command -v jq >/dev/null 2>&1; then
    asr_ready="$(printf '%s' "$status" | jq -r --arg name "$ASR_MODEL" '.models[] | select(.model_name == $name) | .downloaded')"
    tts_ready="$(printf '%s' "$status" | jq -r --arg name "$TTS_MODEL" '.models[] | select(.model_name == $name) | .downloaded')"
    if [[ "$asr_ready" == "true" && "$tts_ready" == "true" ]]; then
      ok "模型下載完成：${ASR_MODEL}、${TTS_MODEL}"
      exit 0
    fi
  else
    if ! grep -q '"downloading":true' <<<"$status"; then
      warn "無 jq 無法精準確認個別模型；請查看上方 Voicebox 狀態或在應用程式中確認。"
      exit 0
    fi
  fi
  sleep 10
done

warn "等待下載逾時；下載可能仍在 Voicebox 背景繼續。請開啟 Voicebox 確認網路與可用磁碟空間。"
exit 1
