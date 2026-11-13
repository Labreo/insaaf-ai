import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEMO_ALERTS_PREVIEW,
  DEMO_CUSTODY_PREVIEW,
  DEMO_INTAKE_SAMPLES,
  DEMO_LEDGER_PREVIEW,
  DEMO_SHOWCASE_MATTERS,
} from '../src/lib/demoData.ts'

test('DEMO_INTAKE_SAMPLES are distinct, complete Indian legal presets', () => {
  assert.ok(DEMO_INTAKE_SAMPLES.length >= 6)
  const ids = new Set(DEMO_INTAKE_SAMPLES.map((s) => s.id))
  assert.equal(ids.size, DEMO_INTAKE_SAMPLES.length)

  for (const s of DEMO_INTAKE_SAMPLES) {
    assert.ok(s.area && s.title && s.forum_hint && s.state && s.district && s.court_seat)
    assert.match(s.cause_date, /^\d{4}-\d{2}-\d{2}$/)
    assert.ok(s.content.length > 80)
  }
})

test('illustrative demo previews carry explicit synthetic markers', () => {
  assert.ok(DEMO_SHOWCASE_MATTERS.length > 0)
  for (const m of DEMO_SHOWCASE_MATTERS) {
    assert.equal(m.synthetic, true)
    assert.equal(m.badge, 'ILLUSTRATIVE DEMO PREVIEW')
  }
  assert.ok(DEMO_ALERTS_PREVIEW.every((a) => a.synthetic === true))
  assert.ok(DEMO_LEDGER_PREVIEW.every((l) => l.synthetic === true))
  assert.ok(DEMO_CUSTODY_PREVIEW.every((c) => c.synthetic === true))
})
