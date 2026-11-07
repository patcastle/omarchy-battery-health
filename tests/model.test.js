const assert = require('node:assert/strict')
const test = require('node:test')
const model = require('../Model.js')

const initial = { state: 'unavailable', policy: 'unknown', stale: true }
const enabled = { state: 'enabled', policy: '75-80', stale: false }

test('describes threshold and firmware policies', () => {
  assert.equal(model.limitDescription('enabled', '75-80'), 'Starts charging at 75% and stops at 80%')
  assert.equal(model.limitDescription('disabled', 'firmware'), 'Use firmware optimized charging')
})

test('first query failure remains unknown, not disabled or unsupported', () => {
  const result = model.parseLimitStatus('state\tunavailable\npolicy\tunknown\n', initial, 1)
  assert.deepEqual(result, initial)
  assert.equal(model.limitStatusDescription(result), 'Battery protection status unavailable. Retrying…')
})

test('failed refresh retains the last enabled state and marks it stale', () => {
  const result = model.parseLimitStatus('state\tunavailable\npolicy\tunknown\n', enabled, 1)
  assert.deepEqual(result, { ...enabled, stale: true })
  assert.equal(model.limitStatusDescription(result), 'Battery protection status unavailable. Last known state: on. Retrying…')
  assert.deepEqual(enabled, { state: 'enabled', policy: '75-80', stale: false })
  assert.deepEqual(model.parseLimitStatus('', result, 1), result)
})

test('a stale disabled state is explicitly labelled as last known', () => {
  const result = model.parseLimitStatus('', { state: 'disabled', policy: 'firmware', stale: false }, 1)
  assert.equal(model.limitStatusDescription(result), 'Battery protection status unavailable. Last known state: off. Retrying…')
})

for (const raw of ['', 'garbage', 'state\tenabled\n', 'state\tinvalid\npolicy\tunknown\n']) {
  test('incomplete or invalid output cannot replace a known state: ' + JSON.stringify(raw), () => {
    assert.deepEqual(model.parseLimitStatus(raw, enabled, 0), { ...enabled, stale: true })
  })
}

test('a non-zero exit rejects even apparently valid output', () => {
  assert.deepEqual(model.parseLimitStatus('state\tdisabled\npolicy\t75-80\n', enabled, 1), { ...enabled, stale: true })
})

test('successful refresh recovers and accepts a changed state and policy', () => {
  const stale = model.parseLimitStatus('', enabled, 1)
  const result = model.parseLimitStatus('state\tdisabled\npolicy\t50-80\n', stale, 0)
  assert.deepEqual(result, { state: 'disabled', policy: '50-80', stale: false })
  assert.equal(model.limitStatusDescription(result), 'Start charging at 50% and stop at 80%')
})

test('confirmed unsupported is distinct from a failed query', () => {
  const result = model.parseLimitStatus('state\tunsupported\npolicy\tunknown\n', enabled, 0)
  assert.deepEqual(result, { state: 'unsupported', policy: 'unknown', stale: false })
  assert.deepEqual(model.parseLimitStatus('', result, 1), { ...result, stale: true })
})
