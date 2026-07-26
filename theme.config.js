/** @type {const} */
const themeColors = {
  // 純黑 — 強調色（按鈕、圖示、選中狀態）
  primary: { light: '#000000', dark: '#FFFFFF' },
  // 淺灰 — 主背景
  background: { light: '#F2F2F5', dark: '#0A0A0A' },
  // 純白 — 卡片底色
  surface: { light: '#FFFFFF', dark: '#1A1A1A' },
  // 純黑 — 主文字
  foreground: { light: '#000000', dark: '#F2F2F5' },
  // 中灰 — 次要文字
  muted: { light: '#999999', dark: '#666666' },
  // 淺灰邊框
  border: { light: '#E5E5E5', dark: '#2A2A2A' },
  // 成功
  success: { light: '#000000', dark: '#FFFFFF' },
  // 警告
  warning: { light: '#666666', dark: '#999999' },
  // 錯誤
  error: { light: '#333333', dark: '#CCCCCC' },
};

module.exports = { themeColors };
