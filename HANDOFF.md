# N1 / N2 follow-up

本節隨基於 `8b2e0b4` 的 N1／N2 修正一併提交；下方交接為歷史記錄。

- N1：Settings 保留載入基準，只把本次改動／刪除套到 lane 內讀取的最新 project。巢狀物件按欄位合併，陣列視為整個欄位替換。儲存期間的新修改會重新套到伺服器回應並保持 dirty，下一次儲存不重送舊快照；關閉／重開前一次請求不更新新視窗。
- N2：同一 scene path 的 DELETE 等候先前 PUT；刪除中禁止 editor 再送該場景的 save，舊回應因 revision 失效不能清理／覆蓋狀態。成功後清掉被刪場景正文、dirty、undo／redo、選擇與備份，再載入仍存在的場景；project 的未存修改保留。失敗則保留場景草稿與歷史。
- 同步修正 v2 與 Classic。Chromium 直接驗證 v2 刪除成功／失敗，以及真實 Settings 視窗；Classic 此次由程式核對與 TypeScript build 驗證，未另做完整 UI 操作。
- 驗證：`pnpm test` 528項通過（editor489、schema36、i18n3）；5項 Chromium 測試通過；正式前端建置通過。瀏覽器涵蓋舊載入競態、pending PUT→DELETE、刪除期間額外 save、project 保留、刪除失敗、Settings 動詞保留／欄位刪除／請求期間繼續編輯。
- 未處理跨分頁 If-Match、服務端版本鎖及舊播放器缺陷；同頁 lane 不代表多客戶端交易保護。

---

# Current follow-up: third audit fixes

2026-10-28：本節隨基於 `907337d` 的第三輪修正一併提交。下方原交接內容保留作歷史記錄，其 HEAD 與「未提交」狀態不代表目前版本。

- Dialogue v2／Classic：場景 GET effect 在 cleanup 後忽略舊請求；回應前比較 scene/project revision 與 dirty。載入期間有新編輯或請求失敗時恢復原場景選擇，保留正文、dirty 與 undo；恢復選擇不會再次載入舊場景覆蓋新編輯。
- HTTP project persistence：`updateJson()` 把 GET、合併、PUT 放進與 Settings `putJson()` 共用的 lane。私有 PUT 不再巢狀排隊，避免 deadlock。這是同頁協調，不提供跨分頁／跨客戶端的服務端版本鎖。
- 增加真正掛載 `useEditorState` 的 Chromium 回歸測試，以及 Settings 寫入／房間重讀交錯與 GET 失敗的測試。
- 新增 Vitest config，保留 Vite 設定並排除 `e2e/**`，瀏覽器測試由 Playwright 執行。
- 本輪驗證：`pnpm test` 全部524項通過；正式 editor build 通過；2項 Chromium 測試通過。Linux 使用系統 `/usr/bin/chromium` 與 checkout 外的 Playwright launch config，未驗證 Windows GUI。
- 本輪未修改 Rust。前輪的 K2/K3、Explore beat ID／BGM 還原、單節拍循環等問題仍需另行修復，不應標為全項目已修完。

---

# Handoff

日期：2026-10-27。下一輪先讀這份，再對照 `docs/audits/2026-10-27/REVIEW.zh-Hant.md` 的「後續狀態」。

## 倉庫位置

- 目錄：`C:\galeng-engine`
- 遠端：`https://github.com/pxxpkm/galeng-engine.git`
- 分支：`work`，追蹤 `origin/work`
- HEAD：`1ac1b36`（`docs: add core and editor audit with validation evidence`）
- `master` 與 `origin/master` 仍是 `45b974c`。審查報告評的是這個提交。
- 產品修正在 `work`。使用者要求推上 GitHub。沒有合進 `master`。

## 不要動的東西

