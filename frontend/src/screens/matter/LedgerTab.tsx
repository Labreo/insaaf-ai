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
      <Glass className={cn('flex flex-wrap items-center justify-between gap-3', !verify.valid && 'border-overruled/50')}>
        <div>
          <Label>Reviewer ledger · tamper-evident hash chain</Label>
          <motion.p
            key={String(verify.valid)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={cn('mt-1 flex items-center gap-2 text-[15px] font-medium', verify.valid ? 'text-followed' : 'text-overruled')}
          >
            {verify.valid ? <ShieldCheck size={16} /> : <ShieldOff size={16} />}
            {verify.valid ? 'Chain intact' : `Chain broken at ${verify.broken_at}`} · {verify.entries} entr
            {verify.entries === 1 ? 'y' : 'ies'}
          </motion.p>
        </div>
        {verify.anchored_root && (
          <Chip tone="steel">
            <Link2 size={11} /> {verify.anchored_root.hash.slice(0, 10)} · {verify.anchored_root.chain}
          </Chip>
        )}
      </Glass>

      <p className="px-1 text-[12px] text-smoke">
        Who reviewed, what changed, when, and why they disagreed. Only the daily root hash is anchored on-chain; client matter records never leave chamber custody.
      </p>

      {entries.length === 0 ? (
        <Empty text="No reviews yet. Approve or override a finding and it is cryptographically chained here." />
      ) : (
        <Glass className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-seam bg-graphite/60 text-[11px] uppercase tracking-wider text-smoke">
                <th className="px-4 py-2.5 font-medium">Timestamp</th>
                <th className="px-4 py-2.5 font-medium">Reviewer</th>
                <th className="px-4 py-2.5 font-medium">Action & Target</th>
                <th className="px-4 py-2.5 font-medium">Reason & Note</th>
                <th className="px-4 py-2.5 font-medium">Hash Chain Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-seam/70">
              {[...entries].reverse().map((e, i) => (
                <motion.tr key={e.id} {...stagger(i)} className="align-top transition-colors hover:bg-graphite/40">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-smoke">
                    {new Date(e.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3">
                    <span className="capitalize text-marble">{e.role}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip tone={e.action === 'approve' ? 'followed' : 'distinguished'}>{e.action}</Chip>
                      <span className="font-mono text-[12px] text-pewter">{e.target}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[12px] text-marble">{e.reason_code.replace(/_/g, ' ')}</span>
                    {e.note && <p className="mt-1 text-[12px] text-pewter">&ldquo;{e.note}&rdquo;</p>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px]">
                    <span className={verify.broken_at === e.id ? 'text-overruled' : 'text-smoke'}>
                      {e.prev_hash.slice(0, 8)} → {e.hash.slice(0, 8)}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </Glass>
      )}
    </div>
  )
}
