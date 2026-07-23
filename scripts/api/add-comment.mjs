#!/usr/bin/env node
// Usage: node scripts/api/add-comment.mjs <board-id> <post-id> <comment.json> --confirm-write
import { readFile } from "node:fs/promises";
import { TeacherComment } from "../lib/models.mjs";
import {
  CommentVerificationError,
  createCommentsSafely,
  MissingCredentialError,
  PostBoardMismatchError,
  RateLimitError,
} from "../lib/padlet-client.mjs";
import { requireConfirmWrite } from "../lib/write-confirmation.mjs";

const out = (o) => console.log(JSON.stringify(o));
const [, , boardId, postId, file] = process.argv;
if (!boardId || !postId || !file) {
  out({ ok: false, error: "usage", hint: "node scripts/api/add-comment.mjs <board-id> <post-id> <comment.json> --confirm-write" });
  process.exit(1);
}
if (!requireConfirmWrite()) process.exit(1);
try {
  const comment = TeacherComment.parse(JSON.parse(await readFile(file, "utf8")));
  const result = await createCommentsSafely(boardId, [{ postId, ...comment }]);
  if (result.created.length === 0) {
    out({ ok: true, boardId, postId, skipped: true, reason: "duplicate-comment", note: "相同留言已存在，未建立重複留言。" });
  } else {
    out({ ok: true, boardId, postId, commentId: result.created[0].commentId, skipped: false });
  }
} catch (err) {
  if (err instanceof RateLimitError) {
    out({ ok: false, error: "rate-limited", retryAfterSeconds: err.retryAfterSeconds, hint: "未重試、未送出後續寫入；請等待後重新執行並再次加入 --confirm-write。" });
  } else if (err instanceof CommentVerificationError) {
    out({ ok: false, error: "comment-write-verification-failed", commentId: err.commentId, verification: err.verification, hint: "回傳內容未驗證，不會自動重送；請先到看板確認。" });
  } else if (err instanceof PostBoardMismatchError) {
    out({ ok: false, error: "post-not-on-board", boardId: err.boardId, postIds: err.postIds, hint: "已停止且未寫入；請先用 list-posts 確認看板與貼文。" });
  } else {
    out({ ok: false, error: String(err?.message ?? err), hint: err instanceof MissingCredentialError ? err.message : "確認 comment.json 的 text、post id 與留言權限。" });
  }
  process.exit(1);
}
