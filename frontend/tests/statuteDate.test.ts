import test from 'node:test'
import assert from 'node:assert/strict'
import {
  daysInMonth,
  formatDaySpan,
  formatISODate,
  formatReadableDate,
  isLeapYear,
  parseStrictISODate,
  shiftISODate,
  todayIST,
  validateCauseDate,
} from '../src/lib/statuteDate.ts'

test('isLeapYear and daysInMonth handle Gregorian leap rules accurately', () => {
  assert.equal(isLeapYear(2024), true)
  assert.equal(isLeapYear(2023), false)
  assert.equal(isLeapYear(2000), true)
  assert.equal(isLeapYear(1900), false)

  assert.equal(daysInMonth(2024, 2), 29)
  assert.equal(daysInMonth(2023, 2), 28)
  assert.equal(daysInMonth(2026, 4), 30)
  assert.equal(daysInMonth(2026, 12), 31)
})

test('parseStrictISODate rejects impossible dates and out-of-range years', () => {
  assert.deepEqual(parseStrictISODate('2024-02-29'), { year: 2024, month: 2, day: 29 })
  assert.equal(parseStrictISODate('2023-02-29'), null)
  assert.equal(parseStrictISODate('2025-04-31'), null)
  assert.equal(parseStrictISODate('2025-13-01'), null)
  assert.equal(parseStrictISODate('2025-00-10'), null)
  assert.equal(parseStrictISODate('1899-12-31'), null)
  assert.equal(parseStrictISODate('2101-01-01'), null)
  assert.equal(parseStrictISODate('2024/02/10'), null)
  assert.equal(parseStrictISODate(''), null)
})

test('shiftISODate clamps leap-day and 31st-of-month without overflowing', () => {
  // Leap year Feb 29 shifted back 1 year clamps to Feb 28 (never March 1)
  assert.equal(shiftISODate('2024-02-29', { years: -1 }), '2023-02-28')
  assert.equal(shiftISODate('2024-02-29', { years: 1 }), '2025-02-28')
  assert.equal(shiftISODate('2024-02-29', { years: 4 }), '2028-02-29')

  // Month-end clamping: May 31 - 1 month -> April 30 (never May 1)
  assert.equal(shiftISODate('2026-05-31', { months: -1 }), '2026-04-30')
  assert.equal(shiftISODate('2026-03-31', { months: -1 }), '2026-02-28')

  // Day arithmetic stays pure UTC across DST / timezone boundaries
  assert.equal(shiftISODate('2026-03-01', { days: -1 }), '2026-02-28')
  assert.equal(shiftISODate('2024-03-01', { days: -1 }), '2024-02-29')
  assert.equal(shiftISODate('2026-01-01', { days: -1 }), '2025-12-31')
})

test('validateCauseDate enforces non-empty, valid calendar, <= today, and 60-year boundary', () => {
  const today = '2026-11-14'

  assert.equal(validateCauseDate('', today).valid, false)
  assert.equal(validateCauseDate('2025-02-29', today).valid, false)
  assert.equal(validateCauseDate('2026-11-15', today).valid, false)
  assert.equal(validateCauseDate('1966-11-13', today).valid, false)

  assert.deepEqual(validateCauseDate('2026-11-14', today), { valid: true, iso: '2026-11-14' })
  assert.deepEqual(validateCauseDate('1966-11-14', today), { valid: true, iso: '1966-11-14' })
  assert.deepEqual(validateCauseDate('2024-02-29', today), { valid: true, iso: '2024-02-29' })
})

test('todayIST computes Asia/Kolkata calendar date around midnight UTC roll-over', () => {
  // 2026-11-13T19:00:00Z is 2026-11-14 00:30 IST
  const istNextDay = new Date('2026-11-13T19:00:00Z')
  assert.equal(todayIST(istNextDay), '2026-11-14')

  // 2026-11-13T18:00:00Z is 2026-11-13 23:30 IST
  const istSameDay = new Date('2026-11-13T18:00:00Z')
  assert.equal(todayIST(istSameDay), '2026-11-13')
})

test('formatting helpers render ISO dates, readable UTC dates, and day spans cleanly', () => {
  assert.equal(formatISODate({ year: 2026, month: 4, day: 5 }), '2026-04-05')
  assert.equal(formatReadableDate('2024-02-29'), '29 February 2024')
  assert.equal(formatReadableDate('2023-02-29'), '—')
  assert.equal(formatDaySpan(1), '1 day')
  assert.equal(formatDaySpan(45), '45 days')
  assert.equal(formatDaySpan(400), '1 yr 1 mo')
})
