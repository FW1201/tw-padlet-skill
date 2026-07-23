---
name: tw-padlet-skill
description: Use when a teacher wants to seed or read a Padlet board via the official REST API — 種入貼文、讀看板、AI 配方建板。Triggers include Padlet, board.json, 看板, 貼文牆, 討論板, seed posts.
---

# tw-padlet-skill

只走 Padlet 官方 REST API（需付費方案的 API key），不做任何瀏覽器自動化或登入。API 沒有建空白看板的端點，只能用 AI 配方建板，或種貼文進老師自己先在 padlet.com 手動建好的既有看板。

## 首次使用

```bash
cd <skill-dir> && npm install
```

只在 `node_modules/` 不存在時執行。

## 設定 API key（必要，本 skill 無此 key 無法使用）

至 [padlet.com/dashboard/settings/developers](https://padlet.com/dashboard/settings/developers) 申請（需付費方案），然後：

```bash
export PADLET_API_KEY=...
# 或
mkdir -p ~/.tw-edu-skills/padlet && echo '{"apiKey":"..."}' > ~/.tw-edu-skills/padlet/config.json && chmod 600 ~/.tw-edu-skills/padlet/config.json
```

`node scripts/preflight.mjs` 確認 key 是否已設定（只檢查存在與否，不會讀出或顯示內容）。

## 工作流程

1. **前置檢查**：`node scripts/preflight.mjs` → `{ok:false, apiKey:false}` 時先引導老師設定 key。
2. **種貼文（一鍵）**：
   ```bash
   node scripts/run.mjs board.json --board-id <老師既有看板id>
   # 或用 AI 配方建立新看板：
   node scripts/run.mjs board.json --ai-prompt "討論光合作用對氣候的影響" --role teacher
   ```
   輸出 `boardId`/`url`/`added`/`failed`/`notes`——**這是外部寫入的確認點**：貼文會直接出現在看板上，`notes` 一定要轉述給老師（欄位對應失敗、非圖片附件渲染未經驗證等）。
3. **細部控制**（不需要 run.mjs 時）：
   - `node scripts/api/get-board.mjs <board-id>`：讀看板（含欄位、貼文數）。
   - `node scripts/api/list-posts.mjs <board-id>`：列貼文。
   - `node scripts/api/create-ai-board.mjs --prompt "..."`：AI 生成看板（唯一 API 建板端點，非同步輪詢約 2 分鐘）。
   - `node scripts/api/add-post.mjs <board-id> post.json`：加單篇貼文。
   - `node scripts/api/seed-board.mjs board.json (--board-id X | --ai-prompt "...")`：`run.mjs` 內部呼叫的就是這支。

4. **API 做不到的事，請老師直接到 padlet.com 手動處理**：建空白看板＋自訂版面/分欄名稱、訪客權限設定、匯出 PDF/CSV/Excel。

## 規則

- board id 是看板 URL 結尾 16-22 字元；`api/get-board.mjs` 可驗證。
- AI recipe board 內容不可控：建完先 `list-posts` 檢視再補種。
- 每支腳本輸出單行 JSON；`ok:false` 時照 `hint` 做。
- 貼文成功前會先讀回內容核對 subject/body/分欄是否與送出的一致；核對不符不算成功（見常見錯誤的 `post-write-verification-failed`）。
- 絕不輸出 API key。
- 這裡沒有任何瀏覽器/登入自動化——見下方「為什麼沒有瀏覽器自動化」。

## 常見錯誤

| 症狀 | 處理 |
|---|---|
| `MissingCredential` | 依 hint 引導老師設定 `PADLET_API_KEY` |
| `Padlet API 401/403` | key 無效或方案不含 API |
| `all-posts-failed` | 檢查 board id/欄位；`ok:false` 不可當成功回報 |
| `post-write-verification-failed` | Padlet 回報 2xx 但讀回內容不符：貼文可能未完整寫入。看 `verification.expected`/`actual` 診斷哪個欄位不符；請老師到看板手動確認/修正該則貼文，先確認是否真的沒建立成功再決定要不要重貼，避免重複貼文。 |
| schema 驗證失敗 | 錯誤含 zod issues；轉譯成老師聽得懂的欄位說明，不要原樣轉貼 |
