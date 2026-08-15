# 迴響 APP：換設備完整搬遷、重建與切換指南

> **目標：** 把「迴響」從舊設備完整搬到新設備，並在不中斷現有語音服務的前提下，逐步完成 APP 專案、Voicebox、Cloudflare Named Tunnel、可選資料庫與資料備份的驗證及切換。

本指南適用於目前的架構：React Native／Expo APP 透過 Express 後端 API 呼叫 Voicebox，而 Voicebox 對外使用 `https://voicebox.echo-voice.cc`。請先在**新設備完成全部驗證**，再停止或清除舊設備；不要一開始就關閉舊設備。

---

## 1. 先理解要搬遷的範圍

GitHub 只保存版本控制中的程式碼，**不會自動保存** `.env`、Cloudflare Tunnel 憑證／Token、Voicebox 模型與 Profile 資料、資料庫內容、使用者裝置中的回憶庫或下載音檔。因此，完整搬遷至少要分成「程式碼」、「服務」、「機密設定」與「資料」四個工作面向。

| 搬遷項目 | 目前位置 | 是否已在 GitHub | 是否必須搬遷 | 建議方式 |
|---|---|---:|---:|---|
| APP 前端、Express 後端、測試、圖示 | `EchoAPP` 儲存庫 | 是 | 是 | 在新設備 `git clone` |
| npm 套件 | `node_modules/` | 否 | 不需複製 | 在新設備 `pnpm install` |
| Voicebox 服務程式、模型、Profile／樣本資料 | 舊設備的 Voicebox 安裝目錄、Docker volume 或資料目錄 | 否 | 是 | 依實際部署方式完整備份後還原 |
| Cloudflare Named Tunnel | Cloudflare Dashboard + 舊設備 connector 設定 | 否 | 是 | 在既有 Tunnel 新增新設備 connector；不要重建 hostname |
| `.env` | 舊設備專案根目錄 | 否 | 是 | 透過加密 USB、密碼管理工具或安全通道手動轉移 |
| PostgreSQL 資料 | 資料庫伺服器 | 否 | 視是否已啟用 | `pg_dump`／`pg_restore` |
| 回憶庫／手機下載音檔 | 使用者手機或瀏覽器的本機儲存 | 否 | 視資料保留需求 | 先保留舊裝置；目前沒有跨裝置自動搬遷機制 |

> **重要：** 不要把 `.env`、Cloudflare Tunnel Token、`cert.pem`、Tunnel 的 JSON 憑證、資料庫密碼或含個資的音檔推送到 GitHub。

---

## 2. 建議的搬遷順序

整個搬遷應分為五個階段：先盤點與備份、在新設備安裝基礎環境、還原 Voicebox、接管 Tunnel、最後才切換與驗收。舊設備在新系統通過完整測試前應保持在線。

```text
舊設備仍正常運作
        │
        ├─ 1. 備份程式碼外的設定與資料
        ├─ 2. 新設備建立 APP 開發環境
        ├─ 3. 新設備還原並測試 Voicebox
        ├─ 4. 為既有 Cloudflare Tunnel 加入新 connector
        ├─ 5. 驗證網址、後端 API 與實際生成
        └─ 6. 停止舊設備服務，保留備份後再除役
```

---

## 3. 階段一：在舊設備盤點與備份

### 3.1 記錄專案版本與服務狀態

在舊設備的 APP 專案根目錄執行下列命令，將輸出存放在**不公開的加密位置**。這可讓您在新設備上確認程式版本、Node.js 版本與目前的環境設定。

```bash
cd /path/to/EchoAPP

git rev-parse HEAD
node --version
pnpm --version

# 僅確認有哪些環境變數名稱；不要把內容貼到公開聊天室或 GitHub
grep -vE '^\s*(#|$)' .env 2>/dev/null || true
```

應特別保留 `VOICEBOX_URL` 的值。若仍使用既有固定網址，應為：

```env
VOICEBOX_URL=https://voicebox.echo-voice.cc
```

### 3.2 安全備份 `.env`

