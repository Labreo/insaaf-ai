import { Link2, ShieldCheck, ShieldOff } from 'lucide-react'
import { api } from '@/lib/api'
import {
  Badge,
  Card,
  Empty,
  ErrorBanner,
  Label,
  Skeleton,
  useAsync,
} from '@/components/primitives'
import { cn } from '@/lib/utils'

/** F11: tamper-evident SHA-256 hash-chained reviewer ledger. */
export default function LedgerTab({ id }: { id: string }) {
  const l = useAsync(() => api.ledger(id), [id])
  if (l.loading && !l.data) return <Skeleton className="h-72" />
  if (l.error && !l.data) return <ErrorBanner error={l.error} onRetry={l.reload} />
  if (!l.data) return null

  const { entries, verify } = l.data

  return (
    <div className="space-y-4">
      <Card
        className={cn(
          'flex flex-wrap items-center justify-between gap-3',
          !verify.valid && 'border-bad-200 bg-bad-50/40',
        )}
      >
        <div>
          <Label>F11 · Tamper-Evident SHA-256 Reviewer Ledger</Label>
          <p
            className={cn(
              'mt-1 flex items-center gap-2 text-[15px] font-semibold',
              verify.valid ? 'text-ok' : 'text-bad',
            )}
          >
            {verify.valid ? <ShieldCheck size={16} /> : <ShieldOff size={16} />}
            {verify.valid ? 'Hash Chain Intact' : `Chain Broken at ${verify.broken_at}`} · {verify.entries}{' '}
            entr{verify.entries === 1 ? 'y' : 'ies'}
          </p>
        </div>

        {verify.anchored_root && (
          <Badge tone="info">
            <Link2 size={11} /> Root {verify.anchored_root.hash.slice(0, 10)} · {verify.anchored_root.chain}
          </Badge>
        )}
      </Card>

      <p className="text-[12px] text-ink-3">
        Records who reviewed, what changed, when, and why. Only the daily Merkle root hash is anchored on Solana Devnet; client matter files never leave chamber custody.
      </p>

      {entries.length === 0 ? (
        <Empty text="No reviews recorded on this matter yet. Approve or override a finding to seal an entry." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="tbl min-w-[720px]">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Reviewer</th>
                <th>Action &amp; Target</th>
                <th>Reason &amp; Note</th>
                <th>SHA-256 Chain Link</th>
              </tr>
            </thead>
            <tbody>
              {[...entries].reverse().map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap font-mono text-[11px] text-ink-3">
                    {new Date(e.at).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="whitespace-nowrap">
                    <span className="font-medium text-ink">{e.actor}</span>{' '}
                    <Badge tone="neutral">{e.role}</Badge>
                  </td>
                  <td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={e.action === 'approve' ? 'ok' : 'warn'}>{e.action}</Badge>
                      <span className="font-mono text-[12px] text-ink-2">{e.target}</span>
                    </div>
                  </td>
                  <td>
                    <span className="text-[12px] font-medium text-ink">
                      {e.reason_code.replace(/_/g, ' ')}
                    </span>
                    {e.note && <p className="mt-0.5 text-[12px] text-ink-2">&ldquo;{e.note}&rdquo;</p>}
                  </td>
                  <td className="whitespace-nowrap font-mono text-[11px]">
                    <span className={verify.broken_at === e.id ? 'font-semibold text-bad' : 'text-ink-3'}>
                      {e.prev_hash.slice(0, 8)} → {e.hash.slice(0, 8)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
