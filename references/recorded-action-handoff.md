# Record-a-Skill 動作銜接：Padlet

Padlet 仍以官方 REST API 為唯一寫入路徑；未收到錄製前不得以瀏覽器流程取代 API，也不得要求 API key、Cookie 或登入資訊。

錄製可涵蓋 `preflight`、唯讀 get/list 與每次寫入前的人工確認。每個真實寫入命令仍必須由教師在當次命令明確加入 `--confirm-write`；錄製不能預先授權未來寫入。寫後要讀回核對，429 立即停止且不重送。

分享權限、公開／訪客設定、發布、指派、學生個人資料與任何 UI 側的權限改動不在自動化範圍。

