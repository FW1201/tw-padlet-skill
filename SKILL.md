---
name: tw-padlet-skill
description: Use when a teacher wants to create, seed, share or export a Padlet board — 建立 Padlet 看板、種入貼文、設定訪客權限、匯出、AI 生成看板。Triggers include Padlet, board.json, 看板, 貼文牆, 討論板, seed posts, 分享連結.
---

# tw-padlet-skill

雙路徑操作 Padlet：**有 API key 走官方 API（優先），沒有走 Playwright**。兩者可混用——API 做不到的（建空白看板、訪客權限、匯出）一律走 Playwright。

## 首次使用

```bash
cd <skill-dir> && npm install && npx playwright install chromium
```

只在 `node_modules/` 不存在時執行。

## 路徑決策（每次任務先做）

1. 檢查是否已設定 key（**只檢查存在與否，絕不讀出、echo 或顯示內容**）：
   ```bash
   printenv PADLET_API_KEY >/dev/null && echo has-env || echo no-env
   ls ~/.tw-edu-skills/padlet/config.json 2>/dev/null && echo has-config || echo no-config
   ```
2. 都沒有 → 問老師：「你有 Padlet API key 嗎？（需付費方案，申請頁：padlet.com/dashboard/settings/developers）」有 → 請老師自行設定 env 或 config.json；沒有 → 走 Playwright 路徑。

| 需求 | 有 key | 無 key |
|---|---|---|
| 讀看板/貼文 | `api/get-board.mjs`、`api/list-posts.mjs` | 直接開 URL 看 |
| 建看板 | `api/create-ai-board.mjs`（僅 AI 生成，無空白板端點） | `pw/create-board.mjs`（可指定版面+欄位）|
| 種貼文 | `api/seed-board.mjs`（支援欄位對應、附件、顏色）| `pw/seed-posts.mjs`（不分欄、無附件，事後拖曳）|
| 加單篇貼文 | `api/add-post.mjs` | `pw/seed-posts.mjs` |
| 訪客權限/分享連結 | ❌ API 做不到 | `pw/set-sharing.mjs` |
| 匯出 PDF/CSV/Excel | ❌ API 做不到 | `pw/export-board.mjs` |

**推薦的混合鏈**（API 無空白板端點，建板一律走 pw）：`pw/create-board.mjs` 建板 → 種貼文（**有 key 用 `api/seed-board.mjs`，品質最好**；無 key 用 `pw/seed-posts.mjs`）→ `pw/set-sharing.mjs` 設權限。

⚠️ **走 pw 種貼文前必須先向老師預告品質折損**：不分欄（需事後拖曳）、貼文顏色遺失、media 附件不會變嵌入卡片。老師在意就建議申請 key。

`--visitor` 對應：`reader`＝只能看｜`commenter`＝可留言、不可新增貼文｜`writer`＝可新增貼文。

## 工作流程

1. Playwright 前置：`node scripts/pw/login.mjs`（timeout ≥360000ms；老師本人登入）。
2. 建板前先在對話中與老師確認：標題、版面（columns/wall/grid/stream/canvas）、欄位名稱。
3. 種貼文：`node scripts/api/seed-board.mjs board.json --board-id <id>`。輸出 `added/failed/errors/notes`——**unmatched 欄位與失敗貼文一定要轉述**。
4. 權限（外部寫入，先確認）：`node scripts/pw/set-sharing.mjs --board-url <url> --visitor commenter`。
5. 最終交付：分享連結（`shareUrl`）＋ 貼文統計。

## 規則

- board id 是看板 URL 結尾 16-22 字元；`api/get-board.mjs` 可驗證。
- AI recipe board 內容不可控：建完先 `list-posts` 檢視再補種。
- 每支腳本輸出單行 JSON；失敗照 `hint` 做，同一支 pw 腳本最多重試 1 次。
- 出現 `handoff`：把 `resumeUrl`/`screenshot` 交還老師。
- 絕不輸出 API key 或讀取瀏覽器 profile 內容。

## 常見錯誤

| 症狀 | 處理 |
|---|---|
| `MissingCredential` | 依 hint 引導老師設 key，或改走 pw 路徑 |
| `Padlet API 401/403` | key 無效或方案不含 API；改走 pw 路徑 |
| `all-posts-failed` | 檢查 board id/欄位；ok:false 不可當成功回報 |
| schema 驗證失敗 | 錯誤含 zod issues；轉譯成老師聽得懂的欄位說明，不要原樣轉貼。注意：schema 驗證先於憑證檢查，無 key 也能先驗檔案格式 |
| `selector-failure` | Padlet 改版；交還 resumeUrl 並回報更新 flow manifest |
