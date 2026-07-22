#!/usr/bin/env node
// Export a board (PDF/CSV/Excel/image) — not possible via the official API.
// Live-verified 2026-07-22: the export entry is behind the SETTINGS (gear)
// icon -> "分享此看板"/"Share this board" panel, which has a "匯出 PDF"/
// "Export PDF" tab at the top alongside 複製連結/QR碼/分組討論室/嵌入.
// Only the PDF tab was confirmed to exist in that panel; CSV/Excel/image
// export entry points are UNVERIFIED (kept as fallback text-match candidates
// below — may live elsewhere, e.g. a board content/kebab menu).
// Usage: node scripts/pw/export-board.mjs --board-url <url> --format pdf|csv|xlsx|image [--out-dir DIR]
// Flow manifest: references/flow-export.md
import path from "node:path";
import os from "node:os";
import {
  openSession,
  ok,
  fail,
  failWithDiagnostics,
  handoff,
  clickFirst,
  assertPlatformAuthenticated,
} from "../lib/session.mjs";

const PLATFORM = "padlet";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const boardUrl = arg("board-url");
const format = arg("format");
const outDir = arg("out-dir") ?? path.join(os.homedir(), "Downloads");
const LABEL = {
  pdf: /pdf/i,
  csv: /csv/i,
  xlsx: /excel|xlsx/i,
  image: /image|圖片/i,
};
if (!boardUrl || !LABEL[format]) {
  fail("usage", "node scripts/pw/export-board.mjs --board-url <url> --format pdf|csv|xlsx|image [--out-dir DIR]");
  process.exit(1);
}

const { context, page } = await openSession(PLATFORM);
try {
  await page.goto(boardUrl, { waitUntil: "domcontentloaded" });
  await assertPlatformAuthenticated(page, PLATFORM);

  await page.getByRole("button", { name: /settings|設定/i }).first().click({ timeout: 10000 }).catch(async () => {
    await page.locator('[class*="settings" i], [aria-label*="settings" i]').first().click({ timeout: 8000 });
  });
  await page.getByText(/^分享此看板$|^share this board$/i).waitFor({ state: "visible", timeout: 10000 });

  const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
  await clickFirst(
    page,
    [
      (p) => p.getByText(new RegExp(`匯出.*${LABEL[format].source}|export.*${LABEL[format].source}`, "i")),
      (p) => p.getByText(LABEL[format]),
    ],
    `export ${format}`,
    15000,
  );
  const download = await downloadPromise;
  const target = path.join(outDir, download.suggestedFilename());
  await download.saveAs(target);
  ok({ exported: true, format, path: target });
} catch (err) {
  const msg = String(err?.message ?? err);
  if (msg.startsWith("selector-failure")) {
    await handoff(PLATFORM, page, msg, {
      hint: "匯出選單選擇器不符。請老師在 Share → Export 手動匯出。",
    });
  } else {
    await failWithDiagnostics(PLATFORM, page, msg, "匯出失敗。請確認登入與 board URL 後重試一次。");
  }
} finally {
  await context.close();
}
