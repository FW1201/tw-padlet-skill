# API 完整度 backlog（2026-07-23 大型縮減後改寫；2026-07-23 v0.3.1 修正讀回 bug）

> ✅ **v0.3.1**：修正真實帳號實測發現的讀回 bug——`buildPostPayload` 的寫入 payload 一直是對的（已對照官方文件 `docs.padlet.dev/reference/add-post` 逐字確認），但 `list-posts.mjs` 讀回時用了錯的欄位名稱：Padlet 回應把貼文內容放在 `content.bodyHtml`（不是 `content.body`），導致回讀永遠顯示空白，跟寫入是否成功無關。`addPost()` 現在會在寫入後立刻讀回核對 subject/body/分欄，不符就 fail-closed（見 `verifyPostWrite`/`PostVerificationError`），不再只憑 HTTP 2xx 判定成功。

> ⚠️ **範圍變更**：本 skill 已拿掉整個 Playwright/瀏覽器自動化層（登入、建空白看板、訪客權限、匯出全部移除），只剩 `scripts/api/*.mjs` 走官方 REST API。以下只保留「API client 還能補的官方規則細節」——需要操作 Padlet 網頁 UI 才有意義的舊項目（AI 配方系統的 4 分頁 UI 流程、匯出格式探索、內容匯入來源、共同作業者邀請、隱私選項、貼文留言/反應、Sandbox 類別）已隨自動化層一起移除，不再是這個 skill 的範圍。

## 已完成（本輪）

- ✅ **空字串→null 轉換**：`buildPostPayload` 的 `body`/`subject` 為空字串時正確轉成 `null`（Padlet 官方文件早有記載但先前未實作的落差）。
- ✅ **輪詢容錯**：`createAiBoardAndWait` 單次網路抖動不再中止整個 ~2 分鐘等待。
- ✅ **非圖片附件警告**：`add-post.mjs`/`seed-board.mjs` 對 `media.kind !== "image"` 明確警告需人工檢查渲染結果，而非假裝完全支援。
- ✅ `run.mjs`/`preflight.mjs` 縮減為純 API 版本，無 CDP/browser 依賴。

## 還能做的 API 細節（下一輪參考）

1. **attachment 的 kind-specific 處理**：目前所有 `media.kind` 一律組成同一種 `{url, caption}` 附件形狀；Padlet 官方文件對 video/audio/link/drive_file/youtube 各自的渲染行為未完整記載，若未來能取得更詳細的官方文件，應改用 kind-specific 的欄位處理而非目前的統一警告。
2. **`resolveSeedSections` 的欄位對應演算法**：目前用精確字串比對區塊名稱，未涵蓋常見誤植（全形/半形空格、大小寫）——可加入更寬鬆的模糊比對，但要避免誤配對到錯誤區塊。
3. **AI recipe board 的 role/workspaceId 參數覆蓋率**：目前 `create-ai-board.mjs` 只暴露 `--role`/`--workspace-id`，若官方 API 之後開放更多 AI 生成參數（如年級/討論類型），可對映擴充。

## 已隨自動化層移除、不再適用

以下項目原本假設有 Playwright 操作 Padlet UI，拿掉登入機制後已無實作基礎，不列入此 skill 未來範圍——**這也是本輪對使用者確認過、可接受的能力縮減**：
- 建立指定版面/自訂分欄名稱的空白看板（API 唯一建板端點是 AI 配方，內容方向由 AI 決定）
- 訪客權限設定（reader/commenter/author/approver 等 5 級）
- 匯出 PDF/CSV/Excel/圖片
- AI 配方系統的完整 4 分頁 UI 流程（產生/設定/張貼/分享）——API 版的 `create-ai-board.mjs` 只對應「產生」分頁的核心能力（主題→建板），較豐富的年級快選/討論類型單選等 UI 專屬體驗無 API 對應
- 內容匯入來源（Google Slides/PDF 匯入）、共同作業者邀請、隱私選項（密碼/要求登入）、貼文留言/反應、Sandbox 類別、投影片模式
