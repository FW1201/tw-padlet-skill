# Flow: create blank board (PW)

- version: 2（2026-07-22 live 驗證後更新）
- entry URL: https://padlet.com/dashboard
- login detector: URL matches `padlet.com/(dashboard|home)`
- precondition: agent 已確認標題/版面/欄位
- declared steps（真實驗證，zh-TW 帳號）：
  1. 點頂部「製作」連結（`getByRole("link",{name:/^\+?\s*製作$/})`）——**不是**按鈕角色，且**沒有**中介的「blank board」選擇畫面，直接進版面選擇網格
  2. 選版面：9 種官方選項 電子牆/欄位/故事看板/表格/自由格式/行系列/時間表/清單/地圖（`Board.format` schema 只涵蓋前 5 種對應）
  3. 建板後自動彈出「新看板」設定面板，需點「已完成」關閉才能操作畫布
  4. 標題：優先找設定面板的 input，找不到則退回點畫布 H1 → cmd+a → type → Enter
  5. 區段改名：點區段標題（heading role「區段 N」）→ 變成可編輯 input（舊文字已預選）→ 輸入新名 → **必須點「已完成」按鈕確認**（單獨按 Enter 不會確認，只是換行/收合鍵盤但仍停在編輯態，已 live 驗證）
  6. 新增區段：按鈕文字「新增區段」（不是「新增區塊」）
- success evidence: URL 轉為看板網址 `padlet.com/<user>/<slug>`；輸出 boardUrl
- cleanup plan: 欄位失敗不視為整體失敗（notes 回報）；建板本身失敗即 handoff
- fallback artifact: 無（老師手動建板約 2 分鐘）
- trace policy: 失敗截圖存 `~/.tw-edu-skills/padlet/diagnostics/`
- **last-verified: 2026-07-22**（步驟 1-3, 5-6 已用真實帳號逐步驗證；步驟 4 的設定面板 title input 為推測，未實測是否可寫入，有 fallback）
- capability-status: provisional（board URL/title/layout evidence；title panel input still needs live confirmation）

# Flow: seed posts (PW)

- version: 2（2026-07-22 live 驗證後更新）
- entry: board URL
- declared steps：
  1. 每區段有獨立「在這個區段新增貼文」按鈕（accessible name 含「新增貼文」），點擊後彈出**浮動編輯器**（畫面右下角，非模態視窗）
  2. 編輯器欄位：主題 placeholder="主題"、內容 placeholder="寫點美好的內容..."
  3. 確認送出按鈕文字「發布」（注意：跟外層觸發鈕「張貼」文字不同，不要混用）
  4. 編輯器底部有「§ 區段名稱」顯示/可切換目前歸屬區段——**貼文確實會落在觸發按鈕所屬的區段**（已驗證分欄正確，不是原先假設的「不分欄」）
- 已知限制：不自動上傳附件（media 貼文的 URL 需人工補上）；顏色設定未實測
- success evidence: 貼文卡片出現在正確區段下方，含作者/時間戳
- 連續 2 篇失敗且 0 成功 → composer-selector-failure handoff
- **last-verified: 2026-07-22**（完整測試 1 篇貼文成功發布並正確歸屬區段）
- capability-status: provisional（section placement verified；attachments and colors remain manual fallback）

# Flow: set sharing (PW)

- version: 2（2026-07-22 live 驗證後更新）
- entry: board URL
- declared steps：
  1. **不是**頂部「分享」按鈕（那個只有複製連結/QR code）——要點旁邊的**齒輪設定圖示**
  2. 開啟「分享此看板」完整面板，內有「權限」區塊：「擁有連結的訪客」下拉選單
  3. 下拉選單展開後有 **5 個選項**（不是原先假設的 3 個）：
     - 無存取權限（No access）：僅共同作業者可看
     - 讀者（Reader）：可存取並閱讀貼文
     - 留言者（Commenter）：可對貼文留言和加反應
     - 作者（Author，**預設值**）：可寫新貼文
     - 審核者（Approver）：可撰寫、編輯、核准貼文
- success evidence: 選項被選中 + 面板內複製連結欄位可取得 share link
- **last-verified: 2026-07-22**（完整展開驗證 5 個選項文字與說明；未實測點選後的送出/生效流程）
- capability-status: pending（permission read-back added；live persistence confirmation still required）

# Flow: export (PW)

- entry: board URL；步驟：齒輪設定 → 分享此看板面板 → 頂部「匯出 PDF」標籤（同一面板內，非另外的 Share 選單）
- last-verified: PENDING（未實測）
- capability-status: pending（keep pending until export output is verified live）
