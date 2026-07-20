# Flow: create blank board (PW)

- version: 1
- entry URL: https://padlet.com/dashboard
- login detector: URL matches `padlet.com/(dashboard|home)`
- precondition: agent 已確認標題/版面/欄位
- declared steps: Make a padlet → blank board → 選版面 → 填標題（Enter）→ 逐欄改名/Add section
- success evidence: URL 轉為看板網址 `padlet.com/<user>/<slug>`；輸出 boardUrl
- cleanup plan: 欄位失敗不視為整體失敗（notes 回報）；建板本身失敗即 handoff
- fallback artifact: 無（老師手動建板約 2 分鐘）
- trace policy: 失敗截圖存 `~/.tw-edu-skills/padlet/diagnostics/`
- last-verified: PENDING

# Flow: seed posts (PW)

- entry: board URL；步驟：+ 按鈕 → 填 subject/body → Publish，逐篇
- 已知限制：不自動分欄、不上傳附件（notes 回報請老師拖曳/補附件）
- 連續 2 篇失敗且 0 成功 → composer-selector-failure handoff
- last-verified: PENDING

# Flow: set sharing (PW)

- entry: board URL；步驟：Share → Visitors with a link → 選 Reader/Commenter/Writer
- success evidence: 權限選項選中 + 取得 share link
- last-verified: PENDING

# Flow: export (PW)

- entry: board URL；步驟：Share → Export → 格式；等待 download 事件存檔
- last-verified: PENDING
