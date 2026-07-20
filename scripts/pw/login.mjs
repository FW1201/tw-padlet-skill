#!/usr/bin/env node
// Visible-browser login to Padlet; the teacher completes login/MFA personally.
// Session persists in ~/.tw-edu-skills/padlet/profile/.
// Usage: node scripts/pw/login.mjs   (allow up to ~6 minutes)
import { openSession, ok, failWithDiagnostics } from "../lib/session.mjs";

const PLATFORM = "padlet";
const LOGIN_URL = "https://padlet.com/auth/login";
const DASHBOARD = /padlet\.com\/(dashboard|home)/;
const WAIT_MS = 5 * 60 * 1000;

const { context, page } = await openSession(PLATFORM);
try {
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  if (!DASHBOARD.test(page.url())) {
    console.error("請在開啟的視窗完成 Padlet 登入（最多等 5 分鐘）…");
    await page.waitForURL(DASHBOARD, { timeout: WAIT_MS });
  }
  ok({ loggedIn: true, dashboardUrl: page.url() });
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
