# Font Manager & Script Manager — Scope Draft

Status: **planning only** (no implementation in this doc).  
Audience: Leo / parent agent. Date context: 2026-10-16.

---

## Current state (audit)

### Fonts today

| Layer | What exists |
|---|---|
| **Schema** | `Project.font?: string` (logical under `fonts/`), `Project.msgBox?: string` (UI image). No weights, sizes, roles, or fallbacks. |
| **Editor** | AssetOverview + ProjectFields: pick one project font / msgBox from asset lists. Preview uses **browser `sans-serif`**, not the project face. |
| **Player** | `GameFont::load_preferred(project.font, locale, source)` → project face then Windows system CJK chain (`msjh` / `msyh` / …). Rasterizer: **fontdue** + 2× supersample. Microsoft system fonts **blocked** as project fonts. |
| **click-room** | Ships OFL **Noto Sans CJK TC Bold** subset `fonts/noto-sans-tc-demo.otf` (~120KB) + `ui/msgbox.png`. |
| **Hardcoded in `draw.rs`** (logical 1920×1080) | Dialogue body **34**, speaker **28**, Explore pill **30**, inventory **26**, HUD **24**, title game name **72**, title/menu buttons **32**, settings rows **28**, backlog ~26–28. Colors: dialogue white/gold on msg box; soft light chrome for buttons (post A+B+C). **No** schema knobs for any of these. |

**Gap:** One global face only; no Medium/Bold roles; no per-UI size table; editor cannot preview real glyphs; no import/validate/license UI; no fallback face list in project JSON.

### Scripts today

| Layer | What exists |
|---|---|
| **On disk** | `scenario/<id>.json` per scene (beats + exit + optional explore hotspots/interactions). Host: list/create/get/put/delete + archive/unarchive. |
| **Schema** | `Scene` (`id`, `title`, `sceneKind` dialogue|explore, `beats[]`, `exit`, explore fields). `Beat` (bg/chars/say/bgm/se/amb/fx/movie/camera/cg/set/label). `Say` (speaker, text, voice, autoAdvance). `Exit` = Next / Choices / Branch / Call / Return / End. |
| **Editor — dialogue** | Classic `App.tsx` + v2 (`Timeline`, `Inspector`, `Sidebar`, `RosterEditor`): edit beats in the open scene; scene list; search (text/speaker/asset); route tree (`RouteTree`); roster/speakers; goto/call validation; `exportScript.ts` → human-readable `@bg` / say export (one-way). |
| **Editor — explore** | Separate `#explore` route: hotspots, interactions, verb matrix — not a “script manuscript” view. |
| **Missing for a dedicated Script Manager** | Project-wide script library UI (filter by kind/tag/speaker); manuscript / screenplay mode; import from text; multi-scene batch ops; character voice line browser; localization (per-locale say); diff/review; graph that includes Call/Return stacks; script “modules” or includes; AI-assist hooks as first-class (optional later). |

**Gap:** Scripts are edited **inside** the dialogue timeline of one scene at a time. There is export-to-text but no import, no library panel, no manuscript workflow, no locale variants.

---

## 1) Font Manager

### Goal
Let authors pick, validate, and role-map project fonts (and basic type scale) in the editor, with the player loading those roles instead of magic numbers alone.

### MVP (must ship first)

1. **Font library panel** (dedicated, not only AssetOverview dropdown): list `assets/fonts/*`, show face name / format / approximate file size, OFL/license note field (free text or `LICENSE*` sidecar).
2. **Roles in project JSON:** at least `ui` (menus/HUD/pill) and `dialogue` (say body + speaker); both default to today’s single `font` for back-compat.
3. **Import / assign:** set role → logical `fonts/…`; reject blocked Microsoft system fonts (already in packer/player).
4. **Player:** `load_preferred` loads role faces; draw paths pick dialogue vs ui face (sizes still constants initially).
5. **Editor preview:** dialogue Preview uses the assigned dialogue font via `@font-face` / loaded blob when possible (fallback: system).
6. **click-room:** keep Bold subset; document as demo ui+dialogue face.

