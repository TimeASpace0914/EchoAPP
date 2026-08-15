# Voicebox Windows 詳細診斷指南

本指南用於找出「前一次可正常生成、目前模型初始化或建立聲音提示失敗」的本機 Voicebox 根因。診斷腳本為**唯讀**：不會停止服務、不會刪除模型快取、不會改動 Profile、資料庫或 Cloudflare Tunnel。

## 目前已知現象

Voicebox 已下載 Qwen 1.7B 模型，並曾成功進入模型載入階段；但在 Qwen 建立 voice clone prompt 時，`transformers/masking_utils.py` 內呼叫 `torch.diff()` 觸發輸出格式錯誤。Whisper 與 Chatterbox 也分別出現推論及 meta tensor 載入失敗，故必須擷取套件與快取診斷資訊。

## 執行方式

1. 將 `scripts/collect-voicebox-diagnostics.ps1` 複製到執行 Voicebox 的 Windows 電腦，例如桌面。
2. 以一般 PowerShell 開啟該檔案所在資料夾。
3. 執行以下命令：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\collect-voicebox-diagnostics.ps1
```

4. 腳本會在桌面產生 `voicebox-diagnostics-日期時間` 資料夾及 ZIP 檔案。
5. 優先提供 `10-error-extract.txt` 與 `05-api-models-status.txt`；若不含不希望分享的本機路徑，也可提供 ZIP 檔案。

## 腳本會收集的資訊

| 檔案 | 用途 |
| --- | --- |
| `01-windows-system.txt` | Windows、記憶體、CPU 與顯示卡資訊 |
| `02-voicebox-processes.txt` | Voicebox／cloudflared 程序與 port 17493 狀態 |
| `03-voicebox-version.txt` | 執行檔版本與檔案資訊 |
| `04` 至 `06` API 檔案 | Health、模型狀態與生成設定 |
| `07-qwen-cache.txt` | Qwen 1.7B 快取檔案與總大小 |
| `09-recent-server-log.txt` | 近期完整後端日誌 |
| `10-error-extract.txt` | 只萃取模型載入、例外堆疊與錯誤周邊訊息 |

> 診斷檔會包含 Windows 使用者目錄、機器名稱及本機檔案路徑；分享前請先檢閱。腳本不讀取或輸出 Cloudflare Tunnel Token、API Key 或其他祕密值。
