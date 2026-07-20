# tw-padlet-skill

台灣 K-12 教師用的 Padlet agent skill：雙路徑設計——有官方 API key（付費方案）走 REST API，沒有則以 Playwright 輔助操作網頁；API 缺口（建空白看板、訪客權限、匯出）一律由 Playwright 補位。

自 [edu-agent-kit](https://github.com/FW1201/edu-agent-kit) 的 Padlet adapter 獨立而來（來源 commit `a7eaa0f`）。

## 安裝

```bash
npx skills add FW1201/tw-padlet-skill
cd <skill-dir> && npm install && npx playwright install chromium
```

## API key（可選）

至 [padlet.com/dashboard/settings/developers](https://padlet.com/dashboard/settings/developers) 申請（需付費方案），然後：

```bash
export PADLET_API_KEY=...
# 或
mkdir -p ~/.tw-edu-skills/padlet && echo '{"apiKey":"..."}' > ~/.tw-edu-skills/padlet/config.json && chmod 600 ~/.tw-edu-skills/padlet/config.json
```

## 腳本

| 腳本 | 路徑 | 功能 |
|---|---|---|
| `api/get-board.mjs` | API | 讀看板（含欄位、貼文數） |
| `api/list-posts.mjs` | API | 列貼文（本地分頁） |
| `api/create-ai-board.mjs` | API | AI 生成看板（官方唯一建板端點，非同步輪詢） |
| `api/add-post.mjs` | API | 加單篇貼文（欄位 label 自動轉 id） |
| `api/seed-board.mjs` | API | 批次種貼文（欄位對應、部分失敗回報） |
| `pw/login.mjs` | PW | 可見視窗登入（session 存 `~/.tw-edu-skills/padlet/profile/`） |
| `pw/create-board.mjs` | PW | 建空白看板（版面+欄位） |
| `pw/seed-posts.mjs` | PW | 無 key 的種貼文路徑 |
| `pw/set-sharing.mjs` | PW | 訪客權限 + 分享連結 |
| `pw/export-board.mjs` | PW | 匯出 PDF/CSV/Excel/圖片 |

## 自動化邊界（ToS 風險控管）

- API 路徑：官方公開 API，完全合規。
- Playwright 路徑：可見瀏覽器、使用者本人帳號與內容；登入/MFA 由使用者親自完成；外部寫入（建板、改權限）前 agent 需在對話中確認；選擇器失敗零重試、截圖、交還人工；cookies 只存本機 Chromium profile。
- 有官方 API 可用的操作一律優先 API。

## Playwright 流程狀態

`references/flow-*.md` 記錄各流程步驟與成功證據；`last-verified: PENDING` 表示尚未以真實帳號驗證，失敗時會安全停止。

## License

MIT
