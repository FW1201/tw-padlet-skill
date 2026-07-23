---
name: tw-padlet-skill
description: Use when teachers need to inspect a Padlet board, seed approved posts, or add teacher feedback through Padlet's official REST API, especially when API-key safety, duplicate comments, rate limits, or an explicit external-write confirmation are required.
---

# Padlet 教師看板 API

本 Skill 僅使用 Padlet 官方 REST API；不使用瀏覽器自動化、不登入、不發布、不調整分享權限。核心原則是：先讀取與確認，只有老師明確確認後才以 `--confirm-write` 寫入。

## 使用時機與限制

- 適用：讀取既有看板／貼文、在既有貼文加入教師留言、批次種貼文，或用 Padlet AI recipe 建立新看板。
- 不適用：建立指定版面或空白看板、建立欄位、設定訪客權限、匯出、指派或發布；請教師直接在 padlet.com 完成。
- 需要付費方案的 `PADLET_API_KEY`。金鑰只能置於環境變數或 `~/.tw-edu-skills/padlet/config.json`（`chmod 600`）；不可放入 JSON、提示詞、網址、輸出或紀錄。

## 固定工作流

1. 先請教師確認看板、貼文、留言對象與文字；涉及學生個人回饋時，先提供草稿而不是直接寫入。
2. 執行 `node scripts/preflight.mjs`，再用 `get-board`、`list-posts` 或 `list-comments` 檢查目標。這些是唯讀操作。
3. 顯示將寫入的內容與範圍，取得本次明確同意。
4. 寫入命令必須加入 `--confirm-write`。沒有此旗標時，程式會在讀檔、讀取金鑰和網路請求前停止。
5. 讀取 JSON 回應：僅 `ok:true` 且驗證通過才算成功。保留輸出與原始資料，並由教師到 Padlet 檢視實際呈現。

目前沒有「模擬但仍連線」的 dry-run；唯讀命令是唯一安全預覽。`--confirm-write` 是真實外部寫入的界線，不能當成 dry-run。

## 留言

留言輸入一律為純文字 JSON，例如 `{"text":"請補上資料來源。"}`。程式會將特殊字元安全轉成 HTML，建立後比對 Padlet 回傳的內容與所屬貼文；不符即失敗，絕不自動重送。

```bash
# 唯讀
node scripts/api/list-comments.mjs <board-id> <post-id>

# 單則留言（真實寫入）
node scripts/api/add-comment.mjs <board-id> <post-id> comment.json --confirm-write

# 批次留言 JSON 是 [{"postId":"...","text":"..."}]
node scripts/api/seed-comments.mjs <board-id> comments.json --confirm-write
```

批次為序列寫入；同一貼文、同一正規化文字的既有留言或同批重複資料會跳過。HTTP 429 會立刻停止，不重試，輸出 `retryAfterSeconds` 與已建立數；等待後先再列出留言，才由教師重新確認執行。

## 貼文／看板

```bash
node scripts/api/get-board.mjs <board-id>
node scripts/api/list-posts.mjs <board-id>
node scripts/api/add-post.mjs <board-id> post.json --confirm-write
node scripts/run.mjs board.json --board-id <board-id> --confirm-write
node scripts/run.mjs board.json --ai-prompt "課程討論主題" --confirm-write
```

`run.mjs`、`add-post.mjs`、`seed-board.mjs` 與 `create-ai-board.mjs` 都同樣必須有 `--confirm-write`。貼文的 subject、body、欄位讀回不符時不算成功；先人工確認再決定是否重送，避免重複貼文。

## 失敗處理

| 回應 | 處理 |
|---|---|
| `confirmation-required` | 先確認目標與內容，再明確加入 `--confirm-write`。 |
| `rate-limited` | 不重試；等待 `retryAfterSeconds`，重新讀取，再取得確認。 |
| `*-write-verification-failed` | 先到 Padlet 檢查，禁止自動或盲目重送。 |
| `post-not-on-board` | 提供的貼文不在已確認看板；未寫入，先用 `list-posts` 核對。 |
| `MissingCredential`、401、403 | 只引導設定或檢查權限；不可要求貼出 API key。 |