請將 `.env` 手動複製到加密 USB、企業密碼管理工具的安全附件，或其他具存取控管的儲存位置。不要使用 Email 明文寄送，也不要將它加入 Git。

```bash
# 範例：建立受限備份目錄（macOS / Linux）
mkdir -p "$HOME/echo-migration-secure"
cp .env "$HOME/echo-migration-secure/echo-app.env.backup"
chmod 600 "$HOME/echo-migration-secure/echo-app.env.backup"
```

### 3.3 找出 Voicebox 的部署形式

Voicebox 的模型、聲音 Profile 與上傳樣本不是 APP GitHub 儲存庫的一部分。先在舊設備判斷 Voicebox 是如何運行，然後使用對應的備份方法。

```bash
# 檢查是否以 Docker / Docker Compose 運行
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' 2>/dev/null || true
docker compose ls 2>/dev/null || true

# 檢查是否以 systemd 服務運行（Linux）
systemctl list-units --type=service --all | grep -i voicebox || true

# 檢查一般程序與可能的啟動命令
ps aux | grep -i '[v]oicebox' || true
```

| Voicebox 部署形式 | 必備備份內容 | 建議做法 |
|---|---|---|
| Docker Compose | `compose.yml`、`.env`、bind mount 資料夾、named volumes | 先用 `docker compose config` 確認掛載位置，再備份資料夾／volume |
| Docker 容器 | Image tag、容器環境變數、named volumes | 記錄 `docker inspect`，備份所有 Voicebox 相關 volume |
| Python / Node 本機安裝 | 專案目錄、虛擬環境需求檔、模型目錄、資料目錄 | 保留程式原始碼、鎖定檔、模型與 Profile 資料夾 |
| systemd / 手動程序 | 服務單元檔、啟動命令、資料目錄、模型目錄 | 備份 service 檔與其引用的所有目錄 |

如果 Voicebox 使用 Docker named volume，可使用以下模式建立備份；請把 `<VOICEBOX_VOLUME>` 替換成實際 volume 名稱。

```bash
mkdir -p "$HOME/echo-migration-secure/voicebox-backup"

docker run --rm \
  -v <VOICEBOX_VOLUME>:/data:ro \
  -v "$HOME/echo-migration-secure/voicebox-backup":/backup \
  alpine sh -c 'tar czf /backup/voicebox-volume.tar.gz -C /data .'
```

> Voicebox 的資料目錄名稱依實際安裝來源而不同；切勿只備份程式碼而漏掉模型、Profile、樣本、快取或資料庫。若不確定，建議先在舊設備製作整個 Voicebox 專案目錄的離線備份。

### 3.4 備份資料庫（僅已設定 `DATABASE_URL` 時）

若 `.env` 有 `DATABASE_URL` 且您使用 PostgreSQL 儲存使用者或其他後端資料，請先匯出資料庫。若沒有設定此變數，可以略過本節。

```bash
export DATABASE_URL='postgresql://<user>:<password>@<host>:5432/<database>'
pg_dump "$DATABASE_URL" --format=custom --file="$HOME/echo-migration-secure/echo-postgres.dump"
```

請確認備份檔不為空，並妥善保存。此檔案可能含個資，不可推送至 GitHub。

### 3.5 處理使用者本機資料與音檔

目前回憶庫主要使用 APP／瀏覽器端的 AsyncStorage。這代表：

| 資料 | 是否隨伺服器搬遷 | 正確處理方式 |
|---|---:|---|
| 使用者手機上的回憶庫 | 否 | 使用者不換手機則不受影響；若換手機，需另行開發「匯出／匯入回憶庫」功能 |
| 使用者已下載的音檔 | 否 | 使用者自行備份至檔案、雲端硬碟或電腦 |
| 後端 PostgreSQL 資料 | 視是否啟用 | 用 `pg_dump`／`pg_restore` 搬遷 |
| Voicebox Profile／樣本 | 否 | 必須從 Voicebox 的實際資料目錄或 Docker volume 備份 |

---

## 4. 階段二：在新設備建立基礎環境

### 4.1 安裝系統工具

