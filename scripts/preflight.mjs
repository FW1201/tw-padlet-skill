#!/usr/bin/env node
// Preflight check for the Padlet chain: toolchain installed, is an API key
// present (REST path available), and — if no key — is the teacher logged in for
// the Playwright path? Run BEFORE run.mjs. Only reports state; never logs in.
// Usage: node scripts/preflight.mjs
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

if (!existsSync(new URL("../node_modules/playwright", import.meta.url))) {
  console.log(
    JSON.stringify({
      ok: false,
      error: "needs-install",
      needsInstall: true,
      hint: "尚未安裝依賴。請先執行：cd <skill-dir> && npm install。",
    }),
  );
  process.exit(1);
}

function hasApiKey() {
  if (process.env.PADLET_API_KEY) return true;
  try {
    const cfg = JSON.parse(
      readFileSync(path.join(os.homedir(), ".tw-edu-skills", "padlet", "config.json"), "utf8"),
    );
    return Boolean(cfg.apiKey);
  } catch {
    return false;
  }
}

const apiKey = hasApiKey();
const { openSession, inspectAuthAcrossPages, gotoReady, authManifest } = await import("./lib/session.mjs");
const PLATFORM = "padlet";
const DASHBOARD = /padlet\.com\/(dashboard|home)/;
const AUTH = authManifest({
  entryUrl: "https://padlet.com/dashboard",
  loginUrls: [/padlet\.com\/auth/i, /padlet\.com\/login/i],
  authenticatedUrlPatterns: [DASHBOARD],
  authenticatedLocators: [(p) => p.getByText(/製作|make|dashboard|看板/i)],
});

let context;
let page;
let session;
try {
  session = await openSession(PLATFORM, { mode: "cdp" });
  ({ context, page } = session);
  await gotoReady(page, "https://padlet.com/dashboard", { timeoutMs: 30000 });
  const auth = await inspectAuthAcrossPages(context, page, AUTH);
  const loggedIn = auth.state === "authenticated";
  console.log(
    JSON.stringify({
      ok: loggedIn || apiKey,
      apiKey,
      loggedIn,
      authState: auth.state,
      browserMode: session.browserMode,
      cdpEndpoint: session.cdpEndpoint,
      checkedUrl: auth.url,
      path: apiKey ? "rest+playwright" : "playwright",
      note: apiKey
        ? "偵測到 API key：seed 可走 REST；建板/權限/匯出仍走 Playwright（API 無法建空白板）。"
        : loggedIn
          ? "無 API key，走 Playwright 全路徑；已登入，可執行 node scripts/run.mjs <board.json> --stage prepare。"
          : "無 API key 且尚未登入。請先執行 node scripts/pw/login.mjs 由老師本人完成登入，再重跑 preflight。",
      ...(loggedIn || apiKey ? {} : { error: "not-logged-in" }),
    }),
  );
  if (!(loggedIn || apiKey)) process.exitCode = 1;
} catch (err) {
  console.log(
    JSON.stringify({
      ok: false,
      error: String(err?.message ?? err),
      hint: err?.code === "cdp-unavailable"
        ? "找不到教育平台專用正常 Chrome。請先執行 npm run browser:start。"
        : "無法連到 Padlet。請確認正常 Chrome 與網路後重試一次。",
    }),
  );
  process.exitCode = 1;
} finally {
  await context?.close();
}
