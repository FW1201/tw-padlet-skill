/**
 * Every command that can create a Padlet resource must call this before it
 * reads input, resolves credentials, or makes a request.  The flag is an
 * explicit per-run human checkpoint, not a remembered preference.
 */
export function requireConfirmWrite(argv = process.argv, out = console.log) {
  if (argv.includes("--confirm-write")) return true;
  out(
    JSON.stringify({
      ok: false,
      error: "confirmation-required",
      hint: "這是外部寫入。確認目標看板、貼文與內容後，重新執行並加入 --confirm-write。",
    }),
  );
  return false;
}