新設備需具備 Node.js 22+、pnpm 9+、Git、ffmpeg，以及執行 Voicebox 所需的工具。若 Voicebox 以 Docker 運行，亦需要 Docker Desktop（macOS／Windows）或 Docker Engine（Linux）。

| 工具 | 必要性 | 用途 |
|---|---:|---|
| Node.js 22+ | 必要 | APP 前端與 Express 後端 |
| pnpm 9+ | 必要 | 依賴安裝與開發指令 |
| Git | 必要 | 下載與同步專案 |
| ffmpeg | 建議 | 後端標準化參考音檔格式 |
| Docker | 依 Voicebox 部署而定 | 還原容器化 Voicebox |
| cloudflared | 必要（保留公開網址時） | Cloudflare Named Tunnel connector |
| PostgreSQL | 依資料庫而定 | 還原伺服器端資料 |

### 4.2 下載專案並執行初始化

```bash
git clone https://github.com/TimeASpace0914/EchoAPP.git
cd EchoAPP

# 確保腳本有執行權限（macOS / Linux）
chmod +x setup.sh

# 自動檢查環境、安裝依賴、建立 .env 範本、執行檢查並啟動
./setup.sh
```

若您已完成依賴安裝，只想啟動開發服務：

```bash
./setup.sh --dev
```

若只想驗證型別與測試：

```bash
./setup.sh --check
```

> Windows 使用者可透過 WSL2 執行本指南中的 Bash 指令；或依相同順序，以 PowerShell 安裝 Node.js、pnpm、Git、ffmpeg 與 Docker Desktop。`setup.sh` 需使用 Git Bash 或 WSL2 執行。

### 4.3 還原 `.env`

把階段一安全保存的 `.env` 複製到新設備專案根目錄；不要使用 GitHub 的版本。若您沒有舊 `.env`，至少建立以下核心設定：

```env
# 若新設備會透過既有 Cloudflare 網址存取 Voicebox
VOICEBOX_URL=https://voicebox.echo-voice.cc

# 本機 APP 後端預設使用 3000
PORT=3000
```

如果 APP 後端與 Voicebox 都在同一台新設備，也可以先改用本機連線，完成測試後再切回固定網址：

```env
VOICEBOX_URL=http://127.0.0.1:17493
```

---

## 5. 階段三：在新設備還原 Voicebox

### 5.1 先還原服務與資料，再啟動

Voicebox 的具體安裝步驟取決於舊設備採用的方式；請使用階段一蒐集的部署資料。原則是：**先安裝相同版本的 Voicebox，再還原模型／資料，再啟動服務。**

#### Docker Compose 範例

```bash
# 在新設備的 Voicebox 專案目錄中
docker compose pull

# 先還原 bind mount 資料夾與 .env（不要放到 Git）
# 再啟動服務
docker compose up -d
docker compose ps
```

若需要還原 named volume，請先停止容器，建立相同名稱 volume，然後將備份解壓至 volume。以下為範例，需替換實際 volume 名稱與備份檔路徑：

```bash
docker volume create <VOICEBOX_VOLUME>

docker run --rm \
  -v <VOICEBOX_VOLUME>:/data \
  -v "$HOME/echo-migration-secure/voicebox-backup":/backup:ro \
  alpine sh -c 'tar xzf /backup/voicebox-volume.tar.gz -C /data'
```

### 5.2 驗證本機 Voicebox

Voicebox 必須先在新設備的 `17493` port 可用，才能接續建立 Tunnel。請用健康檢查確認：

```bash
curl -fsS http://127.0.0.1:17493/health
```

若指令失敗，請先排查 Voicebox 本身，不要急著切換 Cloudflare：

```bash
# Docker Compose
docker compose logs --tail=200

# systemd（Linux）
sudo systemctl status <voicebox-service-name>
journalctl -u <voicebox-service-name> -n 200 --no-pager
```

---

## 6. 階段四：把既有 Cloudflare Named Tunnel 接到新設備

### 6.1 不要重建 DNS hostname

既有網址是 `https://voicebox.echo-voice.cc`。只要此 hostname 已綁定既有 Tunnel，通常應在 **Cloudflare Zero Trust Dashboard → Networking → Tunnels → `voicebox`** 中，為該既有 Tunnel 新增新設備 connector；不要先刪除原 Tunnel，也不要建立同名 Tunnel 覆蓋舊設定。

