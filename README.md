# tw-padlet-skill

> ⚠️ **非官方工具**：本套件的 REST 路徑使用 Padlet **官方公開 API**（需付費方案的 API key，完全合規）；Playwright 路徑則以自動操作官方網頁 UI 補 API 缺口（建空白看板、訪客權限、匯出），該路徑**非**官方認可整合、受 Padlet 服務條款約束。請以老師本人帳號、由本人完成登入，操作自己的內容，風險自負。有官方 API 可用的操作一律優先 API。

台灣 K-12 教師用的 Padlet agent skill：**雙路徑**——有 API key 走 REST，沒有則以 Playwright 操作網頁。一句話就能把貼文 JSON 一路做到「建看板 → 種貼文 → 設定訪客權限 → 回傳分享連結」。

自 [edu-agent-kit](https://github.com/FW1201/edu-agent-kit) 的 Padlet adapter 獨立而來（來源 commit `a7eaa0f`）。

## 這套 skill 能做什麼

老師把看板內容（標題、版面、欄位、種子貼文）給 agent，agent 就能：建立看板 → 種入貼文 → 設定訪客權限（讀者/留言者/作者…）→ 回傳分享連結。唯二人工點：**登入**（無 API key 時）、**訪客權限確認**（對外可見度變更）。

## 快速上手（一鍵流程，推薦）

```bash
cd <skill-dir> && npm install && npx playwright install chromium   # 首次

node scripts/preflight.mjs                              # 確認依賴/API key/登入
node scripts/pw/login.mjs                               # 若無 key 且未登入，老師本人登入一次
node scripts/run.mjs board.json --stage prepare         # 建看板+種貼文，回傳 boardUrl
# ⇧ agent 跟老師確認訪客權限後：
node scripts/run.mjs board.json --stage deliver \
  --board-url <boardUrl> --visitor commenter            # 設定權限，回傳分享連結
```

> `board.json` 欄位：`title`、`format`（版面）、`sections[]`、`seedPosts[]`。建看板一律走 Playwright（REST 無法建空白板）；種貼文預設走 Playwright，有 key 時亦可用 `api/seed-board.mjs --board-id`。

## 自然指令範例

| 老師說 | 觸發 |
|---|---|
| 「把這些討論題種到一個欄位看板、開放學生留言」 | `run.mjs … --visitor commenter` |
| 「用 AI 幫我生一個討論看板」 | `api/create-ai-board.mjs`（需 API key） |
| 「把這個看板匯出成 PDF」 | `pw/export-board.mjs --format pdf` |

## 功能總覽

| 腳本 | 路徑 | 用途 |
|---|---|---|
| `scripts/preflight.mjs` | — | 前置檢查（依賴/API key/登入） |
| `scripts/run.mjs` | PW | **一鍵串接器**（prepare 建板+種貼文 / deliver 設權限） |
| `api/get-board.mjs` / `list-posts.mjs` | API | 讀看板 / 列貼文 |
| `api/create-ai-board.mjs` | API | AI 生成看板（官方唯一建板端點，非同步輪詢） |
| `api/add-post.mjs` / `seed-board.mjs` | API | 加單篇 / 批次種貼文（需 `--board-id`） |
| `pw/login.mjs` | PW | 可見視窗登入 |
| `pw/create-board.mjs` | PW | 建空白看板（版面+欄位） |
| `pw/seed-posts.mjs` | PW | 無 key 的種貼文路徑 |
| `pw/set-sharing.mjs` | PW | 訪客權限 + 分享連結 |
| `pw/export-board.mjs` | PW | 匯出（**PDF 已確認**；CSV/Excel/圖片入口尚未 live 驗證，屬 provisional） |

## API key（可選）

至 [padlet.com/dashboard/settings/developers](https://padlet.com/dashboard/settings/developers) 申請（需付費方案），然後：

```bash
export PADLET_API_KEY=...
# 或
mkdir -p ~/.tw-edu-skills/padlet && echo '{"apiKey":"..."}' > ~/.tw-edu-skills/padlet/config.json && chmod 600 ~/.tw-edu-skills/padlet/config.json
```

## 自動化邊界（ToS 風險控管）

- API 路徑：官方公開 API，完全合規；金鑰只在腳本內部讀取，絕不 echo/輸出。
- Playwright 路徑：可見瀏覽器、老師本人帳號與內容；登入/MFA 親自完成；外部寫入（建板、改權限）前 agent 需在對話中確認；選擇器失敗零重試、截圖、交還人工；cookies 只存本機 Chromium profile。

## License

MIT
