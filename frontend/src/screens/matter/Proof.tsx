import { Check, Minus, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { ProofItem } from '@/lib/types'
import { Badge, Card, ErrorBanner, Skeleton, SourceChip, useAsync } from '@/components/primitives'
import { cn } from '@/lib/utils'
import type { TabProps } from '../Matter'

const stateIcon = { present: Check, weak: Minus, missing: X }
const iconBox = {
  present: 'border-ok-200 bg-ok-50 text-ok',
  weak: 'border-warn-200 bg-warn-50 text-warn',
  missing: 'border-bad-200 bg-bad-50 text-bad',
}

/** F5: deterministic YAML evidentiary checklist. */
export default function Proof({ id, onOpen, onReview }: TabProps) {
  const p = useAsync(() => api.proofLedger(id), [id])
  if (p.loading && !p.data) return <Skeleton className="h-64" />
  if (p.error) return <ErrorBanner error={p.error} onRetry={p.reload} />

  const items = p.data?.items ?? []
  const missing = items.filter((i) => i.state === 'missing').length
  const weak = items.filter((i) => i.state === 'weak').length
  const present = items.filter((i) => i.state === 'present').length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div>
          <p className="text-[18px] font-semibold text-ink">
            <span className="text-bad">{missing} missing</span>
            {weak ? <span className="text-warn"> · {weak} weak</span> : null}
            <span className="text-ok"> · {present} present</span>
          </p>
          <p className="text-[12px] text-ink-3">
            {p.data?.case_type.replace('_', ' ')} YAML rule pack · deterministic evidentiary prerequisites
          </p>
        </div>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="tbl">
          <thead>
            <tr>
              <th>State</th>
              <th>Evidentiary Requirement &amp; Statutory Rationale</th>
              <th>Severity</th>
              <th>Authorities</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <ProofRow
                key={it.requirement}
                it={it}
                onOpen={onOpen}
                onReview={() =>
                  onReview({ target: 'proof', target_id: it.requirement, title: it.requirement })
                }
              />
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function ProofRow({
  it,
  onOpen,
  onReview,
}: {
  it: ProofItem
  onOpen: TabProps['onOpen']
  onReview: () => void
}) {
  const Icon = stateIcon[it.state]
  return (
    <tr className={cn(it.state === 'missing' && it.severity === 'critical' && 'bg-bad-50/40')}>
      <td className="w-28">
        <div className="inline-flex items-center gap-2">
          <span className={cn('grid h-6 w-6 place-items-center rounded-[4px] border', iconBox[it.state])}>
            <Icon size={12} strokeWidth={2.5} />
          </span>
          <Badge tone={it.state === 'present' ? 'ok' : it.state === 'weak' ? 'warn' : 'bad'}>
            {it.state}
          </Badge>
        </div>
      </td>
      <td>
        <p className="font-medium text-ink">{it.requirement}</p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{it.why}</p>
      </td>
      <td className="w-24">
        <Badge tone={it.severity === 'critical' ? 'bad' : it.severity === 'high' ? 'warn' : 'neutral'}>
          {it.severity}
        </Badge>
      </td>
      <td>
        <div className="flex flex-wrap gap-1.5">
          {it.sources.length ? (
            it.sources.map((s) => <SourceChip key={s.source_id} s={s} onOpen={onOpen} />)
          ) : (
            <span className="text-[11px] text-ink-4">—</span>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap text-right">
        {it.state !== 'present' ? (
          <button
            type="button"
            onClick={onReview}
            className="rounded-[4px] border border-line-strong bg-surface px-2.5 py-1 text-[11px] font-medium text-navy hover:bg-navy-50"
          >
            Mark obtained
          </button>
        ) : (
          <span className="text-[11px] text-ok font-medium">Satisfied</span>
        )}
      </td>
    </tr>
  )
}
