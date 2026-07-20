# 測試情境（superpowers:writing-skills TDD）

## RED baseline（2026-07-21，無 skill）

情境：「用 board.json 在 Padlet 建三欄看板、種 4 篇貼文、訪客可留言不可新增、給我分享連結。」

觀察到的 baseline 失敗（general-purpose subagent，無 skill、無憑證）：
1. 花 15 次工具呼叫（含打真實 API 收 401、抓 OpenAPI 文件）才確認 API 能力邊界——skill 應把這些知識內建。
2. 原以為有 `POST /v1/boards` 可建板，被文件推翻；也發現無建 section 端點。
3. 訪客權限（Commenter）確認 API 完全做不到，只能請老師手動。
4. 最終只能產出「請老師自己建板+申請 key」的半自動腳本。

→ skill 必須提供：API 能力矩陣與雙路徑決策、現成 client（含 section label→id 對應、部分失敗回報）、pw 補位（建板/權限/匯出）。

## GREEN 驗證情境（安裝 skill 後）

S1（路徑決策）：無 key 環境，「幫我建這個看板」→ 期望：檢查 key（不讀內容）→ 問老師有無 key → 說明兩路徑並依答案選擇。
S2（API seed）：有 key + board-id →期望：跑 api/seed-board.mjs，轉述 added/failed/unmatched notes。
S3（負向）：壞 board.json / 無 key 直接跑 API 腳本 → 期望：轉述 hint（引導設 key 或改 pw 路徑），無 stack trace、key 永不出現在輸出。

## GREEN 結果（2026-07-21）

- S1：PASS —— 正確做存在性檢查（未讀內容）、詢問老師、給出雙路徑建議與推薦組合。
- S3：PASS —— MissingCredential hint 正確轉述；壞 JSON 得 schema 提示。
- S2 / pw 腳本：需真實 key 與帳號，列入 live 驗證清單（flow-*.md last-verified: PENDING）。

## REFACTOR（依 GREEN 回饋修補，2026-07-21）

1. 「推薦組合（有 key）」改寫為「推薦的混合鏈」，明講建板一律走 pw（API 無空白板端點）。
2. SKILL.md 附安全的 key 存在性檢查指令範例（printenv/ls），避免各 agent 自己發明寫法誤觸 danger-guard hook。
3. seed-board.mjs 的 zod 錯誤改出專屬 hint（點名壞欄位），不再與 board-id/網路混在一起。
4. 常見錯誤表補「schema 驗證失敗」列＋「驗證先於憑證檢查」說明。
5. pw 種貼文的品質折損（不分欄/無顏色/無嵌入附件）升級為「必須先向老師預告」的硬規則；補 `--visitor` 三值中文對應。
6. 觸發測試需在全新 session 驗證。
