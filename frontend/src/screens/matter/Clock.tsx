import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Calendar, Info, Save } from 'lucide-react'
import { api } from '@/lib/api'
import { can } from '@/lib/store'
import {
  formatDaySpan,
  formatReadableDate,
  parseStrictISODate,
  shiftISODate,
  todayIST,
  validateCauseDate,
} from '@/lib/statuteDate'
import type { StatuteClock } from '@/lib/types'
import { Badge, Card, ErrorBanner, Label, Ring, Skeleton, SourceChip, useAsync } from '@/components/primitives'
import { sfx } from '@/lib/sound'
import type { TabProps } from '../Matter'

/**
 * Statute Clock: deterministic limitation calculator with the Supreme Court COVID exclusion.
 * "Preview" never changes the matter; "Save to matter" stores the date and the deadline.
 */
export default function Clock({ id, onOpen }: TabProps) {
  const canSave = can('analysis.run')
  const c = useAsync(() => api.statuteClock(id), [id])
  const [saved, setSaved] = useState<StatuteClock | null>(null)
  const [preview, setPreview] = useState<StatuteClock | null>(null)
  const [causeDate, setCauseDate] = useState('')
  const [busy, setBusy] = useState<'preview' | 'save' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const inFlight = useRef(false)
  const reqSeq = useRef(0)

  useEffect(() => {
    setSaved(null)
    setPreview(null)
    setErr(null)
    inFlight.current = false
    reqSeq.current += 1
  }, [id])

  useEffect(() => {
    if (c.data) {
      setSaved(c.data)
      setCauseDate(c.data.cause_date ?? '')
    }
  }, [c.data])

  const base = saved ?? c.data
  const rawToday = base?.today
  const today = rawToday && parseStrictISODate(rawToday) ? rawToday : todayIST()
  const minDate = useMemo(() => shiftISODate(today, { years: -60 }), [today])
  const years = base?.limitation_years ?? null

  const liveValidation = useMemo(() => {
    if (!causeDate.trim()) return null
    return validateCauseDate(causeDate, today, 60)
  }, [causeDate, today])

  const presets = useMemo(() => {
    const windowYears = years && years > 0 && years <= 30 ? years : 3
    const items = [
      { label: 'Accrued 6 months ago', date: shiftISODate(today, { days: -182 }) },
      { label: '~60 days left', date: shiftISODate(today, { years: -windowYears, days: 60 }) },
      { label: 'Just time-barred', date: shiftISODate(today, { years: -windowYears, days: -10 }) },
      { label: 'Accrued in COVID window', date: '2021-01-15' },
      { label: 'Leap-day edge (29 Feb 2024)', date: '2024-02-29' },
    ]
    return items.filter((p) => {
      const check = validateCauseDate(p.date, today, 60)
      return check.valid
    })
  }, [today, years])

  const compute = async (mode: 'preview' | 'save', dt?: string) => {
    if (inFlight.current) return
    const candidate = (dt ?? causeDate).trim()
    const check = validateCauseDate(candidate, today, 60)
    if (!check.valid) {
      setErr(check.error)
      sfx.reject()
      return
    }

    inFlight.current = true
    const seq = ++reqSeq.current
    setCauseDate(check.iso)
    setBusy(mode)
    setErr(null)
    sfx.tick()

    try {
      const next = await api.recalculateClock(id, check.iso, mode === 'preview')
      if (seq !== reqSeq.current) return
      if (mode === 'preview') {
        setPreview(next)
      } else {
        setSaved(next)
        setPreview(null)
      }
      sfx.accept()
    } catch (e) {
      if (seq === reqSeq.current) {
        setErr(e instanceof Error ? e.message : String(e))
      }
    } finally {
      if (seq === reqSeq.current) {
        setBusy(null)
        inFlight.current = false
      }
    }
  }

  const d = preview ?? base
  if (c.loading && !d) return <Skeleton className="h-72" />
  if (c.error && !d) return <ErrorBanner error={c.error} onRetry={c.reload} />
  if (!d) return null

  const noClock = d.applicable === false
  const daysLeft = d.days_left
  const total = d.total_days ?? null
  const frac = daysLeft == null || !total || total <= 0 ? 0 : Math.max(0, Math.min(1, daysLeft / total))
  const tone =
    daysLeft == null
      ? 'var(--color-ink-3)'
      : daysLeft < 0 || daysLeft <= 30
        ? 'var(--color-bad)'
        : daysLeft <= 90
          ? 'var(--color-warn)'
          : 'var(--color-navy)'

  return (
    <div className="space-y-4">
      {preview && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-info-200 bg-info-50 px-4 py-2 text-[12.5px] text-ink">
          <span>
            <strong>Preview only.</strong> Calculation for {formatReadableDate(preview.cause_date)} is not saved to the matter.
          </span>
          <button
            type="button"
            onClick={() => {
              setPreview(null)
              setCauseDate(saved?.cause_date ?? '')
              setErr(null)
            }}
            className="text-[12px] font-medium text-navy hover:underline"
          >
            Back to saved clock
          </button>
        </div>
      )}
      {!preview && d.cause_date_source === 'document' && d.cause_date && (
        <div role="note" className="rounded-[6px] border border-info-200 bg-info-50 px-4 py-2 text-[12px] text-ink-2">
          Cause date taken from the latest dated event in the documents ({formatReadableDate(d.cause_date)}). Confirm it is the accrual or acknowledgment date, then save it.
        </div>
      )}
      {!preview && (!d.cause_date || d.cause_date_source === 'missing') && !noClock && (
        <div role="note" className="flex items-start gap-2 rounded-[6px] border border-warn-200 bg-warn-50 px-4 py-2.5 text-[12px] text-warn">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            No verified cause-of-action date has been extracted from the uploaded documents yet. Choose an accrual date on the right to preview or save the limitation deadline.
          </span>
        </div>
      )}
      {err && <ErrorBanner error={err} />}

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <Card className="flex flex-wrap items-center gap-6">
            {noClock ? (
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 shrink-0 text-navy" size={20} />
                <div className="space-y-1">
                  <Label>No fixed limitation clock</Label>
                  <p className="text-[13.5px] leading-relaxed text-ink">{d.note}</p>
                  <p className="text-[12px] text-ink-3">{d.article}</p>
                </div>
              </div>
            ) : (
              <>
                <Ring value={frac} size={116} stroke={6} tone={tone}>
                  <span className="tabular font-mono text-[22px] leading-none font-semibold text-ink">
                    {daysLeft == null ? '—' : Math.abs(daysLeft).toLocaleString('en-IN')}
                  </span>
                  <Label className="mt-1">{daysLeft == null ? 'no date' : daysLeft < 0 ? 'days late' : 'days left'}</Label>
                </Ring>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label>{daysLeft != null && daysLeft < 0 ? 'Limitation expired on' : 'Limitation expires'}</Label>
                  <p className="serif text-[24px] leading-tight text-ink">
                    {d.limitation_expires ? formatReadableDate(d.limitation_expires) : 'Enter cause date'}
                  </p>
                  <p className="text-[13px] text-ink-2">{d.article}</p>
                  {d.cause_date && (
                    <p className="text-[12px] text-ink-3">
                      Cause of action {formatReadableDate(d.cause_date)}
                      {years ? ` · ${years}-year period` : ''}
                      {daysLeft != null ? ` · ${formatDaySpan(Math.abs(daysLeft))} ${daysLeft < 0 ? 'overdue' : 'remaining'}` : ''}
                      {total ? ` (${total.toLocaleString('en-IN')} days in window)` : ''}
                    </p>
                  )}
                  {d.note && <p className="text-[12px] text-ink-3">{d.note}</p>}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {d.sources.map((s) => (
                      <SourceChip key={s.source_id} s={s} onOpen={onOpen} />
                    ))}
                  </div>
                </div>
              </>
            )}
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="space-y-1.5">
              <Label>Jurisdiction &amp; forum</Label>
              <p className="text-[14px] font-semibold text-ink">{d.forum.court}</p>
              <p className="text-[12px] text-ink-3">
                {d.forum.basis} · Commercial Court: <strong className="font-medium text-ink">{d.commercial_court ? 'Yes (s.12A applies)' : 'No'}</strong>
              </p>
            </Card>
            <Card className="space-y-2">
              <Label>ADR routes for this area</Label>
              <div className="flex flex-wrap gap-1.5">
                {d.adr_routes.length ? (
                  d.adr_routes.map((r) => (
                    <Badge key={r} tone="info">
                      {r}
                    </Badge>
                  ))
                ) : (
                  <span className="text-[12px] text-ink-3">None mandated for this category</span>
                )}
              </div>
            </Card>
          </div>

          {d.excluded_periods.length > 0 && (
            <Card className="space-y-2.5">
              <Label>Excluded period (actual overlap with your limitation window)</Label>
              <div className="divide-y divide-line">
                {d.excluded_periods.map((p) => (
                  <div key={p.from} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[12.5px]">
                    <span className="font-mono font-medium text-ink">
                      {formatReadableDate(p.from)} to {formatReadableDate(p.to)}
                      {p.days ? ` · +${p.days} days` : ''}
                    </span>
                    <span className="text-ink-2">{p.reason}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-ink-3">Computed by the deterministic rule engine. Language models never calculate limitation.</p>
            </Card>
          )}
        </div>

        {!noClock && (
          <div className="lg:col-span-5">
            <Card className="space-y-4">
              <Label className="flex items-center gap-1.5">
                <Calendar size={13} /> Cause of action / acknowledgment date
              </Label>
              <p className="text-[12.5px] leading-relaxed text-ink-2">
                Preview any date to see the deadline. Save it only when it is the real accrual or acknowledgment date (s.18 Limitation Act). Valid range: {formatReadableDate(minDate)} to {formatReadableDate(today)}.
              </p>
              <div className="space-y-1.5">
                <input
                  type="date"
                  value={causeDate}
                  max={today}
                  min={minDate}
                  onChange={(e) => {
                    setCauseDate(e.target.value)
                    setErr(null)
                  }}
                  aria-label="Cause of action date"
                  className="field w-full font-mono"
                />
                {liveValidation && !liveValidation.valid && (
                  <p role="alert" className="text-[11px] text-bad">
                    {liveValidation.error}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy !== null || !causeDate.trim() || (liveValidation !== null && !liveValidation.valid)}
                  onClick={() => compute('preview')}
                  className="h-[34px] flex-1 rounded-[5px] border border-line-strong bg-surface px-3 text-[12px] font-medium text-ink hover:bg-hover disabled:opacity-50"
                >
                  {busy === 'preview' ? 'Computing…' : 'Preview'}
                </button>
                <button
                  type="button"
                  disabled={busy !== null || !causeDate.trim() || !canSave || (liveValidation !== null && !liveValidation.valid)}
                  title={canSave ? undefined : 'Only advocates (senior / junior) can change the saved deadline'}
                  onClick={() => compute('save')}
                  className="inline-flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded-[5px] bg-navy px-3 text-[12px] font-semibold text-night hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save size={13} /> {busy === 'save' ? 'Saving…' : 'Save to matter'}
                </button>
              </div>
              {presets.length > 0 && (
                <div className="space-y-2 border-t border-line pt-3">
                  <Label>Try a scenario (preview only)</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {presets.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        disabled={busy !== null}
                        onClick={() => compute('preview', p.date)}
                        className="rounded-[4px] border border-line bg-sunken px-2.5 py-1 text-[11px] text-ink-2 transition-colors hover:border-navy hover:text-navy disabled:opacity-50"
                      >
                        {p.label} <span className="font-mono text-ink-3">({p.date})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