- 不要 `git checkout` 或還原這三個 2026-10-21 就已經髒着的檔：`crates/player/src/diag.rs`（UTF-8 路徑遮罩）、`crates/player/src/input.rs`（`HeldMods`）、`crates/player/src/window.rs`（vsync 失敗仍留 `settings.vsync`、held mods、fx hold）。`window.rs` 裡另外有這輪的 `store_runtime_save`。`rustfmt` 曾重排這三個檔，邏輯還在。
- 不要 `cargo fmt -p`。整包 format 會掃到上面的未提交檔。
- `pnpm` 有時會在「already up to date」時改寫 `pnpm-lock.yaml`。若出現這份 diff，立刻 `git checkout -- pnpm-lock.yaml`。
- 不要開始 K2、K3、U3、U5、D1–D5，除非使用者點名。

## 已做（未提交）

### U1

房間存檔前重讀磁碟 project，再疊探險自己的欄位（`apps/editor/src/explore/persist.ts` 的 `projectBaseForSave`、`saveExploreDoc`）。設定對話成功後 `onSaved`，工作區用 `adoptSavedProjectRaw` 更新 `_rawProject`（`ExploreSettings.tsx`、`ExploreWorkspace.tsx`）。測試：`persist.test.ts` 的 titleBgm／gallery 案例。

主機 ETag 沒做。設定寫入若落在重讀和 PUT 之間，磁碟上的 project 仍可能被這次房間存檔蓋掉。

### K1

- `SAVE_FORMAT = 3`。`SaveGame.explore` 可選。沒有這個欄位的舊 JSON 仍是對話檔。格式 4 拒絕。格式 1、2 仍可載入。
- 探險：空動作佇列的 Saying 可存，並還原 `say_speaker`／`say_text`。Error，或佇列還有動作，回 `InvalidState`。`load_save` 還原台詞並清 `pending_se`，不還原 bgm。
- 播放器：`store_runtime_save`（`window.rs`）走 `try_to_save`。明確存檔失敗顯示「而家唔可以存檔」（`Notice::CannotSave`）。兩個自動存檔路徑 `notify = false`，不彈這句。
- 已有探險引擎、但存檔沒有 explore 區塊：`SaveError::MissingExplore`，且在改狀態之前拒絕。純對話存檔沒有 explore 區塊，仍然載入。
- 測試：`crates/player/tests/explore.rs`、`crates/explore/tests/sm.rs` 的 saying／拒絕中途台詞。

### U4

三個 locale 去掉巢狀 `editor` 物件。扁平鍵：`editor.warnSaveExploreFromDialogue`、`editor.saveCancelled`。`packages/i18n/test/keys.test.ts` 要求每個值都是字串。編輯器 `tsc --noEmit` 通過。沒有重跑 `vite build`。

### K5

共用判斷在 `crates/schema/src/eval.rs`，由 `galeng_schema::{condition_holds, apply_set, cmp_holds, pred_holds}` 匯出。對話 VM 與探險 VM 都呼叫它。

`Cmp` 裡出現的每個運算子都要同時成立。`score = 1` 且 `{eq: 1, gt: 10}` 為假。`eq`／`ne` 只接受放得進 `i32` 的整數；`{eq: true}` 對整數不成立。`ConditionPred::Bool`（JSON 布林，不是 `Cmp`）仍然是「非 0」。空條件為真。

### K4

`SetValue::Text` 能 `parse::<i32>` 就是增量（`+1`、`-2`），否則略過。整數是賦值，布林是 0／1。

對話 `Runtime` 有 `set_applied: Option<(String, usize)>`。`settle` 在 `note_say` 之前套用目前節拍的 `beat.set`，所以 `{score}` 看得到新值。同一 `(場景, 索引)` 再進 `settle` 不會再加。`apply_save` 在 `settle()` 前把標記設成還原到的節拍，因為存檔變數已經包含那一拍。`jump_back` 只改標記、不套用，變數維持跳之前的值。換場景或換索引會再套。

探險 `settle_dialogue` 本來就會套 `beat.set`；`load_save` 不呼叫它，所以讀檔不會把同一拍再套一次。`advance` 先加索引再 settle，下一拍套一次。

