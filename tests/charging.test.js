const assert = require('node:assert/strict')
const test = require('node:test')
const model = require('../Model.js')

const states = {
  Unknown: 0,
  Charging: 1,
  Discharging: 2,
  Empty: 3,
  FullyCharged: 4,
  PendingCharge: 5,
  PendingDischarge: 6
}

function battery(overrides = {}) {
  return { isPresent: true, percentage: 0.6, state: states.Charging, changeRate: 12, timeToFull: 3600, ...overrides }
}

function presentation(device, stateNames = states) {
  const state = model.batteryState(device, stateNames)
  return { state, label: model.modeLabel(state), icon: model.batteryIcon(device, state) }
}

for (const rate of [0, 0.1, 0.2, undefined, null]) {
  test('reported charging stays charging with rate ' + rate, () => {
    assert.deepEqual(presentation(battery({ changeRate: rate })), {
      state: 'charging', label: 'Charging', icon: '󰢞'
    })
  })
}

for (const time of [8 * 3600, 12 * 3600]) {
  test('a long time to full does not imply a charge limit: ' + time, () => {
    assert.equal(presentation(battery({ timeToFull: time })).state, 'charging')
  })
}

test('pending charging describes the pause without guessing its cause', () => {
  assert.deepEqual(presentation(battery({ state: states.PendingCharge })), {
    state: 'not-charging', label: 'Not charging', icon: '󰂀'
  })
})

for (const percentage of [0.6, 0.8, 0.98]) {
  test('firmware reporting full at ' + percentage + ' does not imply full capacity or a threshold', () => {
    const result = presentation(battery({ state: states.FullyCharged, percentage }))
    assert.equal(result.state, 'not-charging')
    assert.equal(result.label, 'Not charging')
  })
}

for (const percentage of [0.99, 1]) {
  test('reported full near 100 percent is fully charged: ' + percentage, () => {
    assert.deepEqual(presentation(battery({ state: states.FullyCharged, percentage })), {
      state: 'full', label: 'Fully charged', icon: '󰁹'
    })
  })
}

test('100 percent alone does not override a reported charging state', () => {
  assert.deepEqual(presentation(battery({ percentage: 1 })), {
    state: 'charging', label: 'Charging', icon: '󰂅'
  })
})

test('discharging retains a battery icon and the on-battery label', () => {
  assert.deepEqual(presentation(battery({ state: states.Discharging })), {
    state: 'discharging', label: 'On battery', icon: '󰂀'
  })
})

test('pending discharge is idle rather than charging or draining', () => {
  assert.deepEqual(presentation(battery({ state: states.PendingDischarge })), {
    state: 'not-discharging', label: 'Not discharging', icon: '󰂀'
  })
})

test('an empty battery is not shown as charging', () => {
  assert.deepEqual(presentation(battery({ state: states.Empty, percentage: 0 })), {
    state: 'empty', label: 'Empty', icon: '󰁺'
  })
})

for (const state of [states.Unknown, 99, undefined, null]) {
  test('unknown or missing state stays unknown: ' + state, () => {
    assert.deepEqual(presentation(battery({ state })), {
      state: 'unknown', label: 'Unknown', icon: '󰂀'
    })
  })
}

test('missing state definitions do not accidentally match missing telemetry', () => {
  assert.equal(presentation(battery({ state: undefined }), {}).state, 'unknown')
  assert.equal(presentation(battery(), {}).state, 'unknown')
})

for (const device of [null, undefined, {}, battery({ isPresent: false })]) {
  test('absent battery has no status label or icon: ' + JSON.stringify(device), () => {
    assert.deepEqual(presentation(device), { state: 'unavailable', label: '', icon: '' })
  })
}

test('battery icons stay within their range for out-of-range percentages', () => {
  assert.equal(presentation(battery({ percentage: -0.1 })).icon, '󰢜')
  assert.equal(presentation(battery({ percentage: 1.1 })).icon, '󰂅')
})
