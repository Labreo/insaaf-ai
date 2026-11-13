import { motion } from 'motion/react'
import { Mic, FileText } from 'lucide-react'
import { api } from '@/lib/api'
import type { Fact } from '@/lib/types'
import { Chip, ConfidenceDot, Empty, Row, Skeleton, stagger, useAsync } from '@/components/ui'

const tone: Record<Fact['status'], 'smoke' | 'followed' | 'distinguished' | 'overruled'> = { alleged: 'smoke', documented: 'followed', disputed: 'distinguished', unknown: 'overruled' }

export default function Facts({ id }: { id: string }) {
  const f = useAsync(() => api.facts(id), [id])
  if (f.loading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
  if (!f.data?.length) return <Empty text="No facts extracted yet. Run the pipeline." />
  return (
    <div className="space-y-3">
      <p className="px-1 text-[12px] text-smoke">An allegation is never promoted to a fact. Each card keeps where it came from.</p>
      {f.data.map((fact, i) => (
        <motion.div key={fact.id} {...stagger(i)}>
          <Row>
            <div className="flex items-start justify-between gap-3">
              <p className="text-[15px] leading-snug text-marble">{fact.statement}</p>
              <Chip tone={tone[fact.status]}>{fact.status}</Chip>
            </div>
            {fact.original && (
              <div className="mt-3 rounded-xl bg-graphite p-3">
                <div className="flex items-center justify-between">
                  <span className="label">{fact.original.language === 'kok' ? 'Konkani' : fact.original.language} · original</span>
                  <ConfidenceDot c={fact.original.translation_confidence} />
                </div>
                <p className="devanagari mt-1 text-[15px] text-marble/90">{fact.original.text}</p>
                <p className="mt-1 text-[11px] text-smoke">Translation confidence shown so the advocate verifies, not trusts.</p>
              </div>
            )}
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-smoke">
              {fact.source ? (<>{fact.source.document_id.includes('voice') ? <Mic size={12} /> : <FileText size={12} />}{fact.source.document_id} · {fact.source.location}</>) : 'No source · needs client confirmation'}
            </p>
          </Row>
        </motion.div>
      ))}
    </div>
  )
}
