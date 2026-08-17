# 迴響：Windows 新電腦搬遷與 Cloudflare Tunnel 接管

> **目標：** 把 Voicebox 繼續留在新 Windows 電腦本機執行，並讓既有網址 `https://voicebox.echo-voice.cc` 無縫指向新電腦的 `localhost:17493`。完成驗證前，請不要關閉舊電腦的 Voicebox 或 Tunnel。

本指南是既有完整搬遷文件 `docs/MIGRATION_GUIDE.md` 的 Windows 快速操作版。完整架構如下：

```text
客戶 APP → 迴響後端 API → https://voicebox.echo-voice.cc
                                      │
                              Cloudflare Named Tunnel
                                      │
                         新 Windows 電腦：127.0.0.1:17493
                                      │
                                  本機 Voicebox
```

## 1. 舊電腦：先做安全備份

GitHub 只保存 APP 程式碼，**不會保存** Voicebox 模型、聲音 Profile、上傳樣本、Cloudflare 憑證或 `.env`。請在舊 Windows 電腦建立一個加密 USB 或受保護硬碟的備份資料夾，再複製下列資料。

| 類別 | 舊電腦常見位置 | 必要性 | 原因 |
|---|---|---:|---|
| Voicebox 資料 | `C:\Users\a1234\AppData\Roaming\sh.voicebox.app` | **必要** | 包含 Voicebox 資料庫、Profile、樣本與設定 |
| 模型快取 | `C:\Users\a1234\.cache\huggingface\hub` | 建議 | 保留可避免重新下載 Qwen、Whisper Large 等大型模型 |
| Cloudflare 本機設定 | `C:\Users\a1234\.cloudflared` | 僅本機管理 Tunnel 時 | 包含 `config.yml` 與 Tunnel JSON 憑證；切勿公開 |
| APP 專案機密設定 | `EchoAPP\.env` | 必要 | 包含 `VOICEBOX_URL` 與可能的資料庫設定 |
| APP 程式碼 | GitHub `TimeASpace0914/EchoAPP` | 已保存 | 新電腦直接 clone，不需複製 `node_modules` |

在舊電腦的 PowerShell 中，可用以下指令建立時間戳備份位置。**請先確認目標磁碟是安全位置，且不要把備份推送到 GitHub。**

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = "E:\EchoVoice-Backup-$stamp"  # 請改成加密 USB 或受保護磁碟
New-Item -ItemType Directory -Path $backup -Force

Copy-Item "$env:APPDATA\sh.voicebox.app" "$backup\voicebox-appdata" -Recurse -Force
Copy-Item "$env:USERPROFILE\.cache\huggingface\hub" "$backup\huggingface-hub" -Recurse -Force
Copy-Item "$env:USERPROFILE\.cloudflared" "$backup\cloudflared" -Recurse -Force
```

如果某一個資料夾不存在，PowerShell 會報錯；這通常表示該元件尚未在本機使用，請略過該項目，不要自行建立空資料夾假裝完成備份。

> **安全提醒：** `.env`、`cert.pem`、`<Tunnel UUID>.json`、Tunnel Token、音檔樣本及 Voicebox 資料庫都可能含機密或個資。請不要上傳到 GitHub、公開雲端硬碟或聊天室。

## 2. 新電腦：先建立本機 Voicebox

請先在新 Windows 電腦安裝與舊電腦相同版本的 Voicebox，再停止新安裝預設服務，把備份資料還原到對應位置。

```powershell
# 建立資料目錄並還原（請將 E: 改為實際備份磁碟）
New-Item -ItemType Directory -Path "$env:APPDATA\sh.voicebox.app" -Force
Copy-Item "E:\EchoVoice-Backup-YYYYMMDD-HHMMSS\voicebox-appdata\*" `
  "$env:APPDATA\sh.voicebox.app" -Recurse -Force

# 選擇性還原模型快取；若省略，Voicebox 會在首次使用時重新下載模型
New-Item -ItemType Directory -Path "$env:USERPROFILE\.cache\huggingface\hub" -Force
Copy-Item "E:\EchoVoice-Backup-YYYYMMDD-HHMMSS\huggingface-hub\*" `
  "$env:USERPROFILE\.cache\huggingface\hub" -Recurse -Force
