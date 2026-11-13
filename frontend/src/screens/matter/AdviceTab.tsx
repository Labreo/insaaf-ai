import { motion } from 'motion/react'
import { api } from '@/lib/api'
import { Chip, ConfidenceDot, Glass, Label, Skeleton, SourceChip, stagger, useAsync } from '@/components/primitives'
import { cn } from '@/lib/utils'
import type { TabProps } from '../Matter'

const routeLabel: Record<string, string> = {
  lok_adalat: 'Lok Adalat',
  pre_institution_mediation_12A: 'Pre-institution mediation (s.12A)',
  fight: 'Proceed to suit / trial',
  plea_bargain: 'Plea bargaining',
  mediate: 'Mediation',
  settle: 'Settle',
}

/** F6: settle or fight. Eligibility is rule-based; the band comes from the score. */
export default function AdviceTab({ id, onOpen, onReview }: TabProps) {
  const a = useAsync(() => api.advice(id), [id])
  if (a.loading || !a.data) return <Skeleton className="h-72" />
  const d = a.data
  return (
    <div className="space-y-4">
      <Glass spotlight className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Label>Settle or fight · deterministic strategic recommendation</Label>
          <p className="mt-1 text-2xl font-medium capitalize text-marble">{d.recommendation.replace('_', ' ')}</p>
          <div className="mt-1.5 flex items-center gap-3">
            <ConfidenceDot c={d.confidence} />
            <span className="text-[12px] text-smoke">Eligibility evaluated strictly from statutory prerequisites & claim posture</span>
          </div>
        </div>
        <button
          onClick={() =>
            onReview({
              target: 'advice',
              target_id: d.recommendation,
              title: `Disagree with "${d.recommendation.replace('_', ' ')}"`,
            })
          }
          className="rounded-md border border-seam bg-graphite px-3 py-1.5 text-[12px] text-pewter transition-colors hover:border-brass/40 hover:text-brass"
        >
          disagree →
        </button>
      </Glass>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {d.options.map((o, i) => (
          <motion.div key={o.route} {...stagger(i)}>
            <Glass className={cn('flex h-full flex-col justify-between gap-3', !o.eligible && 'opacity-65')}>
              <div>
                <div className="flex items-center justify-between gap-2 border-b border-seam/70 pb-2.5">
                  <p className="text-[15px] font-medium text-marble">{routeLabel[o.route] ?? o.route}</p>
                  <Chip tone={o.eligible ? 'followed' : 'smoke'}>{o.eligible ? 'eligible' : 'not eligible'}</Chip>
                </div>
                <p className="mt-2.5 text-[13px] leading-relaxed text-pewter">{o.why}</p>
              </div>
              {o.sources.length > 0 && (
                <div className="flex flex-wrap gap-1.5 border-t border-seam/60 pt-2.5">
                  {o.sources.map((s) => (
                    <SourceChip key={s.source_id} s={s} onOpen={onOpen} />
                  ))}
                </div>
              )}
            </Glass>
          </motion.div>
        ))}
      </div>

      <p className="px-1 text-[11px] text-smoke">
        Information for the advocate, not advice to the client. Plea bargaining applies to criminal proceedings only, within statutory limits.
      </p>
    </div>
  )
}
