import { motion } from 'motion/react'
import { api } from '@/lib/api'
import type { SourceRef } from '@/lib/types'
import { Bar, Chip, Label, Row, Skeleton, SourceChip, stagger, useAsync } from '@/components/ui'

export default function Precedents({ id, onOpen }: { id: string; onOpen: (s: SourceRef) => void }) {
  const p = useAsync(() => api.precedents(id), [id])
  if (p.loading || !p.data) return <Skeleton className="h-72" />
  const d = p.data
  return (
    <div className="space-y-4">
      <Row className="flex items-center justify-between">
        <div>
          <p className="text-heading font-normal text-marble">{d.searched} <span className="text-smoke">of {d.total_matches.toLocaleString('en-IN')}</span></p>
          <p className="text-[12px] text-smoke">judgments fetched in {(d.elapsed_ms / 1000).toFixed(1)}s of an {(d.budget_ms / 1000).toFixed(0)}s budget</p>
        </div>
        {d.cached && <Chip>cached</Chip>}
      </Row>
      <p className="px-1 text-[12px] text-smoke">We don&rsquo;t index 50 million cases. Indian Kanoon does. We fetch 20 and read the 5 that share your facts.</p>

      {d.results.map((r, i) => (
        <motion.div key={r.rank} {...stagger(i)}>
          <Row>
            <div className="flex items-center justify-between">
              <Chip tone={r.stance === 'for' ? 'followed' : 'overruled'}>{r.stance === 'for' ? 'supports you' : 'against you'}</Chip>
              <span className="text-[11px] text-smoke">similarity {Math.round(r.similarity * 100)}%</span>
            </div>
            <p className="serif mt-2 text-[19px] leading-tight text-marble">{r.sources[0]?.title}</p>
            <p className="text-[12px] text-smoke">{r.sources[0]?.court} · {r.sources[0]?.date}</p>
            <Label className="mt-3">Why it matches</Label>
            <p className="text-[13px] text-pewter">{r.why_similar}</p>
            <Bar value={r.similarity} tone={r.stance === 'for' ? 'followed' : 'overruled'} className="mt-3" />
            <div className="mt-3 flex flex-wrap gap-1.5">{r.sources.map((s) => <SourceChip key={s.source_id} s={s} onOpen={onOpen} />)}</div>
          </Row>
        </motion.div>
      ))}
    </div>
  )
}
