# 第二輪審查：修正已落地，但資料完整性仍有缺口

日期：2026-10-28（香港）。審查提交：`760c37bee2b48be238bc3ae90b0eb298a298834b`，GitHub `work`。`master` 仍為 `45b974c`，所以以下修復結論不適用於 master。

## 結論

這次更新有實質改善：正式前端建置恢復、多邊形點擊與複合條件修好、Explore 存檔已接入播放器。不能再沿用第一輪「完全沒有 Explore 存檔」的結論。

但 U1、U2、K1、K4 只能視為部分修好：設定刪除、重疊儲存、儲存後切場景、讀檔的節拍位置與 BGM，以及單節拍循環仍有缺口。K2／K3 的跨執行器問題亦仍存在。

建議仍暫緩宣稱混合 Dialogue／Explore 專案已達完整發布驗收。最優先處理「畫面說已儲存，但磁碟／重新載入結果不一致」的情況，其次是對話轉探險後直接結束。

## 本輪方法與邊界

- 從 GitHub 讀取分支版本，將乾淨本機 work fast-forward 到上述提交；未覆寫使用者變更。
- 閱讀 `HANDOFF.md`、更新後的三份開發文件、上輪報告的後續狀態，以及本次 31 檔的差異。
- 執行現有測試與正式前端 build，重跑上輪最小案例，再補針對修復邊界的案例。
- 補齊 Linux SDL2／ALSA 開發依賴後，這次可執行實際 player Runtime 的無視窗測試。這不是 Windows GUI、音訊輸出或影片相容性測試。
- UI 重現使用真正的 persistence／mergeSaveResponse／flushIfDirty helpers；請求時序和 state 更新由小型測試程式模擬。沒有聲稱完成 React 瀏覽器端到端操作。
- 未改產品原始碼、依賴宣告或倉庫 lockfile。新報告與重現程式放在 checkout 外。

## 舊問題狀態表

| 上輪編號 | 本輪判斷 | 證據／限制 |
|---|---|---|
| K1 Explore 存讀檔未接線 | **主要接線已修，仍有缺口** | save format 3／Explore payload、player tests 通過；BGM、穩定 beat id 尚有錯誤 |
| K2 Dialogue → Explore | **仍存在，已直接重現** | 結果 uses_explore=false、phase=Ended |
| K3 Explore 對話視聽被削減 | **仍存在，部分直接重現** | 有 voice 的 dialogue 經 Call 後 Runtime view.voice=None |
| K4 set 語義不一致 | **一般案例修好，循環邊界未修** | +1 已生效；同場景單節拍重入不會再加 |
| K5 複合比較提早返回 | **原案例已修** | score=1、eq=1 且 gt=10 正確走 no |
| K6 polygon 永遠點不到 | **原案例已修** | (200,150) 正確命中 window；既有新測試通過 |
| U1 Settings 被房間存檔覆寫 | **部分修好** | 更新既有值有同步機制，但刪除欄位會復活 |
| U2 儲存期間新編輯被蓋掉 | **部分修好** | 單請求 response guard 有效；重疊請求與切場景仍不安全 |
| U3 字型預覽 API | **仍存在，已重測** | 實際字型仍返回 MissingAsset |
| U4 前端 build | **已修，完整建置通過** | 不只 tsc，Vite build 也成功 |
| U5 Settings 關閉丟改動 | **仍存在，程式確認** | Escape／遮罩關閉仍無 dirty 確認 |
| D1 Call 後動作消失 | **仍存在，已重測** | after_call 仍 None；需定義 continuation 語義 |
| D2 多套 UI | **仍屬設計議題** | 不因未合併 UI 而直接列 P0 |
| D3 原子寫入 | **未修** | 此次 host 寫入路徑未變；沒有故障注入實測 |
| D4 任意 Origin CORS | **未修** | host 未改，沿用上輪預檢證據，未重做跨站測試 |
| D5 舊 Windows／硬體承諾 | **仍缺證據** | 本輪 Linux 無視窗測試不能代替目標平台驗收 |

## 需優先處理的修補缺口

### R1 — 刪掉的 Settings 欄位會被房間儲存復活（P1）

位置：`apps/editor/src/explore/persist.ts:232`、`:245`；AudioPanel 清 titleBgm 使用 `setOptionalPath`。

新增 `projectBaseForSave()` 用 `{...raw, ...disk}`，`adoptSavedProjectRaw()` 也用 spread 合併。若磁碟完整 JSON 已刪除某個 key，spread 不會刪掉舊 raw 裡的同名 key。

