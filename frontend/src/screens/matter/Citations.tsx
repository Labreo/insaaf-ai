import { motion } from 'motion/react'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { api } from '@/lib/api'
import { useDB } from '@/lib/store'
import type { CitationHealth } from '@/lib/types'
import { Chip, Empty, Glass, Label, Skeleton, SourceChip, Well, stagger, useAsync } from '@/components/primitives'
import { cn } from '@/lib/utils'
import type { TabProps } from '../Matter'

const badge: Record<CitationHealth['badge'], { ring: string; tone: 'followed' | 'distinguished' | 'overruled'; label: string }> = {
  green: { ring: 'bg-followed', tone: 'followed', label: 'good law' },
  amber: { ring: 'bg-distinguished', tone: 'distinguished', label: 'distinguished / limited' },
  red: { ring: 'bg-overruled', tone: 'overruled', label: 'overruled' },
}

/** F7: every cited case checked against later judgments. Red blocks the draft until a senior overrides. */
export default function Citations({ id, onOpen, onReview }: TabProps) {
  const v = useDB((d) => JSON.stringify(d.stages[id]?.citations.map((c) => c.blocks_draft)))
  const c = useAsync(() => api.citationHealth(id), [id, v])
  if (c.loading) return <Skeleton className="h-64" />
  if (!c.data?.length) return <Empty text="No judgments cited in this draft yet." />

  return (
    <div className="space-y-4">
      <div className="border-b border-seam pb-3">
        <p className="text-[13px] text-pewter">
          Each cited authority is verified via downstream citing judgments (<code className="text-marble">citedby:</code>). Red-flagged citations block final sealing until a senior advocate records a reasoned override.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {c.data.map((it, i) => {
          const b = badge[it.badge]
          return (
            <motion.div key={it.cited.source_id} {...stagger(i)}>
              <Glass className={cn('flex h-full flex-col justify-between gap-3', it.badge === 'red' && it.blocks_draft && 'border-overruled/40')}>
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', b.ring)} />
                      <Chip tone={b.tone}>{b.label}</Chip>
                    </div>
                    <span className="text-[11px] text-smoke">{it.cited.date}</span>
                  </div>

                  <div>
                    <p className="serif text-[20px] leading-tight text-marble">{it.cited.title}</p>
                    <p className="mt-0.5 text-[12px] text-smoke">{it.cited.court}</p>
                  </div>

                  {it.by && (
                    <Well>
                      <Label>{it.treatment} by later decision</Label>
                      <p className="mt-1 text-[13px] font-medium text-marble">{it.by.title}</p>
                      <p className="text-[11px] text-smoke">{it.by.court} · {it.by.date}</p>
                      <div className="mt-2"><SourceChip s={it.by} onOpen={onOpen} /></div>
                    </Well>
                  )}
                </div>

                {it.badge === 'red' && (
                  <div className="flex items-center justify-between border-t border-seam/70 pt-2.5">
                    {it.blocks_draft ? (
                      <p className="flex items-center gap-1.5 text-[12px] text-overruled"><ShieldAlert size={13} /> Blocked from final draft</p>
                    ) : (
                      <p className="flex items-center gap-1.5 text-[12px] text-distinguished"><ShieldCheck size={13} /> Senior override on record</p>
                    )}
                    {it.blocks_draft && (
                      <button
                        onClick={() => onReview({ target: 'citation', target_id: it.cited.source_id, title: `Override block on ${it.cited.title.split(' v. ')[0]}` })}
                        className="rounded-md border border-seam bg-graphite px-2.5 py-1 text-[11px] font-medium text-brass hover:border-brass/40"
                      >
                        override →
                      </button>
                    )}
                  </div>
                )}
              </Glass>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
