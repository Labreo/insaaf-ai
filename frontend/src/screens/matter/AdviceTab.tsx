import { motion } from 'motion/react'
import { api } from '@/lib/api'
import type { SourceRef } from '@/lib/types'
import { Chip, ConfidenceDot, Label, Row, Skeleton, SourceChip, cx, stagger, useAsync } from '@/components/ui'

const routeLabel: Record<string, string> = { lok_adalat: 'Lok Adalat', pre_institution_mediation_12A: 'Pre-institution mediation (s.12A)', fight: 'Proceed to suit', plea_bargain: 'Plea bargaining', mediate: 'Mediation', settle: 'Settle' }

export default function AdviceTab({ id, onOpen }: { id: string; onOpen: (s: SourceRef) => void }) {
  const a = useAsync(() => api.advice(id), [id])
  if (a.loading || !a.data) return <Skeleton className="h-72" />
  const d = a.data
  return (
    <div className="space-y-4">
      <div className="px-1">
        <Label>Settle or fight</Label>
        <p className="text-display font-normal capitalize text-marble">{d.recommendation.replace('_', ' ')}</p>
        <div className="mt-1 flex items-center gap-3"><ConfidenceDot c={d.confidence} /><span className="text-[12px] text-smoke">eligibility is rule-based; the band comes from the score</span></div>
      </div>
      {d.options.map((o, i) => (
        <motion.div key={o.route} {...stagger(i)}>
          <Row className={cx(!o.eligible && 'opacity-60')}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[15px] text-marble">{routeLabel[o.route] ?? o.route}</p>
              <Chip tone={o.eligible ? 'followed' : 'smoke'}>{o.eligible ? 'eligible' : 'not eligible'}</Chip>
            </div>
            <p className="mt-1 text-[13px] text-pewter">{o.why}</p>
            {o.sources.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{o.sources.map((s) => <SourceChip key={s.source_id} s={s} onOpen={onOpen} />)}</div>}
          </Row>
        </motion.div>
      ))}
      <p className="px-1 text-[11px] text-smoke">Information for the advocate, not advice to the client. Plea bargaining applies to criminal matters only, within the statutory limits.</p>
    </div>
  )
}
