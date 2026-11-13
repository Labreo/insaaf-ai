import { useEffect, useMemo, useState } from 'react'
import { Calendar, Info, Save } from 'lucide-react'
import { api } from '@/lib/api'
import { can } from '@/lib/store'
import type { StatuteClock } from '@/lib/types'
import { Badge, Card, ErrorBanner, Label, Ring, Skeleton, SourceChip, useAsync } from '@/components/primitives'
import { sfx } from '@/lib/sound'
import type { TabProps } from '../Matter'

function iso(d: Date) {
  return d.toISOString().slice(0, 10)
}

function shift(base: string, { years = 0, days = 0 }: { years?: number; days?: number }) {
  const d = new Date(base + 'T00:00:00Z')
  d.setUTCFullYear(d.getUTCFullYear() + years)
  d.setUTCDate(d.getUTCDate() + days)
  return iso(d)
}

function fmt(date: string | null | undefined) {
  if (!date) return '—'
  return new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

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

  useEffect(() => {
    setSaved(null)
    setPreview(null)
    setErr(null)
  }, [id])

  useEffect(() => {
    if (c.data) {
      setSaved(c.data)
      setCauseDate(c.data.cause_date ?? '')
    }
  }, [c.data])

  const base = saved ?? c.data
  const today = base?.today ?? iso(new Date())
  const years = base?.limitation_years ?? null

  const presets = useMemo(() => {
    if (!years) return []
    return [
      { label: 'Accrued 6 months ago', date: shift(today, { days: -182 }) },
      { label: '~60 days left', date: shift(today, { years: -years, days: 60 }) },
      { label: 'Just time-barred', date: shift(today, { years: -years, days: -10 }) },
      { label: 'Accrued in COVID window', date: '2021-01-15' },
    ].filter((p) => p.date <= today)
  }, [today, years])

  const compute = async (mode: 'preview' | 'save', dt?: string) => {
    const val = (dt ?? causeDate).trim()
    if (!val) {
      setErr('Enter the cause-of-action date first.')
      return
    }
    if (val > today) {
      setErr('Cause of action cannot be in the future.')
      return
    }
    setCauseDate(val)
    setBusy(mode)
    setErr(null)
    sfx.tick()
    try {
      const next = await api.recalculateClock(id, val, mode === 'preview')
      if (mode === 'preview') setPreview(next)
      else {
        setSaved(next)
        setPreview(null)
      }
      sfx.accept()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const d = preview ?? base
  if (c.loading && !d) return <Skeleton className="h-72" />
  if (c.error && !d) return <ErrorBanner error={c.error} onRetry={c.reload} />
  if (!d) return null

  const noClock = d.applicable === false
  const daysLeft = d.days_left
  const total = d.total_days ?? null
  const frac = daysLeft == null || !total ? 0 : Math.max(0, Math.min(1, daysLeft / total))
  const tone = daysLeft == null ? 'var(--color-ink-3)' : daysLeft < 0 ? 'var(--color-bad)' : daysLeft <= 30 ? 'var(--color-bad)' : daysLeft <= 90 ? 'var(--color-warn)' : 'var(--color-navy)'

  return (
    <div className="space-y-4">
      {preview && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-info-200 bg-info-50 px-4 py-2 text-[12.5px] text-ink">
          <span>
            <strong>Preview only.</strong> This calculation for {fmt(preview.cause_date)} is not saved to the matter.
          </span>
          <button type="button" onClick={() => setPreview(null)} className="text-[12px] font-medium text-navy hover:underline">
            Back to saved clock
          </button>
        </div>
      )}
      {!preview && d.cause_date_source === 'document' && d.cause_date && (
        <div role="note" className="rounded-[6px] border border-info-200 bg-info-50 px-4 py-2 text-[12px] text-ink-2">
          Cause date taken from the latest dated event in the documents ({fmt(d.cause_date)}). Confirm it is the accrual or acknowledgment date, then save it.
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
                <Ring value={frac} size={108} stroke={6} tone={tone}>
                  <span className="tabular font-mono text-[24px] leading-none font-semibold text-ink">
                    {daysLeft == null ? '—' : Math.abs(daysLeft).toLocaleString('en-IN')}
                  </span>
                  <Label className="mt-1">{daysLeft == null ? 'no date' : daysLeft < 0 ? 'days late' : 'days left'}</Label>
                </Ring>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label>{daysLeft != null && daysLeft < 0 ? 'Limitation expired on' : 'Limitation expires'}</Label>
                  <p className="serif text-[24px] leading-tight text-ink">{d.limitation_expires ? fmt(d.limitation_expires) : 'Enter cause date'}</p>
                  <p className="text-[13px] text-ink-2">{d.article}</p>
                  {d.cause_date && (
                    <p className="text-[12px] text-ink-3">
                      Cause of action {fmt(d.cause_date)} · {years}-year period{total ? ` · ${total.toLocaleString('en-IN')} days in all` : ''}
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
                {d.adr_routes.map((r) => (
                  <Badge key={r} tone="info">
                    {r}
                  </Badge>
                ))}
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
                      {fmt(p.from)} to {fmt(p.to)}
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
                Preview any date to see the deadline. Save it only when it is the real accrual or acknowledgment date (s.18 Limitation Act).
              </p>
              <input
                type="date"
                value={causeDate}
                max={today}
                min={shift(today, { years: -60 })}
                onChange={(e) => setCauseDate(e.target.value)}
                aria-label="Cause of action date"
                className="field w-full font-mono"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy !== null || !causeDate}
                  onClick={() => compute('preview')}
                  className="h-[34px] flex-1 rounded-[5px] border border-line-strong bg-surface px-3 text-[12px] font-medium text-ink hover:bg-hover disabled:opacity-50"
                >
                  {busy === 'preview' ? 'Computing…' : 'Preview'}
                </button>
                <button
                  type="button"
                  disabled={busy !== null || !causeDate || !canSave}
                  title={canSave ? undefined : 'Only advocates (senior / junior) can change the saved deadline'}
                  onClick={() => compute('save')}
                  className="inline-flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded-[5px] bg-navy px-3 text-[12px] font-medium text-white hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-50"
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
                        className="rounded-[4px] border border-line bg-sunken px-2.5 py-1 text-[11px] text-ink-2 transition-colors hover:border-navy hover:text-navy"
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
