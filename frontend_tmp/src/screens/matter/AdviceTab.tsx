import { motion } from 'motion/react'
import { api } from '@/lib/api'
import { Chip, ConfidenceDot, Glass, Label, Skeleton, SourceChip, stagger, useAsync } from '@/components/primitives'
import { cn } from '@/lib/utils'
import type { TabProps } from '../Matter'

const routeLabel: Record<string, string> = { lok_adalat: 'Lok Adalat', pre_institution_mediation_12A: 'Pre-institution mediation (s.12A)', fight: 'Proceed to suit / trial', plea_bargain: 'Plea bargaining', mediate: 'Mediation', settle: 'Settle' }

/** F6: settle or fight. Eligibility is rule-based; the band comes from the score. */
export default function AdviceTab({ id, onOpen, onReview }: TabProps) {
  const a = useAsync(() => api.advice(id), [id])
  if (a.loading || !a.data) return <Skeleton className="h-72" />
  const d = a.data
  return (
    <div className="space-y-4">
      <Glass spotlight className="lamp">
        <Label>Settle or fight</Label>
        <p className="text-display font-normal capitalize text-marble">{d.recommendation.replace('_', ' ')}</p>
        <div className="mt-1 flex items-center justify-between"><div className="flex items-center gap-3"><ConfidenceDot c={d.confidence} /><span className="text-[12px] text-smoke">eligibility is rule-based</span></div><button onClick={() => onReview({ target: 'advice', target_id: d.recommendation, title: `Disagree with "${d.recommendation.replace('_', ' ')}"` })} className="text-[11px] text-smoke hover:text-brass">disagree →</button></div>
      </Glass>
      {d.options.map((o, i) => (
        <motion.div key={o.route} {...stagger(i)}>
          <Glass className={cn(!o.eligible && 'opacity-60')}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[15px] text-marble">{routeLabel[o.route] ?? o.route}</p>
              <Chip tone={o.eligible ? 'followed' : 'smoke'}>{o.eligible ? 'eligible' : 'not eligible'}</Chip>
            </div>
            <p className="mt-1 text-[13px] text-pewter">{o.why}</p>
            {o.sources.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{o.sources.map((s) => <SourceChip key={s.source_id} s={s} onOpen={onOpen} />)}</div>}
          </Glass>
        </motion.div>
      ))}
      <p className="px-1 text-[11px] text-smoke">Information for the advocate, not advice to the client. Plea bargaining is criminal only, within the statutory limits.</p>
    </div>
  )
}
