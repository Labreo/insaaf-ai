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
    <div className="space-y-3">
      <p className="px-1 text-[12px] text-smoke">Each cited case is searched for later judgments that cite it (Kanoon <code className="text-pewter">citedby:</code>), and the treatment is classified. A red badge blocks the draft until a senior overrides it; the override is logged.</p>
      {c.data.map((it, i) => {
        const b = badge[it.badge]
        return (
          <motion.div key={it.cited.source_id} {...stagger(i)}>
            <Glass className={cn(it.badge === 'red' && it.blocks_draft && 'border-overruled/35')}>
              <div className="flex items-start gap-3">
                <motion.span className={cn('mt-1.5 h-3 w-3 shrink-0 rounded-full', b.ring)} animate={it.badge === 'red' && it.blocks_draft ? { boxShadow: ['0 0 0 0 rgba(217,92,84,0.5)', '0 0 0 10px rgba(217,92,84,0)'] } : {}} transition={{ duration: 1.6, repeat: Infinity }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="serif text-[19px] leading-tight text-marble">{it.cited.title}</p>
                    <Chip tone={b.tone}>{b.label}</Chip>
                  </div>
                  <p className="text-[12px] text-smoke">{it.cited.court} · {it.cited.date}</p>
                  {it.by && (
                    <Well className="mt-3">
                      <Label>{it.treatment} by</Label>
                      <p className="mt-1 text-[14px] text-marble">{it.by.title}</p>
                      <p className="text-[11px] text-smoke">{it.by.court} · {it.by.date}</p>
                      <div className="mt-2"><SourceChip s={it.by} onOpen={onOpen} /></div>
                    </Well>
                  )}
                  {it.badge === 'red' && (
                    <div className="mt-3 flex items-center justify-between">
                      {it.blocks_draft ? <p className="flex items-center gap-1.5 text-[12px] text-overruled"><ShieldAlert size={13} /> Blocked from the draft</p> : <p className="flex items-center gap-1.5 text-[12px] text-distinguished"><ShieldCheck size={13} /> Senior override on record</p>}
                      {it.blocks_draft && <button onClick={() => onReview({ target: 'citation', target_id: it.cited.source_id, title: `Override block on ${it.cited.title.split(' v. ')[0]}` })} className="text-[11px] text-smoke hover:text-brass">override →</button>}
                    </div>
                  )}
                </div>
              </div>
            </Glass>
          </motion.div>
        )
      })}
    </div>
  )
}
