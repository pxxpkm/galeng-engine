# Galeng／Plane 核心與 UI 審查報告

審查日期：2026-10-27。版本：`45b974c13881060eb618931f4ecf99ae8798e918`（本機 master）。

## 結論

現階段適合繼續開發與有限範例驗證，未達到可以放心交給作者製作、儲存並發布混合對話／探險遊戲的程度。最優先問題是資料完整性與兩套執行器的語義分裂：編輯器可能覆寫已儲存設定，播放器的 Explore 存讀檔未接入實際存檔格式，同一份對話資料在兩種模式下亦有不同效果。

這不是「所有功能都壞掉」：核心測試、打包與 host 測試有實際覆蓋，click-room 通關測試也存在。但目前通過的測試不足以證明存讀檔、跨模式渲染、非同步編輯及正式發布流程可靠。

本報告不把三套編輯器、視覺風格不統一等設計選擇直接定性為最高級 BUG。資料遺失、遊戲無法續玩與無法發布，優先於外觀整理。

## 範圍與證據限制

- 閱讀 README、硬體 SPEC、三份 docs 開發／審查文件、範例、schema、Rust 核心／player／host，以及 React 編輯器相關實作與測試。
- 倉庫未見獨立、正式簽收的驗收文件。本次將開發文件的承諾、範例流程及測試作為驗收線索；不聲稱取得倉庫外的交接文件。
- 本次重新執行 Rust 非 player workspace 測試：105 通過、0 失敗。
- 本次 `pnpm test`：i18n 2、schema 36、editor 461 項測試通過，但 editor 有 1 個 suite 載入失敗，整體命令失敗。
- 本次正式前端 build：失敗，6 個 TS2322 錯誤。
- 另建立 checkout 外的最小重現程式，直接呼叫真實 Explore／host／前端 persistence 實作。未修改原始碼、正式測試或倉庫 lockfile。
- 未在 Windows 執行 player，亦未進行瀏覽器逐頁操作、截圖或無障礙量測。下述 player 結論明確標示為程式路徑確認；UI 競態未冒充完整瀏覽器重現。
- Linux 本身並非產品宣稱支援的平台，因此不把 Windows 專屬執行需求算成產品 BUG。

嚴重性：P1＝應阻擋相關功能發布，可能遺失資料、破壞遊戲流程或阻擋建置；P2＝功能缺陷、有侷限或需特定操作；「待商榷」＝需定義產品語義或驗收標準。沒有證據支持把所有問題籠統標成 P0。

## 一、應優先處理的核心問題

### K1 — Explore 狀態沒有接入播放器實際存讀檔（P1，極嚴重）

**證據：程式路徑確認，尚未 Windows 實機重現。**

`crates/player/src/vm.rs:323` 的 `Runtime::to_save()` 寫出 Runtime 自己的 scene／beat／vars；`SaveGame`（`crates/player/src/save.rs:35`）沒有 Explore 的 inventory、switches、hotspot overrides 或 call stack。`Runtime::apply_save()` 只更新舊 Runtime 欄位，沒有呼叫 Explore 的 `load_save()`。另一方面，`view()` 在存在 Explore engine 時以該 engine 的狀態為準。

`crates/player/src/window.rs:2320` 的實際存檔入口仍呼叫 `runtime.to_save()`。因此，「Explore engine 有自己的 save struct」不等於播放器存檔已支援它。

**影響：** 探險中拿走物品、開門、跳房間後存檔，無法由此格式完整還原。舊 Runtime 欄位也未隨 Explore 進度同步，場景／標籤可能仍指向初始位置。重新載入與同局讀檔均不應被宣稱可靠。

**修正方向：** 存檔格式明確區分／統一 dialogue 與 explore 狀態，從真正執行中的引擎序列化；恢復整個引擎狀態並處理舊檔遷移。另定義 Saying／pending queue 時能否存檔，不能僅吞掉錯誤。

