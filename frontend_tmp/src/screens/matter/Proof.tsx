import { motion } from 'motion/react'
import { Check, Minus, X } from 'lucide-react'
import { api } from '@/lib/api'
import { useDB } from '@/lib/store'
import type { ProofItem } from '@/lib/types'
import { Chip, Glass, Skeleton, SourceChip, stagger, useAsync } from '@/components/primitives'
import { cn } from '@/lib/utils'
import type { TabProps } from '../Matter'

const icon = { present: Check, weak: Minus, missing: X }
const color = { present: 'text-followed bg-followed/15', weak: 'text-distinguished bg-distinguished/15', missing: 'text-overruled bg-overruled/15' }

/** F5: the evidence a case still lacks, from the legal lead's deterministic rule pack. */
export default function Proof({ id, onOpen, onReview }: TabProps) {
  const v = useDB((d) => JSON.stringify(d.stages[id]?.proof.items.map((i) => i.state)))
  const p = useAsync(() => api.proofLedger(id), [id, v])
  if (p.loading) return <Skeleton className="h-64" />
  const items = p.data?.items ?? []
  const missing = items.filter((i) => i.state === 'missing').length
  const weak = items.filter((i) => i.state === 'weak').length
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between px-1">
        <div>
          <p className="text-heading font-normal text-marble">{missing} <span className="serif italic text-overruled">missing</span>{weak ? <span className="text-smoke"> · {weak} weak</span> : null}</p>
          <p className="text-[12px] text-smoke">{p.data?.case_type.replace('_', ' ')} pack · rules written by the legal lead, not the model</p>
        </div>
      </div>
      <div className="space-y-2">
        {items.map((it, i) => <Item key={it.requirement} it={it} i={i} onOpen={onOpen} onReview={() => onReview({ target: 'proof', target_id: it.requirement, title: it.requirement })} />)}
      </div>
    </div>
  )
}

function Item({ it, i, onOpen, onReview }: { it: ProofItem; i: number; onOpen: TabProps['onOpen']; onReview: () => void }) {
  const Icon = icon[it.state]
  return (
    <motion.div {...stagger(i)}>
      <Glass className={cn(it.state === 'missing' && it.severity === 'critical' && 'border-overruled/35')}>
        <div className="flex items-start gap-3">
          <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full', color[it.state])}><Icon size={13} strokeWidth={2.5} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[15px] text-marble">{it.requirement}</p>
              <Chip tone={it.severity === 'critical' ? 'overruled' : it.severity === 'high' ? 'distinguished' : 'smoke'}>{it.severity}</Chip>
            </div>
            <p className="mt-1 text-[13px] leading-snug text-pewter">{it.why}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {it.sources.map((s) => <SourceChip key={s.source_id} s={s} onOpen={onOpen} />)}
              {it.state !== 'present' && <button onClick={onReview} className="ml-auto text-[11px] text-smoke hover:text-brass">mark as obtained →</button>}
            </div>
          </div>
        </div>
      </Glass>
    </motion.div>
  )
}
