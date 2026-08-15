# Voicebox Windows 生成失敗診斷

## 已確認環境

| 項目 | 結果 |
| --- | --- |
| 作業系統 | Windows 11 AMD64 |
| Voicebox 版本 | 0.5.0 |
| 執行檔 | `C:\Program Files\Voicebox\voicebox-server.exe` |
| 資料目錄 | `C:\Users\a1234\AppData\Roaming\sh.voicebox.app` |
| 聆聽埠 | `0.0.0.0:17493` |
| 推論後端 | PyTorch、僅 CPU |

## 根因

Voicebox 服務正常啟動且 API 可連線；失敗發生在服務端的模型推論，不是 Expo APP、Cloudflare Tunnel 或上傳音檔格式造成。

Qwen 建立語音提示時，堆疊追蹤落在 `transformers/masking_utils.py` 的 `torch.diff(position_ids, ...)`，並拋出：

```text
AssertionError: Unexpected result type: <class 'list'>,
is_tensor=True, out_names=('out',)
```

Whisper 轉錄也出現相同類型的 `float` 輸出錯誤；Chatterbox 則出現 `Cannot copy out of meta tensor`。因此目前 Voicebox 的封裝 PyTorch／Transformers 執行環境存在相容性問題，所有主要推論路徑皆不可用。

## 已驗證但無效的措施

- 透過 API 卸載並重載 Qwen 1.7B。
- 改為 Qwen 0.6B。
- 改用 Chatterbox Multilingual。

## 修復前提

需在實際執行 Voicebox 的 Windows 主機上修復或重建 Voicebox 的封裝環境；APP 後端無法透過公開 API 修補 `voicebox-server.exe` 內的 PyTorch／Transformers 相依套件。
