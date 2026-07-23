#!/usr/bin/env node
// Thin one-command entry point for the API-only Padlet chain — kept mainly
// for entry-point consistency with the other three tw-*-skill repos (all now
// reduced to "one script, no login"). scripts/api/seed-board.mjs already
// fully implements create(optional)+seed as a single call, so this wrapper
// adds no new logic — it just gives Padlet the same `node scripts/run.mjs
// <input>` shape teachers/agents see elsewhere.
//
// Usage:
//   node scripts/run.mjs board.json --board-id <existing-board-id> --confirm-write
//   node scripts/run.mjs board.json --ai-prompt "..." [--role teacher] --confirm-write
//
// Seeding posts onto a board (existing or freshly AI-generated) is an
// external write visible to anyone with the board link — the printed summary
// (added/failed/unmatchedLabels) is the confirmation checkpoint; review it
// before treating the board as finished. Visitor permission and export still
// have no API equivalent — direct the teacher to padlet.com for those.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireConfirmWrite } from "./lib/write-confirmation.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function out(obj) {
  console.log(JSON.stringify(obj));
}

function runScript(relPath, args) {
  const res = spawnSync(process.execPath, [path.join(HERE, relPath), ...args], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  const lines = (res.stdout ?? "").trim().split("\n").filter(Boolean);
  let parsed;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      parsed = JSON.parse(lines[i]);
      break;
    } catch {
      // keep scanning upward for the JSON result line
    }
  }
  if (!parsed) {
    return {
      ok: false,
      error: "no-json-output",
      hint: `子腳本 ${relPath} 未輸出可解析的 JSON（exit ${res.status}）。stderr: ${(res.stderr ?? "").slice(0, 400)}`,
    };
  }
  return parsed;
}

const boardPath = process.argv[2];
const boardId = arg("board-id");
const aiPrompt = arg("ai-prompt");
const role = arg("role") ?? "teacher";

if (!boardPath || (!boardId && !aiPrompt)) {
  out({
    ok: false,
    error: "usage",
    hint: 'node scripts/run.mjs <board.json> (--board-id <既有看板id> | --ai-prompt "..." [--role teacher]) --confirm-write',
  });
  process.exit(1);
}
if (!requireConfirmWrite()) process.exit(1);

const seedArgs = boardId
  ? [boardPath, "--board-id", boardId, "--confirm-write"]
  : [boardPath, "--ai-prompt", aiPrompt, "--role", role, "--confirm-write"];

const result = runScript("api/seed-board.mjs", seedArgs);
if (!result.ok) {
  out({ ok: false, step: "seed-board", ...result });
  process.exit(1);
}
out({
  ...result,
  note: "貼文已種入看板。訪客權限與匯出 Padlet API 沒有對應端點，請老師直接在 padlet.com 的看板設定調整。",
});