**驗收：** 拿 key → 改 switch → 換房 → 存檔 → 關閉重開 → 讀檔，逐項比較物品、房間、變數、開關、熱區和 call stack；Call 中與 Choices 中也需要案例。

### K2 — 執行器只在啟動時選一次，Dialogue → Explore 無完整接管（P1）

**證據：程式路徑確認。**

`crates/player/src/vm.rs:156` 以起始場景種類建立 `self.explore`。之後舊 VM 的 `goto_scene()`（約 733 行）只換 scene／beat 並 `settle()`，不檢查目的場景種類；其 `Exit::Call/Return` 分支直接把 phase 改成 Ended（約 725 行）。

**影響：** 遊戲先播放序章對話，再 Next 到探險房間，並不等同於以房間直接啟動；空 beats 的房間可能直接結束。Dialogue 起始路徑的 Call／Return 亦不能按編輯器提供的語義運行。

**修正方向：** 統一場景調度／執行器，或在每次場景轉移明確交接狀態。CLI 指定 Explore scene 時 engine 仍從 project.startScene 啟動的限制也應一併釐清。

**驗收：** Dialogue → Explore → Call Dialogue → Return → Next，以及直接從兩種場景啟動，應具一致結果。

### K3 — Explore 呼叫對話時，視聽呈現被大幅削減（P1／P2，取決於產品承諾）

**證據：程式路徑確認。**

`crates/player/src/vm.rs:429` 的 `view_from_explore()` 把 chars 設為空、voice／movie／amb／cg 設為 None、camera 設為 default；Explore 的 `settle_dialogue()` 主要處理 set 和 say。這不是完整對話 VM 的顯示結果。

**影響：** 作者在 Dialogue 編輯器設定的立繪、配音或鏡頭，直接對話預覽與從 Explore Call 進入時可能完全不同。存於 beats 的相關欄位有效，不代表實際播放會執行。

**判定：** 若產品承諾「共用完整 dialogue IR」，這是發布阻擋；若 Explore Call 僅承諾純文字片段，則必須在 UI、schema 能力檢查與文件明示，不能默默忽略。

### K4 — 變數 set 在兩套 VM 的語義不一致（P1）

**證據：Explore 增量已重現；舊 VM beat.set 為程式路徑確認。**

最小案例以 dialogue beat `set: {score: "+1"}` 從 Explore 進入，結果 `score=None`。`crates/explore/src/engine.rs:1133` 對 `SetValue::Text` 直接略過；但 schema 容許增量字串，舊 VM 的 `apply_set()`（`crates/player/src/vm.rs:925`）也實作了增量。

更值得注意：舊 VM 的 `settle()`（約 522 行）未套用 `beat.set`；該 VM 可見的 `apply_set()` 呼叫在選項 `choose()`。因此不能把問題簡化為只有 Explore 不支援 `+1`。

**影響：** 好感、任務旗標、分支條件與作者設定不符；錯誤可能到後面的結局才顯現。

**修正與驗收：** 抽出共用運算語義；整數、布林、正負增量、beat 與 choice 都要分別測試，並驗證 advance／load 不會漏套用或重複套用。

### K5 — Explore 複合比較條件提早返回，分支判斷錯誤（P1）

**證據：直接呼叫真實 Engine 已重現。**

當 score=1，條件 `{score: {eq: 1, gt: 10}}` 應為 false，實際進入 yes 場景。`crates/explore/src/engine.rs:1139` 的條件評估在 eq／ne 命中時立即 return，沒有繼續套用 gt／lt 等限制；舊 VM 的比較實作則逐項檢查。

**影響：** schema 接受、編輯器存入的條件可以在不同入口走出不同劇情。

**修正：** 統一 predicate evaluator；或若規格只容許單一運算子，schema 必須明確拒絕複合條件。目前不能一邊接受、一邊忽略。

### K6 — 多邊形熱區可編輯，但播放器永遠點不到（P1，涉及必經熱區時）

