#!/usr/bin/env node
// One-command orchestrator for the Padlet chain. Sequences the existing
// single-purpose scripts and stops at the FIRST failure — it does not
// re-implement any step. Board creation always uses Playwright (the REST API
// cannot create a blank board); seeding uses REST when an API key is present,
// otherwise Playwright. Two stages keep the one intentional human checkpoint
// (confirming the visitor permission, an external visibility change) as a
// single interaction:
//
//   node scripts/run.mjs <board.json> --stage prepare
//     create-board (Playwright, needs login) -> seed-posts (REST if key, else
//     Playwright). Prints boardUrl + a summary. Permission NOT changed yet
//     (board defaults to its creation privacy).
//
//   node scripts/run.mjs <board.json> --stage deliver --board-url <url> \
//     --visitor no_access|reader|commenter|author|approver
//     set-sharing. Prints the final share state.
//
// board.json fields: title, format (layout), sections[], seedPosts[]. The only
// manual steps are login (preflight) and confirming the visitor permission.
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRunState, inputFingerprint } from "./lib/session.mjs";
import { createTrackedRunner } from "./lib/browser-core/orchestrator.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLATFORM = "padlet";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function out(obj) {
  console.log(JSON.stringify(obj));
}

let runState;
const runTracked = createTrackedRunner({ here: HERE, platform: PLATFORM, getState: () => runState });

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
const stage = arg("stage");
if (!boardPath || !["prepare", "deliver"].includes(stage)) {
  out({
    ok: false,
    error: "usage",
    hint: "node scripts/run.mjs <board.json> --stage prepare | --stage deliver --board-url <url> --visitor no_access|reader|commenter|author|approver",
  });
  process.exit(1);
}

try {
  const board = JSON.parse(await fs.readFile(boardPath, "utf8"));

  if (stage === "prepare") {
    const createArgs = ["--title", board.title ?? "未命名看板"];
    if (board.format) createArgs.push("--layout", board.format);
    for (const s of board.sections ?? []) createArgs.push("--section", s);

    runState = await createRunState(PLATFORM, { id: "padlet-prepare", version: 1 }, inputFingerprint(board));
    const created = await runTracked("create-board", "pw/create-board.mjs", createArgs);
    if (!created.ok) {
      out({ ok: false, stage, step: "create-board", ...created });
      process.exit(1);
    }

    // Seed with the Playwright seeder. (REST seed-board.mjs needs a numeric
    // --board-id, which a UI-created board URL doesn't directly expose, so the
    // one-command chain seeds via the UI for reliability. With an API key,
    // api/seed-board.mjs --board-id <id> is still available for advanced use.)
    const seeded = await runTracked("seed-posts", "pw/seed-posts.mjs", [boardPath, "--board-url", created.boardUrl]);
    if (!seeded.ok) {
      out({ ok: false, stage, step: "seed", boardUrl: created.boardUrl, ...seeded });
      process.exit(1);
    }

    out({
      ok: true,
      stage: "prepare",
      runId: runState.runId,
      boardUrl: created.boardUrl,
      title: board.title,
      layout: created.layout,
      added: seeded.added,
      requested: seeded.requested,
      failures: seeded.failures?.length ? seeded.failures : undefined,
      confirm: {
        visitorDefault: "author",
        note: "訪客權限（no_access/reader/commenter/author/approver）是對外可見度變更，由老師確認後帶入 deliver。",
      },
      next: `老師確認後執行：node scripts/run.mjs ${boardPath} --stage deliver --board-url ${created.boardUrl} --visitor commenter`,
    });
    process.exit(0);
  }

  // stage === "deliver"
  const boardUrl = arg("board-url");
  const visitor = arg("visitor");
  if (!boardUrl || !visitor) {
    out({ ok: false, stage, error: "missing-args", hint: "deliver 需要 --board-url（來自 prepare）與 --visitor。" });
    process.exit(1);
  }

  runState = await createRunState(PLATFORM, { id: "padlet-deliver", version: 1 }, inputFingerprint({ boardUrl, visitor }));
  const shared = await runTracked("set-sharing", "pw/set-sharing.mjs", ["--board-url", boardUrl, "--visitor", visitor]);
  if (!shared.ok) {
    out({ ok: false, stage, step: "set-sharing", boardUrl, ...shared });
    process.exit(1);
  }

  out({
    ok: true,
    stage: "deliver",
    runId: runState.runId,
    boardUrl,
    visitor,
    shareUrl: shared.shareUrl,
    note: "完整鏈完成。把 shareUrl 交給學生即可。",
  });
} catch (err) {
  out({
    ok: false,
    stage,
    error: String(err?.message ?? err),
    hint: "請確認 board.json 路徑與內容，以及先跑過 preflight 確認登入或 API key。",
  });
  process.exit(1);
}