Cloudflare 的 remotely-managed Tunnel 可在 Dashboard 選取作業系統並取得 connector 安裝命令；公開 hostname 的路由則在 Tunnel 的 Routes／Published application 中設定。[1] 以 Token 啟動時，`cloudflared tunnel run --token <TOKEN>` 會將新 connector 關聯到特定 Tunnel。[2]

### 6.2 建議方式：在 Dashboard 取得新設備安裝命令

1. 登入 Cloudflare Zero Trust Dashboard。
2. 開啟 **Networking → Tunnels**。
3. 選取既有的 **`voicebox`** Tunnel；確認對應路由仍為 `voicebox.echo-voice.cc`。
4. 選擇 **Add a replica** 或該頁面提供的安裝選項，選取新設備的作業系統。
5. **只從 Dashboard 複製安裝命令**到新設備執行；該命令包含 connector Token，不能貼到 GitHub、截圖公開或寫入 README。
6. 在 Dashboard 確認新 connector 顯示為 **Healthy**。

在新 connector 正常前，保留舊設備 connector 運作。Cloudflare 官方文件建議以新 replica 先啟動並確認可用，再停止舊 instance，可降低服務中斷風險。[3]

### 6.3 本機管理 Tunnel 的替代方案

若舊設備使用的是本機管理模式，而非 Dashboard Token 模式，才需要安全轉移：

- `$HOME/.cloudflared/config.yml`
- `$HOME/.cloudflared/<TUNNEL_UUID>.json`
- 可能需要的 `$HOME/.cloudflared/cert.pem`

新設備的 `config.yml` 應使用 `$HOME` 對應路徑，不應把舊設備的 `/home/ubuntu/...` 寫死。公開服務的設定需包含 hostname、指向本機 Voicebox 的服務位址，以及最後的 catch-all 規則；Cloudflare 文件要求 ingress 規則以 catch-all 結尾。[3]

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /Users/<YOUR_USER>/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: voicebox.echo-voice.cc
    service: http://127.0.0.1:17493
  - service: http_status:404
```

變更前先驗證設定：

```bash
cloudflared tunnel ingress validate
cloudflared tunnel ingress rule https://voicebox.echo-voice.cc
```

### 6.4 驗證公開網址

新 connector 已 Healthy 後，在**不在新設備本機服務的外部網路**測試：

```bash
curl -fsS https://voicebox.echo-voice.cc/health
```

公開網址回應正常，代表 DNS、Tunnel、connector 與新設備 Voicebox 已串接完成。

---

## 7. 階段五：還原資料庫（可選）

如果舊設備確實有 PostgreSQL 資料庫，請先建立空白資料庫，再還原 dump。

```bash
# 範例：新設備 PostgreSQL 已啟動後
createdb echo_voice

export DATABASE_URL='postgresql://<user>:<password>@localhost:5432/echo_voice'
pg_restore --dbname="$DATABASE_URL" --clean --if-exists "$HOME/echo-migration-secure/echo-postgres.dump"

# 套用程式結構遷移（若需要）
pnpm db:push
```

> `pg_restore --clean` 會刪除同名既有物件。請只對新建或可清除的目標資料庫執行，並先確認備份可還原。

---

## 8. 完整驗收清單

請依序完成以下驗證，全部通過後才視為搬遷完成。

| 驗證項目 | 指令或操作 | 預期結果 |
|---|---|---|
| GitHub 程式碼 | `git log -1` | 顯示預期最新 commit |
| 前端／後端依賴 | `pnpm install` | 無依賴安裝錯誤 |
| 型別檢查 | `pnpm check` | 0 errors |
| 單元測試 | `pnpm test` | 測試通過 |
| Voicebox 本機健康檢查 | `curl -fsS http://127.0.0.1:17493/health` | 可取得健康回應 |
| Tunnel 公開健康檢查 | `curl -fsS https://voicebox.echo-voice.cc/health` | 可取得健康回應 |
| APP 後端健康檢查 | `curl -fsS http://127.0.0.1:3000/api/voicebox/health` | 回傳 Voicebox online 狀態 |
| APP 畫面 | `pnpm dev` | 可開啟 Expo Web／Expo Go |
| 實際生成 | 使用非敏感測試音檔生成短句 | 成功播放、下載與寫入回憶庫 |
| 資料庫（如使用） | 查詢必要表與帳號／資料 | 資料存在且應用可存取 |

