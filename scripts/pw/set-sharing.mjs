#!/usr/bin/env node
// Set visitor permission and capture the share link.
// Live-verified 2026-07-22 (zh-TW account): the top-right "分享"/Share button
// only shows a link-copy/QR-code menu — the actual permission control lives
// behind the SETTINGS (gear) icon, which opens a "分享此看板"/"Share this
// board" panel with a "擁有連結的訪客"/"People with the link" dropdown.
// That dropdown has FIVE options (not three as originally assumed):
//   無存取權限 (No access) / 讀者 (Reader) / 留言者 (Commenter) /
//   作者 (Author, default) / 審核者 (Approver)
// "留言者" is what a teacher means by "visitors can comment but not post".
// Not possible via the official API. Agent confirms the permission with the
// teacher in chat before running (external write).
// Usage: node scripts/pw/set-sharing.mjs --board-url <url> --visitor no_access|reader|commenter|author|approver
// Flow manifest: references/flow-create-board.md
import {
  openSession,
  ok,
  fail,
  failWithDiagnostics,
  handoff,
} from "../lib/session.mjs";

const PLATFORM = "padlet";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const boardUrl = arg("board-url");
const visitor = arg("visitor");
const LABEL = {
  no_access: /^無存取權限$|^no access$/i,
  reader: /^讀者$|^reader$/i,
  commenter: /^留言者$|^commenter$/i,
  author: /^作者$|^author$/i,
  approver: /^審核者$|^approver$/i,
};
if (!boardUrl || !LABEL[visitor]) {
  fail("usage", `node scripts/pw/set-sharing.mjs --board-url <url> --visitor ${Object.keys(LABEL).join("|")}`);
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

  // The permission control is behind the gear/settings icon, not the "分享"
  // button (that one only has copy-link/QR code).
  await page.getByRole("button", { name: /settings|設定/i }).first().click({ timeout: 10000 }).catch(async () => {
    // fall back to a generic gear-icon locator if no accessible name is set
    await page.locator('[class*="settings" i], [aria-label*="settings" i]').first().click({ timeout: 8000 });
  });

  await page.getByText(/^分享此看板$|^share this board$/i).waitFor({ state: "visible", timeout: 10000 });

  const permissionDropdown = page.getByText(/^擁有連結的訪客$|^people with the link$/i).locator("xpath=following-sibling::*[1]");
  await permissionDropdown.click({ timeout: 8000 });
  await page.getByText(LABEL[visitor]).click({ timeout: 8000 });

  // Capture the share link from the "複製連結"/copy-link row.
  let shareUrl;
  try {
    const linkInput = page.locator('input[value*="padlet.com"]').first();
    await linkInput.waitFor({ state: "visible", timeout: 5000 });
    shareUrl = await linkInput.inputValue();
  } catch {
    shareUrl = boardUrl;
  }
  ok({ visitor, shareUrl, boardUrl });
} catch (err) {
  const msg = String(err?.message ?? err);
  if (msg.startsWith("selector-failure")) {
    await handoff(PLATFORM, page, msg, {
      hint: "分享設定選擇器不符（介面可能改版）。請老師點齒輪設定 → 分享此看板 → 擁有連結的訪客 手動設定。",
    });
  } else {
    await failWithDiagnostics(PLATFORM, page, msg, "設定分享權限失敗。請確認登入與 board URL 後重試一次。");
  }
} finally {
  await context.close();
}