### Phase 2

- Weight aliases (`regular` / `medium` / `bold`) if multiple files exist, or variable-font axis note.
- **Type scale table** in project: `dialogueBody`, `speaker`, `explorePill`, `hud`, `title` sizes (f32, logical px).
- Fallback face list per locale (project-level), not only OS probe.
- Glyph coverage report (“missing 書房?”) against scenario text.
- Optional outline/shadow for light-on-dark or dark-on-light (player draw helper).
- msgBox / chrome still separate (UI skin); do **not** fold full theme editor into Font Manager.

### Data model (proposed)

```json
{
  "font": "fonts/noto-sans-tc-demo",
  "fonts": {
    "dialogue": "fonts/noto-sans-tc-demo",
    "ui": "fonts/noto-sans-tc-demo",
    "title": null,
    "scale": {
      "dialogueBody": 34,
      "speaker": 28,
      "explorePill": 30,
      "inventory": 26,
      "hud": 24,
      "title": 72,
      "menu": 32
    }
  }
}
```

- Keep top-level `font` as deprecated alias = `fonts.dialogue ?? fonts.ui`.
- Schema: new optional `Project.fonts: FontConfig`; validate logicals under `fonts/`.

### Editor UI

- **New panel:** “字型 / Fonts” in v2 sidebar (or Dialogs hub), **alongside** AssetOverview — do not only extend the one-line dropdown.
- AssetOverview keeps cite links into the Font panel.
- Actions: assign role, open folder hint, show license sidecar, “scan missing glyphs” (Phase 2).

### Player runtime hooks

- `GameFont` bank: `dialogue` + `ui` (share one `GameFont` if same logical).
- `draw_view` / `draw_button` / explore chrome take the right face + optional scale from `FontConfig` with hardcoded defaults as fallback.
- Packer: pack all referenced font logicals; block system fonts (existing).

### Effort
**M** (MVP ~1–2 weeks calendar with tests). Phase 2 scale + coverage **M**.

### Dependencies / risks

- Large CJK files in git/pak — prefer subsets or external asset root; document size policy.
- Editor `@font-face` for TTC/OTF browser support varies; Preview may stay approximate.
- Dual-face draw must not break say paging (`saypage` uses one face metrics).

---

## 2) Script Manager

### Goal
Treat dialogue/explore scripts as a **first-class library**: browse, filter, manuscript-edit, and validate across the whole project — not only the open scene’s timeline.

### MVP (must ship first)

1. **Script Library panel:** all scenes from `/api/scenes` (+ archived toggle); columns: id, title, `sceneKind`, beat count, exit kind, missing-goto flags.
2. **Open → existing timeline/inspector** (reuse v2 Timeline; Script Manager is the **router/library**, not a rewrite of beat editing on day one).
3. **Filters:** kind (dialogue/explore), text search (reuse `search.ts`), speaker (roster), “has Call/Return”, “has unresolved goto”.
4. **Batch-ish ops:** create scene, duplicate, archive/unarchive, rename id (careful: rewrite gotos — MVP may “create + warn” and leave rename to Phase 2).
5. **Manuscript view (read-mostly MVP):** per-scene or multi-scene screenplay using current `exportScript.ts` rendering inside the panel; copy/export all (already exists) with one click from library.
6. **Deep links:** from Explore interaction “toDialogue” → jump to that script in library + timeline.

### Phase 2

- **Import manuscript** → beats (parse `@bg` / `Speaker: line` subset of export format).
- **Rename scene** with project-wide goto/Call rewrite + Explore interaction targets.
- **Tags / folders** (`scriptTags` on Scene or sidecar index).
- **Locale layers:** `say.variants["zh-Hans"]` or parallel scene files — big product decision.
- Call stack graph (RouteTree + Call/Return).
- Voice line sheet (speaker × line × voice asset).
- Diff against git / last backup.
- Optional AI assist: “expand outline → beats” behind explicit user action (not silent).

