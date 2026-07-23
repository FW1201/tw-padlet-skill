#!/usr/bin/env node
// Usage: node scripts/api/list-comments.mjs <board-id> <post-id>
import { htmlToPlainText, listComments, MissingCredentialError } from "../lib/padlet-client.mjs";

const out = (o) => console.log(JSON.stringify(o));
const [, , boardId, postId] = process.argv;
if (!boardId || !postId) {
  out({ ok: false, error: "usage", hint: "node scripts/api/list-comments.mjs <board-id> <post-id>" });
  process.exit(1);
}
try {
  const comments = await listComments(boardId, postId);
  out({
    ok: true,
    boardId,
    postId,
    total: comments.length,
    comments: comments.map((comment) => ({
      id: comment.id,
      text: htmlToPlainText(comment.attributes?.htmlContent ?? comment.attributes?.content ?? ""),
      htmlContent: comment.attributes?.htmlContent ?? null,
      status: comment.attributes?.status ?? null,
      createdAt: comment.attributes?.createdAt ?? null,
    })),
  });
} catch (err) {
  out({
    ok: false,
    error: String(err?.message ?? err),
    hint: err instanceof MissingCredentialError ? err.message : "確認 board id、post id 與 API key 的讀取權限。",
  });
  process.exit(1);
}
