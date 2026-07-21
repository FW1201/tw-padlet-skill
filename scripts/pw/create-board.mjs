#!/usr/bin/env node
// Create a blank board with chosen layout + sections via the Padlet UI
// (the official API has NO blank-board endpoint).
// Live-verified 2026-07-22 against a real logged-in session (UI was in
// Traditional Chinese). Key findings vs. the original port:
//  - Trigger link text is "製作" (not "Make a padlet") in a zh-TW account.
//  - Clicking the trigger goes STRAIGHT to the layout picker — there is no
//    separate "blank board" intermediate screen.
//  - The full official layout picker has 9 options: 電子牆/欄位/故事看板/
//    表格/自由格式/行系列/時間表/清單/地圖 — richer than the 5-value
//    Board.format schema (wall/grid/columns/stream/canvas) inherited from
//    edu-agent-kit. The 5 schema values are mapped to their closest official
//    label below; the other 4 (story/timeline/list/map) are reachable via a
//    literal --layout value even though they're outside the schema enum.
//  - After creating the board, a right-side "新看板"/"New padlet" settings
//    panel auto-opens with layout options (title field there was read-only in
//    testing) — it must be dismissed via "已完成"/"Done" before the canvas
//    (including the real editable H1 title) becomes interactable.
//  - Section rename: click the section heading -> it becomes a text input
//    with the old name pre-selected -> type -> MUST click "已完成"/"Done" to
//    confirm (Enter alone leaves it in edit mode). "Add section" button text
//    is "新增區段" (not "新增區塊").
// Agent must confirm title/layout/sections with the teacher before running.
// Usage: node scripts/pw/create-board.mjs --title "..." [--layout columns] [--section 名稱 ...可重複]
// Flow manifest: references/flow-create-board.md
import {
  openSession,
  ok,
  fail,
  failWithDiagnostics,
  handoff,
  clickFirst,
} from "../lib/session.mjs";

const PLATFORM = "padlet";
const DASHBOARD = /padlet\.com\/(dashboard|home)/;

const argv = process.argv.slice(2);
function arg(name) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}
const sections = [];
argv.forEach((a, i) => {
  if (a === "--section" && argv[i + 1]) sections.push(argv[i + 1]);
});
const title = arg("title");
const layout = arg("layout") ?? "columns";

if (!title) {
  fail("usage", 'node scripts/pw/create-board.mjs --title "..." [--layout columns] [--section 名稱 --section 名稱2]');
  process.exit(1);
}

// Schema-mapped layouts (Board.format enum) -> closest official label.
// "canvas" maps to "自由格式" (freeform) — Padlet's true whiteboard/canvas is
// a separate "sandbox" category not shown in this board-layout picker.
const SCHEMA_LAYOUT_LABEL = {
  wall: /^電子牆$|^wall$/i,
  columns: /^欄位$|^shelf$|^columns$/i,
  grid: /^表格$|^grid$/i,
  stream: /^行系列$|^stream$/i,
  canvas: /^自由格式$|^freeform$/i,
};
// Extra official layouts, reachable by passing the literal label as --layout.
const EXTRA_LAYOUT_LABEL = {
  story: /^故事看板$/i,
  timeline: /^時間表$/i,
  list: /^清單$/i,
  map: /^地圖$/i,
};
const LAYOUT_LABEL = { ...SCHEMA_LAYOUT_LABEL, ...EXTRA_LAYOUT_LABEL };
if (!LAYOUT_LABEL[layout]) {
  fail(
    "bad-layout",
    `--layout 必須是 schema 值（${Object.keys(SCHEMA_LAYOUT_LABEL).join("|")}）或官方額外版面（${Object.keys(EXTRA_LAYOUT_LABEL).join("|")}）之一。`,
  );
  process.exit(1);
}

const { context, page } = await openSession(PLATFORM);
try {
  await page.goto("https://padlet.com/dashboard", { waitUntil: "domcontentloaded" });
  if (!DASHBOARD.test(page.url())) {
    fail("not-logged-in", "尚未登入 Padlet。請先執行 node scripts/pw/login.mjs。");
    await context.close();
    process.exit(1);
  }

  await clickFirst(
    page,
    [
      (p) => p.getByRole("link", { name: /^\+?\s*製作$/i }),
      (p) => p.getByRole("button", { name: /make a padlet|^make$/i }),
      (p) => p.getByRole("link", { name: /make a padlet/i }),
    ],
    "製作/Make trigger",
    15000,
  );

  // Layout picker appears directly — no intermediate "blank board" screen.
  await clickFirst(page, [(p) => p.getByText(LAYOUT_LABEL[layout])], `layout ${layout}`, 15000);

  // Board is created; a settings panel ("新看板"/"New padlet") auto-opens.
  // Dismiss it to reach the editable canvas/title.
  await page.waitForURL(/padlet\.com\/[^/]+\/[a-z0-9-]+/i, { timeout: 30000 });
  try {
    await page
      .getByRole("button", { name: /^已完成$|^done$/i })
      .first()
      .click({ timeout: 8000 });
  } catch {
    // panel may not have auto-opened in this account/layout — not fatal
  }

  const titleInput = page
    .locator('input[placeholder*="title" i], [data-testid*="title"] input')
    .first();
  const titleHeading = page.getByRole("heading").first();
  try {
    await titleInput.waitFor({ state: "visible", timeout: 5000 });
    await titleInput.fill(title);
    await page.keyboard.press("Enter");
  } catch {
    // fall back to the canvas H1 (click -> select all -> type -> Enter)
    await titleHeading.click({ timeout: 10000 });
    await page.keyboard.press("Meta+a");
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
  }

  // Rename/add sections. First section: click its heading -> edit -> type ->
  // MUST confirm with the "已完成"/"Done" button (Enter alone stays in edit mode).
  const sectionNotes = [];
  for (let i = 0; i < sections.length; i += 1) {
    const name = sections[i];
    try {
      if (i > 0) {
        await clickFirst(
          page,
          [
            (p) => p.getByRole("button", { name: /^新增區段$|^add section$/i }),
            (p) => p.getByText(/^新增區段$|^add section$/i),
          ],
          "add section",
          8000,
        );
      }
      const heading = page.getByRole("heading", { name: i === 0 ? /^區段\s*1$/ : new RegExp(`^區段\\s*${i + 1}$`) }).first();
      await heading.click({ timeout: 8000 });
      await page.keyboard.press("Meta+a");
      await page.keyboard.type(name);
      await page
        .getByRole("button", { name: /^已完成$|^done$/i })
        .first()
        .click({ timeout: 5000 });
    } catch {
      sectionNotes.push(`欄位「${name}」未能自動建立/改名，請老師手動補上。`);
    }
  }

  ok({
    created: true,
    boardUrl: page.url(),
    layout,
    sectionsRequested: sections,
    notes: sectionNotes,
    next: "用 scripts/api/seed-board.mjs（有 key）或 scripts/pw/seed-posts.mjs（無 key）貼種子貼文，或 scripts/pw/set-sharing.mjs 設定權限。",
  });
} catch (err) {
  const msg = String(err?.message ?? err);
  if (msg.startsWith("selector-failure")) {
    await handoff(PLATFORM, page, msg, {
      hint: "Padlet 介面可能改版。請人工完成建板（點「製作」→ 選版面），並回報以更新 flow manifest。",
    });
  } else {
    await failWithDiagnostics(PLATFORM, page, msg, "建板失敗。請確認登入狀態後重試一次。");
  }
} finally {
  await context.close();
}
