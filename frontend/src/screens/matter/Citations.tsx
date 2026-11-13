import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { api } from '@/lib/api'
import type { CitationHealth } from '@/lib/types'
import {
  Badge,
  Card,
  Empty,
  ErrorBanner,
  Label,
  Skeleton,
  SourceChip,
  Well,
  type Tone,
  useAsync,
} from '@/components/primitives'
import { cn } from '@/lib/utils'
import type { TabProps } from '../Matter'

const badgeMap: Record<CitationHealth['badge'], { tone: Tone; label: string }> = {
  green: { tone: 'ok', label: 'Good Law (Followed)' },
  amber: { tone: 'warn', label: 'Distinguished / Limited' },
  red: { tone: 'bad', label: 'Overruled' },
}

/** F7: downstream citation health check (blocks overruled authorities until senior overrides). */
export default function Citations({ id, onOpen, onReview }: TabProps) {
  const c = useAsync(() => api.citationHealth(id), [id])
  if (c.loading && !c.data) return <Skeleton className="h-64" />
  if (c.error) return <ErrorBanner error={c.error} onRetry={c.reload} />
  if (!c.data?.length) return <Empty text="No cited authorities require downstream health review." />

  return (
    <div className="space-y-4">
      <Well className="text-[12.5px] text-ink-2">
        Each cited decision is checked against subsequent citing judgments (<code className="font-mono text-ink">citedby:</code>). Overruled authorities block draft sealing until a Senior Advocate records a reasoned override.
      </Well>

      <div className="grid gap-4 md:grid-cols-2">
        {c.data.map((it) => {
          const b = badgeMap[it.badge]
          return (
            <Card
              key={it.cited.source_id}
              className={cn(
                'flex h-full flex-col justify-between gap-3',
                it.badge === 'red' && it.blocks_draft && 'border-bad-200 bg-bad-50/20',
              )}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <Badge tone={b.tone}>{b.label}</Badge>
                  <span className="font-mono text-[11px] text-ink-3">{it.cited.date}</span>
                </div>

                <div>
                  <h3 className="serif text-[20px] leading-snug text-ink">{it.cited.title}</h3>
                  <p className="mt-0.5 text-[12px] text-ink-3">{it.cited.court}</p>
                </div>

                {it.by && (
                  <Well className="space-y-1">
                    <Label>{it.treatment} by later judgment</Label>
                    <p className="text-[13px] font-medium text-ink">{it.by.title}</p>
                    <p className="text-[11px] text-ink-3">
                      {it.by.court} · {it.by.date}
                    </p>
                    <div className="pt-1.5">
                      <SourceChip s={it.by} onOpen={onOpen} />
                    </div>
                  </Well>
                )}
              </div>

              {it.badge === 'red' && (
                <div className="flex items-center justify-between border-t border-line pt-2.5">
                  {it.blocks_draft ? (
                    <p className="flex items-center gap-1.5 text-[12px] font-medium text-bad">
                      <ShieldAlert size={14} /> Blocks final draft sealing
                    </p>
                  ) : (
                    <p className="flex items-center gap-1.5 text-[12px] font-medium text-warn">
                      <ShieldCheck size={14} /> Senior override recorded
                    </p>
                  )}
                  {it.blocks_draft && (
                    <button
                      type="button"
                      onClick={() =>
                        onReview({
                          target: 'citation',
                          target_id: it.cited.source_id,
                          title: `Override block on ${it.cited.title.split(' v. ')[0]}`,
                        })
                      }
                      className="rounded-[4px] border border-line-strong bg-surface px-2.5 py-1 text-[11px] font-medium text-navy hover:bg-navy-50"
                    >
                      Senior Override →
                    </button>
                  )}
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
