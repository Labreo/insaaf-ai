/**
 * Pure UTC calendar math & validation for India's Limitation Act Statute Clock.
 * Avoids JS Date local-timezone shifts and leap-year / month-end overflow bugs.
 */

export interface DateParts {
  year: number
  month: number
  day: number
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30
  return 31
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatISODate({ year, month, day }: DateParts): string {
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`
}

/** Current date in IST (Asia/Kolkata), returned as YYYY-MM-DD. */
export function todayIST(now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
  } catch {
    const ms = now.getTime() + 330 * 60_000
    return new Date(ms).toISOString().slice(0, 10)
  }
}

/**
 * Strictly parses a YYYY-MM-DD string and rejects impossible dates
 * (e.g. Feb 29 on non-leap years, April 31, years outside 1900-2100).
 */
export function parseStrictISODate(raw: string | null | undefined): DateParts | null {
  if (!raw || typeof raw !== 'string') return null
  const trimmed = raw.trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return null
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  const maxDay = daysInMonth(year, month)
  if (!Number.isInteger(day) || day < 1 || day > maxDay) return null
  return { year, month, day }
}

/**
 * Deterministically shifts an ISO date in pure UTC calendar arithmetic.
 * Clamps day-of-month (e.g. 2024-02-29 minus 1 year -> 2023-02-28) before adding days,
 * so Feb 29 or 31st-of-month never overflows into the following month.
 */
export function shiftISODate(
  baseISO: string,
  { years = 0, months = 0, days = 0 }: { years?: number; months?: number; days?: number },
): string {
  const parsed = parseStrictISODate(baseISO) ?? parseStrictISODate(todayIST())!
  const totalMonths = parsed.year * 12 + (parsed.month - 1) + years * 12 + months
  const targetYear = Math.floor(totalMonths / 12)
  const targetMonth = ((totalMonths % 12) + 12) % 12 + 1
  const clampedDay = Math.min(parsed.day, daysInMonth(targetYear, targetMonth))
  const utcMs = Date.UTC(targetYear, targetMonth - 1, clampedDay) + days * 86_400_000
  const out = new Date(utcMs)
  if (Number.isNaN(out.getTime())) return baseISO
  return formatISODate({
    year: out.getUTCFullYear(),
    month: out.getUTCMonth() + 1,
    day: out.getUTCDate(),
  })
}

export function validateCauseDate(
  raw: string,
  todayISO: string,
  maxYearsBack = 60,
): { valid: true; iso: string } | { valid: false; error: string } {
  const val = raw.trim()
  if (!val) {
    return { valid: false, error: 'Enter the cause-of-action date first.' }
  }
  const parsed = parseStrictISODate(val)
  if (!parsed) {
    return {
      valid: false,
      error: 'Enter a valid calendar date in YYYY-MM-DD format (between 1900 and 2100).',
    }
  }
  const safeToday = parseStrictISODate(todayISO) ? todayISO : todayIST()
  if (val > safeToday) {
    return {
      valid: false,
      error: `Cause of action date cannot be in the future (after ${formatReadableDate(safeToday)}).`,
    }
  }
  const minAllowed = shiftISODate(safeToday, { years: -maxYearsBack })
  if (val < minAllowed) {
    return {
      valid: false,
      error: `Cause date exceeds the ${maxYearsBack}-year Statute Clock range (earliest: ${formatReadableDate(minAllowed)}).`,
    }
  }
  return { valid: true, iso: val }
}

export function formatReadableDate(isoStr: string | null | undefined): string {
  const parts = parseStrictISODate(isoStr)
  if (!parts) return '—'
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  return utc.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function formatDaySpan(absDays: number): string {
  const safe = Math.max(0, Math.floor(absDays))
  if (safe < 60) return `${safe} day${safe === 1 ? '' : 's'}`
  const years = Math.floor(safe / 365)
  const remDays = safe % 365
  const months = Math.floor(remDays / 30)
  const parts: string[] = []
  if (years > 0) parts.push(`${years} yr${years === 1 ? '' : 's'}`)
  if (months > 0) parts.push(`${months} mo${months === 1 ? '' : 's'}`)
  return parts.length ? parts.join(' ') : `${safe} days`
}
