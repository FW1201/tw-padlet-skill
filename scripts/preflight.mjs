#!/usr/bin/env node
// Preflight check for the Padlet chain: is an API key configured? This skill
// is API-only (no browser/login), so this is the entire precondition.
// Usage: node scripts/preflight.mjs
import { hasApiKey } from "./lib/padlet-client.mjs";

const ok = await hasApiKey();
console.log(
  JSON.stringify({
    ok,
    apiKey: ok,
    hint: ok
      ? undefined
      : "缺少 PADLET_API_KEY。至 https://padlet.com/dashboard/settings/developers 申請（需付費方案），再 export PADLET_API_KEY=... 或寫入 ~/.tw-edu-skills/padlet/config.json。",
  }),
);
if (!ok) process.exitCode = 1;
