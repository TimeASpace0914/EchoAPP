#!/usr/bin/env sh

# Expo CLI 在非互動式開發環境偶爾會以 code 0 提早結束。
# 此包裝器保持 Metro 工作程序存活並自動重新啟動，避免 concurrently
# 將正常結束誤判為整個開發服務應停止的訊號。
set -eu

while true; do
  script -q -c "EXPO_USE_METRO_WORKSPACE_ROOT=1 CI=0 EXPO_NO_INTERACTIVE=0 npx expo start --port \${EXPO_PORT:-8081}" /dev/null || true
  echo "[metro-wrapper] Metro ended; restarting in 1 second..."
  sleep 1
done
