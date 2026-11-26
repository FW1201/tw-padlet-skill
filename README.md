<p align="center"><img src="assets/logo.png" width="88" alt="Padlet logo"></p>

# tw-padlet-skill 使用手冊

這是教師使用 Padlet 官方 REST API 的輔助工具，支援讀取看板、種入貼文、建立 Padlet AI recipe 看板，以及在既有貼文留下教師回饋。它不是 Padlet 官方產品，且不會使用瀏覽器自動化、登入、發布、指派或設定分享權限。

## 能力與限制

| 可以做 | 不能做（請在 Padlet 網站手動完成） |
|---|---|
| 讀取看板、貼文、貼文留言 | 建立指定版面或空白看板、建立欄位 |
| 種入單則／批次貼文 | 設定訪客權限、分享、發布、指派 |
| 新增單則／批次純文字教師留言 | 匯出 PDF、CSV 或 Excel |
| 以 AI recipe 建立新看板 | 代替教師判斷學生回饋或處理個資 |

所有會改變 Padlet 的命令都必須在每次執行時附上 `--confirm-write`。沒有旗標，工具會在讀取檔案、金鑰或連線前停止。此旗標代表真實寫入，並非模擬模式。

## 事前準備

需要 Node.js 18 以上與可使用官方 API 的 Padlet 方案。

```bash
cd <skill-dir>
npm install

# 擇一設定，絕不可把真實 key 放進 board.json、comment.json、版本庫、網址或聊天紀錄
export PADLET_API_KEY='...'
# 或：建立權限受限本機設定檔
mkdir -p ~/.tw-edu-skills/padlet
printf '%s' '{"apiKey":"..."}' > ~/.tw-edu-skills/padlet/config.json
chmod 600 ~/.tw-edu-skills/padlet/config.json

node scripts/preflight.mjs
```

前置檢查只回報金鑰是否存在，不會輸出金鑰。若失敗，請依 JSON 的 `hint` 修正；不要將 key 貼給 agent 或寫入教材資料。

## 先預覽、再確認、最後寫入

本工具沒有會連到外部服務的 dry-run。請使用下列唯讀命令作為安全預覽，再取得教師確認。任何寫入後，仍應到 Padlet 介面檢視呈現；這是驗證邊界，不能只看程式成功碼。

```bash
node scripts/api/get-board.mjs <board-id>
node scripts/api/list-posts.mjs <board-id>
node scripts/api/list-comments.mjs <board-id> <post-id>
```

`board-id` 是看板網址結尾的識別碼。先確認看板名稱、目標貼文、學生名單與回饋文字。針對學生的個別建議應先給教師草稿審閱，不應直接發布。

## 建立貼文與看板

`post.json` 範例：

```json
{
  "subject": "暖身討論",
  "body": "請用一句話描述你對光合作用的理解。",
  "section": "第一組"
}
```

確認後才執行：

```bash
node scripts/api/add-post.mjs <board-id> post.json --confirm-write
node scripts/run.mjs board.json --board-id <board-id> --confirm-write

# API 唯一的建板路徑：Padlet AI recipe。生成內容須由教師檢查。
node scripts/run.mjs board.json --ai-prompt "國中自然：光合作用討論" --role teacher --confirm-write
```

輸出中的 `ok:true`、`added` 與 `failed` 必須一起判讀。貼文會比對回傳內容的標題、本文與分欄；若出現 `post-write-verification-failed`，先開啟看板確認，絕不可直接重送。

## 教師留言

留言僅接收純文字，工具會跳脫 HTML 特殊字元，避免將輸入當作網頁標記。單筆 `comment.json`：

```json
{ "text": "請補上資料來源，並說明你選擇此答案的理由。" }
```

```bash
# 先讀目前留言，確認對象與是否已留言
node scripts/api/list-comments.mjs <board-id> <post-id>

# 再進行真實寫入
node scripts/api/add-comment.mjs <board-id> <post-id> comment.json --confirm-write
```

批次 `comments.json` 為陣列：

```json
[
  { "postId": "post_A", "text": "請補上資料來源。" },
  { "postId": "post_B", "text": "論點清楚，可再引用一項證據。" }
]
```

