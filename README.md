# Galeng

[English](#english) · [繁體中文](#繁體中文)

A low-overhead Japanese-style ADV / galgame engine.

低開銷日系 ADV / galgame 引擎。

---

## English

A native player that fits classic PC specs, and an OpenCut-like Web editor whose timeline is **beats**, not seconds.

**Audience.** Chinese and English authors and players first. The *genre* is Japanese-style visual novel; the *product locales* are `zh-Hans`, `zh-Hant`, and `en`. Japanese may appear in scripts. This is not a Japan-domestic studio tool.

### What it is

- **Player** — native `player.exe` + `game.pak`. Rust and official SDL2. Target: Windows 8.1 / 10, Core 2 Duo, 2 GB RAM, DirectX 9, 1920×1080. Hardware budget: [`SPEC .txt`](SPEC%20.txt).
- **Editor** — local Web UI (Vite + React + TypeScript). Four panes: assets, preview, inspector, tracks. The X axis is beats.
- **Story** — JSON scenario IR is the only source of truth. A Kirikiri-like script can be *exported* for proofreading. v1 does not import scripts.

```
  Author (modern PC)                         Player (SPEC-class PC)
 ┌─────────────────────┐                    ┌──────────────────┐
 │  Editor (Web UI)    │       pack         │  player.exe      │
 │  + JS live preview  │ ───────────────►   │  + game.pak      │
 │  + local file host  │       .pak         │  SDL2 / D3D9     │
 └─────────┬───────────┘                    └──────────────────┘
           │  same Scenario IR (JSON)
           ▼
      packages/schema
```

### What it is not (v1)

- Not Electron, Tauri, or a browser as the player
- Not Live2D, Spine, 3D, or a Lua / Python VM
- Not a CapCut clone that edits video in seconds
- Not Kirikiri-compatible
- Not a Japanese-only tool
- Not macOS / Linux (Windows 8.1+ only)

### Requirements

- Windows 8.1 or later
- Rust stable (workspace edition 2021)
- pnpm 11.12.0 (pinned in `package.json`)
- Vendored SDL2 under `third_party/SDL2/`

Run every command from the **repository root**.

### Build and test

```powershell
pnpm install
cargo test
pnpm test
```

If `pnpm install` blocks on `esbuild`, run `pnpm approve-builds esbuild`.

### Author pack (no Rust / pnpm)

Download **`galeng-editor-<version>-windows-x64.zip`** from [Releases](https://github.com/pxxpkm/galeng-engine/releases). Unzip and double-click `galeng-editor/Galeng.bat`. The browser opens **http://127.0.0.1:3847**. Close the console to stop. Drag your own project folder (must contain `galeng.json`) onto `Galeng.bat`.

The Source code zip on the Release page is the repository, not the editor.

Maintainers: tag `v0.1.3` (or similar) and push; Actions builds the zip. Locally, `pack-author.bat` writes `out/galeng-editor/`.

### Editor

From the repo root, `editor.bat` starts and stops the host (`127.0.0.1:3847`) and Vite. It does not launch the player.

```
editor.bat start
editor.bat stop
editor.bat restart
```

After changing the host, use `restart`. Open **http://127.0.0.1:5173** (not `localhost`, not https).

Or two terminals:

```powershell
cargo build -p galeng-player
cargo run -p galeng-host -- --project examples/prologue
```

```powershell
pnpm --filter @galeng/editor dev
```

Click an asset to apply it to the current beat (`bg/` → background, `char/` → sprite, `bgm/` → music). Save writes JSON. Play from here launches the native player.

Work in your own project folder, not `examples/prologue`. Start the editor with:

```
editor.bat start D:\MyGame
```

### Play the prologue

```powershell
cargo run -p galeng-player --release -- --project examples/prologue
```

Tiny placeholder PNGs, a BGM loop, two voice clips, and a breeze SE live under `examples/prologue/assets/`. Missing pictures fall back to color blocks. Missing audio is silence. Click or Enter to advance. Esc quits.

Settings and saves: `%APPDATA%\Galeng\example-prologue\`.

### License

[MIT](LICENSE).

---

## 繁體中文

對齊經典 PC 規格的 Native 播放器，加上 OpenCut 式 Web 編輯器。時間軸的單位是 **beat（格）**，不是秒。

**給誰用。** 第一用戶是中文與英文的作者和玩家。題材是日系 ADV；產品界面是簡中、繁中、英文。劇本裡可以夾日文。這不是日本本土木方工具。

### 它是什麼

- **播放器** — 原生 `player.exe` + `game.pak`。Rust 與官方 SDL2。目標機：Windows 8.1 / 10、Core 2 Duo、2 GB RAM、DirectX 9、1920×1080。硬體預算見 [`SPEC .txt`](SPEC%20.txt)。
- **編輯器** — 本機 Web UI（Vite + React + TypeScript）。四欄：素材、預覽、屬性、軌。橫軸是 beat。
- **劇本** — JSON 場景 IR 是唯一真相。類 KAG 腳本只供匯出校對。v1 不做匯入。

### 它不是什麼（v1）

- 不是 Electron、Tauri，也不是用瀏覽器當播放器
- 不是 Live2D、Spine、3D，也沒有 Lua / Python 虛擬機
- 不是用秒剪片的 CapCut 仿品
- 不相容 Kirikiri
- 不是日文專用工具
- 不做 macOS / Linux（只保證 Windows 8.1+）

### 環境

- Windows 8.1 或更新
- Rust stable（workspace edition 2021）
- pnpm 11.12.0（寫在 `package.json`）
- SDL2 已放在 `third_party/SDL2/`

指令一律在**倉庫根目錄**跑。

### 建置與測試

```powershell
pnpm install
cargo test
pnpm test
```

若 `pnpm install` 卡住 `esbuild`，執行 `pnpm approve-builds esbuild`。

### 作者包（免 Rust／pnpm）

到 [Releases](https://github.com/pxxpkm/galeng-engine/releases) 下載 **`galeng-editor-<version>-windows-x64.zip`**。解壓後雙擊 `galeng-editor/Galeng.bat`。瀏覽器開 **http://127.0.0.1:3847**。關掉黑色視窗＝停編輯器。自己的專案資料夾（裡面要有 `galeng.json`）可以拖到 `Galeng.bat`。

Release 頁上 GitHub 自動附的 Source code 是源碼，不是作者包。

維護者：打 `v0.1.3`（這類）tag 並 push，Actions 會編 zip。本機可用 `pack-author.bat`。

### 編輯器

```
editor.bat start
editor.bat stop
editor.bat restart
```

改過 host 之後用 `restart`。瀏覽器開 **http://127.0.0.1:5173**（不要 `localhost`，不要 https）。

正式寫稿請用自己的專案資料夾，不要改 `examples/prologue`：

```
editor.bat start D:\我的遊戲
```

### 玩範例

```powershell
cargo run -p galeng-player --release -- --project examples/prologue
```

設定與存檔：`%APPDATA%\Galeng\example-prologue\`。

### 授權

[MIT](LICENSE)。