重現：初始 titleBgm=bgm/old → Settings 清空並儲存，磁碟不再含 titleBgm → 採用 saved raw → 房間再儲存。實際 titleBgm 又變回 bgm/old。

這不是交接文件提到的「GET 和 PUT 之間另一次寫入」競態；完全順序操作也會發生。因此 U1 不宜標成全部完成。

建議：把成功取得的完整 project JSON 當新 raw 基準，保留的是明確識別的本地未存編輯，不是已被磁碟刪掉的舊欄位。另將 GET 失敗分型；現在 catch 全部錯誤後用舊 raw，會掩蓋讀取失敗。

驗收：新增、修改、刪除三種操作分開測；Settings 清 titleBgm → 存房間 → 重載，必須仍為空。

### R2 — 新舊儲存請求亂序：UI 已同步、磁碟是舊版（P1）

位置：`apps/editor/src/saveGeneration.ts:8`、`apps/editor/src/v2/useEditorState.ts:318`、`apps/editor/src/explore/ExploreWorkspace.ts:420`。

revision guard 只決定是否採用 response，沒有序列化寫入，也沒有 server revision／ETag。

以真實 mergeSaveResponse 模擬：送 A → 編輯 B 再送 B → B 先完成並清 dirty → A 後完成、寫入磁碟。A 的回應因 revision 不符被忽略，但 dirty 已由 B 清除。

結果：`UI=B, dirty=false, disk=A`。當前拒絕過時 response 的測試不能證明儲存完整。

證據等級：helper 時序重現＋呼叫端程式確認；尚未用真實瀏覽器限速重排 PUT。

建議：同一文件提交序列化／合併；服務端以版本條件拒絕過時寫入。驗收要比較磁碟，不只 React state。

### R3 — 儲存期間的新編輯仍可能在切場景時丟失（P1）

位置：`apps/editor/src/dirty.ts:1`、`apps/editor/src/v2/useEditorState.ts:606` 的 selectScene，以及 new scene／search 導航的相似路徑。

流程：場景 A 有未存改動 → 點場景 B，觸發 await save → 等待期間繼續改 A → save guard 正確保留新內容並維持 dirty → save 正常返回 → flushIfDirty 無條件返回 saved → selectScene 繼續 setSceneId(B)。新場景載入會替換目前內容並清 dirty。

shellGate 會再檢查 dirty，但場景內部導航沒有同樣保護。最小 helper 模擬顯示 selected=new、仍存在未存 edit B；呼叫端仍繼續導航。

建議：統一所有離開文件的 gate；儲存結果區分 fully-saved／newer-edits-remain，後者必須取消導航或再次提交。不要只保護 shell hash 切換。

### R4 — Explore 存檔寫出 beat_id，讀取時卻忽略（P1／更新遊戲後續玩）

位置：`crates/player/src/vm.rs:397` 的 Explore 分支，對照純對話分支 `resolve_beat()`；`crates/explore/src/engine.rs:678` 左右直接套 beat_index。

直接使用真實 Runtime 重現：Explore Call 到兩句 dialogue，在 b1 存檔 → 在原劇本 b1 前插入另一個有合法穩定 ID 的 beat → 重新載入 Runtime 與存檔 → advance。

結果：下一句仍是 line1，預期為 line2。存檔確實有 b1 的 beat_id，卻走了舊索引；還原的快取台詞暫時遮住了錯位，直到下一步才顯現。

影響：遊戲更新／作者插入節拍後，讀檔會重播、跳過或套錯 beat 邏輯。不能只在未改劇本時做 round-trip。

建議：Explore 分支也依穩定 ID 解析位置，明確處理 missing／duplicate ID；call stack 的 dialogue frame 也需要版本策略。

### R5 — Explore 讀檔後保留讀檔前的 BGM（P2）

位置：`crates/explore/src/engine.rs:652` 的 load_save、`crates/player/src/vm.rs:500` 的 BGM 優先順序。

真實 Runtime 重現：房間播放 bgm/a → 存檔 → 互動改播 bgm/b → 讀原存檔。結果 view.bgm 仍是 bgm/b。

原因：外層 carried_bgm 已還原，但 engine.bgm 沒有被還原或清除，而 view 優先選 engine.bgm。交接文件說「不還原 bgm」是缺口說明，不能當驗收豁免。

建議：BGM 由單一權威狀態保存／恢復，並區分「未指定／繼承」與「明確停止」。需要測 same-runtime load 與 fresh-runtime load。

### R6 — 單節拍場景回到自己後，set 不再執行（P2，依劇情可能升級）

位置：`crates/player/src/vm.rs:617` 的 set_applied 與 `:830` 的 goto_scene。

