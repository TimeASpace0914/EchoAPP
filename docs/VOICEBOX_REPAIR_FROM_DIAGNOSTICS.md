# Voicebox Windows 診斷結果與下一步修復

## 診斷結論

已收到 Windows 主機的診斷檔。Qwen 1.7B **不是未下載**：`/models/status` 顯示模型 `downloaded: true`、`loaded: true`，本機快取約 **4.33 GB**；可用磁碟空間約 **710 GB**，記憶體為 **16 GB**。Voicebox 也正確聆聽 `0.0.0.0:17493`，所以 APP、Cloudflare Tunnel 與模型下載都不是本次阻塞點。

真正失敗點仍是 Voicebox v0.5.0 Windows 封裝執行環境在 Qwen 建立克隆提示時觸發的 PyTorch／Transformers 輸出格式錯誤：

```text
AssertionError: Unexpected result type: <class 'list'>,
is_tensor=True, out_names=('out',)
```

這與先前可成功生成相符：模型檔與資料未必有變，但桌面版內建的 PyTorch／Transformers runtime 或模型初始化狀態可能已與目前載入路徑不相容。診斷檔原先找不到 `server.log`，因此必須以即時 DEBUG 日誌補足完整版本與初始化上下文。

## 先做的安全步驟：即時 DEBUG 重現

1. 將 `scripts/start-voicebox-debug.ps1` 儲存到 Windows 主機，例如「下載」資料夾。
2. 關閉 Voicebox 桌面程式。
3. 在 PowerShell 執行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
& "$HOME\Downloads\start-voicebox-debug.ps1"
```

4. 保持 PowerShell 視窗開啟，回到 APP 僅嘗試**一次**生成。
5. 產生錯誤後，回到 PowerShell 按 `Ctrl+C`，將桌面新建的 `voicebox-debug-日期時間\voicebox-server-debug.log` 提供給我。

> 此腳本只停止並重新啟動本機 Voicebox service，會使用原來的資料目錄與 port 17493；它不會刪除 Qwen 模型、Profile、SQLite 資料庫或 Cloudflare Tunnel 設定。Tunnel 若指向 `localhost:17493`，服務重啟後會自動重新連上同一個本機服務。

## 取得 DEBUG 日誌後的修復原則

確認實際 PyTorch、Transformers 與 Qwen TTS 版本後，才會進行精確修復。若封裝 runtime 的確損壞，修復會先備份 `%APPDATA%\sh.voicebox.app`，再用官方原始碼建立可維護的本機 Python runtime，重用現有 Hugging Face 快取與原資料目錄。Voicebox 官方的開發設定支援 Windows，並以 `just setup` 或 Python virtual environment 建立依賴；這是在不改雲端架構下取代有問題封裝 runtime 的可維護方案。[1]

## 參考資料

[1]: https://docs.voicebox.sh/developer/setup "Voicebox — Development Setup"
