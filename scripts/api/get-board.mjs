#!/usr/bin/env node
// Usage: node scripts/api/get-board.mjs <board-id>
import { getBoard, MissingCredentialError } from "../lib/padlet-client.mjs";

const boardId = process.argv[2];
const out = (o) => console.log(JSON.stringify(o));
if (!boardId) {
  out({ ok: false, error: "usage", hint: "node scripts/api/get-board.mjs <board-id>（board URL 結尾的 16-22 字元 id）" });
  process.exit(1);
}
try {
  const res = await getBoard(boardId);
  const b = res.data;
  const included = res.included ?? [];
  out({
    ok: true,
    id: b.id,
    title: b.attributes.title ?? "",
    description: b.attributes.description ?? "",
    url: b.attributes.webUrl?.live ?? "",
    sections: included
      .filter((e) => e.type === "section")
      .map((s) => ({ id: s.id, title: s.attributes?.title ?? "" })),
    postCount: included.filter((e) => e.type === "post").length,
  });
} catch (err) {
  out({
    ok: false,
    error: String(err?.message ?? err),
    hint: err instanceof MissingCredentialError ? err.message : "確認 board id 與 API key 權限。",
  });
  process.exit(1);
}
