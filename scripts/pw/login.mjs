#!/usr/bin/env node
// Visible-browser login to Padlet; the teacher completes login/MFA personally.
// Session persists in ~/.tw-edu-skills/padlet/profile/.
// Usage: node scripts/pw/login.mjs   (allow up to ~6 minutes)
import { openSession, ok, failWithDiagnostics, inspectAuth, waitForAuthenticated, gotoReady, authManifest } from "../lib/session.mjs";

const PLATFORM = "padlet";
const LOGIN_URL = "https://padlet.com/auth/login";
const ENTRY_URL = "https://padlet.com/dashboard";
const DASHBOARD = /padlet\.com\/(dashboard|home)/;
const WAIT_MS = 5 * 60 * 1000;
const AUTH = authManifest({
  entryUrl: ENTRY_URL,
  loginUrls: [/padlet\.com\/auth/i, /padlet\.com\/login/i],
  authenticatedUrlPatterns: [DASHBOARD],
  authenticatedLocators: [(p) => p.getByText(/製作|make|dashboard|看板/i)],
});

const { context, page } = await openSession(PLATFORM);
try {
  await gotoReady(page, ENTRY_URL, { timeoutMs: 30000 });
  const current = await inspectAuth(page, AUTH);
  if (current.state !== "authenticated") {
    await gotoReady(page, LOGIN_URL, { timeoutMs: 30000 });
    console.error("請在開啟的視窗完成 Padlet 登入（最多等 5 分鐘）…");
    const authenticated = await waitForAuthenticated(context, page, AUTH, WAIT_MS);
    ok({ loggedIn: true, authState: authenticated.state, dashboardUrl: authenticated.url });
  } else {
    ok({ loggedIn: true, authState: current.state, dashboardUrl: current.url });
  }
} catch (err) {
  await failWithDiagnostics(
    PLATFORM,
    page,
    `login-timeout: ${String(err?.message ?? err)}`,
    "5 分鐘內未偵測到登入完成。請重新執行 scripts/pw/login.mjs。",
  );
} finally {
  await context.close();
}
