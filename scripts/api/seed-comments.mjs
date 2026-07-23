#!/usr/bin/env node
// Usage: node scripts/api/seed-comments.mjs <board-id> <comments.json> --confirm-write
import { readFile } from "node:fs/promises";
import { TeacherCommentBatch } from "../lib/models.mjs";
import {
  CommentVerificationError,
  createCommentsSafely,
  MissingCredentialError,
  PostBoardMismatchError,
  RateLimitError,
} from "../lib/padlet-client.mjs";
import { requireConfirmWrite } from "../lib/write-confirmation.mjs";

const out = (o) => console.log(JSON.stringify(o));
const [, , boardId, file] = process.argv;
if (!boardId || !file) {
  out({ ok: false, error: "usage", hint: "node scripts/api/seed-comments.mjs <board-id> <comments.json> --confirm-write" });
  process.exit(1);
}
if (!requireConfirmWrite()) process.exit(1);
try {
  const comments = TeacherCommentBatch.parse(JSON.parse(await readFile(file, "utf8")));
  const result = await createCommentsSafely(boardId, comments);
  out({ ok: true, boardId, requested: comments.length, ...result, createdCount: result.created.length });
} catch (err) {
  if (err instanceof RateLimitError) {
    const partial = err.batch ?? { created: [], skipped: 0 };
    out({
      ok: false,
      error: "rate-limited",
      retryAfterSeconds: err.retryAfterSeconds,
      created: partial.created,
      createdCount: partial.created.length,
      skipped: partial.skipped,
      hint: "批次已立即停止，未送出後續留言；請等待後先用 list-comments 檢查，再重新執行並再次加入 --confirm-write。",
    });
  } else if (err instanceof CommentVerificationError) {
    out({ ok: false, error: "comment-write-verification-failed", commentId: err.commentId, verification: err.verification, hint: "批次已停止，不會自動重送；請先到看板確認。" });
  } else if (err instanceof PostBoardMismatchError) {
    out({ ok: false, error: "post-not-on-board", boardId: err.boardId, postIds: err.postIds, hint: "批次未寫入；請先用 list-posts 確認每個 postId 屬於此看板。" });
  } else {
    out({ ok: false, error: String(err?.message ?? err), hint: err instanceof MissingCredentialError ? err.message : "確認 comments.json、board id 與留言權限。" });
  }
  process.exit(1);
}
