# 測試情境（API 正確性——2026-07-23 大型縮減後改寫）

本文件原本記錄雙路徑（API + Playwright）的 RED/GREEN/REFACTOR TDD 過程，含 pw 建板/權限/匯出的規劃情境。Playwright 路徑已整個移除（見 README「為什麼沒有瀏覽器自動化」），歷史脈絡保留在 git log，不在此重述。

現在 `scripts/api/*.mjs` + `scripts/lib/padlet-client.mjs` 是唯一產品面。測試情境改為關注 **API client 對官方規則的正確性**，可執行測試見 `tests/padlet-client.test.mjs`（`npm test` 執行，node:test + node:assert，用 mock fetch，無需真實網路/帳號）。

## 涵蓋情境

1. **空字串→null 轉換**（本輪修的真實 bug）：`buildPostPayload` 的 `body`/`subject` 為空字串時要轉成 `null`——Padlet 官方文件記載字串欄位不可用空字串，先前有這條規則但未真正實作。非空字串維持不變。
2. **attachment 欄位組裝**：`media` 存在時要正確組出 `{url, caption}` 形狀。
3. **輪詢容錯**（本輪修的真實 bug）：`createAiBoardAndWait` 單次網路抖動（fetch 拋錯）不應中止整個等待，應繼續重試；只有明確拿到 `status: "failed"` 才立即中止（不耗盡剩餘重試次數）。
4. **前置檢查**：`preflight.mjs` 純檢查 `PADLET_API_KEY`/config.json 是否存在，`ok:false` 時不可洩漏任何 key 內容。

## 何時要補測試

`padlet-client.mjs` 新增任何官方文件記載但先前未實作的規則時，`padlet-client.test.mjs` 至少要補一組「規則生效」的測試——本輪的空字串轉換就是這類「知道規則但沒寫進程式碼」的落差，容易在下一次修改時又漏掉。
