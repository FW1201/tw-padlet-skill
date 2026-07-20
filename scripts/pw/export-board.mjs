#!/usr/bin/env node
// Export a board (PDF/CSV/Excel/image) — not possible via the official API.
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
  if (/auth\/login/.test(page.url())) {
    fail("not-logged-in", "尚未登入 Padlet。請先執行 node scripts/pw/login.mjs。");
    await context.close();
    process.exit(1);
  }

  await clickFirst(
    page,
    [(p) => p.getByRole("button", { name: /^share|分享/i })],
    "Share button",
    15000,
  );
  const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
  await clickFirst(
    page,
    [(p) => p.getByText(new RegExp(`export.*${LABEL[format].source}|save as.*${LABEL[format].source}`, "i")), (p) => p.getByText(LABEL[format])],
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