**證據：直接重現，且現有測試明確鎖定此行為。**

`crates/explore/src/hit.rs:31` 對 Polygon 固定回傳 false。fixture 的 window 多邊形內點 `(200,150)` 得到 None。`crates/explore/tests/sm.rs` 的測試甚至以「polygon ignored」為預期。

UI 卻提供畫多邊形、拖頂點、增刪頂點（`apps/editor/src/explore/InspectorPanels.tsx:844`），前端測試也驗證 polygon 選取。

**影響：** 編輯時看似正常、遊戲中無法觸發；若門或關鍵物品使用 polygon，玩家不能通關。

**修正：** 完成 runtime point-in-polygon 與邊界規則；在完成前，UI／打包至少應明確阻擋或警示 unsupported shape。不能把「測試通過」當成能力已完成。

## 二、UI 與作者資料完整性

### U1 — Explore 設定已儲存，後續房間儲存仍會覆寫它（P1，極嚴重）

**證據：真實 persistence helper 配合記憶體 API 重現；UI 狀態來源經程式核對。**

`ExploreSettings.tsx:65` 自行載入 project，`doSave()` 直接 PUT 全份 project；對話框只有 open／onClose，沒有把 savedProject 回傳工作區。工作區掛載點為 `ExploreWorkspace.tsx:1117`。

主工作區的 `saveExploreDoc()`（`persist.ts:226`）每次都先把自己保留的 `_rawProject` 與 model 合併，PUT 整份 project，再存 scene。

**重現：** 載入工作區 → 設定另存 `titleBgm=bgm/audit_new` → 工作區存房間 → titleBgm 回到 undefined。字型及其他僅由設定面板更新的欄位有相同覆寫路徑。這不需要兩名作者或兩個分頁。

**修正：** 單一 project state／統一提交管道；Settings 成功後同步工作區。Host 以 revision 或 ETag 拒絕過時整份覆寫，避免多分頁也發生同類問題。

**驗收：** Settings 存字型／titleBgm／gallery → 改熱區 → 存房間 → 重新載入，先前設定必須完整保留。

### U2 — 非同步存檔回應會覆蓋儲存期間的新編輯（P1）

**證據：程式路徑確認；未用瀏覽器網路限速實測。**

v2 `useEditorState.ts:282` 以閉包中的 scene 發送請求，回應後無條件 `setScene(saved)`、`setDirty(false)` 並清 backup。Explore `ExploreWorkspace.tsx:411` 同樣將舊請求的 saved.scene／project 寫回最新 state 並清 dirty。Classic 存檔也採相近方式。

**觸發序列：** 編輯 A → 按存檔 → 請求尚未返回時編輯 B → A 的回應返回 → B 被覆蓋，UI 顯示已存。

**修正：** edit revision 與 request revision 比對；只清除已提交版本的 dirty，較新的編輯必須保留。序列化提交並避免舊回應反蓋新回應。僅 disable Save 按鈕不能阻止其他編輯操作。

**驗收：** 延遲 PUT 回應 2 秒、期間輸入／拖曳／undo，回應後最新內容仍存在且 dirty 正確。

### U3 — 字型管理 UI 存在，但預覽讀取路徑不支援字型（P2）

**證據：真實 host resolver 重現。**

存在 `examples/click-room/assets/fonts/noto-sans-tc-demo.otf`，但 `ProjectDir::resolve_media("fonts/noto-sans-tc-demo")` 返回 MissingAsset。`crates/host/src/lib.rs:498` 的 MEDIA_EXTS 只有 png／webp／ogg／wav。

`Preview.tsx:137` 透過同一 `/api/media/…` 載入 FontFace；失敗被 catch 後靜默改用 sans-serif。FontPanel 的字型連結亦使用同一 API。

**影響：** 已選字型不會出現在編輯器預覽，字寬／換行與遊戲顯示不一致，作者容易誤判排版。