### Data model

- **MVP:** no schema break — library is a view over existing `Scene` JSON + host APIs.
- **Phase 2 additive:**

```json
{
  "id": "dlg_butler",
  "title": "管家提示",
  "sceneKind": "dialogue",
  "scriptTags": ["demo", "study"],
  "beats": [ ... ],
  "exit": { "type": "return" }
}
```

- Optional project index `scripts/index.json` only if listing becomes slow (avoid unless needed).

### Editor UI

- **New top-level surface:** “腳本 / Scripts” (sibling to Dialogue timeline and Explore), or a left-rail Library that always stays visible in v2.
- Reuse: Timeline, Inspector, Roster, SearchPalette, RouteTree, exportScript.
- Do **not** merge Explore hotspot editing into Script Manager MVP — link out to `#explore` for room scripts.

### Player runtime hooks

- **MVP:** none (editor/host only). Runtime already loads scenes by id.
- Later: locale pack selection if variants land.

### Effort
**M** for library + manuscript read + filters; **L** if MVP wrongly includes import + rename rewrite + l10n.

### Dependencies / risks

- Scene id rename without reference rewrite breaks gotos / Explore `toDialogue`.
- Export format is lossy (not all beat fields) — import must be conservative.
- Dual editors (classic App vs v2) — implement library on **v2 + host API** first.
- Explore scenes mix spatial data with optional beats — library must show kind clearly.

---

## Recommended build order

1. **Font Manager MVP first (1–2 weeks)** — unblocks Leo’s “字好核突 / 要可調” without waiting on script UX; small schema surface; player changes localized.
2. **Script Manager MVP next** — library + manuscript + filters on existing APIs; biggest workflow win for writing.
3. **Parallel only if two people:** Font player wiring ∥ Script library UI (shared schema freeze first).

### Do **not** do yet

- Full **theme / skin editor** (colors, nine-slice chrome, cursor packs) — separate epic; msgBox stays a single asset.
- Variable-font full axis UI.
- Bidirectional perfect screenplay round-trip.
- Per-line localization matrix.
- Replacing Explore editor with Script Manager.
- Shipping full Noto CJK TTC in-repo (keep subsets / asset-root policy).

---

## Suggested first tickets (when Leo says go)

**Fonts**
1. Schema `FontConfig` + validate + back-compat `font`.
2. Player load ui/dialogue roles + use in draw (defaults = current constants).
3. Editor Fonts panel + assign roles + Preview font-face.

**Scripts**
1. Script Library panel (list/filter/open).
2. Embed exportScript manuscript pane + export all.
3. Deep link from Explore dialogue targets; unresolved-goto badges.

---

## One-page summary for Leo

| System | MVP | Not yet |
|---|---|---|
| **字型管理** | 字型庫、對話/UI 兩角色、匯入指定、player 照角色載入、編輯器預覽盡量用真字型 | 完整主題、游標包、全量 CJK 上庫 |
| **腳本管理** | 獨立腳本庫、篩選、開返現有時間軸、稿紙預覽/匯出、連 Explore | 稿紙完美匯入、改名全專案重寫、多語言表 |



---

## MVP status (implemented)

Font Manager MVP landed: `Project.fonts` roles + optional scale, player `FontSet`/`TypeScale`, editor Fonts panel, Preview FontFace, click-room wired to Bold subset for dialogue/ui/title.


### Script Manager MVP (implemented)

Script Library panel in v2 (top bar **腳本**): list/filter/manuscript/export; open → timeline; Explore Call/Goto **腳本庫** deep link (`#dialogue?scene=&scripts=1`). Rename-with-rewrite and manuscript import deferred.
