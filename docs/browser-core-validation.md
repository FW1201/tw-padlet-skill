# Browser Core validation

- canary id: `CANARY-20260722T1647+0800`
- unit/static: 6/6 unit tests passed；all `scripts/*.mjs` passed `node --check`；`check:browser-core` passed；`git diff --check` passed。
- core parity: all four repositories produced the same Browser Core SHA-256 aggregate: `90770e6677e90584a959f369f0e4ebbfdf99dd89b21685cd88c56fe64622e90a`。
- readonly live preflight: Chromium launched only in escalated macOS GUI mode；Padlet returned `not-logged-in` with auth state `login-required` at the signup redirect；no API key was detected。
- external-write canary: pending because this session has no authenticated Padlet profile；board creation, section post placement, permission read-back persistence, export, and duplicate-write recovery were not attempted。
- handoff: run `node scripts/pw/login.mjs` for teacher-owned login/MFA, rerun preflight, then run a `CANARY-<timestamp>` fixture through prepare before any board/share/export write。