**修正：** 明確提供字型資產端點或擴充安全白名單與 Content-Type；載入失敗可見地告知作者。驗收應檢查真實請求與字型載入結果，而不只是角色欄位存在。

### U4 — 正式前端 build 被語系資料結構阻擋（P1，發布阻擋）

**證據：本次 build 重現，退出碼 2。**

三個 locale 新增巢狀 `editor` 物件，但 App 與 v2 將字典宣告為 `Record<string,string>`，其他 key 又採扁平命名。`packages/i18n/locales/zh-Hant.json:383`、`apps/editor/src/v2/useEditorState.ts:47`、`apps/editor/src/App.tsx:49` 可直接對照。

**結果：** 6 個 TS2322，`tsc --noEmit && vite build` 停在 tsc。警告文字的 key 查找亦需一併核查，不能只用型別斷言壓掉錯誤。

### U5 — Settings 自己的未存變更缺少離開保護（P2）

**證據：程式路徑確認。**

Explore Settings 的 dirty 是獨立 state；Escape、遮罩及關閉操作直接 onClose，close effect 清 dirty。它沒有納入 workspace 的 shell session。

**影響：** 作者修改字型或音訊後誤按 Escape，沒有提示便丟失尚未儲存設定。這與 U1 的「已儲存後被覆寫」不同。

**修正：** Settings 與整體 dirty policy 一致；明確提示儲存／捨棄／取消，或採具可靠狀態同步的自動儲存。

## 三、需要定義規格或補強的項目

### D1 — Call 後面的動作會消失（P2；若承諾子程序語義則升 P1）

直接重現 `onEnter: [Call(dlg), SetVar(after_call,9)]`，對話 Return 後 after_call 仍不存在。`goto_scene_keep_stack()` 清 action_queue，而 Explore stack frame 不保存剩餘 actions。

「Call」通常暗示返回後繼續，但現有規格未明確界定 action list 的 continuation。應選擇：保存剩餘 queue 並繼續；或把 Call 定義為終止本段動作，且 UI 禁止其後仍放有效動作。不能讓作者只能從失效行為猜語義。

### D2 — 多套 UI／沒有專案入口提示，屬工作流程設計問題

Classic、v2、Explore 分開並不自動是 P0。真正要驗收的是：從 startScene 是否能選對工作區、跨殼切換是否保護資料、同一專案的設定是否一致。可保留兩種專業編輯視圖，但需要共享資料生命週期與清晰入口。

### D3 — 直接覆寫檔案、分兩次 PUT，沒有原子提交（P2 可靠性風險）

Host 的 save_project／save_scene 與 player write_slot 使用 `fs::write()`；Explore 先存 project 再存 scene，第二步失敗時第一步已生效。這是從實作確認的失敗窗口，本次沒有做斷電／磁碟滿故障注入，不能宣稱已觀察檔案毀損。

建議先以暫存檔＋原子替換保護單檔，再定義 project／scene 多檔一致性與回復策略。並加入過期版本檢查，避免多分頁最後寫入者默默覆寫。

### D4 — 本機 host 接受任意 Origin（條件性 P1 安全風險）

`crates/host/src/main.rs:61` 的 CORS 使用 Any origin／method／header，未見每次寫入的 session token。實測對 `/api/project` 發出非破壞性的 OPTIONS，Origin 為 `https://audit.invalid`，返回 allow-origin／methods／headers 全為 `*`。

若瀏覽器允許網站連到此本機服務，惡意網頁可能讀取或改寫專案；實際可利用性還取決於瀏覽器的本機網路政策。本次沒有執行跨站寫入攻擊，也不把 loopback 綁定誤寫成對外公開。

建議限定已知 editor origins，並加本次工作階段的寫入授權。這是本機檔案編輯服務應考慮的邊界。

### D5 — Windows 8.1／Core 2 Duo／2 GB 的承諾尚缺驗收證據

