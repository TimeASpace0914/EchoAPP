/**
 * 開發者選項為降低一般家屬誤操作的介面鎖。
 * 此密碼由專案管理者指定；它不是 Windows、Voicebox 或 Cloudflare 的系統層憑證。
 */
const DEVELOPER_ACCESS_PASSWORD = "TimeASpace0914";

export function verifyDeveloperPassword(input: string): boolean {
  return input === DEVELOPER_ACCESS_PASSWORD;
}
