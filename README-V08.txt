電子抽獎機 V08 第一階段｜雲端設定同步基礎包

內容：
- admin-site/: 從 v0.1.8 延伸的 v0.1.9 管理頁，增加「儲存並同步到雲端」與查詢狀態，不再要求手動下載 JSON 來完成雲端發布。
- cloudflare-worker/: 雲端設定儲存 API（Cloudflare Workers + KV），提供管理員發布與設備拉取、確認版本。
- V07 韌體尚未變更。ESP32 目前不會自動同步；本包不能當成已完成跨網路同步。

部署順序：
1. 在 Cloudflare 建立 KV namespace，將 id 填入 wrangler.toml 的 CONFIG_KV。
2. 在 Worker 設定兩個不同的高強度 Secrets：ADMIN_API_KEY、DEVICE_API_KEY；不得把它們放進 GitHub 或前端程式。
3. 設定 ADMIN_ORIGINS 為真正使用的 Admin 網站來源，發布 Worker。
4. 將 admin-site 內的 index.html、app.js、style.css、README.md 更新到現有 GitHub Pages 網站。
5. 在 Admin 雲端同步欄位輸入 HTTPS Worker 網址及管理員同步金鑰，點「儲存並同步到雲端」。成功只代表雲端儲存，不代表 ESP32 已接收。
6. 下一階段 ESP32 需要以 HTTPS 驗證伺服器憑證，帶設備金鑰 GET /device/config，驗證並原子寫入 LittleFS，再 POST /device/ack。必須先確定端點與安全配置後才進行韌體更新。

安全說明：
- API 金鑰由 Worker Secrets 管理；前端只在頁面記憶體暫存，不存 localStorage。
- Cloudflare KV 具有最終一致性，設備回報時間可能略有延遲。
- 雲端設定僅用於模板、獎項及提示音偏好；不產生可兌換獎券、不扣正式庫存、不實作核銷。
- 不要將 /device/config 暴露給沒有設備金鑰的使用者；不要把 Wi-Fi 密碼放進設定資料。
- 未包含手機 OTA；4MB Flash + Huge APP (No OTA) 需要另行評估可恢復的 OTA 分割與韌體體積。
- 未進行實際 Cloudflare 部署或 ESP32 編譯／連線測試。
