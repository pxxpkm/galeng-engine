#!/bin/sh
# Q04 release smoke. See tools/release_smoke.py.
here=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
exec python3 "$here/release_smoke.py" "$@"
