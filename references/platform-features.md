# Padlet 官方功能調查（2026-07）

## 官方 API（docs.padlet.dev；需付費方案）

- Base：`https://api.padlet.dev/v1`，JSON:API，`X-API-KEY` header，寫入 content-type `application/vnd.api+json`。
- 端點：GET board（include posts/sections/comments）、POST posts、POST comments、POST reactions、GET attachment、GET current user、GET organization、POST ai-recipe-boards + GET status（非同步，30s–3min）。
- 限制：無空白建板端點（唯一建板路徑是 AI recipe board）、無建 section 端點、無看板設定/權限/匯出端點、字串不可用空字串（用 null）。

## 網頁 UI（Playwright 補位範圍）

- 建板：Make a padlet → 版面（Wall/Shelf(columns)/Grid/Stream/Canvas）→ 標題/描述/背景/欄位。
- 分享：Share 選單 → Visitors with a link 權限（No access/Reader/Commenter/Writer）→ 連結/QR code。
- 匯出：Share → Export（image/PDF/CSV/Excel）。

來源：
- https://docs.padlet.dev/
- https://padlet.help/l/en/article/typfdby7fn-how-to-share-or-publish-a-padlet
- https://padlet.help/l/en/article/l2d9pcbd9i-privacy-settings
