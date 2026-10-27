# Dialogue ↔ Explore shell review（互保／衝突）

Status: **audit** (2026-10-16), current-status pass 2026-10-27. Audience: Leo / parent agent.  
Scope: editor shells + shared `Scene` JSON + player/explore handoff.

2026-10-27：下面幾項已在程式裡落地，不要再當成未修缺陷。細節與尚未提交的核心修正見 `docs/audits/2026-10-27/REVIEW.zh-Hant.md` 的「後續狀態」，交接見 `HANDOFF.md`。

- 跨殼離開會先經 `shellGate.ts` 儲存；存檔失敗或事後仍 dirty 就留在原殼。
- Script Library 的 explore 列開 `#explore`，不再灌進對白時間軸。
- Explore 存房間保留磁碟上的 `beats`，不再強制寫成 `[]`。
- `onEmptyClick` 可在探險 Inspector 編輯並來回儲存。

---

## 1. How they connect

### Shared data model

One on-disk file per scene: `scenario/<id>.json` → schema `Scene`:

| Field | Dialogue shell | Explore shell | Player |
|---|---|---|---|
| `sceneKind` `dialogue` \| `explore` | Shown / filtered in Script Library; default when host `create_scene` | Required (`persist` rejects non-explore without hotspots) | Explore engine only enters rooms with `SceneKind::Explore` |
| `beats[]` | Primary edit surface (Timeline / Inspector) | Preserved from disk raw on Explore save (not wiped to `[]`) | Dialogue phase advances beats; Call into dialogue scene plays beats |
| `exit` (Next / Choices / Branch / **Call** / **Return** / End) | Edited in dialogue Inspector | Preserved via raw merge on Explore save (not Explore-owned UI) | Stack: Explore `Call` → dialogue → `Return` back |
| `bg`, `hotspots`, `interactions`, `onEnter` | Mostly ignored / invisible in v2 Timeline | Primary edit surface | Explore hit-test + verb matrix |
| `onEmptyClick` | Not edited | Explore Inspector「空白點擊」(persist round-trip) | YU-NO empty-room look |

Project-level glue: `startScene`, `verbs`, `items`, `fallback`, `transitionDefaults.toDialogue` / `fromDialogue` / `gotoScene`, `effectLibrary`, `fonts` (Font Manager).

### Runtime handoff (player)

1. Explore room → hotspot / onEnter action `Call { scene }` (often a dialogue id with `hasReturn`).
2. Player leaves Explore phase, runs dialogue beats until `exit: { type: "return" }`.
3. `Return` pops back to Explore; `transitionDefaults` pick fade ids (`toDialogue` / `fromDialogue`).
4. Explore also has inline `Say` (one-shot lines) without leaving the room — **not** the same as dialogue beats.

### Editor routes

| Hash | Root component | Notes |
|---|---|---|
| `#explore` | `ExploreApp` → `ExploreWorkspace` | Dark chrome; scene catalog; matrix / canvas |
| `#dialogue` or empty / `#v2` | `V2App` (default) or classic `App` if `localStorage galeng.uiVersion=classic` | Timeline + Script Library + Fonts |
| `#dialogue?scene=id&scripts=1` | v2 + open scene + Script Library panel | Deep link from Explore Call/Goto **腳本庫** buttons |

Helpers: `navigateToExploreEditor()`, `navigateToDialogueEditor({ sceneId, openScripts })` in `editorRoute.ts`. `main.tsx` swaps root on `hashchange` after `ensureShellCleanForLeave()` (`shellGate.ts`).

### Cross-links that exist today

- v2 TopBar → 「探險編輯器」→ `#explore`（離開前 `ensureShellCleanForLeave`）。
- Explore topbar → 「對話編輯器」→ `#dialogue`（同一道 gate）。
- Explore Inspector Call/Goto → 「腳本庫」→ `#dialogue?scene=…&scripts=1`.
- Script Library lists **both** kinds; an explore row opens `#explore?scene=`, a dialogue row opens the Timeline.
- Explore `sceneCatalog` computes dialogue `hasReturn` for dead-end Call warnings (Problems).

---

## 2. Overlap / 互保（what each does well）

### Explore-only（對白殼做唔到／唔應做）

- Hotspot geometry (rect / polygon), draw tools, verb × hotspot matrix, `visibleIf` / `enabledIf`.
- Interaction rules + Explore actions (`GotoScene`, `Call`, `GiveItem`, …).
- `onEnter`, `onEmptyClick`, room `bg`, project verbs/items/fallback/transitionDefaults (Explore settings panels).
- Pack-time Explore problem scan across all explore scenes; dead-end Call checks via catalog.

### Dialogue-only（探險殼做唔到）

- Beat Timeline / sheet, say speaker·text·voice, bgm/se/amb/cg/fx/movie/camera, roster, RouteTree, search, exportScript manuscript.
- Script Library (filter, archive, duplicate, manuscript export).
- Font Manager (`Project.fonts` roles + scale) in v2 settings.
- Full `exit` editing (choices / branch / call / return / end) as dialogue flow graph.

### Shared safely（兩邊都讀／寫得相對安全）

- Same host API: `/api/project`, `/api/scenes`, pack.
- Scene **id / title** conceptually shared (Explore edits title on explore scenes; dialogue creates dialogue-default scenes).
- `exit` on explore files: preserved when Explore saves (raw merge) — dialogue shell is the right place to edit Return/Call exits for dialogue scenes.
- Catalog + Script Library both see the full scene list from host.