已知缺口：對話從紀錄跳回舊句之後，若再往前重走，離開過的那一拍會再套用一次。跳回本身不加。

### K6

`crates/explore/src/hit.rs` 的多邊形用與 `apps/editor/src/explore/canvas.ts` `pointInPolygon` 相同的奇偶射線。橫邊因為嚴格 `yi > y` 而不算相交。少於 3 點為假。矩形仍是半開區間。後畫的熱區仍勝。

`fixtures/explore/study.json` 的窗 `[[100,80],[400,80],[400,300],[100,260]]`：`(200, 150)` 是 `Some("window")`。測試名是 `hit_test_rect_and_topmost_polygon`。

### U2

`apps/editor/src/saveGeneration.ts` 的 `mergeSaveResponse`：修訂號相同才採用伺服器正文並 `clearDirty`。號變了就留本地正文，不清 dirty。

- 經典 `App.tsx`、v2 `useEditorState.ts`：場景號與專案號分開。`commit`／`commitScene`、undo、redo、換場景載入推進場景號。改 project 推進專案號。存檔在 `await` 之後用 ref 讀最新正文，只在號沒變時 `setScene`／`setProject` 並清 dirty。v2 只有真的採用回應才 toast、才清 backup。
- 探險 `ExploreWorkspace.tsx`：一份 `docGen`。內容命令、undo、redo 才加號；只改 UI 不加。重載、切場景、新建場景，以及設定 `onSaved`，都加號。過期回應不寫回 state。出包前那次存檔若號已變，狀態是「仍有未儲存修改，未出包」，並中止出包。
- `shellGate` 在存檔返回後會再看 `getDirty()`。三個殼在改 dirty 時同步更新那個 ref，避免 React 還沒重繪就把成功存檔當成仍髒。

沒有用延遲 PUT 在瀏覽器裡走過。磁碟上仍可能短暫留下較舊正文。

## 這輪跑過的檢查

- `cargo test -p galeng-schema --lib -- eval::`：5 通過。
- `cargo test -p galeng-explore --offline --tests`：狀態機 31 通過；多邊形射線單元測試通過。
- `cargo test -p galeng-player --offline --test vm`：24 通過，含 `beat_set_applies_once_on_advance_and_load`。
- `cargo test -p galeng-player --offline --test explore`：9 通過。
- `cargo test -p galeng-player --offline --lib -- cond_tests`：1 通過。
- `node apps/editor/node_modules/vitest/vitest.mjs run src/saveGeneration.test.ts --root apps/editor`：2 通過。
- `node apps/editor/node_modules/typescript/bin/tsc --noEmit -p apps/editor/tsconfig.json`：退出碼 0。

`window.rs` 的 `flash_started_for`、`pause_edge` 未使用警告是原有的，沒有當這輪的失敗。

## 文件

- `docs/audits/2026-10-27/REVIEW.zh-Hant.md`：審查原文保留，開頭加了「後續狀態」。
- `docs/DIALOGUE_EXPLORE_SHELL_REVIEW.md`：跨殼存檔、腳本庫開探險、房間存檔保留 beats、`onEmptyClick` 標成已落地。
- `docs/FONT_SCRIPT_MANAGERS.md`：字型面板已有，但預覽仍被 U3 擋住。

## 還沒做

審查裡仍開着的是 K2（對話進探險的執行器交接）、K3（探險裡的對話視聽被削掉）、U3（字型預覽的媒體路徑）、U5（設定對話 Escape 不確認）、D1（Call 後面的動作）、D3（原子寫入）、D4（CORS）、D5（舊硬體證據）。D2 是工作流程，不是這幾輪的缺陷修補。

也還沒做：把 `work` 合進 `master`、瀏覽器裡點設定對話與延遲存檔、完整 `vite build`、主機 ETag。

## 使用者還沒交代的

使用者要的是把開發文案和這份交接對上已落地的修正，然後推上 GitHub。沒有點名下一項缺陷，也沒有說要合進 `master`。
