#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { validateWildcardAlignment } from "./wildcard-alignment.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Board } from "./lib/models.mjs";
import { runLessonCommand } from "./portable-core/lesson-command.mjs";
import { runRuntimeCommand } from "./portable-core/runtime-command.mjs";
import { runEdtechCli } from "./lib/edtech-cli.mjs";
import { guardStudentRosterPlan } from "./lib/student-roster-plan.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const needsProtectedRoster = async () => {
  const [command, ...args] = process.argv.slice(2);
  const action = args[args.indexOf("--action") + 1];
  const rosterIndex = args.indexOf("--roster");
  const roster = rosterIndex >= 0 ? args[rosterIndex + 1] : undefined;
  const catalog = JSON.parse(await readFile(path.join(root, "capability-catalog.json"), "utf8"));
  return ["plan", "run"].includes(command) && catalog.actions.find((item) => item.id === action)?.requiresStudentData && !roster;
};
const missingCommentTarget = () => {
  const [command, ...args] = process.argv.slice(2);
  const postIndex = args.indexOf("--post");
  return command === "run" && args[args.indexOf("--action") + 1] === "comment.create" && !(postIndex >= 0 && args[postIndex + 1]);
};
if (process.argv[2] === "wildcard-check") {
  const index=process.argv.indexOf("--input");
  try {
    if(index<0 || !process.argv[index+1]) throw new Error("--input <json> is required");
    const report=validateWildcardAlignment(JSON.parse(await readFile(process.argv[index+1],"utf8")));
    console.log(JSON.stringify(report)); if(!report.ok) process.exitCode=1;
  } catch(e) {console.log(JSON.stringify({ok:false,error:String(e.message)}));process.exitCode=1;}
} else if (process.argv[2] === "lesson") {
  const report = await runLessonCommand(process.argv.slice(3));
  console.log(JSON.stringify(report));
  if (!report.ok) process.exitCode = 1;
} else if (process.argv[2] === "runtime") {
  const report = await runRuntimeCommand("padlet", process.argv.slice(3));
  console.log(JSON.stringify(report));
  if (!report.ok) process.exitCode = 1;
} else if (await guardStudentRosterPlan({ platform: "padlet", root })) {
  // The guard emitted a roster-bound plan or a fail-closed diagnostic.
} else if (missingCommentTarget()) {
  console.log(JSON.stringify({ ok: false, error: "post-required", hint: "建立留言前必須以 --post 指定目標貼文；不會嘗試任何外部寫入。", externalWriteAttempted: false }));
  process.exitCode = 1;
} else if (await needsProtectedRoster()) {
  console.log(JSON.stringify({ ok: false, error: "roster-required", hint: "此動作涉及學生資料；請提供已受保護且不納入 Git 的 --roster 檔案。", externalWriteAttempted: false }));
  process.exitCode = 1;
} else await runEdtechCli({
  platform: "padlet",
  root,
  validate: async (input) => {
    const board = Board.parse(JSON.parse(await readFile(input, "utf8")));
    return { valid: true, title: board.title, format: board.format, seedPostCount: board.seedPosts.length };
  },
  apiHandlers: {
    "post.create": ({ resource, payload }) => [path.join(root, "scripts/api/add-post.mjs"), resource, payload, "--confirm-write"],
    "post.seed": ({ resource, payload }) => [path.join(root, "scripts/api/seed-board.mjs"), payload, "--board-id", resource, "--confirm-write"],
    "comment.create": ({ resource, payload, args }) => [path.join(root, "scripts/api/add-comment.mjs"), resource, args[args.indexOf("--post") + 1], payload, "--confirm-write"],
    "comment.seed": ({ resource, payload }) => [path.join(root, "scripts/api/seed-comments.mjs"), resource, payload, "--confirm-write"],
  },
});