```

啟動 Voicebox 後，先在**新電腦本機**驗證它，不要急著啟動 Tunnel：

```powershell
Invoke-RestMethod http://127.0.0.1:17493/health
```

只有這個指令有正常 JSON 回應後，才進入下一步。若本機健康檢查失敗，先檢查 Voicebox 視窗／服務日誌；Cloudflare 不能修復本機模型或服務啟動問題。

## 3. 新電腦：下載並設定 Cloudflare Tunnel

### 建議方式：在既有 Tunnel 新增新 connector

這是最安全的做法，因為不需要把舊電腦的 Token 或憑證手動散佈到新設備。

1. 在新電腦下載 Windows 版 [`cloudflared`][1]，例如放到 `C:\Tools\cloudflared\cloudflared.exe`。
2. 登入 Cloudflare Zero Trust Dashboard，開啟 **Networking → Tunnels → voicebox**。
3. 確認 Public Hostname 仍是 `voicebox.echo-voice.cc`，服務目標是 `http://127.0.0.1:17493`。
4. 選擇 **Add a replica** 或 Windows connector 安裝選項。
5. 在**系統管理員 PowerShell**貼上 Dashboard 產生的安裝命令。這通常會以 Windows Service 形式安裝 connector。
6. 回到 Dashboard，確認新 connector 顯示 **Healthy**。

> 請不要把 Dashboard 顯示的 Token 貼到本對話、GitHub、文件或截圖中。它等同於讓持有者連接您的 Tunnel。

驗證 Windows 服務：

```powershell
Get-Service cloudflared
Get-Service cloudflared | Select-Object Status, Name, DisplayName
```

### 目前的手動啟動方式（暫時測試）

若您暫時沿用舊機的本機管理設定，須以安全方式搬移 `C:\Users\<使用者>\.cloudflared\config.yml` 與對應的 `<TUNNEL_UUID>.json`，然後在新電腦執行：

```powershell
cd C:\Tools\cloudflared
.\cloudflared.exe tunnel ingress validate
.\cloudflared.exe tunnel run voicebox
```

畫面出現 `Registered tunnel connection` 才代表 connector 已連上。請讓此 PowerShell 視窗保持開啟；如要長期穩定運作，應改用前述的 Windows Service 安裝方式。

## 4. 外部驗證與正式切換

新電腦本機健康檢查正常、Tunnel connector 顯示 Healthy 後，使用**新電腦以外**的網路或手機瀏覽器測試：

```powershell
Invoke-RestMethod https://voicebox.echo-voice.cc/health
```

| 驗證結果 | 代表意義 | 下一步 |
|---|---|---|
| 本機 `17493/health` 成功，公開網址成功 | 新設備已可提供服務 | 用 APP 建立一筆短測試生成 |
| 本機成功，公開網址失敗／1033 | Voicebox 正常，但 Tunnel connector 未連線 | 檢查 Dashboard connector、Windows Service 或 `cloudflared` 視窗 |
| 本機失敗 | Voicebox 未正常啟動 | 先修 Voicebox、模型或資料還原 |
| APP 可連線但生成失敗 | Tunnel 正常，問題在 Voicebox 模型或 Profile | 查看 Voicebox 日誌與模型狀態 |

請在正式切換前保留舊電腦的 Voicebox 與 cloudflared 運作。新設備以非敏感短音檔成功完成「上傳 → 生成 → 播放 → 下載 → 回憶庫」後，再停止舊電腦的 connector。網址不需要改動，因為兩台電腦接管的是同一個 `voicebox` Named Tunnel。

## 5. 新電腦還原 APP 專案

在新電腦安裝 Node.js 22+、pnpm、Git 與 ffmpeg 後：

```powershell
git clone https://github.com/TimeASpace0914/EchoAPP.git
cd EchoAPP
pnpm install
Copy-Item .env.example .env  # 若專案有範本；否則手動建立 .env
```

`.env` 的核心內容應為：

```env
VOICEBOX_URL=https://voicebox.echo-voice.cc
PORT=3000
```

接著執行：

```powershell
pnpm check
pnpm test
pnpm dev
```

若 APP 後端與 Voicebox 也都在新電腦，初次除錯可暫時設為 `VOICEBOX_URL=http://127.0.0.1:17493`；確認本機流程正確後，再改回固定的公開網址。

## 6. 切換完成前檢查清單

- [ ] 已在安全位置備份 Voicebox 資料、模型快取與 `.env`。
- [ ] 新電腦 Voicebox 的 `http://127.0.0.1:17493/health` 正常。
- [ ] 新電腦 Cloudflare connector 在 Dashboard 顯示 Healthy。
- [ ] 外部 `https://voicebox.echo-voice.cc/health` 正常。
- [ ] APP 已以測試音檔成功生成、播放、下載並寫入回憶庫。
- [ ] 舊電腦仍保留可回復狀態，尚未清除資料。
- [ ] 完成以上項目後，才停止舊電腦的 cloudflared 與 Voicebox。

## 參考資料

[1]: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/ "Cloudflare：cloudflared downloads"
