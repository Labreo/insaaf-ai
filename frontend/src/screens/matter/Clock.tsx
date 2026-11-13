import { useState } from 'react'
import { Calendar } from 'lucide-react'
import { api } from '@/lib/api'
import type { StatuteClock } from '@/lib/types'
import {
  Badge,
  Card,
  ErrorBanner,
  Label,
  Ring,
  Skeleton,
  SourceChip,
  useAsync,
} from '@/components/primitives'
import { sfx } from '@/lib/sound'
import type { TabProps } from '../Matter'

const PRESET_DATES = [
  { date: '2013-01-07', label: '2013-01-07 (COVID overlap)' },
  { date: '2021-06-01', label: '2021-06-01 (Pandemic window)' },
  { date: '2025-05-12', label: '2025-05-12 (s.18 Ack)' },
]

/** Statute Clock: deterministic limitation calculator with SC COVID tolling. */
export default function Clock({ id, onOpen }: TabProps) {
  const c = useAsync(() => api.statuteClock(id), [id])
  const [liveData, setLiveData] = useState<StatuteClock | null>(null)
  const [causeDate, setCauseDate] = useState('2013-01-07')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const recalc = async (dt?: string) => {
    const val = dt ?? causeDate
    if (!val) return
    setCauseDate(val)
    setBusy(true)
    setErr(null)
    sfx.tick()
    try {
      const next = await api.recalculateClock(id, val)
      setLiveData(next)
      sfx.accept()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const d = liveData ?? c.data
  if (c.loading && !d) return <Skeleton className="h-72" />
  if (c.error && !d) return <ErrorBanner error={c.error} onRetry={c.reload} />
  if (!d) return null

  const frac = Math.max(0, Math.min(1, d.days_left / 90))
  const expires = new Date(d.limitation_expires).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const ringTone = d.days_left <= 15 ? '#b03a2e' : d.days_left <= 45 ? '#a86514' : '#1f3a5c'

  return (
    <div className="space-y-4">
      {err && <ErrorBanner error={err} />}

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <Card className="flex flex-wrap items-center gap-6">
            <Ring value={frac} size={108} stroke={6} tone={ringTone}>
              <span className="tabular font-mono text-[26px] leading-none font-semibold text-ink">
                {d.days_left}
              </span>
              <Label className="mt-1">days left</Label>
            </Ring>

            <div className="min-w-0 flex-1 space-y-1.5">
              <Label>Statutory Limitation Expires</Label>
              <p className="serif text-[25px] leading-tight text-ink">{expires}</p>
              <p className="text-[13px] text-ink-2">{d.article}</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {d.sources.map((s) => (
                  <SourceChip key={s.source_id} s={s} onOpen={onOpen} />
                ))}
              </div>
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="space-y-1.5">
              <Label>Jurisdiction &amp; Forum</Label>
              <p className="text-[14px] font-semibold text-ink">{d.forum.court}</p>
              <p className="text-[12px] text-ink-3">
                Basis: {d.forum.basis} · Commercial Court:{' '}
                <strong className="font-medium text-ink">
                  {d.commercial_court ? 'Yes (s.12A mandatory)' : 'No'}
                </strong>
              </p>
            </Card>
            <Card className="space-y-2">
              <Label>Eligible ADR Routes</Label>
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
              <Label>Excluded Statutory &amp; COVID Tolling Windows</Label>
              <div className="divide-y divide-line">
                {d.excluded_periods.map((p) => (
                  <div key={p.from} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[12.5px]">
                    <span className="font-mono font-medium text-ink">
                      {p.from} → {p.to}
                    </span>
                    <span className="text-ink-2">{p.reason}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-ink-3">
                Deterministic YAML rule engine calculation. Language models never calculate statutory limitation periods.
              </p>
            </Card>
          )}
        </div>

        <div className="lg:col-span-5">
          <Card className="space-y-4">
            <Label className="flex items-center gap-1.5">
              <Calendar size={13} /> Cause / Acknowledgment Date Calculator
            </Label>
            <p className="text-[12.5px] leading-relaxed text-ink-2">
              Test how Limitation Act exclusion periods (Supreme Court Suo Motu COVID-19 extension 2020-03-15 → 2022-02-28 and s.18 acknowledgments) recompute the filing deadline.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={causeDate}
                onChange={(e) => setCauseDate(e.target.value)}
                aria-label="Cause or acknowledgment date"
                className="field flex-1 font-mono"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => recalc()}
                className="h-[34px] rounded-[5px] bg-navy px-4 text-[12px] font-medium text-white hover:bg-navy-600 disabled:opacity-50"
              >
                {busy ? 'Computing…' : 'Compute'}
              </button>
            </div>
            <div className="space-y-2 border-t border-line pt-3">
              <Label>Benchmark Scenarios</Label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_DATES.map((p) => (
                  <button
                    key={p.date}
                    type="button"
                    disabled={busy}
                    onClick={() => recalc(p.date)}
                    className="rounded-[4px] border border-line bg-sunken px-2.5 py-1 text-[11px] text-ink-2 transition-colors hover:border-navy hover:text-navy"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
