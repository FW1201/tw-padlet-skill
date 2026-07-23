#!/usr/bin/env node
// Usage: node scripts/api/add-post.mjs <board-id> <post.json> --confirm-write
// post.json: {subject?, body, media?, section?(label 或 section id), color?}
import { readFile } from "node:fs/promises";
import { BoardPost } from "../lib/models.mjs";
import {
  addPost,
  listSections,
  resolveSeedSections,
  MissingCredentialError,
  PostVerificationError,
} from "../lib/padlet-client.mjs";
import { requireConfirmWrite } from "../lib/write-confirmation.mjs";

const out = (o) => console.log(JSON.stringify(o));
const [, , boardId, file] = process.argv;
if (!boardId || !file) {
  out({ ok: false, error: "usage", hint: "node scripts/api/add-post.mjs <board-id> <post.json> --confirm-write" });
  process.exit(1);
}
if (!requireConfirmWrite()) process.exit(1);
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
  if (resolved.media && resolved.media.kind !== "image") {
    notes.push("附件非圖片類型；Padlet 官方文件未完整記載非圖片附件的渲染行為，請貼文後自行檢查嵌入卡片是否正確顯示。");
  }
  const res = await addPost(boardId, resolved);
  out({ ok: true, postId: res.data.id, url: res.data.attributes?.webUrl?.live ?? null, notes });
} catch (err) {
  if (err instanceof PostVerificationError) {
    out({
      ok: false,
      error: "post-write-verification-failed",
      postId: err.postId,
      verification: err.verification,
      hint: "Padlet 回報建立成功，但讀回內容與送出內容不符，貼文可能未完整寫入。請直接到看板確認該則貼文，必要時手動修正或重新張貼——先確認是否真的沒建立成功，避免重複貼文。",
    });
    process.exit(1);
  }
  out({
    ok: false,
    error: String(err?.message ?? err),
    hint: err instanceof MissingCredentialError ? err.message : "確認 post.json 格式（body 必填）與 board id。",
  });
  process.exit(1);
}
