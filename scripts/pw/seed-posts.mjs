#!/usr/bin/env node
// Seed posts into a board via the UI (the no-API-key path).
// Live-verified 2026-07-22 (zh-TW account):
//  - Per-section "add post" button accessible name is "在這個區段新增貼文"
//    ("add new post in this section") — clicking it opens a floating composer
//    scoped to that section (bottom-right), pre-selecting the section.
//  - Composer field placeholders are Chinese: subject = "主題", body =
//    "寫點美好的內容...". The confirm button reads "發布" (Publish) — note
//    this differs from the section's OWN trigger button, which is externally
//    labelled "張貼" (Post) at the bottom-right of the whole board.
//  - The composer footer shows a "§ <section name>" selector confirming which
//    section the post will land in — so posts DO land in the correct section
//    when triggered from that section's own add-post button.
// Usage: node scripts/pw/seed-posts.mjs <board.json> --board-url <url>
// Flow manifest: references/flow-create-board.md
import { readFile } from "node:fs/promises";
import { Board } from "../lib/models.mjs";
import {
  openSession,
  ok,
  fail,
  failWithDiagnostics,
  handoff,
  waitForCondition,
  assertPlatformAuthenticated,
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
  await assertPlatformAuthenticated(page, PLATFORM);

  for (const post of board.seedPosts) {
    try {
      // Scope the add-post trigger to the requested section when possible so
      // the post lands in the right column; fall back to the first trigger
      // found (board-wide "張貼" button) if the section can't be located.
      let trigger;
      if (post.section) {
        const sectionHeading = page.getByRole("heading", { name: post.section }).first();
        if ((await sectionHeading.count()) > 0) {
          const sectionBox = sectionHeading.locator("xpath=ancestor::*[self::div][1]");
          trigger = sectionBox.getByRole("button", { name: /新增貼文|add.*post/i }).first();
        }
      }
      if (!trigger || (await trigger.count()) === 0) {
        trigger = page.getByRole("button", { name: /新增貼文|add.*post|^張貼$|^post$/i }).first();
      }
      await trigger.waitFor({ state: "visible", timeout: 10000 });
      await trigger.click();

      const subjectInput = page.getByPlaceholder(/^主題$|^subject$/i).first();
      if (post.subject) {
        await subjectInput.waitFor({ state: "visible", timeout: 8000 });
        await subjectInput.fill(post.subject);
      }
      const bodyInput = page.getByPlaceholder(/寫點美好的內容|write something/i).first();
      if (post.body) {
        await bodyInput.waitFor({ state: "visible", timeout: 8000 });
        await bodyInput.fill(post.body);
      }

      const publish = page.getByRole("button", { name: /^發布$|^publish$/i }).first();
      await publish.waitFor({ state: "visible", timeout: 8000 });
      await publish.click();
      const evidenceText = post.subject || post.body;
      const published = await waitForCondition(
        page,
        async () => {
          if (!evidenceText) return true;
          const matchingText = page.getByText(evidenceText, { exact: true }).first();
          return (await matchingText.count()) > 0 && await matchingText.isVisible().catch(() => false);
        },
        { timeoutMs: 12000, intervalMs: 250 },
      );
      if (!published) {
        throw Object.assign(new Error("post-success-evidence-timeout"), { code: "post-success-evidence-timeout" });
      }
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

  const notes = [];
  if (board.seedPosts.some((p) => p.media)) {
    notes.push("此路徑不支援自動上傳附件；含 media 的貼文請人工補上圖片/連結。");
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
