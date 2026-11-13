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
    setBusy(true); sfx.tick()
    const next = await api.recalculateClock(id, val)
    setLiveData(next); setBusy(false); sfx.accept()
  }

  const d = liveData ?? c.data
  if (c.loading || !d) return <Skeleton className="h-72" />
  const frac = Math.max(0, Math.min(1, d.days_left / 90))
  const expires = new Date(d.limitation_expires).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  const tone = d.days_left <= 7 ? '#d95c54' : d.days_left <= 45 ? '#c9a868' : '#8fa3bd'
  return (
    <div className="space-y-4">
      <Glass spotlight className="flex items-center gap-6">
        <Ring value={frac} size={136} stroke={7} tone={tone}>
          <span className="text-[42px] leading-none font-normal tracking-[-0.04em] tabular-nums text-marble"><NumberTicker value={d.days_left} /></span>
          <Label className="mt-1">days left</Label>
        </Ring>
        <div className="min-w-0 flex-1">
          <Label>Limitation expires</Label>
          <p className="serif mt-1 text-[22px] leading-tight text-marble">{expires}</p>
          <p className="mt-1 text-[12px] text-smoke">{d.article}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{d.sources.map((s) => <SourceChip key={s.source_id} s={s} onOpen={onOpen} />)}</div>
        </div>
      </Glass>

      <Glass className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Label className="flex items-center gap-1.5"><Calendar size={12} /> Trigger / Acknowledgment date calculator</Label>
          <div className="flex items-center gap-2">
            <input type="date" value={causeDate} onChange={(e) => setCauseDate(e.target.value)} aria-label="Cause or acknowledgment date" className="glass-well px-2.5 py-1 text-[12px] text-marble" />
            <Button disabled={busy} onClick={() => recalc()} className="h-8 rounded-full bg-brass px-3 text-[11px] uppercase tracking-[0.08em] text-void hover:bg-[#d6b676]">
              {busy ? '…' : 'Compute'}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_DATES.map((p) => (
            <button key={p.date} disabled={busy} onClick={() => recalc(p.date)} className="rounded-full border border-marble/10 px-2.5 py-1 text-[11px] text-pewter transition-colors hover:border-brass/35 hover:text-marble">
              {p.label}
            </button>
          ))}
        </div>
      </Glass>

      <Glass>
        <Label>Forum</Label>
        <p className="mt-1 text-[15px] text-marble">{d.forum.court}</p>
        <p className="text-[12px] text-smoke">basis: {d.forum.basis} · commercial court: {d.commercial_court ? 'yes — s.12A mediation before suit' : 'no'}</p>
      </Glass>

      <Glass>
        <Label>ADR routes open</Label>
        <div className="mt-2 flex flex-wrap gap-1.5">{d.adr_routes.map((r) => <Chip key={r} tone="steel">{r}</Chip>)}</div>
      </Glass>

      {d.excluded_periods.length > 0 && (
        <Glass>
          <Label>Excluded periods applied</Label>
          {d.excluded_periods.map((p) => <p key={p.from} className="mt-1 text-[13px] text-pewter"><span className="text-marble">{p.from} → {p.to}</span> · {p.reason}</p>)}
          <p className="mt-2 text-[11px] text-smoke">A rule engine computes this. No model guesses a deadline.</p>
        </Glass>
      )}
    </div>
  )
}
