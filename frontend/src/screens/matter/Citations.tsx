import { motion } from 'motion/react'
import { ShieldAlert } from 'lucide-react'
import { api } from '@/lib/api'
import type { CitationHealth, SourceRef } from '@/lib/types'
import { Chip, Label, Row, Skeleton, SourceChip, cx, stagger, useAsync } from '@/components/ui'

const badge: Record<CitationHealth['badge'], { ring: string; tone: 'followed' | 'distinguished' | 'overruled'; label: string }> = {
  green: { ring: 'bg-followed', tone: 'followed', label: 'good law' },
  amber: { ring: 'bg-distinguished', tone: 'distinguished', label: 'distinguished / limited' },
  red: { ring: 'bg-overruled', tone: 'overruled', label: 'overruled' },
}

export default function Citations({ id, onOpen }: { id: string; onOpen: (s: SourceRef) => void }) {
  const c = useAsync(() => api.citationHealth(id), [id])
  if (c.loading || !c.data) return <Skeleton className="h-64" />
  return (
    <div className="space-y-3">
      <p className="px-1 text-[12px] text-smoke">Each cited case is checked against later judgments that cite it. A red badge blocks the draft until an advocate overrides it, and the override is logged.</p>
      {c.data.map((it, i) => {
        const b = badge[it.badge]
        return (
          <motion.div key={it.cited.source_id} {...stagger(i)}>
            <Row className={cx(it.badge === 'red' && 'ring-1 ring-overruled/40')}>
              <div className="flex items-start gap-3">
                <motion.span className={cx('mt-1.5 h-3 w-3 shrink-0 rounded-full', b.ring)} animate={it.badge === 'red' ? { boxShadow: ['0 0 0 0 rgba(217,92,84,0.5)', '0 0 0 10px rgba(217,92,84,0)'] } : {}} transition={{ duration: 1.6, repeat: Infinity }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="serif text-[18px] leading-tight text-marble">{it.cited.title}</p>
                    <Chip tone={b.tone}>{b.label}</Chip>
                  </div>
                  <p className="text-[12px] text-smoke">{it.cited.court} · {it.cited.date}</p>
                  {it.by && (
                    <div className="mt-3 rounded-xl bg-graphite p-3">
                      <Label>{it.treatment} by</Label>
                      <p className="mt-1 text-[14px] text-marble">{it.by.title}</p>
                      <p className="text-[11px] text-smoke">{it.by.court} · {it.by.date}</p>
                      <div className="mt-2"><SourceChip s={it.by} onOpen={onOpen} /></div>
                    </div>
                  )}
                  {it.blocks_draft && <p className="mt-2 flex items-center gap-1.5 text-[12px] text-overruled"><ShieldAlert size={13} /> Blocked from the draft</p>}
                </div>
              </div>
            </Row>
          </motion.div>
        )
      })}
    </div>
  )
}
