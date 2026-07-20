#!/usr/bin/env node
// Usage: node scripts/api/add-post.mjs <board-id> <post.json>
// post.json: {subject?, body, media?, section?(label 或 section id), color?}
import { readFile } from "node:fs/promises";
import { BoardPost } from "../lib/models.mjs";
import {
  addPost,
  listSections,
  resolveSeedSections,
  MissingCredentialError,
} from "../lib/padlet-client.mjs";

const out = (o) => console.log(JSON.stringify(o));
const [, , boardId, file] = process.argv;
if (!boardId || !file) {
  out({ ok: false, error: "usage", hint: "node scripts/api/add-post.mjs <board-id> <post.json>" });
  process.exit(1);
}
try {
  const post = BoardPost.parse(JSON.parse(await readFile(file, "utf8")));
  let resolved = post;
  const notes = [];
  if (post.section) {
    const sections = await listSections(boardId);
    const r = resolveSeedSections([post], sections);
    resolved = r.posts[0];
    if (r.unmatchedLabels.length > 0) {
      notes.push(`找不到欄位「${r.unmatchedLabels.join("、")}」，改為不分欄張貼。`);
    }
  }
  const res = await addPost(boardId, resolved);
  out({ ok: true, postId: res.data.id, url: res.data.attributes?.webUrl?.live ?? null, notes });
} catch (err) {
  out({
    ok: false,
    error: String(err?.message ?? err),
    hint: err instanceof MissingCredentialError ? err.message : "確認 post.json 格式（body 必填）與 board id。",
  });
  process.exit(1);
}
