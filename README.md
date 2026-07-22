<p align="center"><img src="assets/logo.png" width="88" alt="Padlet logo"></p>

# tw-padlet-skill

> ⚠️ **非官方工具**：本套件**不是** Padlet 官方產品。它使用 Padlet **官方公開 REST API**（需付費方案的 API key，完全合規），不做任何瀏覽器自動化或登入。

台灣 K-12 教師用的 Padlet agent skill：只走官方 REST API，一句話把貼文 JSON 種進 Padlet 看板（既有看板或 AI 配方新建）。

自 [edu-agent-kit](https://github.com/FW1201/edu-agent-kit) 的 Padlet adapter 獨立而來（來源 commit `a7eaa0f`）。

## 這套 skill 能做什麼

老師把看板內容（種子貼文）給 agent，agent 透過官方 API 種入既有看板（老師先在 padlet.com 手動建好、給 board id），或用 AI 配方直接生成一個新看板再種貼文。

⚠️ **能力邊界**：Padlet 官方 API 沒有「建立指定版面/自訂分欄名稱的空白看板」端點——這是 Playwright 才做得到的事，本輪已拿掉。同樣沒有 API 的還有訪客權限設定與匯出，這些請老師直接在 padlet.com 手動處理。

## 快速上手

```bash
cd <skill-dir> && npm install                                    # 首次
export PADLET_API_KEY=...                                        # 見下方申請方式
node scripts/preflight.mjs                                       # 確認 key 已設定
node scripts/run.mjs board.json --board-id <既有看板id>
# 或用 AI 配方直接新建看板：
node scripts/run.mjs board.json --ai-prompt "討論光合作用對氣候的影響"
```

## 自然指令範例

| 老師說 | 觸發 |
|---|---|
| 「把這些討論題種到我這個看板」 | `run.mjs board.json --board-id <id>` |
| 「用 AI 幫我生一個討論看板並種入這些內容」 | `run.mjs board.json --ai-prompt "..."` |
| 「這個看板現在有哪些貼文？」 | `api/list-posts.mjs <board-id>`（唯讀） |

## 功能總覽

| 腳本 | 用途 | 輸入 | 輸出 |
|---|---|---|---|
| `scripts/preflight.mjs` | 前置檢查（API key 是否已設定） | — | `{ok, apiKey}` |
| `scripts/run.mjs` | 一鍵種貼文（既有看板或 AI 配方新建） | `board.json --board-id\|--ai-prompt` | boardId/url/added/failed |
| `scripts/api/get-board.mjs` | 讀看板（含欄位、貼文數） | `<board-id>` | 看板資料 |
| `scripts/api/list-posts.mjs` | 列貼文 | `<board-id>` | 貼文陣列 |
| `scripts/api/create-ai-board.mjs` | AI 生成看板（唯一 API 建板端點） | `--prompt` | boardId/url |
| `scripts/api/add-post.mjs` | 加單篇貼文 | `<board-id> post.json` | postId/url |
| `scripts/api/seed-board.mjs` | 批次種貼文（`run.mjs` 內部呼叫） | `board.json` | added/failed/notes |

## API key（必要）

至 [padlet.com/dashboard/settings/developers](https://padlet.com/dashboard/settings/developers) 申請（需付費方案），然後：

```bash
export PADLET_API_KEY=...
# 或
mkdir -p ~/.tw-edu-skills/padlet && echo '{"apiKey":"..."}' > ~/.tw-edu-skills/padlet/config.json && chmod 600 ~/.tw-edu-skills/padlet/config.json
```

## 為什麼沒有瀏覽器自動化

這套 skill 原本是雙路徑：有 API key 走官方 API，沒有則以 Playwright 操作網頁補 API 缺口（建空白看板、訪客權限、匯出）。Playwright 路徑一樣受「Google OAuth 拒絕自動化瀏覽器、選擇器驅動的 UI 自動化不穩定」的問題所苦。現在只保留完全合規、不需要瀏覽器的官方 API 路徑；API 做不到的事（建自訂版面空白看板、訪客權限、匯出）明確列為能力邊界，交給老師手動處理，不再嘗試用瀏覽器自動化補位。

## License

MIT