### 互保做得好嘅

- **Call → dialogue → Return** is a first-class schema + player path; Explore Problems warn on Call to dialogue **without** reachable Return.
- **腳本庫 deep link** from Explore Call/Goto targets the right dialogue scene.
- Explore persist **does not delete** unknown/`exit` keys when saving rooms (overlay model).
- Script Library filters by `sceneKind` and Call/Return / unresolved goto — project-wide awareness.
- Packer collects Explore action asset refs (`on_enter`, `on_empty_click`, interactions) as well as dialogue beat refs.

---

## 3. Conflicts / bugs / footguns

### P0 — Dirty lost on shell switch — ✅ fixed

`main.tsx` 的 `hashchange` 先走 `ensureShellCleanForLeave`：dirty 時自動存檔；存檔拋錯，或存完 `getDirty()` 仍為真，就取消切換並把 hash 留在原殼。`beforeunload` 仍然不涵蓋同頁換根，這條路徑改由 shell gate 負責。

### P0 — Three shells, one mental model

Classic `App` vs v2 vs Explore. Default is v2 (ADR-093), but `#dialogue?scripts=1` looks nothing like `#explore`. Leo already hit this (腳本庫 vs 探險工作區). No project hub explaining 「呢個專案係 Click Room → 開 #explore」.

### P1 — Script Library opens explore scenes in Dialogue Timeline — ✅ fixed

Explore 列呼叫 `navigateToExploreEditor({ sceneId })`。對白列仍進時間軸。對白殼若仍把目前場景存成 explore，儲存前會先確認。

### P1 — Explore save always `beats: []` — ✅ fixed

`exploreSceneToApi` 不把 `beats` 當成探險擁有欄位；磁碟上已有的 beats 會留着。沒有 beats 陣列時才補 `[]`。

### P1 — `onEmptyClick` editor gap — ✅ fixed

Explore persist round-trips `onEmptyClick`; Inspector「空白點擊」edits the action list (empty = player fallback look / room title). Schema + player unchanged.

### P2 — Host `create_scene` always Dialogue

Empty beat + `scene_kind: Dialogue`. Explore「＋場景」uses Explore persist path (good), but Script Library「建立」and host API create dialogue scenes — easy to create the wrong kind for click-room.

### P2 — Font Manager / audio only in dialogue v2

Explore chrome has no Font panel; room authors changing ui/dialogue faces must bounce to v2 settings. Explore `Say` lines don’t go through dialogue Preview font path the same way.

### P2 — Scene list divergence

Explore catalog vs Script Library vs classic sidebar: different filters (Explore focuses rooms + dialogue hasReturn; Library shows archived toggle + beat stats). Same host data, different UX → 「邊個先係真相」.

### P2 — Rename / id rewrite

Still deferred (Script Manager). Broken Call/Goto targets across shells until rewrite lands.

### P3 — Classic vs v2 dual maintenance

Feature work (Script Library, Fonts, timeline polish) lands on v2 first; classic lags. Switching `galeng.uiVersion` changes the world again.

---

## 4. Gaps

| Gap | Why it hurts |
|---|---|
| No **unified project hub** (home): startScene kind → recommend `#explore` or `#dialogue` | Leo opened wrong shell |
| ~~No **cross-shell dirty gate** on `navigateTo*`~~ ✅ `shellGate.ts` | 離開前會存；存失敗就留在原殼 |
| No 「Open in Explore」 from Script Library for explore rows | Library only feeds Timeline |
| No 「Edit exit / Return」 hint inside Explore for Call targets | Authors bounce blindly |
| Fonts / msgBox not reachable from Explore | Split brain for click-room polish |
| Docs: `FONT_SCRIPT_MANAGERS.md` planned library; this review closes the shell-conflict story | Need one place Leo can read |

---

## 5. Recommendations（優先序）

1. **P0 — Shell switch save gate:** ✅ implemented (`shellGate.ts` + `main.tsx` hashchange): auto-save when dirty before `#explore` ↔ `#dialogue`; revert hash if save fails; `switchUiVersion` flushes before reload.
2. **P0 — Boot / hub cue:** after load project, if `startScene` is explore (or project has explore scenes), show a one-shot banner or default hash `#explore` for click-room-like projects; keep `#dialogue?scripts=1` as explicit deep link only.
3. **P1 — Kind-aware open:** ✅ Script Library explore → `#explore?scene=`; dialogue → Timeline. Explore save preserves raw `beats`. Dialogue save confirms before writing explore scenes.
4. **P1 — Preserve + expose `onEmptyClick`** ✅ Explore persist + Inspector「空白點擊」(YU-NO room look).
5. **P2 — Cross-links polish:** Explore 「腳本庫」already good; add symmetric 「喺探險編輯器開啟」from Library; surface Fonts shortcut from Explore settings strip.

Out of scope for quick wins: full shell merge, rename rewrite, classic retirement (document only until Leo chooses).

---

## 6. Quick reference — URLs

| Intent | URL |
|---|---|
| Click-room / hotspots | `http://127.0.0.1:5173/#explore` |
| Dialogue timeline | `http://127.0.0.1:5173/#dialogue` |
| Script Library | `http://127.0.0.1:5173/#dialogue?scripts=1` |
| Deep link scene + library | `http://127.0.0.1:5173/#dialogue?scene=<id>&scripts=1` |

Host API remains `http://127.0.0.1:3847` (proxied as `/api` from Vite).