### 建議的首次生成測試

首次測試請使用已取得授權的短測試音檔與不含個資的文字，例如「這是迴響系統搬遷後的測試語音」。確認成功後，再處理正式個案資料。

---

## 9. 切換舊設備與除役

完成驗收後，建議保留舊設備至少一個工作日或直到您確認所有重要功能正常，再開始切換。

1. 確認新設備的 Voicebox、Tunnel、APP 後端與實際生成皆已通過。
2. 在 Cloudflare Dashboard 確認新 connector 穩定為 **Healthy**。
3. 停止舊設備的 `cloudflared` connector；不要先刪除 Tunnel。
4. 重新從外部網路測試 `https://voicebox.echo-voice.cc/health`。
5. 再測試一次 APP 生成流程。
6. 確認所有備份已在安全位置可讀取後，才停用舊設備 Voicebox 與資料庫。
7. 舊設備除役前，安全清除 `.env`、Tunnel 憑證、資料庫 dump、使用者音檔與 Voicebox Profile 的複本。

---

## 10. 常見問題排除

| 現象 | 優先檢查 | 處理方式 |
|---|---|---|
| APP 顯示 Voicebox 離線 | `.env` 的 `VOICEBOX_URL`、後端是否啟動 | 先用本機與公開 `/health` 逐段測試 |
| 公開網址連不到 | Tunnel connector、Cloudflare route、舊設備是否仍佔用 | Dashboard 確認新 connector Healthy；保留舊 connector 到新端驗證完成 |
| Tunnel Healthy 但生成失敗 | Voicebox 模型／Profile／資料目錄未完整還原 | 查看 Voicebox 日誌，確認模型與資料 volume 已恢復 |
| 新設備無法生成但舊設備可以 | `.env` 未複製、`VOICEBOX_URL` 指錯、port 17493 未啟動 | 用 `curl` 依「本機 → Tunnel → APP 後端」逐段定位 |
| `pnpm install` 失敗 | Node／pnpm 版本或網路 | 確認 Node 22+、pnpm 9+，刪除部分安裝後重試 |
| 回憶庫是空的 | 之前資料只存在手機／瀏覽器 AsyncStorage | 這是目前設計限制；需另做匯出／匯入或切換到 PostgreSQL 同步 |
| Cloudflare 設定檔找不到 | 新設備尚未安裝 connector 或不採本機管理模式 | 優先從 Dashboard 為既有 Tunnel 取得新 connector 安裝命令 |

---

## 11. 最終交接清單

在停止舊設備前，請逐項勾選：

- [ ] GitHub `EchoAPP` 已可在新設備 clone 並安裝依賴。
- [ ] 新設備的 `.env` 已安全建立，且 `VOICEBOX_URL` 正確。
- [ ] Voicebox 程式、模型、Profile／樣本與必要資料已完整搬遷。
- [ ] 新設備 `http://127.0.0.1:17493/health` 正常。
- [ ] `voicebox.echo-voice.cc` 已由新設備 connector 正常服務。
- [ ] `http://127.0.0.1:3000/api/voicebox/health` 正常。
- [ ] 已以測試音檔完成一次端到端生成。
- [ ] PostgreSQL（若使用）已備份、還原與驗證。
- [ ] 使用者端下載音檔與需要保留的回憶庫資料已有獨立備份方案。
- [ ] 舊設備尚未清除，且保留至新系統穩定後才除役。

---

## 參考資料

[1]: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/ "Cloudflare：Create a tunnel (dashboard)"
[2]: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/run-parameters/ "Cloudflare：Tunnel run parameters"
[3]: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/configuration-file/ "Cloudflare：Configuration file"
