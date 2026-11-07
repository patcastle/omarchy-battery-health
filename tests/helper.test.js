const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test, after } = require('node:test')
const model = require('../Model.js')

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'battery-limit-test-'))
const helper = path.resolve(__dirname, '../bin/omarchy-battery-limit')
const device = '/org/freedesktop/UPower/devices/battery_BAT0'
const secondDevice = '/org/freedesktop/UPower/devices/battery_BAT1'
const calls = path.join(fixture, 'calls')
after(() => fs.rmSync(fixture, { recursive: true, force: true }))

// Every UPower read and write is intercepted; these tests never touch hardware.
fs.writeFileSync(path.join(fixture, 'upower'), `#!/bin/bash
[[ $1 == -e ]] || exit 2
[[ $BATTERY_TEST_FAIL_ENUM == 1 ]] && exit 1
printf '%s\n' "$BATTERY_TEST_DEVICES"
`, { mode: 0o755 })
fs.writeFileSync(path.join(fixture, 'busctl'), `#!/bin/bash
if [[ $1 == get-property ]]; then
  if [[ $5 == "$BATTERY_TEST_FAIL_PROPERTY" && ( -z $BATTERY_TEST_FAIL_DEVICE || $3 == "$BATTERY_TEST_FAIL_DEVICE" ) ]]; then
    exit 1
  fi
  if [[ $5 == "$BATTERY_TEST_INVALID_PROPERTY" ]]; then
    printf '%s\n' "$BATTERY_TEST_INVALID_VALUE"
    exit 0
  fi
  case "$5" in
    ChargeThresholdSupported) echo "b $BATTERY_TEST_SUPPORTED" ;;
    ChargeThresholdEnabled) echo "b $BATTERY_TEST_ENABLED" ;;
    ChargeThresholdSettingsSupported) echo "u 3" ;;
    ChargeStartThreshold) echo "u 75" ;;
    ChargeEndThreshold) echo "u 80" ;;
    *) exit 2 ;;
  esac
elif [[ $1 == call ]]; then
  printf '%s\t%s\n' "$3" "$7" >>"$BATTERY_TEST_CALLS"
else
  exit 2
fi
`, { mode: 0o755 })

function run(args = ['status', '--shell'], overrides = {}) {
  fs.writeFileSync(calls, '')
  const result = spawnSync(helper, args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: fixture + ':/usr/bin:/bin',
      BATTERY_TEST_CALLS: calls,
      BATTERY_TEST_DEVICES: device,
      BATTERY_TEST_SUPPORTED: 'true',
      BATTERY_TEST_ENABLED: 'true',
      BATTERY_TEST_FAIL_ENUM: '',
      BATTERY_TEST_FAIL_PROPERTY: '',
      BATTERY_TEST_FAIL_DEVICE: '',
      BATTERY_TEST_INVALID_PROPERTY: '',
      BATTERY_TEST_INVALID_VALUE: '',
      ...overrides
    }
  })
  assert.ifError(result.error)
  return { ...result, calls: fs.readFileSync(calls, 'utf8') }
}

function expectUnavailable(overrides) {
  const result = run(['status', '--shell'], overrides)
  assert.equal(result.status, 1)
  assert.equal(result.stdout, 'state\tunavailable\npolicy\tunknown\n')
  assert.match(result.stderr, /Battery protection status unavailable/)
  for (const action of ['enable', 'disable']) {
    const actionResult = run([action], overrides)
    assert.equal(actionResult.status, 1)
    assert.equal(actionResult.calls, '', 'must not mutate batteries after an incomplete query')
  }
}

test('reports enabled and disabled without treating false as an error', () => {
  assert.equal(run().stdout, 'state\tenabled\npolicy\t75-80\n')
  const result = run(['status', '--shell'], { BATTERY_TEST_ENABLED: 'false' })
  assert.equal(result.status, 0)
  assert.equal(result.stdout, 'state\tdisabled\npolicy\t75-80\n')
})

test('confirmed unsupported and empty enumeration remain successful results', () => {
  for (const overrides of [{ BATTERY_TEST_SUPPORTED: 'false' }, { BATTERY_TEST_DEVICES: '' }, { BATTERY_TEST_DEVICES: '/org/freedesktop/UPower/devices/DisplayDevice' }]) {
    const result = run(['status', '--shell'], overrides)
    assert.equal(result.status, 0)
    assert.equal(result.stdout, 'state\tunsupported\npolicy\tunknown\n')
    assert.equal(run(['enable'], overrides).calls, '')
  }
})

test('failed enumeration is unavailable and blocks writes', () => {
  expectUnavailable({ BATTERY_TEST_FAIL_ENUM: '1' })
  const result = run(['status'], { BATTERY_TEST_FAIL_ENUM: '1' })
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /status unavailable/)
})

for (const property of ['ChargeThresholdSupported', 'ChargeThresholdEnabled', 'ChargeThresholdSettingsSupported', 'ChargeStartThreshold', 'ChargeEndThreshold']) {
  test('failed ' + property + ' query is unavailable and blocks writes', () => {
    expectUnavailable({ BATTERY_TEST_FAIL_PROPERTY: property })
  })
}

for (const value of ['', 'b unknown', 'u 1']) {
  test('invalid boolean property is unavailable: ' + JSON.stringify(value), () => {
    expectUnavailable({ BATTERY_TEST_INVALID_PROPERTY: 'ChargeThresholdEnabled', BATTERY_TEST_INVALID_VALUE: value })
  })
}

test('invalid numeric property is unavailable', () => {
  expectUnavailable({ BATTERY_TEST_INVALID_PROPERTY: 'ChargeEndThreshold', BATTERY_TEST_INVALID_VALUE: 'u invalid' })
})

test('failure on a second battery prevents writes to the first', () => {
  expectUnavailable({ BATTERY_TEST_DEVICES: device + '\n' + secondDevice, BATTERY_TEST_FAIL_DEVICE: secondDevice, BATTERY_TEST_FAIL_PROPERTY: 'ChargeThresholdEnabled' })
})

test('verified status still permits enable and disable for all supported batteries', () => {
  for (const [action, desired] of [['enable', 'true'], ['disable', 'false']]) {
    const result = run([action], { BATTERY_TEST_DEVICES: device + '\n' + secondDevice })
    assert.equal(result.status, 0)
    assert.equal(result.calls, device + '\t' + desired + '\n' + secondDevice + '\t' + desired + '\n')
  }
})

test('widget state recovers from a helper failure on the next successful query', () => {
  let state
  for (const [overrides, expected] of [
    [{}, { state: 'enabled', policy: '75-80', stale: false }],
    [{ BATTERY_TEST_FAIL_ENUM: '1' }, { state: 'enabled', policy: '75-80', stale: true }],
    [{ BATTERY_TEST_ENABLED: 'false' }, { state: 'disabled', policy: '75-80', stale: false }]
  ]) {
    const result = run(['status', '--shell'], overrides)
    state = model.parseLimitStatus(result.stdout, state, result.status)
    assert.deepEqual(state, expected)
  }
})
