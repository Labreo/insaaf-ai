import { motion } from 'motion/react'
import { Check, Minus, X } from 'lucide-react'
import { api } from '@/lib/api'
import { useDB } from '@/lib/store'
import type { ProofItem } from '@/lib/types'
import { Chip, Skeleton, SourceChip, stagger, useAsync } from '@/components/primitives'
import { cn } from '@/lib/utils'
import type { TabProps } from '../Matter'

const icon = { present: Check, weak: Minus, missing: X }
const color = {
  present: 'text-followed bg-followed/15 border border-followed/30',
  weak: 'text-distinguished bg-distinguished/15 border border-distinguished/30',
  missing: 'text-overruled bg-overruled/15 border border-overruled/30',
}

/** F5: the evidence a case still lacks, from the legal lead's deterministic rule pack. */
export default function Proof({ id, onOpen, onReview }: TabProps) {
  const v = useDB((d) => JSON.stringify(d.stages[id]?.proof.items.map((i) => i.state)))
  const p = useAsync(() => api.proofLedger(id), [id, v])
  if (p.loading) return <Skeleton className="h-64" />
  const items = p.data?.items ?? []
  const missing = items.filter((i) => i.state === 'missing').length
  const weak = items.filter((i) => i.state === 'weak').length
  const present = items.filter((i) => i.state === 'present').length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-seam pb-3">
        <div>
          <p className="text-[20px] font-medium text-marble">
            <span className="text-overruled">{missing} missing</span>
            {weak ? <span className="text-distinguished"> · {weak} weak</span> : null}
            <span className="text-smoke"> · {present} present</span>
          </p>
          <p className="text-[12px] text-smoke">{p.data?.case_type.replace('_', ' ')} rule pack · deterministic evidentiary checklist authored by senior counsel</p>
        </div>
      </div>

      <div className="glass overflow-hidden p-0">
        <div className="divide-y divide-seam">
          {items.map((it, i) => (
            <Item
              key={it.requirement}
              it={it}
              i={i}
              onOpen={onOpen}
              onReview={() => onReview({ target: 'proof', target_id: it.requirement, title: it.requirement })}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function Item({ it, i, onOpen, onReview }: { it: ProofItem; i: number; onOpen: TabProps['onOpen']; onReview: () => void }) {
  const Icon = icon[it.state]
  return (
    <motion.div {...stagger(i)} className={cn('p-4 transition-colors hover:bg-graphite/35', it.state === 'missing' && it.severity === 'critical' && 'bg-overruled/[0.03]')}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md', color[it.state])}>
            <Icon size={13} strokeWidth={2.5} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[14px] font-medium text-marble">{it.requirement}</p>
              <Chip tone={it.severity === 'critical' ? 'overruled' : it.severity === 'high' ? 'distinguished' : 'smoke'}>{it.severity}</Chip>
              <Chip tone={it.state === 'present' ? 'followed' : it.state === 'weak' ? 'distinguished' : 'overruled'}>{it.state}</Chip>
            </div>
            <p className="mt-1 text-[13px] leading-snug text-pewter">{it.why}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {it.sources.map((s) => <SourceChip key={s.source_id} s={s} onOpen={onOpen} />)}
            </div>
          </div>
        </div>
        {it.state !== 'present' && (
          <button onClick={onReview} className="shrink-0 self-start rounded-md border border-seam bg-graphite px-3 py-1.5 text-[11px] font-medium text-brass hover:border-brass/40">
            mark as obtained →
          </button>
        )}
      </div>
    </motion.div>
  )
}
