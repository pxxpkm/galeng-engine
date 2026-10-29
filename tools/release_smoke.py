#!/usr/bin/env python3
"""Release smoke for the author zip (Q04).

Unpack a clean copy of the author zip (or the release folder layout), start
galeng-host, open the project, export a pak, then run galeng-player --diag.

--diag does not open the game window. If the player still cannot start because
there is no display, SDL, or SDL2.dll, that step is skipped with a message.
Pass --require-player to fail instead, or --skip-player to not try.

Examples:
  python3 tools/release_smoke.py --self-test
  python3 tools/release_smoke.py --zip galeng-editor-1.0-windows-x64.zip
  python3 tools/release_smoke.py --layout out/galeng-editor
  python3 tools/release_smoke.py --assemble
  py -3 tools\\release_smoke.py --zip galeng-editor-1.0-windows-x64.zip
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path


class SmokeFail(Exception):
    def __init__(self, message: str, work: Path | None = None) -> None:
        super().__init__(message)
        self.work = work


REPO = Path(__file__).resolve().parents[1]

DISPLAY_HINTS = (
    "sdl",
    "display",
    "wayland",
    "libgl",
    "video driver",
    "sdl2.dll",
    "libsdl",
    "shared librar",
    "cannot open shared object",
    "no display",
    "audiodriver",
    "alsa",
    "winerror 126",
    "error while loading",
)


def main(argv: list[str] | None = None) -> int:
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except (AttributeError, OSError):
        pass
    args = parse_args(argv)
    if args.self_test:
        return self_test()
    try:
        run(args)
    except SmokeFail as exc:
        print(f"[galeng-smoke] FAIL: {exc}", file=sys.stderr)
        if exc.work is not None:
            print(f"[galeng-smoke] left work dir at {exc.work}", file=sys.stderr)
        return 1
    return 0


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--zip", type=Path, help="author zip to unpack into a clean directory")
    parser.add_argument("--layout", type=Path, help="unpacked author folder (galeng-host + editor/)")
    parser.add_argument(
        "--assemble",
        action="store_true",
        help="build a layout from this repo, zip it, then unpack that zip",
    )
    parser.add_argument(
        "--project",
        default="examples/prologue",
        help="project directory inside the pack (default: examples/prologue)",
    )
    parser.add_argument("--skip-player", action="store_true", help="do not run the player")
    parser.add_argument(
        "--require-player",
        action="store_true",
        help="fail when the player cannot run (display, SDL, or missing binary)",
    )
    parser.add_argument("--self-test", action="store_true", help="run this script against a stub pack")
    parser.add_argument("--work", type=Path, help="use this directory (kept); default is a temp dir")
    parser.add_argument("--player-timeout", type=float, default=45.0)
    args = parser.parse_args(argv)
    if args.skip_player and args.require_player:
        parser.error("pass only one of --skip-player and --require-player")
    if args.zip and args.layout:
        parser.error("pass only one of --zip and --layout")
    if args.assemble and (args.zip or args.layout):
        parser.error("--assemble cannot be combined with --zip or --layout")
    return args


def run(args: argparse.Namespace) -> None:
    own_work = args.work is None
    work = args.work if args.work is not None else Path(tempfile.mkdtemp(prefix="galeng-smoke-"))
    work.mkdir(parents=True, exist_ok=True)
    host_proc: subprocess.Popen[bytes] | None = None
    log_path = work / "host.log"
    log_fh = open(log_path, "wb")
    ok = False
    caught: SmokeFail | None = None
    try:
        kind, source = choose_source(args)
        print(f"[galeng-smoke] source {kind}: {source}")
        pack = materialize(kind, source, work)
        print(f"[galeng-smoke] pack {pack}")
        project = (pack / args.project).resolve()
        if not (project / "galeng.json").is_file():
            raise SmokeFail(f"no project file: {project / 'galeng.json'}")
        editor = pack / "editor"
        if not (editor / "index.html").is_file():
            raise SmokeFail(f"author pack has no editor/index.html: {editor}")
        bat = pack / "Galeng.bat"
        if bat.is_file():
            print("[galeng-smoke] Galeng.bat present")
        else:
            print("[galeng-smoke] note: Galeng.bat missing (Windows double-click launcher)")

        host = host_bin(pack)
        if host is None:
            raise SmokeFail(f"galeng-host is missing in {pack}")
        port = free_port()
        base = f"http://127.0.0.1:{port}"
        cmd = command_for(host) + [
            "--project",
            str(project),
            "--static",
            str(editor),
            "--bind",
            f"127.0.0.1:{port}",
        ]
        print(f"[galeng-smoke] host {base}")
        host_proc = subprocess.Popen(
            cmd,
            cwd=str(pack),
            stdout=log_fh,
            stderr=subprocess.STDOUT,
            start_new_session=(os.name != "nt"),
        )
        wait_health(host_proc, base, log_path)
        print("[galeng-smoke] health ok")
        project_doc = get_json(base + "/api/project")
        if not isinstance(project_doc, dict) or not project_doc.get("id"):
            raise SmokeFail(f"opened project is not a document with id: {project_doc!r}")
        project_id = str(project_doc["id"])
        scenes = get_json(base + "/api/scenes")
        if not isinstance(scenes, list) or not scenes:
            raise SmokeFail(f"project {project_id} opened but the scene list is empty")
        scene_ids = [item.get("id") for item in scenes if isinstance(item, dict)]
        if project_id == "example-prologue" and "park_01" not in scene_ids:
            raise SmokeFail(f"example-prologue is missing park_01: {scene_ids}")
        print(f"[galeng-smoke] project {project_id} scenes={len(scenes)}")
        check_editor_page(base)
        pak_path, pak_field = export_pak(base, project)
        print(f"[galeng-smoke] exported {pak_field} ({pak_path.stat().st_size} bytes)")
        stop_proc(host_proc)
        host_proc = None
        run_player(args, pack, pak_path)
        print("[galeng-smoke] ok")
        ok = True
    except SmokeFail as exc:
        caught = exc
        raise
    finally:
        if host_proc is not None:
            stop_proc(host_proc)
        log_fh.close()
        if own_work and ok:
            shutil.rmtree(work, ignore_errors=True)
        elif own_work and not ok and caught is not None:
            caught.work = work
        elif own_work and not ok:
            print(f"[galeng-smoke] left work dir at {work}", file=sys.stderr)


def choose_source(args: argparse.Namespace) -> tuple[str, Path]:
    if args.zip:
        if not args.zip.is_file():
            raise SmokeFail(f"zip not found: {args.zip}")
        return "zip", args.zip
    if args.layout:
        if not args.layout.is_dir():
            raise SmokeFail(f"layout not found: {args.layout}")
        return "layout", args.layout
    if args.assemble:
        return "assemble", REPO
    packed = REPO / "out" / "galeng-editor"
    if is_pack(packed):
        return "layout", packed
    zips = sorted(REPO.glob("galeng-editor*.zip")) + sorted((REPO / "out").glob("galeng-editor*.zip"))
    if zips:
        return "zip", zips[0]
    return "assemble", REPO


def materialize(kind: str, source: Path, work: Path) -> Path:
    unpack = work / "unpack"
    if unpack.exists():
        shutil.rmtree(unpack)
    unpack.mkdir(parents=True)
    if kind == "zip":
        safe_extract(source, unpack)
    elif kind == "layout":
        shutil.copytree(source, unpack / source.name)
    elif kind == "assemble":
        stage = work / "stage"
        assemble_layout(source, stage)
        archive = work / "author.zip"
        zip_dir(stage, archive, top="galeng-editor")
        print(f"[galeng-smoke] assembled zip {archive}")
        safe_extract(archive, unpack)
    else:
        raise SmokeFail(f"unknown source {kind}")
    return locate_pack(unpack)


def assemble_layout(repo: Path, dest: Path) -> None:
    host = newest_built(repo, "galeng-host")
    if host is None:
        raise SmokeFail(
            "no galeng-host in target/release or target/debug. "
            "Build it with `cargo build -p galeng-host --release`, or pass --zip."
        )
    editor = repo / "apps" / "editor" / "dist"
    if not (editor / "index.html").is_file():
        raise SmokeFail("apps/editor/dist/index.html missing. Run: pnpm --filter @galeng/editor build")
    project = repo / "examples" / "prologue"
    if not (project / "galeng.json").is_file():
        raise SmokeFail(f"missing {project / 'galeng.json'}")
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    shutil.copy2(host, dest / host.name)
    player = newest_built(repo, "galeng-player")
    if player is not None:
        shutil.copy2(player, dest / player.name)
    sdl = repo / "third_party" / "SDL2" / "lib" / "x64" / "SDL2.dll"
    if sdl.is_file():
        shutil.copy2(sdl, dest / "SDL2.dll")
    shutil.copytree(editor, dest / "editor")
    shutil.copytree(
        project,
        dest / "examples" / "prologue",
        ignore=shutil.ignore_patterns("export"),
    )
    for name in ("Galeng.bat", "README.txt"):
        src = repo / "tools" / "author" / name
        if src.is_file():
            shutil.copy2(src, dest / name)


def newest_built(repo: Path, stem: str) -> Path | None:
    found: list[Path] = []
    for config in ("release", "debug"):
        directory = repo / "target" / config
        for name in (f"{stem}.exe", stem):
            path = directory / name
            if path.is_file():
                found.append(path)
    if not found:
        return None
    return max(found, key=lambda path: path.stat().st_mtime)


def is_pack(root: Path) -> bool:
    return root.is_dir() and host_bin(root) is not None and (root / "editor" / "index.html").is_file()


def host_bin(root: Path) -> Path | None:
    return first_file(root, ("galeng-host.exe", "galeng-host"))


def player_bin(root: Path) -> Path | None:
    return first_file(root, ("galeng-player.exe", "galeng-player"))


def first_file(root: Path, names: tuple[str, ...]) -> Path | None:
    for name in names:
        path = root / name
        if path.is_file():
            return path
    return None


def locate_pack(root: Path) -> Path:
    found: list[Path] = []
    if is_pack(root):
        found.append(root.resolve())
    if root.is_dir():
        for child in root.iterdir():
            if child.is_dir() and is_pack(child):
                resolved = child.resolve()
                if resolved not in found:
                    found.append(resolved)
    if len(found) == 1:
        return found[0]
    if not found:
        raise SmokeFail(f"author pack not found under {root} (need galeng-host and editor/index.html)")
    raise SmokeFail("more than one author pack: " + ", ".join(str(path) for path in found))


def safe_extract(archive: Path, dest: Path) -> None:
    dest = dest.resolve()
    with zipfile.ZipFile(archive) as zf:
        for info in zf.infolist():
            name = info.filename.replace("\\", "/")
            if not name or name.endswith("/"):
                continue
            parts = Path(name).parts
            if name.startswith("/") or ".." in parts:
                raise SmokeFail(f"unsafe zip entry: {info.filename}")
            target = (dest / Path(*parts)).resolve()
            try:
                target.relative_to(dest)
            except ValueError:
                raise SmokeFail(f"unsafe zip entry: {info.filename}") from None
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info) as src, open(target, "wb") as out:
                shutil.copyfileobj(src, out)
            mode = info.external_attr >> 16
            if mode & 0o777:
                os.chmod(target, mode & 0o777)


def zip_dir(src: Path, archive: Path, top: str) -> None:
    if archive.exists():
        archive.unlink()
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(src.rglob("*")):
            if not path.is_file():
                continue
            rel = path.relative_to(src).as_posix()
            add_zip_bytes(zf, f"{top}/{rel}", path.read_bytes(), path.stat().st_mode & 0o777)


def add_zip_bytes(zf: zipfile.ZipFile, arcname: str, data: bytes, mode: int) -> None:
    info = zipfile.ZipInfo(arcname)
    info.external_attr = (mode & 0o777) << 16
    info.create_system = 3
    zf.writestr(info, data)


def command_for(binary: Path) -> list[str]:
    """Run a shebang script via this interpreter. Real exe/ELF files run directly."""
    if not binary.name.lower().endswith(".exe"):
        try:
            head = binary.read_bytes()[:2]
        except OSError:
            head = b""
        if head == b"#!":
            return [sys.executable, str(binary)]
    return [str(binary)]


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def wait_health(proc: subprocess.Popen[bytes], base: str, log_path: Path) -> None:
    deadline = time.time() + 20
    last = "no response"
    while time.time() < deadline:
        if proc.poll() is not None:
            raise SmokeFail(f"host exited {proc.returncode} before /api/health.\n{tail(log_path)}")
        try:
            status, raw = http("GET", base + "/api/health", timeout=2)
            if status == 200 and raw.strip() == b"ok":
                return
            last = f"HTTP {status} {raw[:200]!r}"
        except urllib.error.URLError as exc:
            last = str(exc)
        time.sleep(0.1)
    raise SmokeFail(f"timed out waiting for /api/health ({last}).\n{tail(log_path)}")


def get_json(url: str) -> object:
    try:
        status, raw = http("GET", url, timeout=30)
    except urllib.error.URLError as exc:
        raise SmokeFail(f"GET {url} failed: {exc}") from exc
    if status != 200:
        raise SmokeFail(f"GET {url} failed: HTTP {status} {raw.decode('utf-8', 'replace')[:400]}")
    try:
        return json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise SmokeFail(f"GET {url} returned non-JSON: {exc}") from exc


def check_editor_page(base: str) -> None:
    try:
        status, raw = http("GET", base + "/", timeout=30)
    except urllib.error.URLError as exc:
        raise SmokeFail(f"editor page failed: {exc}") from exc
    if status != 200:
        raise SmokeFail(f"editor index HTTP {status}")
    html = raw.decode("utf-8", "replace")
    if "galeng" not in html.lower():
        raise SmokeFail("editor index is not the Galeng page")
    marker = 'src="'
    start = html.find(marker)
    if start == -1:
        return
    rest = html[start + len(marker) :]
    end = rest.find('"')
    if end == -1:
        return
    src = rest[:end]
    if src.startswith("/"):
        script_url = base + src
    else:
        script_url = base + "/" + src
    status, script = http("GET", script_url, timeout=30)
    if status != 200 or len(script) < 8:
        raise SmokeFail(f"editor script {src} was not served (HTTP {status})")
    print("[galeng-smoke] editor page ok")


def export_pak(base: str, project: Path) -> tuple[Path, str]:
    try:
        status, raw = http("POST", base + "/api/pack", {}, timeout=180)
    except urllib.error.URLError as exc:
        raise SmokeFail(f"export request failed: {exc}") from exc
    text = raw.decode("utf-8", "replace")
    if status != 200:
        raise SmokeFail(f"export failed: HTTP {status} {text[:500]}")
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise SmokeFail(f"export returned a 200 that is not JSON: {exc}") from exc
    pak_field = payload.get("pak") if isinstance(payload, dict) else None
    if not isinstance(pak_field, str) or not pak_field.strip():
        raise SmokeFail(f"export JSON has no pak path: {payload!r}")
    pak_path = Path(pak_field)
    if not pak_path.is_absolute():
        pak_path = project / pak_path
    if not pak_path.is_file():
        raise SmokeFail(f"export reported success but {pak_path} is missing")
    try:
        with zipfile.ZipFile(pak_path) as zf:
            names = set(zf.namelist())
    except zipfile.BadZipFile as exc:
        raise SmokeFail(f"export wrote a file that is not a pak: {exc}") from exc
    if "galeng.json" not in names:
        raise SmokeFail("exported pak has no galeng.json")
    leftovers = [
        path.name
        for path in pak_path.parent.iterdir()
        if path.is_file() and path.name.startswith(pak_path.name) and path.name.endswith(".tmp")
    ]
    if leftovers:
        raise SmokeFail(f"export left temp pak files: {leftovers}")
    return pak_path, pak_field


def run_player(args: argparse.Namespace, pack: Path, pak_path: Path) -> None:
    if args.skip_player:
        print("[galeng-smoke] SKIP player: disabled with --skip-player.")
        return
    player = player_bin(pack)
    if player is None:
        skip_or_fail(args, "this author pack has no galeng-player. Player smoke skipped.")
        return
    env = os.environ.copy()
    # dummy drivers let --diag read the pak on a machine with no display.
    # Windows keeps the real driver; a hang or SDL failure is skipped below.
    if os.name != "nt":
        env.setdefault("SDL_VIDEODRIVER", "dummy")
        env.setdefault("SDL_AUDIODRIVER", "dummy")
    cmd = command_for(player) + ["--diag", "--pak", str(pak_path.resolve())]
    print(f"[galeng-smoke] player {' '.join(cmd)}")
    try:
        completed = subprocess.run(
            cmd,
            cwd=str(pack),
            env=env,
            timeout=args.player_timeout,
            capture_output=True,
        )
    except subprocess.TimeoutExpired:
        skip_or_fail(
            args,
            f"player did not exit within {args.player_timeout:.0f}s. "
            "It may be waiting for a display. Player smoke skipped. "
            "Re-run on a machine with a display, or pass --skip-player. "
            "Pass --require-player to fail instead.",
        )
        return
    except OSError as exc:
        skip_or_fail(
            args,
            "player could not start "
            f"({exc}). This usually means SDL2.dll / libSDL2 is missing, or there is no display. "
            "Player smoke skipped.",
        )
        return
    output = (completed.stdout + b"\n" + completed.stderr).decode("utf-8", "replace")
    diag_path = player.resolve().parent / "UserData" / "diag.txt"
    diag = diag_path.read_text(encoding="utf-8", errors="replace") if diag_path.is_file() else ""
    if completed.returncode == 0 and "pak: ok" in diag:
        print("[galeng-smoke] player diag ok (pak: ok)")
        return
    if completed.returncode == 0:
        raise SmokeFail(
            "player --diag exited 0 but did not report 'pak: ok'. "
            f"diag={diag!r} output={output[-500]!r}"
        )
    blob = output.lower()
    if completed.returncode < 0 or any(hint in blob for hint in DISPLAY_HINTS):
        skip_or_fail(
            args,
            "player needs a display or SDL runtime and did not finish "
            f"(exit {completed.returncode}). Player smoke skipped. "
            f"Last output: {output[-400:].strip()}",
        )
        return
    raise SmokeFail(f"player --diag failed (exit {completed.returncode}): {output[-500:].strip()}")


def skip_or_fail(args: argparse.Namespace, message: str) -> None:
    if args.require_player:
        raise SmokeFail(message)
    print(f"[galeng-smoke] SKIP player: {message}")


def http(method: str, url: str, body: object | None = None, timeout: float = 30) -> tuple[int, bytes]:
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read()


def tail(path: Path, lines: int = 40) -> str:
    if not path.is_file():
        return "(no host log)"
    text = path.read_text(encoding="utf-8", errors="replace")
    chunk = "\n".join(text.splitlines()[-lines:])
    return chunk or "(empty host log)"


def stop_proc(proc: subprocess.Popen[bytes]) -> None:
    if proc.poll() is not None:
        return
    try:
        if os.name != "nt":
            os.killpg(proc.pid, 15)
        else:
            proc.terminate()
    except OSError:
        proc.terminate()
    try:
        proc.wait(timeout=5)
        return
    except subprocess.TimeoutExpired:
        pass
    try:
        if os.name != "nt":
            os.killpg(proc.pid, 9)
        else:
            proc.kill()
    except OSError:
        proc.kill()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        pass


STUB_HOST = r'''#!/usr/bin/env python3
import json, os, sys, zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

args = sys.argv[1:]

def flag(name):
    if name not in args:
        sys.stderr.write("missing %s\n" % name)
        raise SystemExit(2)
    return args[args.index(name) + 1]

project = Path(flag("--project")).resolve()
static_dir = Path(flag("--static")).resolve()
bind = flag("--bind")
host, port_s = bind.rsplit(":", 1)
if not (project / "galeng.json").is_file():
    sys.stderr.write("no galeng.json\n")
    raise SystemExit(1)
if not (static_dir / "index.html").is_file():
    sys.stderr.write("no index.html\n")
    raise SystemExit(1)

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *a):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % a))

    def _send(self, code, body, content_type="application/json"):
        data = body if isinstance(body, bytes) else body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = unquote(urlparse(self.path).path)
        if path == "/api/health":
            self._send(200, b"ok", "text/plain")
            return
        if path == "/api/project":
            self._send(200, (project / "galeng.json").read_bytes())
            return
        if path == "/api/scenes":
            scenes = []
            folder = project / "scenario"
            if folder.is_dir():
                for item in sorted(folder.glob("*.json")):
                    try:
                        doc = json.loads(item.read_text(encoding="utf-8"))
                        scenes.append({"id": doc.get("id", item.stem)})
                    except Exception:
                        scenes.append({"id": item.stem})
            self._send(200, json.dumps(scenes).encode("utf-8"))
            return
        rel = path.lstrip("/") or "index.html"
        file = (static_dir / rel).resolve()
        try:
            file.relative_to(static_dir)
        except ValueError:
            self._send(404, b"no", "text/plain")
            return
        if not file.is_file():
            self._send(404, b"no", "text/plain")
            return
        ctype = "text/html" if file.suffix == ".html" else "text/javascript"
        self._send(200, file.read_bytes(), ctype)

    def do_POST(self):
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        if path != "/api/pack":
            self._send(404, b"no", "text/plain")
            return
        if os.environ.get("GALENG_SMOKE_STUB_PACK") == "fail":
            self._send(500, b"pack failed", "text/plain")
            return
        try:
            body = json.loads(raw.decode("utf-8") or "{}")
        except Exception:
            body = {}
        out = body.get("out") if isinstance(body, dict) else None
        if isinstance(out, str) and out.strip():
            dest = Path(out)
            if not dest.is_absolute():
                dest = project / dest
        else:
            dest = project / "export" / "game"
        dest.mkdir(parents=True, exist_ok=True)
        pak = dest / "game.pak"
        tmp = dest / "game.pak.tmp"
        with zipfile.ZipFile(tmp, "w") as zf:
            zf.write(project / "galeng.json", "galeng.json")
            zf.writestr("index.json", '{"schemaVersion":1,"assets":{}}')
        os.replace(tmp, pak)
        try:
            shown = pak.resolve().relative_to(project).as_posix()
        except ValueError:
            shown = str(pak)
        self._send(200, json.dumps({"pak": shown, "warnings": [], "signed": False}).encode("utf-8"))

class Server(ThreadingHTTPServer):
    allow_reuse_address = True

httpd = Server((host, int(port_s)), Handler)
httpd.serve_forever()
'''

STUB_PLAYER = r'''#!/usr/bin/env python3
import os, sys, zipfile
from pathlib import Path

if os.environ.get("GALENG_SMOKE_STUB_PLAYER") == "display":
    sys.stderr.write("sdl.video: error: no display\n")
    raise SystemExit(1)

args = sys.argv[1:]
if "--diag" not in args or "--pak" not in args:
    sys.stderr.write("expected --diag --pak\n")
    raise SystemExit(2)
pak = Path(args[args.index("--pak") + 1])
try:
    with zipfile.ZipFile(pak) as zf:
        names = set(zf.namelist())
except Exception as exc:
    sys.stderr.write("pak unreadable: %s\n" % exc)
    raise SystemExit(3)
if "galeng.json" not in names:
    sys.stderr.write("pak missing galeng.json\n")
    raise SystemExit(3)
root = Path(__file__).resolve().parent
user = root / "UserData"
user.mkdir(parents=True, exist_ok=True)
(user / "diag.txt").write_text("player: stub\npak: ok schema=1\nsdl.video: dummy\n", encoding="utf-8")
'''

STUB_PROJECT = """{
  "id": "example-prologue",
  "title": "Prologue",
  "schemaVersion": 1,
  "resolution": {"width": 1920, "height": 1080},
  "startScene": "park_01",
  "locale": "en"
}
"""

STUB_SCENE = '{"id":"park_01","beats":[]}\n'

STUB_HTML = """<!doctype html>
<html><head><title>Galeng</title>
<script type="module" src="/assets/app.js"></script>
</head><body><div id="root"></div></body></html>
"""

STUB_JS = "console.log('galeng smoke');\n"


def self_test() -> int:
    cases = [
        ("success", {}, False, 0),
        ("skip-display", {"GALENG_SMOKE_STUB_PLAYER": "display"}, False, 0),
        ("require-display", {"GALENG_SMOKE_STUB_PLAYER": "display"}, True, 1),
        ("pack-fail", {"GALENG_SMOKE_STUB_PACK": "fail"}, False, 1),
    ]
    failed = 0
    for name, env, require, expect in cases:
        code, out, err, work = run_stub_case(name, env, require)
        try:
            text = out + "\n" + err
            problems = []
            if (code == 0) != (expect == 0):
                problems.append(f"exit {code}, expected {expect}")
            if name == "success":
                if "exported" not in out or "player diag ok" not in out or "[galeng-smoke] ok" not in out:
                    problems.append("missing success lines")
                if len(list(work.rglob("game.pak"))) != 1:
                    problems.append("pak missing")
                if list(work.rglob("*.tmp")):
                    problems.append("temp pak left behind")
            if name == "skip-display":
                if "SKIP player" not in out or "player diag ok" in out:
                    problems.append("display case was not skipped")
                if "[galeng-smoke] ok" not in out:
                    problems.append("skip should still finish the rest")
            if name == "require-display":
                if "FAIL" not in text:
                    problems.append("require-player did not fail")
                if "[galeng-smoke] ok" in out:
                    problems.append("reported ok after a required player failure")
            if name == "pack-fail":
                if "export failed" not in text or "exported" in out or "player diag ok" in out:
                    problems.append("failed export was reported as success")
                if list(work.rglob("game.pak")):
                    problems.append("failed export left a pak")
            if problems:
                failed += 1
                print(f"[galeng-smoke] self-test {name} FAIL: {'; '.join(problems)}", file=sys.stderr)
                print(text[-1500:], file=sys.stderr)
            else:
                print(f"[galeng-smoke] self-test {name} ok")
        finally:
            shutil.rmtree(work.parent, ignore_errors=True)
    if failed:
        print(f"[galeng-smoke] self-test failed {failed}", file=sys.stderr)
        return 1
    print("[galeng-smoke] self-test ok")
    return 0


def run_stub_case(name: str, env: dict[str, str], require: bool) -> tuple[int, str, str, Path]:
    parent = Path(tempfile.mkdtemp(prefix=f"galeng-smoke-{name}-"))
    stage = parent / "stage"
    (stage / "editor" / "assets").mkdir(parents=True)
    (stage / "examples" / "prologue" / "scenario").mkdir(parents=True)
    (stage / "galeng-host").write_text(STUB_HOST, encoding="utf-8")
    (stage / "galeng-player").write_text(STUB_PLAYER, encoding="utf-8")
    (stage / "editor" / "index.html").write_text(STUB_HTML, encoding="utf-8")
    (stage / "editor" / "assets" / "app.js").write_text(STUB_JS, encoding="utf-8")
    (stage / "examples" / "prologue" / "galeng.json").write_text(STUB_PROJECT, encoding="utf-8")
    (stage / "examples" / "prologue" / "scenario" / "park_01.json").write_text(STUB_SCENE, encoding="utf-8")
    (stage / "Galeng.bat").write_text("@echo off\r\necho galeng\r\n", encoding="utf-8")
    (stage / "README.txt").write_text("stub\n", encoding="utf-8")
    archive = parent / "author.zip"
    zip_dir(stage, archive, top="galeng-editor")
    work = parent / "work"
    cmd = [
        sys.executable,
        str(Path(__file__).resolve()),
        "--zip",
        str(archive),
        "--work",
        str(work),
    ]
    if require:
        cmd.append("--require-player")
    child_env = os.environ.copy()
    child_env.pop("GALENG_SMOKE_STUB_PLAYER", None)
    child_env.pop("GALENG_SMOKE_STUB_PACK", None)
    child_env.update(env)
    completed = subprocess.run(cmd, capture_output=True, env=child_env, text=True)
    return completed.returncode, completed.stdout, completed.stderr, work


if __name__ == "__main__":
    sys.exit(main())