```bash
node scripts/api/seed-comments.mjs <board-id> comments.json --confirm-write
```

批次會一則一則送出，並跳過同一貼文中相同的既有留言與同批重複資料。建立後會核對回傳文字和所屬貼文。API 回應 429 時，工具立刻停止、不會自動重試，並回報 `retryAfterSeconds` 和已建立項目；等待後先重新列出留言，重新確認範圍，再以新的 `--confirm-write` 執行。

## 輸出與常見問題

所有命令輸出單行 JSON；只有 `ok:true` 才是可繼續的成功結果。

| 回應 | 意義與下一步 |
|---|---|
| `confirmation-required` | 尚未取得本次外部寫入確認；核對後加上 `--confirm-write`。 |
| `rate-limited` | 已停止，沒有自動重試；等待 `retryAfterSeconds` 後先唯讀檢查。 |
| `comment-write-verification-failed` | 回傳內容或所屬貼文不符，先到 Padlet 手動確認。 |
| `post-write-verification-failed` | 回傳貼文和原輸入不符，禁止盲目重送。 |
| `post-not-on-board` | 提供的貼文不在確認的看板中；未寫入，先用 `list-posts` 核對。 |
| 401／403／`MissingCredential` | API key 不存在、無效或無權限；設定／權限由教師管理，勿外洩 key。 |

## 維護與重新驗證

平台 API 可能變動。維護者更新時應先下載／閱讀當日 Padlet 官方 API 文件，確認 JSON:API 欄位、`POST /posts/{post_hashid}/comments` 的 `htmlContent`、回傳 comment 的 `relationships.post`，再更新測試。執行：

```bash
npm test
for f in scripts/lib/*.mjs scripts/api/*.mjs scripts/*.mjs; do node --check "$f"; done
git diff --check
```

這些測試全以 mock API 執行，不會寫入 Padlet。實際平台驗證必須另行取得教師同意，使用一次性測試內容並保持未發布／未指派狀態。

## 授權

MIT

## CLI 控制與下一輪錄製

```bash
tw-edtech-padlet doctor
tw-edtech-padlet validate --input board.json
tw-edtech-padlet plan --action post.create --resource <board-id>
```

貼文與留言仍優先使用官方 API；空白看板、版面、欄位、公開／分享、指派、成果與刪除改由下一輪 Canary 錄製建立 action map。API key 不得錄製或輸入 CLI 參數。所有寫入均以 `--confirm-write` 為第一道確認；公開、分享、批次、學生資料及刪除另需計畫碼與高風險確認。

## 跨 Agent 安裝診斷

安裝前執行 `node scripts/portable-core/agent-doctor.mjs --agent codex`，其他 Agent 可替換為 `claude`、`antigravity`、`opencode` 或 `other`。診斷結果中的 unknown 需在實際 Agent 與平台確認；詳見 [跨 Agent 指引](references/portable-integration.md)。核心只提供診斷和路由建議，不會自動安裝、登入或執行平台操作。

### 專案範圍安裝

執行 `node scripts/portable-core/install.mjs --agent codex --project <專案目錄>` 預覽；確認結果後加 `--apply`，將完整 Skill 複製到該 Agent 專案技能目錄。已有同名 Skill 時停止，絕不覆蓋；需要同時安裝套件時加 `--with-deps`，使用 `npm ci --ignore-scripts`；完成後重新載入 Agent 並檢查技能發現。安裝器不修改 MCP 設定或登入。

使用 `tw-edtech-padlet runtime --inventory inventory.json` 將本次 Agent 發現的工具與替代能力送入 CLI，回報動作路由；此命令唯讀，不會替宿主呼叫 connector。工具可見不代表帳號權限已驗證。

### Wildcard 教材契合檢查

依 [設計指引](references/wildcard-game-design.md) 整理教材來源片段、目標、操作與回饋，參考 `assets/wildcard-alignment.example.json`，執行 `node scripts/tw-edtech-padlet.mjs wildcard-check --input assets/wildcard-alignment.example.json`。此檢查不會讀取或上傳原始素材，不能證明平台已讀到內容；請以介面與生成結果核對。
