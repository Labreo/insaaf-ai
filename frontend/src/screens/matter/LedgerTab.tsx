import { motion } from 'motion/react'
import { Link2, ShieldCheck, ShieldOff } from 'lucide-react'
import { api } from '@/lib/api'
import { Chip, Label, Row, Skeleton, cx, stagger, useAsync } from '@/components/ui'

export default function LedgerTab({ id }: { id: string }) {
  const l = useAsync(() => api.ledger(id), [id])
  if (l.loading || !l.data) return <Skeleton className="h-72" />
  const { entries, verify } = l.data
  return (
    <div className="space-y-4">
      <Row className="flex items-center justify-between">
        <div>
          <Label>Reviewer ledger</Label>
          <p className={cx('mt-1 flex items-center gap-1.5 text-[15px]', verify.valid ? 'text-followed' : 'text-overruled')}>
            {verify.valid ? <ShieldCheck size={16} /> : <ShieldOff size={16} />} {verify.valid ? 'Chain intact' : `Chain broken at ${verify.broken_at}`} · {verify.entries} entries
          </p>
        </div>
        {verify.anchored_root && <Chip tone="steel"><Link2 size={11} /> anchored · {verify.anchored_root.chain}</Chip>}
      </Row>
      <p className="px-1 text-[12px] text-smoke">Who reviewed, what changed, when, and why they disagreed. Each row hashes the previous one; editing history breaks the chain visibly.</p>
      <ol className="relative ml-3 border-l border-seam">
        {entries.map((e, i) => (
          <motion.li key={e.id} {...stagger(i)} className="relative pl-6 pb-5 last:pb-0">
            <span className="absolute -left-[5px] top-2 h-[9px] w-[9px] rounded-full bg-brass" />
            <div className="flex items-center justify-between gap-2">
              <p className="text-[14px] text-marble"><span className="capitalize">{e.role}</span> · {e.action} · {e.target}</p>
              <span className="text-[11px] text-smoke">{new Date(e.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <Chip tone="distinguished" className="mt-1">{e.reason_code.replace(/_/g, ' ')}</Chip>
            {e.note && <p className="serif mt-1.5 text-[15px] text-pewter">&ldquo;{e.note}&rdquo;</p>}
            <p className="mt-1.5 font-mono text-[10px] text-smoke">{e.prev_hash.slice(0, 10)} → {e.hash.slice(0, 10)}</p>
          </motion.li>
        ))}
      </ol>
    </div>
  )
}
