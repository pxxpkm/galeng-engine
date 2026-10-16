# Click Room（MVP 範例）

tech-spec §6：1 房、4 熱區、1 物、2 開關、1 短對話、1 結局。

## 通關（玩家）

1. **開**書桌 → 抽屜開（`drawer_open`）
2. **拎**書桌 → 得到黃銅鎖匙
3. （可選）**講**管家 → 短對話提示後 Return
4. 對門 **用**鎖匙 → `door_open`，鎖匙經明確 `takeItem` 消耗（唔用 `consumeOnUse`）
5. **去**門 → 結局場景

## 出包

**Explore GUI（host 開住本專案時）：** 頂欄按 **出包** → `POST /api/pack` → 預設寫入專案 `export/game/game.pak`。

**CLI：**

```bash
cargo run -p galeng-packer -- --project examples/click-room --out /tmp/click-room.pak [--strict]
```

缺 SDL 時仍可驗證 packer／schema；player 畫面另計。

## 編輯器

可用 Explore 編輯器載入本專案 `galeng.json`＋`scenario/*.json`（HTTP persist 或 FS）。本目錄 JSON 結構對齊 editor `persist`／schema v2。

## Item use gestures (YU-NO P1)

- **Aim** (default): click an inventory chip, then click a hotspot. Door + key uses Aim (`"on": { "item": "key" }` ≡ `useMode: "aim"`).
- **Drag**: press an inventory chip, drag onto a hotspot, release. Demo: drag key onto the window for a different line (`"useMode": "drag"`).
- Hover a hotspot with multiple verbs and scroll the mouse wheel to cycle the single action button.

## Fonts & UI skin

- `font`: `fonts/noto-sans-tc-demo` — OFL subset of **Noto Sans CJK TC** (see `assets/fonts/OFL-NotoSans.txt`). Covers Click Room + common UI glyphs only; not the full typeface.
- `msgBox`: `ui/msgbox` — simple translucent panel PNG.
