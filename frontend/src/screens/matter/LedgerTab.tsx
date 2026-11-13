import { motion } from 'motion/react'
import { Link2, ShieldCheck, ShieldOff } from 'lucide-react'
import { api } from '@/lib/api'
import { useDB } from '@/lib/store'
import { Chip, Empty, Glass, Label, Skeleton, stagger, useAsync } from '@/components/primitives'
import { cn } from '@/lib/utils'

/** F11: reviewer ledger. Each row hashes the previous one; editing history breaks the chain visibly. */
export default function LedgerTab({ id }: { id: string }) {
  const v = useDB((d) => d.ledger.length + ':' + String(d.tampered) + ':' + d.ledger.map((e) => e.note).join('').length)
  const l = useAsync(() => api.ledger(id), [id, v])
  if (l.loading || !l.data) return <Skeleton className="h-72" />
  const { entries, verify } = l.data
  return (
    <div className="space-y-4">
      <Glass className={cn('flex items-center justify-between', !verify.valid && 'border-overruled/40')}>
        <div>
          <Label>Reviewer ledger</Label>
          <motion.p key={String(verify.valid)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn('mt-1 flex items-center gap-1.5 text-[15px]', verify.valid ? 'text-followed' : 'text-overruled')}>
            {verify.valid ? <ShieldCheck size={16} /> : <ShieldOff size={16} />} {verify.valid ? 'Chain intact' : `Chain broken at ${verify.broken_at}`} · {verify.entries} entr{verify.entries === 1 ? 'y' : 'ies'}
          </motion.p>
        </div>
        {verify.anchored_root && <Chip tone="steel"><Link2 size={11} /> {verify.anchored_root.hash.slice(0, 8)} · {verify.anchored_root.chain}</Chip>}
      </Glass>
      <p className="px-1 text-[12px] text-smoke">Who reviewed, what changed, when, and why they disagreed. Only the daily root hash is anchored on-chain; client data never is.</p>
      {entries.length === 0 && <Empty text="No reviews yet. Override or approve something and it lands here." />}
      <ol className="relative ml-3 border-l border-marble/10">
        {[...entries].reverse().map((e, i) => (
          <motion.li key={e.id} {...stagger(i)} className="relative pl-6 pb-5 last:pb-0">
            <span className={cn('absolute -left-[5px] top-2 h-[9px] w-[9px] rounded-full', verify.broken_at === e.id ? 'bg-overruled' : 'bg-brass')} />
            <div className="flex items-center justify-between gap-2">
              <p className="text-[14px] text-marble"><span className="capitalize">{e.role}</span> · {e.action} · {e.target}</p>
              <span className="text-[11px] text-smoke">{new Date(e.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <Chip tone={e.action === 'approve' ? 'followed' : 'distinguished'} className="mt-1">{e.reason_code.replace(/_/g, ' ')}</Chip>
            {e.note && <p className="serif mt-1.5 text-[15px] text-pewter">&ldquo;{e.note}&rdquo;</p>}
            <p className="mt-1.5 font-mono text-[10px] text-smoke">{e.prev_hash.slice(0, 10)} → {e.hash.slice(0, 10)}</p>
          </motion.li>
        ))}
      </ol>
    </div>
  )
}
