import { useState } from 'react'
import { Calendar } from 'lucide-react'
import { api } from '@/lib/api'
import type { StatuteClock } from '@/lib/types'
import { Chip, Glass, Label, Ring, Skeleton, SourceChip, useAsync } from '@/components/primitives'
import { Button } from '@/components/ui/button'
import { NumberTicker } from '@/components/magicui/number-ticker'
import { sfx } from '@/lib/sound'
import type { TabProps } from '../Matter'

const PRESET_DATES = [
  { date: '2013-01-07', label: '2013-01-07 (COVID overlap)' },
  { date: '2021-06-01', label: '2021-06-01 (Pandemic window)' },
  { date: '2025-05-12', label: '2025-05-12 (s.18 Ack)' },
]

/** Statute Clock: limitation, forum, ADR routes, excluded periods + live cause-date calculator. Deterministic. */
export default function Clock({ id, onOpen }: TabProps) {
  const c = useAsync(() => api.statuteClock(id), [id])
  const [liveData, setLiveData] = useState<StatuteClock | null>(null)
  const [causeDate, setCauseDate] = useState('2013-01-07')
  const [busy, setBusy] = useState(false)

  const recalc = async (dt?: string) => {
    const val = dt ?? causeDate
    if (!val) return
    setCauseDate(val)
    setBusy(true)
    sfx.tick()
    const next = await api.recalculateClock(id, val)
    setLiveData(next)
    setBusy(false)
    sfx.accept()
  }

  const d = liveData ?? c.data
  if (c.loading || !d) return <Skeleton className="h-72" />
  const frac = Math.max(0, Math.min(1, d.days_left / 90))
  const expires = new Date(d.limitation_expires).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  const tone = d.days_left <= 7 ? '#d95c54' : d.days_left <= 45 ? '#c9a868' : '#8fa3bd'

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="space-y-4 lg:col-span-7">
        <Glass className="flex flex-wrap items-center gap-6">
          <Ring value={frac} size={116} stroke={7} tone={tone}>
            <span className="font-mono text-[32px] leading-none font-medium tracking-[-0.03em] tabular-nums text-marble">
              <NumberTicker value={d.days_left} />
            </span>
            <Label className="mt-1">days left</Label>
          </Ring>
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label>Limitation expires</Label>
            <p className="serif text-[26px] leading-tight text-marble">{expires}</p>
            <p className="text-[13px] text-pewter">{d.article}</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {d.sources.map((s) => <SourceChip key={s.source_id} s={s} onOpen={onOpen} />)}
            </div>
          </div>
        </Glass>

        <div className="grid gap-4 sm:grid-cols-2">
          <Glass className="space-y-1.5">
            <Label>Jurisdiction & Forum</Label>
            <p className="text-[15px] font-medium text-marble">{d.forum.court}</p>
            <p className="text-[12px] text-smoke">
              Basis: {d.forum.basis} · Commercial Court: {d.commercial_court ? 'Yes — s.12A mediation before suit' : 'No'}
            </p>
          </Glass>
          <Glass className="space-y-2">
            <Label>ADR routes open</Label>
            <div className="flex flex-wrap gap-1.5">
              {d.adr_routes.map((r) => <Chip key={r} tone="steel">{r}</Chip>)}
            </div>
          </Glass>
        </div>

        {d.excluded_periods.length > 0 && (
          <Glass className="space-y-2">
            <Label>Excluded statutory & COVID tolling windows applied</Label>
            <div className="divide-y divide-seam/70">
              {d.excluded_periods.map((p) => (
                <div key={p.from} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
                  <span className="font-mono text-marble">{p.from} → {p.to}</span>
                  <span className="text-pewter">{p.reason}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-smoke">Deterministic rule engine calculation. Models never guess limitation dates.</p>
          </Glass>
        )}
      </div>

      <div className="lg:col-span-5">
        <Glass className="space-y-4">
          <Label className="flex items-center gap-1.5"><Calendar size={13} /> Trigger / Acknowledgment date calculator</Label>
          <p className="text-[12px] leading-relaxed text-smoke">
            Test how Limitation Act exclusion periods (including Supreme Court Suo Motu Cognizance COVID-19 extension 2020-03-15 → 2022-02-28 and s.18 written acknowledgments) recompute the statutory filing deadline.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={causeDate}
              onChange={(e) => setCauseDate(e.target.value)}
              aria-label="Cause or acknowledgment date"
              className="glass-well h-10 flex-1 px-3 font-mono text-[13px] text-marble"
            />
            <Button disabled={busy} onClick={() => recalc()} className="h-10 rounded-md bg-brass px-4 text-[12px] font-medium uppercase tracking-[0.06em] text-void hover:bg-[#d6b676]">
              {busy ? '…' : 'Compute'}
            </Button>
          </div>
          <div className="space-y-1.5 border-t border-seam pt-3">
            <Label>Quick benchmark scenarios</Label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_DATES.map((p) => (
                <button
                  key={p.date}
                  disabled={busy}
                  onClick={() => recalc(p.date)}
                  className="rounded-md border border-seam bg-graphite px-2.5 py-1.5 text-[11px] text-pewter transition-colors hover:border-brass/40 hover:text-marble"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </Glass>
      </div>
    </div>
  )
}
