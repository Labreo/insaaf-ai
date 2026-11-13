import { motion } from 'motion/react'
import { Check, Minus, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { ProofItem, SourceRef } from '@/lib/types'
import { Chip, Row, Skeleton, SourceChip, cx, stagger, useAsync } from '@/components/ui'

const icon = { present: Check, weak: Minus, missing: X }
const color = { present: 'text-followed bg-followed/15', weak: 'text-distinguished bg-distinguished/15', missing: 'text-overruled bg-overruled/15' }

export default function Proof({ id, onOpen }: { id: string; onOpen: (s: SourceRef) => void }) {
  const p = useAsync(() => api.proofLedger(id), [id])
  if (p.loading) return <Skeleton className="h-64" />
  const items = p.data?.items ?? []
  const missing = items.filter((i) => i.state === 'missing').length
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between px-1">
        <div>
          <p className="text-heading font-normal text-marble">{missing} <span className="serif italic text-overruled">missing</span></p>
          <p className="text-[12px] text-smoke">{p.data?.case_type} pack · rules written by the legal lead, not the model</p>
        </div>
      </div>
      <div className="space-y-2">
        {items.map((it, i) => <Item key={it.requirement} it={it} i={i} onOpen={onOpen} />)}
      </div>
    </div>
  )
}

function Item({ it, i, onOpen }: { it: ProofItem; i: number; onOpen: (s: SourceRef) => void }) {
  const Icon = icon[it.state]
  return (
    <motion.div {...stagger(i)}>
      <Row className={cx(it.state === 'missing' && it.severity === 'critical' && 'ring-1 ring-overruled/40')}>
        <div className="flex items-start gap-3">
          <span className={cx('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full', color[it.state])}><Icon size={13} strokeWidth={2.5} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[15px] text-marble">{it.requirement}</p>
              <Chip tone={it.severity === 'critical' ? 'overruled' : it.severity === 'high' ? 'distinguished' : 'smoke'}>{it.severity}</Chip>
            </div>
            <p className="mt-1 text-[13px] leading-snug text-pewter">{it.why}</p>
            {it.sources.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{it.sources.map((s) => <SourceChip key={s.source_id} s={s} onOpen={onOpen} />)}</div>}
          </div>
        </div>
      </Row>
    </motion.div>
  )
}
