# Audio Manager — Audit & MVP

Status: **MVP shipped** (editor panel). Date context: 2026-10-16.

Audience: Leo / parent agent.

---

## Current state (audit)

| Layer | What exists |
|---|---|
| **Beat Inspector** | Fold「音訊」: `bgm` (+fade), `se[]`, `amb` inherit/off; `say.voice` on dialogue lines. |
| **Project** | `titleBgm`, `musicGallery[]` (id + asset) edited in `ProjectFields` (Settings → Project). |
| **AssetOverview** | Cites `bgm` / `se` / `amb` / `voice` / `titleBgm` / `music`. |
| **Assets on disk** | Logical prefixes `bgm/`, `se/`, `amb/`, `voice/` (`assets.ts` / `beats.ts`). |
| **Player** | Plays silence when a referenced clip is missing; no dedicated mixer redesign in this MVP. |
| **Editor preview** | Shared `audition.ts` + `AuditionButton` (HTML `<audio>` via `mediaUrl`). |

**Gap before MVP:** No dedicated Audio Manager panel — authors hunted AssetOverview + ProjectFields separately. Explore Settings had Fonts only.

---

## MVP (this change)

1. **`AudioPanel.tsx` (v2)** — Settings nested page:
   - Filter chips: All / BGM / SE / Amb / Voice
   - Library list from `listAudioLogicals` / `assetLists`
   - Per row: logical path, optional cite count (`overviewOf` when scenes available), Play/Stop via `AuditionButton`
   - Project section: **titleBgm** `AssetField`; **musicGallery** list (id + asset) via `patchMusicGalleryItem` / `addMusicItem` / `removeMusicGalleryItem`
2. **Dialogue Settings** — main page button「音訊 / Audio」→ page `"audio"` (same pattern as Fonts).
3. **Explore Settings** — same Audio page via `AudioPanelHost` (thin adapter; no scenes → cite counts from project-only cites + orphans).
4. **TopBar** — **not** cluttered; Settings path is enough.
5. **i18n** — `editor.audioPanel*` (+ filter / empty / cite / gallery hint) in en + zh-Hant + zh-Hans.
6. **Helpers** — `apps/editor/src/audioPanel.ts` (pure filter + gallery patch); Vitest coverage.
7. **ProjectFields** — music gallery remains editable there too (shared `galeng.json` fields); Audio panel documents this.

---

## How to open

- **Dialogue:** Settings (gear) → **音訊 / Audio**
- **Explore:** Settings (gear) → **音訊 / Audio**
- Save project as usual (Dialogue dirty save / Explore Settings Save).

---

## Phase 2 (out of scope)

- Player mixer redesign / per-channel volume schema
- Ducking rules
- Waveform UI
- Drag-drop import / batch rename
- Unused-audio purge workflow
- Explore interaction SE browser beyond listing

---

## Files

| Path | Role |
|---|---|
| `apps/editor/src/audioPanel.ts` | Pure helpers |
| `apps/editor/src/audioPanel.test.ts` | Unit tests |
| `apps/editor/src/v2/AudioPanel.tsx` | Panel UI |
| `apps/editor/src/v2/Dialogs.tsx` | Settings page `"audio"` |
| `apps/editor/src/explore/ExploreSettings.tsx` | Explore Settings entry |
| `packages/i18n/locales/{en,zh-Hant,zh-Hans}.json` | Strings |
| `docs/AUDIO_MANAGER.md` | This doc |