SPEC 與 README 明確列出舊 Windows 與低規格目標，但 CI 為 windows-latest，Rust stable 浮動。這不能證明舊系統無法執行，也不能證明已支援。

應建立目標 OS 啟動、音訊／影片、字型、1080p 繪製、長篇腳本及記憶體峰值的驗收矩陣。不要用現代 CI 上的編譯成功代替硬體規格承諾。

## 四、文件與測試的誤導風險

1. `DIALOGUE_EXPLORE_SHELL_REVIEW.md` 前文仍寫跨殼切換無保護、Explore 儲存強制清 beats；後文又標已修正。現行 `shellGate.ts`、`main.tsx` 已有儲存 gate，`persist.ts` 已保留 raw beats。不能將舊 audit 直接轉成新缺陷清單，但仍應驗證非同步／競態邊界。
2. Script Library 已按 explore kind 跳轉；Explore Settings 已包含 Fonts／Audio。舊文提及缺少入口也不是現況。
3. Font 文件先寫 planning only，末尾寫 implemented；實際端到端字型預覽仍被 U3 阻擋。「有元件」與「功能完成」要分開。
4. 預設 `pnpm test` 把 `e2e/explore-smoke.spec.ts` 交給 Vitest，出現 Playwright test.describe runner 錯誤。應分清 unit 與 browser runner，不可把一個失敗 suite 說成全綠。
5. `pnpm-lock.yaml` 未同步 editor manifest 的 Playwright／Node types，乾淨 frozen 安裝失敗。現環境以 checkout 外 lockfile 安裝作為開發 workaround；這不是倉庫發布流程已修好。
6. 現有 player Explore 測試重點是 click-room 通關；本次檢查的該檔未覆蓋 K1 的完整存讀檔。Polygon ignored 的測試反而證明目前能力邊界被測試固定住。
7. 現有 browser smoke 主要驗證「沒有 host 時顯示錯誤與重試」，不能代替有 host 的編輯→儲存→重載驗收。本次未執行 browser suite。

## 五、建議修復順序與驗收門檻

**第一批：先保資料。** 修 U1、U2、K1；補 Settings 關閉保護，最少加入版本檢查與單檔原子替換。退出門檻是儲存／讀檔後內容與遊戲狀態確實一致，而非 toast 顯示成功。

**第二批：統一遊戲語義。** 修 K2、K4、K5、K6；定義 K3 和 D1 的正式承諾。以相同 scene 資料分別從 dialogue 起點及 explore 起點執行，對比狀態與視聽事件。

**第三批：恢復可發布流程。** 修語系結構、同步 lockfile、分離測試 runner、增加 production build CI。字型需從真實 host 端點載入驗證。

**第四批：整理體驗與文件。** 更新單一現況表、工作區入口提示、設定來源及能力警告；再處理外觀一致性或 Classic 退場。不要讓低優先視覺重構先於資料保護。

最低發布驗收應包括：乾淨 frozen install、正式 build、單元測試、Windows player 存讀檔、Dialogue↔Explore 往返、polygon 必經路線、Settings 後再存房間、存檔延遲期間繼續編輯、真實字型預覽，以及無 host／有 host 的 browser smoke。此次尚未達成整套驗收。

## 附：重現證據

- 核心／host 最小程式：本次在 checkout 外執行；以下保留執行紀錄。
- 核心結果：[core-results.txt](core-results.txt)。
- Settings persistence：以 vite-node 執行 checkout 外的最小程式，觀察新 titleBgm 在房間儲存後變成 undefined；使用記憶體 API，沒有寫入範例。
- 本次測試／建置：[Rust](rust-tests.txt)、[JavaScript](js-tests.txt)、[前端建置](build.txt)。
- 核心觀察：score 增量結果 None；Call 後 after_call None；polygon hit None；字型 MissingAsset；eq=1 且 gt=10 錯誤進入 yes。

這份報告是缺陷審查與修復建議，沒有修改產品程式碼，也沒有將推論冒充 Windows 或瀏覽器實測。
