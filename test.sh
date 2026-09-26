#!/bin/bash

set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
omarchy plugin validate "$root"
grep -F 'Qt.resolvedUrl("bin/omarchy-battery-limit")' "$root/Panel.qml" >/dev/null

node - "$root" <<'JS'
const root = process.argv[2]
const model = require(root + '/Model.js')

if (model.limitDescription('enabled', '75-80') !== 'Starts charging at 75% and stops at 80%') throw new Error('threshold range')
if (model.limitDescription('disabled', 'firmware') !== 'Use firmware optimized charging') throw new Error('firmware policy')
if (model.limitChoiceIndex('enabled') !== 1) throw new Error('choice index enabled')
if (model.limitChoiceIndex('disabled') !== 0) throw new Error('choice index disabled')
if (model.limitChoiceName(0) !== 'Full charge') throw new Error('choice name full')
if (model.limitChoiceName(1) !== 'Preserve') throw new Error('choice name preserve')
if (model.limitChoiceDescription(1, '75-80') !== 'Starts charging at 75% and stops at 80%') throw new Error('choice description preserve')
if (model.limitChoiceDescription(0, '75-80') !== 'Charges the battery to 100% each cycle') throw new Error('choice description full')
JS

fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/bin" "$fixture/device"

cat >"$fixture/bin/upower" <<'STUB'
#!/bin/bash
[[ $1 == -e ]] && echo /org/freedesktop/UPower/devices/battery_BAT0
STUB

cat >"$fixture/bin/busctl" <<'STUB'
#!/bin/bash
if [[ $1 == get-property ]]; then
  case "$5" in
    ChargeThresholdSupported | ChargeThresholdEnabled) echo "b true" ;;
    ChargeThresholdSettingsSupported) echo "u 3" ;;
    ChargeStartThreshold) echo "u 75" ;;
    ChargeEndThreshold) echo "u 80" ;;
  esac
elif [[ $1 == call ]]; then
  printf '%s\t%s\n' "$3" "$7" >>"$BATTERY_CALL_LOG"
fi
STUB

chmod +x "$fixture/bin/upower" "$fixture/bin/busctl"
export PATH="$fixture/bin:$PATH"
export BATTERY_CALL_LOG="$fixture/calls"

status=$("$root/bin/omarchy-battery-limit" status --shell)
grep -Fx $'state\tenabled' <<<"$status" >/dev/null
grep -Fx $'policy\t75-80' <<<"$status" >/dev/null
"$root/bin/omarchy-battery-limit" disable >/dev/null
grep -Fx $'/org/freedesktop/UPower/devices/battery_BAT0\tfalse' "$BATTERY_CALL_LOG" >/dev/null
"$root/bin/omarchy-battery-limit" enable >/dev/null
grep -Fx $'/org/freedesktop/UPower/devices/battery_BAT0\ttrue' "$BATTERY_CALL_LOG" >/dev/null

echo "All checks passed"
