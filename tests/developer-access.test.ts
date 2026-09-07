import { describe, expect, it } from "vitest";

import { verifyDeveloperPassword } from "../lib/developer-access";

describe("開發者選項密碼驗證", () => {
  it("僅接受管理者指定的完整密碼", () => {
    expect(verifyDeveloperPassword("TimeASpace0914")).toBe(true);
  });

  it("拒絕大小寫不同、前後空白與空白密碼", () => {
    expect(verifyDeveloperPassword("timeaspace0914")).toBe(false);
    expect(verifyDeveloperPassword(" TimeASpace0914 ")).toBe(false);
    expect(verifyDeveloperPassword("")).toBe(false);
  });
});
