import { motion } from 'motion/react'
import { api } from '@/lib/api'
import { Bar, Chip, Glass, Label, Skeleton, SourceChip, stagger, useAsync } from '@/components/primitives'
import { AnimatedShinyText } from '@/components/magicui/animated-shiny-text'
import type { TabProps } from '../Matter'

/** F3: time-boxed Kanoon search. Supporting and adverse authorities side by side. */
export default function Precedents({ id, onOpen }: TabProps) {
  const p = useAsync(() => api.precedents(id), [id])
  if (p.loading || !p.data) return <Skeleton className="h-72" />
  const d = p.data
  return (
    <div className="space-y-4">
      <Glass spotlight className="flex items-center justify-between">
        <div>
          <p className="text-heading font-normal text-marble tabular-nums">{d.searched} <span className="text-smoke">of {d.total_matches.toLocaleString('en-IN')}</span></p>
          <p className="text-[12px] text-smoke">fetched in {(d.elapsed_ms / 1000).toFixed(1)}s of an {(d.budget_ms / 1000).toFixed(0)}s budget</p>
        </div>
        {d.cached && <Chip>cached</Chip>}
      </Glass>
      <AnimatedShinyText className="px-1 text-[12px]">Whether the corpus is 50 thousand or 50 million, every query costs the same 8 seconds.</AnimatedShinyText>

      {d.results.map((r, i) => (
        <motion.div key={r.rank} {...stagger(i)}>
          <Glass className={r.stance === 'against' ? 'border-overruled/25' : 'border-followed/25'}>
            <div className="flex items-center justify-between">
              <Chip tone={r.stance === 'for' ? 'followed' : 'overruled'}>{r.stance === 'for' ? 'supports you' : 'against you'}</Chip>
              <span className="text-[11px] tabular-nums text-smoke">similarity {Math.round(r.similarity * 100)}%</span>
            </div>
            <p className="serif mt-2 text-[20px] leading-tight text-marble">{r.sources[0]?.title}</p>
            <p className="text-[12px] text-smoke">{r.sources[0]?.court} · {r.sources[0]?.date}</p>
            <Label className="mt-3">Why it matches</Label>
            <p className="text-[13px] text-pewter">{r.why_similar}</p>
            <Bar value={r.similarity} tone={r.stance === 'for' ? 'followed' : 'overruled'} className="mt-3" />
            <div className="mt-3 flex flex-wrap gap-1.5">{r.sources.map((s) => <SourceChip key={s.source_id} s={s} onOpen={onOpen} />)}</div>
          </Glass>
        </motion.div>
      ))}
    </div>
  )
}
