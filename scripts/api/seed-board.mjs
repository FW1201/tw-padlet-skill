#!/usr/bin/env node
// Seed a Padlet board with posts from board.json — either an existing board
// (--board-id) or a new AI recipe board (--ai-prompt; the only API creation path).
// Ported seed workflow from edu-agent-kit padlet tools.ts @ a7eaa0f.
// Usage: node scripts/api/seed-board.mjs <board.json> (--board-id X | --ai-prompt "...") [--role teacher]
import { readFile } from "node:fs/promises";
import { Board } from "../lib/models.mjs";
import {
  addPost,
  getBoard,
  listSections,
  createAiBoardAndWait,
  resolveSeedSections,
  MissingCredentialError,
} from "../lib/padlet-client.mjs";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const out = (o) => console.log(JSON.stringify(o));

const file = process.argv[2];
let boardId = arg("board-id");
const aiPrompt = arg("ai-prompt");
const role = arg("role") ?? "teacher";

if (!file || (!boardId && !aiPrompt)) {
  out({ ok: false, error: "usage", hint: "node scripts/api/seed-board.mjs <board.json> (--board-id X | --ai-prompt \"...\") [--role teacher]。API 無法建空白看板，只能種到既有看板或 AI 生成看板。" });
  process.exit(1);
}

try {
  const board = Board.parse(JSON.parse(await readFile(file, "utf8")));
  let url;

  if (!boardId) {
    const created = await createAiBoardAndWait({ prompt: aiPrompt, role });
    boardId = created.boardId;
    url = created.url;
  }

  const sections = await listSections(boardId);
  const { posts, unmatchedLabels } = resolveSeedSections(board.seedPosts, sections);

  let added = 0;
  const errors = [];
  for (const post of posts) {
    try {
      await addPost(boardId, post);
      added += 1;
    } catch (err) {
      errors.push(String(err?.message ?? err));
    }
  }

  if (!url) {
    try {
      url = (await getBoard(boardId)).data.attributes.webUrl?.live;
    } catch {
      // URL is best-effort
    }
  }

  const notes = [];
  if (unmatchedLabels.length > 0) {
    notes.push(
      `這些欄位名稱在板上找不到對應區塊，已改為不分欄張貼：${unmatchedLabels.join("、")}。` +
        `可用的欄位：${sections.map((s) => s.title).filter(Boolean).join("、") || "（無）"}。`,
    );
  }
  notes.push("API 無法設定訪客權限/匯出——請老師直接在 padlet.com 的看板設定調整。");
  const nonImageCount = posts.filter((p) => p.media && p.media.kind !== "image").length;
  if (nonImageCount > 0) {
    notes.push(
      `${nonImageCount} 則貼文附件非圖片類型；Padlet 官方文件未完整記載非圖片附件的渲染行為，請貼文後自行檢查嵌入卡片是否正確顯示。`,
    );
  }

  const failed = board.seedPosts.length - added;
  const ok = added > 0 || board.seedPosts.length === 0; // all posts failed ≠ success
  out({ ok, boardId, url: url ?? "", requested: board.seedPosts.length, added, failed, errors, notes });
  if (!ok) process.exitCode = 1;
} catch (err) {
  let hint;
  if (err instanceof MissingCredentialError) {
    hint = err.message;
  } else if (err?.issues) {
    const fields = err.issues.map((i) => i.path.join(".")).join("、");
    hint = `board.json 格式錯誤（欄位：${fields}）。請對照 scripts/lib/models.mjs 的 Board schema 修正後重試。`;
  } else {
    hint = "請確認 board-id 正確（16-22 字元）與網路正常。";
  }
  out({ ok: false, error: String(err?.message ?? err), hint });
  process.exit(1);
}
