# Voicebox 中文文字轉音素流程研究

## 來源
- NVIDIA NeMo G2P 文件: https://docs.nvidia.com/nemo-framework/user-guide/latest/nemotoolkit/tts/g2p.html
- Voicebox 架構分析: https://www.itnotetk.com/2026/06/01/voicebox-local-ai-voice-studio/
- Qwen3-TTS 指南: https://medium.com/@zh.milo/qwen3-tts-the-complete-2026-guide-to-open-source-voice-cloning-and-ai-speech-generation-1a2efca05cd6

## Voicebox 中文文字處理流程

Voicebox 是一個本地 TTS 工作站，包裝了 7 種引擎（Qwen3-TTS, Chatterbox, Kokoro 等）。
對於中文文字，TTS 引擎使用 G2P（Grapheme-to-Phoneme）轉換流程：

1. **文字正規化（Text Normalization）**：將數字、符號等轉為標準文字
2. **中文分詞（Word Segmentation）**：將連續中文字切成詞
3. **G2P 轉換**：將中文字/詞轉為拼音（pinyin），再轉為音素（phonemes）
4. **音素送入聲學模型**：用音素 + 參考音檔的聲音特徵生成語音

## 問題根因

當 G2P 遇到不在字典中的字（如罕見人名用字「諺」），會根據形聲字規則猜測發音。
「承」和「懲」發音相近（chéng vs chéng），「諺」和「罰」在某些方言中可能混淆。
G2P 模型將「蔡承諺」錯誤映射為「蔡懲罰」的音素。

## 解決方案

### 方案：在 instruct 參數中加入注音/拼音提示

Voicebox 的 `instruct` 參數支援自然語言指令，可以用來引導發音。
在生成語音時，自動偵測文字中的中文人名，並在 instruct 中加入注音提示。

例如：
- 用戶輸入：「我是蔡承諺」
- 自動生成 instruct 補充：「『蔡承諺』讀作『ㄘㄞˋ ㄔㄥˊ ㄧㄢˋ』，不要讀成『蔡懲罰』」
- 最終 instruct = 用戶的個性設定 + 注音提示

### 實作方式

1. 建立一個中文注音對照表（常用易混淆字）
2. 在生成語音前，掃描文字中的中文字
3. 為每個字加上注音提示
4. 將注音提示附加到 instruct 參數中
