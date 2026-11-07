#!/bin/bash

set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
omarchy plugin validate "$root"
grep -F 'Qt.resolvedUrl("bin/omarchy-battery-limit")' "$root/Panel.qml" >/dev/null
bash -n "$root/bin/omarchy-battery-limit"
node --test "$@" "$root"/tests/*.test.js
