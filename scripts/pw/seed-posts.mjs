#!/usr/bin/env node
// Seed posts into a board via the UI (the no-API-key path).
// Usage: node scripts/pw/seed-posts.mjs <board.json> --board-url <url>
// Flow manifest: references/flow-seed-posts.md
import { readFile } from "node:fs/promises";
import { Board } from "../lib/models.mjs";
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
const file = process.argv[2];
const boardUrl = arg("board-url");

if (!file || !boardUrl) {
  fail("usage", "node scripts/pw/seed-posts.mjs <board.json> --board-url <url>");
  process.exit(1);
}

let board;
try {
  board = Board.parse(JSON.parse(await readFile(file, "utf8")));
} catch (err) {
  fail(String(err?.message ?? err), "board.json 不符合 Board schema（title + seedPosts[]）。");
  process.exit(1);
}

const { context, page } = await openSession(PLATFORM);
let added = 0;
const failures = [];
try {
  await page.goto(boardUrl, { waitUntil: "domcontentloaded" });
  if (/auth\/login/.test(page.url())) {
    fail("not-logged-in", "尚未登入 Padlet。請先執行 node scripts/pw/login.mjs。");
    await context.close();
    process.exit(1);
  }

  for (const post of board.seedPosts) {
    try {
      // Padlet: double-click empty area or the + button opens the composer.
      const plus = page
        .getByRole("button", { name: /add|新增|\+/i })
        .first();
      await plus.waitFor({ state: "visible", timeout: 10000 });
      await plus.click();

      const subjectInput = page
        .locator('[placeholder*="subject" i], [placeholder*="title" i], [data-testid*="subject"]')
        .first();
      if (post.subject) {
        await subjectInput.waitFor({ state: "visible", timeout: 8000 });
        await subjectInput.fill(post.subject);
      }
      const bodyInput = page
        .locator('[placeholder*="write" i], [contenteditable="true"][class*="body"], [data-testid*="body"]')
        .first();
      if (post.body) {
        await bodyInput.waitFor({ state: "visible", timeout: 8000 });
        await bodyInput.fill(post.body);
      }
      // Publish the post (composer confirm).
      const publish = page
        .getByRole("button", { name: /publish|post|發布|張貼/i })
        .first();
      await publish.waitFor({ state: "visible", timeout: 8000 });
      await publish.click();
      await page.waitForTimeout(800);
      added += 1;
    } catch (err) {
      failures.push({ subject: post.subject ?? "(無標題)", error: String(err?.message ?? err) });
      if (failures.length >= 2 && added === 0) {
        // composer selectors clearly wrong — stop instead of hammering the UI
        await handoff(PLATFORM, page, "composer-selector-failure", {
          added,
          failures,
          hint: "貼文編輯器選擇器不符（介面可能改版）。請人工貼入剩餘貼文，並回報以更新 flow manifest。附件與分欄請一併人工確認。",
        });
        await context.close();
        process.exit(1);
      }
    }
  }

  const notes = [
    "UI 種子路徑不支援自動指定欄位與附件；貼文集中貼在預設位置，請老師拖曳分欄。",
  ];
  if (board.seedPosts.some((p) => p.media)) {
    notes.push("含 media 的貼文：附件連結已寫入內文末，或請人工補上。");
  }
  const success = added > 0 || board.seedPosts.length === 0;
  if (success) {
    ok({ added, requested: board.seedPosts.length, failures, boardUrl: page.url(), notes });
  } else {
    fail("all-posts-failed", "所有貼文都未能貼入，請改用 API 路徑或人工貼入。", { failures });
  }
} catch (err) {
  await failWithDiagnostics(PLATFORM, page, String(err?.message ?? err), "貼文失敗。請確認 board URL 與登入狀態。", { added });
} finally {
  await context.close();
}
