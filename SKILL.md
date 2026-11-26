---
name: tw-padlet-skill
description: Design and create Padlet boards, Sandbox collaboration, Arcade activities, or Wildcard games using available connectors, official API, or browser workflows; verify content and sharing.
---

## Codex connector 實作路徑

在目前 Agent 工具清單中發現並直接使用平台 connector；先讀工具描述與實際 schema，不依 CLI 推測支援。Padlet connector 可建立白板與 Arcade 配對遊戲；Wayground connector 可建立選擇題與閃卡草稿。每次建立後讀回或以平台編輯頁核對，呈現資源連結和實際存取狀態；connector 能力與 REST CLI 的限制須分開描述。未在工具清單發現功能時，依既有匯入或 Computer Use 流程處理。

使用平台特有模式時，先查閱 [模式與驗證指引](references/platform-modes.md)。以 [教學 brief 範例](assets/lesson-brief-v1.example.json) 定義年級、來源、目標、活動、時間和玩家回饋；用既有 CLI 的 `lesson --input <brief.json>` 檢查時間及來源關聯，結果不取代教師審查。

## Wildcard：以玩家行動設計

處理 Wildcard 時，必讀 [Wildcard 情境遊戲設計與驗收](references/wildcard-game-design.md)：把教材轉成玩家身分、核心操作、可見狀態、選擇後果、回饋與重試，先建立教材片段、學習目標與關卡的對應表，分別核對 Agent 讀取、平台附件與遊戲呈現；依素材填寫可直接提交的提示詞，必要時執行 `wildcard-check --input <對應表.json>` 檢查來源結構；除非使用者指定測驗，不以連續答題代替遊戲循環。建立後確認生成完成，核對教材與設計的對應及可見內容，並分別回報已驗證與未測項目；依使用者指定範圍決定是否試玩，不反覆測試遊戲機制。

## 跨 Agent 環境與工具發現

首次安裝前及需要外部平台操作前，執行 `node scripts/portable-core/agent-doctor.mjs --agent codex`；可將 codex 換為 claude、antigravity、opencode 或 other。診斷不會讀出或測試金鑰；unknown 不是可用。依診斷提示與當前 Agent 工具清單檢查 connector/MCP、權限、瀏覽器與登入，不能由本機 CLI 是否存在推論工具可用。詳見 [跨 Agent 與模式指引](references/portable-integration.md)。

連接器與 MCP 路徑僅在當前工具庫確認操作、權限與使用者需求後使用；使用具體工具前確認其參數及輸出。原有下方 CLI 與人工流程、品質檢查及外部寫入限制仍適用於原工具；不能宣稱未測試的工具路徑已完成。完成後讀回並區分草稿、發布及分享狀態。

# Padlet 教師看板 API

既有腳本路徑使用 Padlet 官方 REST API；Codex 等 Agent 若提供 Padlet connector，可依工具清單另行使用其支援的功能。既有 API CLI 的外部寫入仍須遵循 `--confirm-write` 與既有核對規則。

## 使用時機與限制

- 適用：讀取既有看板／貼文、在既有貼文加入教師留言、批次種貼文，或用 Padlet AI recipe 建立新看板。
- 既有 REST 腳本不提供建立指定版面或空白看板、欄位及分享設定；這些功能若由目前 Agent 的 Padlet connector 提供，可按實際工具能力操作並讀回。
- 僅在既有 REST API 腳本路徑需要 `PADLET_API_KEY`（依帳號方案確認）；使用 Agent connector 不應預設需要這把 key。該金鑰只能置於環境變數或 `~/.tw-edu-skills/padlet/config.json`（`chmod 600`）；不可放入 JSON、提示詞、網址、輸出或紀錄。

## 錄製後的 API 動作

教師以 Record-a-Skill 提供可檢視錄製後，才可依 [recorded-action-handoff.md](references/recorded-action-handoff.md) 將錄到的唯讀與確認節點接回 API 工作流；錄製本身不等於未來寫入授權。

## 固定工作流

以下是既有 REST CLI 路徑；connector 路徑依本次工具 schema 及使用者授權執行。

1. 先確認看板、貼文、留言對象與文字；涉及學生個人回饋時，先提供草稿而不是直接寫入。
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

## CLI 教學帳戶控制

`tw-edtech-padlet` 提供與其他四套相同的 `doctor`、`catalog scan`、`validate`、`plan`、`run`、`verify` 契約。官方 API 已支援的貼文與留言優先走現有 API；版面、分享、可見度、指派與刪除等 UI 動作，必須等教師錄製 Canary action map 後才能執行。

```bash
tw-edtech-padlet doctor
tw-edtech-padlet plan --action post.create --resource <board-id>
```

所有 API 寫入仍需 `--confirm-write`；分享、公開、指派、批次、學生資料與刪除還需要計畫確認碼與 `--confirm-impact`。API key 不得傳給 CLI 計畫、錄製、日誌或 Agent；429、讀回不符與權限問題一律停止，不自動重送。
