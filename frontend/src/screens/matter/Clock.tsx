import { api } from '@/lib/api'
import type { SourceRef } from '@/lib/types'
import { Chip, Label, Ring, Row, Skeleton, SourceChip, useAsync } from '@/components/ui'

export default function Clock({ id, onOpen }: { id: string; onOpen: (s: SourceRef) => void }) {
  const c = useAsync(() => api.statuteClock(id), [id])
  if (c.loading || !c.data) return <Skeleton className="h-72" />
  const d = c.data
  const frac = Math.max(0, Math.min(1, d.days_left / 90))
  const expires = new Date(d.limitation_expires).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-6">
        <Ring value={frac} size={132} stroke={7} tone={d.days_left <= 45 ? '#c9a868' : '#8fa3bd'}>
          <span className="text-[40px] leading-none font-normal tracking-[-0.04em] text-marble">{d.days_left}</span>
          <Label className="mt-1">days left</Label>
        </Ring>
        <div className="min-w-0 flex-1">
          <Label>Limitation expires</Label>
          <p className="serif mt-1 text-[22px] leading-tight text-marble">{expires}</p>
          <p className="mt-1 text-[12px] text-smoke">{d.article}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{d.sources.map((s) => <SourceChip key={s.source_id} s={s} onOpen={onOpen} />)}</div>
        </div>
      </div>

      <Row>
        <Label>Forum</Label>
        <p className="mt-1 text-[15px] text-marble">{d.forum.court}</p>
        <p className="text-[12px] text-smoke">basis: {d.forum.basis} · commercial court: {d.commercial_court ? 'yes — s.12A mediation first' : 'no'}</p>
      </Row>

      <Row>
        <Label>ADR routes open</Label>
        <div className="mt-2 flex flex-wrap gap-1.5">{d.adr_routes.map((r) => <Chip key={r} tone="steel">{r}</Chip>)}</div>
      </Row>

      {d.excluded_periods.length > 0 && (
        <Row>
          <Label>Excluded periods applied</Label>
          {d.excluded_periods.map((p) => (
            <p key={p.from} className="mt-1 text-[13px] text-pewter"><span className="text-marble">{p.from} → {p.to}</span> · {p.reason}</p>
          ))}
          <p className="mt-2 text-[11px] text-smoke">Deterministic rule engine. No model guesses a deadline.</p>
        </Row>
      )}
    </div>
  )
}
