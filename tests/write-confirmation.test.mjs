import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function withoutConfirmation(script, args) {
  const result = spawnSync(process.execPath, [path.join(ROOT, script), ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, PADLET_API_KEY: "" },
  });
  assert.equal(result.status, 1, `${script} must reject an unconfirmed write`);
  const payload = JSON.parse(result.stdout.trim());
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "confirmation-required");
  assert.match(payload.hint, /--confirm-write/);
}

test("every Padlet write CLI fails before credentials, files, or network without --confirm-write", () => {
  withoutConfirmation("scripts/api/add-post.mjs", ["board-not-used", "post-not-used.json"]);
  withoutConfirmation("scripts/api/create-ai-board.mjs", ["--prompt", "not-used"]);
  withoutConfirmation("scripts/api/seed-board.mjs", ["board-not-used.json", "--board-id", "board-not-used"]);
  withoutConfirmation("scripts/run.mjs", ["board-not-used.json", "--board-id", "board-not-used"]);
  withoutConfirmation("scripts/api/add-comment.mjs", ["board-not-used", "post-not-used", "comment-not-used.json"]);
  withoutConfirmation("scripts/api/seed-comments.mjs", ["board-not-used", "comments-not-used.json"]);
});
