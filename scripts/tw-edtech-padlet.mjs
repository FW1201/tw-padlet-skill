#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Board } from "./lib/models.mjs";
import { runEdtechCli } from "./lib/edtech-cli.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await runEdtechCli({
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
