#!/usr/bin/env node
// Usage: node scripts/api/list-posts.mjs <board-id> [--limit N] [--offset N]
import { listPosts, MissingCredentialError } from "../lib/padlet-client.mjs";

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
}
const out = (o) => console.log(JSON.stringify(o));
const boardId = process.argv[2];
if (!boardId) {
  out({ ok: false, error: "usage", hint: "node scripts/api/list-posts.mjs <board-id> [--limit N] [--offset N]" });
  process.exit(1);
}
try {
  const all = await listPosts(boardId);
  const offset = arg("offset", 0);
  const limit = arg("limit", 50);
  const page = all.slice(offset, offset + limit).map((p) => ({
    id: p.id,
    subject: p.attributes?.content?.subject ?? "",
    body: p.attributes?.content?.body ?? "",
    color: p.attributes?.color ?? null,
    sectionId: p.relationships?.section?.data?.id ?? null,
    attachmentUrl: p.attributes?.content?.attachment?.url ?? null,
    url: p.attributes?.webUrl?.live ?? null,
  }));
  out({ ok: true, total: all.length, offset, limit, posts: page });
} catch (err) {
  out({
    ok: false,
    error: String(err?.message ?? err),
    hint: err instanceof MissingCredentialError ? err.message : "確認 board id 與 API key 權限。",
  });
  process.exit(1);
}
