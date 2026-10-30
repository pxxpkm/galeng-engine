#!/bin/sh
# Q04 release smoke. See tools/release_smoke.py.
# exec keeps python's status, including a missing apps/editor/dist.
# tools/release-smoke.bat does the same with exit /b on the next line.
here=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
exec python3 "$here/release_smoke.py" "$@"
