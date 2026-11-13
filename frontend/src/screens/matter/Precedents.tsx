import { useState } from 'react'
import { motion } from 'motion/react'
import { Search } from 'lucide-react'
import { api } from '@/lib/api'
import type { Precedents as PrecedentsData } from '@/lib/types'
import { Bar, Chip, Glass, Label, Skeleton, SourceChip, stagger, useAsync } from '@/components/primitives'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AnimatedShinyText } from '@/components/magicui/animated-shiny-text'
import { sfx } from '@/lib/sound'
import type { TabProps } from '../Matter'

const QUICK_QUERIES = [
  'Suraj Lamp GPA registration',
  'Section 53A part performance possession',
  'Commercial Courts s.12A Patil Automation',
  'BNSS plea bargaining 290',
]

/** F3: time-boxed Kanoon search. Supporting and adverse authorities side by side. */
export default function Precedents({ id, onOpen }: TabProps) {
  const p = useAsync(() => api.precedents(id), [id])
  const [liveData, setLiveData] = useState<PrecedentsData | null>(null)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)

  const runSearch = async (q?: string) => {
    const text = (q ?? query).trim()
    if (!text) return
    setQuery(text)
    setSearching(true); sfx.tick()
    const next = await api.searchPrecedents(id, text)
    setLiveData(next); setSearching(false); sfx.accept()
  }

  const d = liveData ?? p.data
  if (p.loading || !d) return <Skeleton className="h-72" />

  return (
    <div className="space-y-4">
      <Glass spotlight className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-heading font-normal text-marble tabular-nums">{d.searched} <span className="text-smoke">of {d.total_matches.toLocaleString('en-IN')}</span></p>
            <p className="text-[12px] text-smoke">fetched in {(d.elapsed_ms / 1000).toFixed(1)}s of an {(d.budget_ms / 1000).toFixed(0)}s budget</p>
          </div>
          {d.cached ? <Chip>cached</Chip> : <Chip tone="followed">live kanoon</Chip>}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); runSearch() }} className="flex gap-2">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Query Indian Kanoon live (8s budget)…" className="glass-well h-10 flex-1 border-0 text-[13px] text-marble placeholder:text-smoke" />
          <Button type="submit" disabled={searching || !query.trim()} className="h-10 rounded-full bg-brass px-4 text-void uppercase tracking-[0.08em] hover:bg-[#d6b676]">
            <Search size={13} /> {searching ? '…' : 'Search'}
          </Button>
        </form>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_QUERIES.map((q) => (
            <button key={q} disabled={searching} onClick={() => runSearch(q)} className="rounded-full border border-marble/10 px-2.5 py-1 text-[11px] text-pewter transition-colors hover:border-brass/35 hover:text-marble">
              {q}
            </button>
          ))}
        </div>
      </Glass>
      <AnimatedShinyText className="px-1 text-[12px]">Whether the corpus is 50 thousand or 50 million, every query costs the same 8 seconds.</AnimatedShinyText>

      {d.results.map((r, i) => (
        <motion.div key={`${r.rank}-${r.sources[0]?.source_id ?? i}`} {...stagger(i)}>
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
