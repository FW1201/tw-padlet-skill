#!/usr/bin/env node
// Create a blank board with chosen layout + sections via the Padlet UI
// (the official API has NO blank-board endpoint).
// Agent must confirm title/layout/sections with the teacher before running.
// Usage: node scripts/pw/create-board.mjs --title "..." [--layout wall|columns|grid|stream|canvas] [--section 名稱 ...可重複]
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

const LAYOUT_LABEL = {
  wall: /wall|牆/i,
  columns: /shelf|columns|欄/i,
  grid: /grid|網格/i,
  stream: /stream|串流/i,
  canvas: /canvas|畫布/i,
};

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
      (p) => p.getByRole("button", { name: /make a padlet|make|建立/i }),
      (p) => p.getByRole("link", { name: /make/i }),
    ],
    "Make a padlet",
    15000,
  );
  // Choose a blank board with the requested layout.
  await clickFirst(
    page,
    [
      (p) => p.getByText(/blank board|blank|空白/i),
      (p) => p.getByRole("button", { name: /board/i }),
    ],
    "blank board",
    10000,
  ).catch(() => {
    // some UIs go straight to layout choice
  });
  await clickFirst(page, [(p) => p.getByText(LAYOUT_LABEL[layout])], `layout ${layout}`, 10000);

  // New board opens; set the title.
  await page.waitForURL(/padlet\.com\/[^/]+\/[a-z0-9]/i, { timeout: 30000 });
  const titleInput = page
    .locator('input[placeholder*="title" i], [data-testid*="title"] input, h1[contenteditable="true"]')
    .first();
  await titleInput.waitFor({ state: "visible", timeout: 15000 });
  await titleInput.fill(title);
  await page.keyboard.press("Enter");

  // Rename/add sections for sectioned layouts.
  const sectionNotes = [];
  if (sections.length > 0) {
    for (let i = 0; i < sections.length; i += 1) {
      const name = sections[i];
      try {
        if (i === 0) {
          const firstSection = page
            .locator('[data-testid*="section"] [contenteditable="true"], [class*="section-title"]')
            .first();
          await firstSection.waitFor({ state: "visible", timeout: 8000 });
          await firstSection.click();
          await page.keyboard.press("Meta+a");
          await page.keyboard.type(name);
          await page.keyboard.press("Enter");
        } else {
          await clickFirst(
            page,
            [
              (p) => p.getByRole("button", { name: /add section|新增區塊/i }),
              (p) => p.getByText(/add section/i),
            ],
            "add section",
            8000,
          );
          await page.keyboard.type(name);
          await page.keyboard.press("Enter");
        }
      } catch {
        sectionNotes.push(`欄位「${name}」未能自動建立，請老師手動補上。`);
      }
    }
  }

  ok({
    created: true,
    boardUrl: page.url(),
    layout,
    sectionsRequested: sections,
    notes: sectionNotes,
    next: "用 scripts/pw/seed-posts.mjs 貼種子貼文，或 scripts/pw/set-sharing.mjs 設定權限。",
  });
} catch (err) {
  const msg = String(err?.message ?? err);
  if (msg.startsWith("selector-failure")) {
    await handoff(PLATFORM, page, msg, {
      hint: "Padlet 介面可能改版。請人工完成建板（Make a padlet → 選版面），並回報以更新 flow manifest。",
    });
  } else {
    await failWithDiagnostics(PLATFORM, page, msg, "建板失敗。請確認登入狀態後重試一次。");
  }
} finally {
  await context.close();
}
