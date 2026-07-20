#!/usr/bin/env node
// Create a board via the async AI-recipe endpoint (the ONLY API creation path;
// there is no blank-board endpoint). Polls until ready (~2 min max).
// Usage: node scripts/api/create-ai-board.mjs --prompt "..." [--role teacher] [--workspace-id X]
import { createAiBoardAndWait, MissingCredentialError } from "../lib/padlet-client.mjs";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const out = (o) => console.log(JSON.stringify(o));
const prompt = arg("prompt");
if (!prompt) {
  out({ ok: false, error: "usage", hint: "node scripts/api/create-ai-board.mjs --prompt \"...\" [--role teacher] [--workspace-id X]" });
  process.exit(1);
}
try {
  const created = await createAiBoardAndWait({
    prompt,
    role: arg("role") ?? "teacher",
    workspaceId: arg("workspace-id"),
  });
  out({ ok: true, ...created, note: "AI 生成板內容不完全可控；可用 list-posts 檢視後以 add-post/seed-board 補充。" });
} catch (err) {
  out({
    ok: false,
    error: String(err?.message ?? err),
    hint: err instanceof MissingCredentialError ? err.message : "AI 建板逾時或失敗；可稍後重試一次，或改用 scripts/pw/create-board.mjs。",
  });
  process.exit(1);
}