真實 Runtime 重現：solo 只有一拍 `set score:+1` 與 say，exit Next 指回 solo。首次 score=1，advance 後重入場景，score 仍為1，預期2。

原因：防重覆標記只有 `(scene_id, beat_index)`，goto 沒清除；新一次場景進入剛好是相同 pair，被當成同一次 settle。一般多拍測試不容易撞到。

建議：以執行進入次數區分，或在真正轉場時重設標記；保留讀檔不重套用的語義。加入 self-loop、雙場景 loop、backlog 跳回與 save/load 的組合測試。

## 未修舊問題，本輪補強的證據

**K2：** intro dialogue Next 到 room，實際 `uses_explore=false, phase=Ended`。現有純對話 Runtime 不會在 goto 時接入 Explore；這已不是僅靠閱讀程式的推測。

**K3：** 被 Call 的 dialogue 有 `say.voice=voice/a`，Runtime 的 view.voice 卻為 None。這證明至少 voice 欄位在轉接時遺失；沒有聲稱做了實體音效裝置播放測試。chars／movie 等仍見相同固定空值路徑。

**U3：** 既有範例字型檔仍由 host resolver 返回 MissingAsset；此次未改 host 媒體白名單。

**D1：** Call 後的 SetVar 仍未執行。若產品要把 Call 定義成終止當前動作串，應在 UI／文件明示；若是子程序，應保存 continuation。

**U5：** Settings 還是獨立 dirty state，關閉沒有確認；其自身 doSave 也未加入主工作區那套 revision guard。後者屬程式確認，未另做瀏覽器延遲重現。

## 本次實際驗證結果

| 檢查 | 結果 |
|---|---|
| `cargo test --workspace --exclude galeng-player --locked -j 4` | **114 通過** |
| `cargo test -p galeng-player --locked --test vm --test explore -j 4` | **33 通過**：vm 24、explore 9 |
| `pnpm --filter @galeng/editor build` | **通過**，有大 chunk 提醒；提醒不當成 build 失敗 |
| `pnpm test` | **503 項通過，但命令失敗**：i18n 3、schema 36、editor 464；1 個 Playwright suite 被 Vitest 誤收 |
| 上輪增量／複合條件／polygon 最小案例 | **修復確認** |
| 本輪 Runtime 邊界案例 | R4／R5／R6 及 K2／voice 缺失可重現 |
| UI persistence／儲存 gate helpers | R1／R2／R3 可重現或確認呼叫結果；非完整 browser E2E |

測試和 build 使用之前已安裝的外部 lockfile 依賴。倉庫 pnpm-lock 與 manifest 本次未更動，因此不能將 build 通過宣稱成乾淨 frozen 安裝也已恢復。本輪未再次執行該安裝。

## 交接文件與驗收建議

`HANDOFF.md` 開頭仍寫 HEAD=1ac1b36、修正「未提交」，但遠端實際為760c37b且修正已提交。這會誤導下一位接手者；應更新為當前提交，或將這些句子標示為歷史快照。所列「不要動原本髒檔」在此乾淨 checkout 沒有對應的未提交變更，本次沒有還原或格式化它們。

第一批先修 R1／R2／R3，避免作者資料受損；第二批修 K2 與 R4，避免遊戲不能轉場／更新後讀錯進度；第三批修 R5／R6、視聽轉接與字型端點。同步修預設測試 runner 與 lockfile，否則正常 CI／乾淨安裝仍不可信。

新驗收測試應重點覆蓋：欄位刪除、兩次儲存亂序、導航等待期間再編輯、劇本插入後載入舊檔、讀檔前後 BGM、單節拍自循環。現有新增單元測試證明一般路徑改善，未覆蓋這些邊界。

## 證據檔案

- [Runtime 重現結果](player-repro.txt)
- [上輪核心案例重測](core-retest.txt)
- [UI helper 重現結果](repro-ui.txt) 與 [程式](repro.ts)
- [非 player Rust 測試](rust-tests.txt)、[player 測試](player-tests.txt)
- [前端建置](build.txt)、[前端測試](js-tests.txt)

Runtime 重現程式：[recheck.rs](recheck.rs)（執行時位於 `/workspace/.onboarding/audit/src/bin/recheck.rs`）；所有測試專案皆寫入本報告目錄下的 projects，沒有改動倉庫範例。


發布註：上述 checkout 外路徑描述的是審查執行時的環境。本目錄保存報告、原始重現程式與執行紀錄；重現程式包含當時的本機絕對路徑，其他環境執行前需調整。此提交不包含產品修復。
