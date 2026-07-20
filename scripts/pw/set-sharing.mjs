#!/usr/bin/env node
// Set visitor permission (reader/commenter/writer) and capture the share link.
// Not possible via the official API. Agent confirms the permission with the
// teacher in chat before running (external write).
// Usage: node scripts/pw/set-sharing.mjs --board-url <url> --visitor reader|commenter|writer
// Flow manifest: references/flow-set-sharing.md
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
const visitor = arg("visitor");
const LABEL = {
  reader: /reader|讀者|可讀/i,
  commenter: /commenter|可留言/i,
  writer: /writer|可撰寫|可新增/i,
};
if (!boardUrl || !LABEL[visitor]) {
  fail("usage", "node scripts/pw/set-sharing.mjs --board-url <url> --visitor reader|commenter|writer");
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
    [
      (p) => p.getByRole("button", { name: /^share|分享/i }),
      (p) => p.getByLabel(/share/i),
    ],
    "Share button",
    15000,
  );
  await clickFirst(
    page,
    [
      (p) => p.getByText(/visitors with a link|link privacy|訪客/i),
      (p) => p.getByText(/privacy|權限/i),
    ],
    "visitor permission entry",
    10000,
  );
  await clickFirst(page, [(p) => p.getByText(LABEL[visitor])], `visitor=${visitor}`, 10000);

  // Success evidence: copy-link control present; capture the canonical link.
  let shareUrl = page.url();
  try {
    const linkInput = page.locator('input[value*="padlet.com"]').first();
    await linkInput.waitFor({ state: "visible", timeout: 5000 });
    shareUrl = await linkInput.inputValue();
  } catch {
    // board URL itself is the share link
  }
  ok({ visitor, shareUrl, boardUrl });
} catch (err) {
  const msg = String(err?.message ?? err);
  if (msg.startsWith("selector-failure")) {
    await handoff(PLATFORM, page, msg, {
      hint: "分享選單選擇器不符（介面可能改版）。請老師在 Share → Visitors with a link 手動設定權限。",
    });
  } else {
    await failWithDiagnostics(PLATFORM, page, msg, "設定分享權限失敗。請確認登入與 board URL 後重試一次。");
  }
} finally {
  await context.close();
}
