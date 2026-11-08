function clampIndex(index, length) {
  if (length <= 0) return 0
  return Math.max(0, Math.min(length - 1, index))
}

function selectProfileIndex(index, delta, profiles) {
  var values = Array.isArray(profiles) ? profiles : []
  if (values.length === 0) return 0
  return clampIndex(index + delta, values.length)
}

function parseKeyValue(raw) {
  var next = {}
  var lines = String(raw || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var idx = lines[i].indexOf("\t")
    if (idx <= 0) continue
    next[lines[i].substring(0, idx)] = lines[i].substring(idx + 1).trim()
  }
  return next
}

function parseProfiles(raw, previousIndex) {
  var lines = String(raw || "").split("\n")
  var list = []
  var active = ""
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim()
    if (!line) continue
    var parts = line.split("\t")
    list.push(parts[0])
    if (parts[1] === "1") active = parts[0]
  }
  return {
    profiles: list,
    activeProfile: active,
    profileIndex: clampIndex(previousIndex || 0, list.length)
  }
}

function limitDescription(state, policy) {
  var active = state === "enabled"
  if (policy === "firmware") return (active ? "Uses" : "Use") + " firmware optimized charging"
  if (!policy || policy === "unknown") return (active ? "Uses" : "Use") + " the battery's health-preserving policy"

  var thresholds = policy.split("-")
  if (thresholds.length === 2) {
    return (active ? "Starts charging at " : "Start charging at ") + thresholds[0] + "% and "
      + (active ? "stops" : "stop") + " at " + thresholds[1] + "%"
  }

  return (active ? "Stops charging at " : "Limit charging to ") + policy + "%"
}

function profileIcon(name) {
  if (name === "power-saver") return "󰌪"
  if (name === "balanced") return "󰊚"
  if (name === "performance") return "󰓅"
  return "󰂄"
}

function batteryFraction(device) {
  return device && device.isPresent ? Math.max(0, Math.min(1, device.percentage)) : 0
}

// UPower reports battery flow separately from the configured charging policy.
// A low rate or a long estimate does not tell us why charging has slowed down.
function batteryState(device, states) {
  var d = device || {}
  var s = states || {}
  if (!d.isPresent) return "unavailable"
  if (d.state === undefined || d.state === null) return "unknown"

  if (d.state === s.Charging) return "charging"
  if (d.state === s.Discharging) return "discharging"
  if (d.state === s.PendingCharge) return "not-charging"
  if (d.state === s.PendingDischarge) return "not-discharging"
  if (d.state === s.Empty) return "empty"
  // Firmware can report FullyCharged below full capacity. Describe the stopped
  // flow without claiming that a charge limit caused it.
  if (d.state === s.FullyCharged) return batteryFraction(d) >= 0.99 ? "full" : "not-charging"
  return "unknown"
}

function batteryIcon(device, state) {
  var d = device || {}
  if (!d.isPresent) return ""

  var chargingIcons = ["󰢜", "󰂆", "󰂇", "󰂈", "󰢝", "󰂉", "󰢞", "󰂊", "󰂋", "󰂅"]
  var defaultIcons = ["󰁺", "󰁻", "󰁼", "󰁽", "󰁾", "󰁿", "󰂀", "󰂁", "󰂂", "󰁹"]
  var index = Math.max(0, Math.min(9, Math.floor(batteryFraction(d) * 10)))
  return state === "charging" ? chargingIcons[index] : defaultIcons[index]
}

function modeLabel(state) {
  if (state === "charging") return "Charging"
  if (state === "discharging") return "On battery"
  if (state === "full") return "Fully charged"
  if (state === "not-charging") return "Not charging"
  if (state === "not-discharging") return "Not discharging"
  if (state === "empty") return "Empty"
  if (state === "unavailable") return ""
  return "Unknown"
}

if (typeof module !== "undefined") {
  module.exports = {
    clampIndex: clampIndex,
    selectProfileIndex: selectProfileIndex,
    parseKeyValue: parseKeyValue,
    parseProfiles: parseProfiles,
    limitDescription: limitDescription,
    profileIcon: profileIcon,
    batteryFraction: batteryFraction,
    batteryState: batteryState,
    batteryIcon: batteryIcon,
    modeLabel: modeLabel
  }
}
