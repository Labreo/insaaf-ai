import { motion } from 'motion/react'
import { Mic, FileText, Pencil } from 'lucide-react'
import { api } from '@/lib/api'
import { useDB } from '@/lib/store'
import type { Fact } from '@/lib/types'
import { Chip, ConfidenceDot, Empty, Glass, Label, Skeleton, Well, stagger, useAsync } from '@/components/primitives'
import type { TabProps } from '../Matter'

const tone: Record<Fact['status'], 'smoke' | 'followed' | 'distinguished' | 'overruled'> = { alleged: 'smoke', documented: 'followed', disputed: 'distinguished', unknown: 'overruled' }

/** F4: bilingual fact cards. An allegation is never promoted to a fact; every card keeps its source span. */
export default function Facts({ id, onReview }: TabProps) {
  const v = useDB((d) => JSON.stringify(d.stages[id]?.facts.map((x) => x.statement + x.status)) + ':' + d.ledger.length)
  const f = useAsync(() => api.facts(id), [id, v])
  if (f.loading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
  if (!f.data?.length) return <Empty text="No facts extracted yet. Run the pipeline." />
  const counts = f.data.reduce((a, x) => ({ ...a, [x.status]: (a[x.status] ?? 0) + 1 }), {} as Record<string, number>)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5 px-1">
        {(['documented', 'alleged', 'disputed', 'unknown'] as const).map((s) => counts[s] ? <Chip key={s} tone={tone[s]}>{counts[s]} {s}</Chip> : null)}
      </div>
      {f.data.map((fact, i) => (
        <motion.div key={fact.id} {...stagger(i)}>
          <Glass>
            <div className="flex items-start justify-between gap-3">
              <p className="text-[15px] leading-snug text-marble">{fact.statement}</p>
              <Chip tone={tone[fact.status]}>{fact.status}</Chip>
            </div>
            {fact.original && (
              <Well className="mt-3">
                <div className="flex items-center justify-between">
                  <Label>{fact.original.language === 'kok' ? 'Konkani' : fact.original.language} · original</Label>
                  <ConfidenceDot c={fact.original.translation_confidence} />
                </div>
                <p className="devanagari mt-1 text-[15px] text-marble/90">{fact.original.text}</p>
                <p className="mt-1 text-[11px] text-smoke">Translation confidence is shown so the advocate verifies rather than trusts.</p>
              </Well>
            )}
            <div className="mt-3 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[11px] text-smoke">
                {fact.source ? (<>{fact.source.document_id.includes('voice') ? <Mic size={12} /> : <FileText size={12} />}{fact.source.document_id} · {fact.source.location}</>) : 'No source · needs client confirmation'}
              </p>
              <button onClick={() => onReview({ target: 'fact', target_id: fact.id, title: fact.statement, action: 'edit' })} className="inline-flex items-center gap-1 text-[11px] text-smoke hover:text-brass"><Pencil size={11} /> correct</button>
            </div>
          </Glass>
        </motion.div>
      ))}
    </div>
  )
}
