import { api } from '@/lib/api'
import { Chip, Glass, Label, Ring, Skeleton, SourceChip, useAsync } from '@/components/primitives'
import { NumberTicker } from '@/components/magicui/number-ticker'
import type { TabProps } from '../Matter'

/** Statute Clock: limitation, forum, ADR routes, excluded periods. Deterministic. */
export default function Clock({ id, onOpen }: TabProps) {
  const c = useAsync(() => api.statuteClock(id), [id])
  if (c.loading || !c.data) return <Skeleton className="h-72" />
  const d = c.data
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
