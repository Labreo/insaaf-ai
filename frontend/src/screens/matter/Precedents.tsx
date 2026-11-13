import { useState } from 'react'
import { Search } from 'lucide-react'
import { api } from '@/lib/api'
import type { Precedents as PrecedentsData } from '@/lib/types'
import {
  Badge,
  Bar,
  Card,
  ErrorBanner,
  Label,
  Skeleton,
  SourceChip,
  useAsync,
} from '@/components/primitives'
import { sfx } from '@/lib/sound'
import type { TabProps } from '../Matter'

const QUICK_QUERIES = [
  'Suraj Lamp GPA registration',
  'Section 53A part performance possession',
  'Commercial Courts s.12A Patil Automation',
  'BNSS plea bargaining 290',
]

/** F3: time-boxed Indian Kanoon search (20 judgments within 8s). */
export default function Precedents({ id, onOpen }: TabProps) {
  const p = useAsync(() => api.precedents(id), [id])
  const [liveData, setLiveData] = useState<PrecedentsData | null>(null)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const runSearch = async (q?: string) => {
    const text = (q ?? query).trim()
    if (!text) return
    setQuery(text)
    setSearching(true)
    setErr(null)
    sfx.tick()
    try {
      const next = await api.searchPrecedents(id, text)
      setLiveData(next)
      sfx.accept()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSearching(false)
    }
  }

  const d = liveData ?? p.data
  if (p.loading && !d) return <Skeleton className="h-72" />
  if (p.error && !d) return <ErrorBanner error={p.error} onRetry={p.reload} />
  if (!d) return null

  return (
    <div className="space-y-4">
      {err && <ErrorBanner error={err} />}

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="tabular text-[16px] font-semibold text-ink">
              {d.searched} judgments inspected{' '}
              <span className="font-normal text-ink-3">
                of {d.total_matches.toLocaleString('en-IN')} Indian Kanoon matches
              </span>
            </p>
            <p className="text-[12px] text-ink-3">
              Completed in {(d.elapsed_ms / 1000).toFixed(2)}s within {(d.budget_ms / 1000).toFixed(0)}s hard budget · Supporting &amp; adverse authorities retrieved together
            </p>
          </div>
          <Badge tone={d.cached ? 'neutral' : 'ok'}>{d.cached ? 'Kanoon Cache' : 'Live Kanoon'}</Badge>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            runSearch()
          }}
          className="flex gap-2"
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Query Indian Kanoon live (8s budget)…"
            className="field flex-1"
          />
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="inline-flex h-[34px] items-center gap-1.5 rounded-[5px] bg-navy px-4 text-[12px] font-medium text-white hover:bg-navy-600 disabled:opacity-50"
          >
            <Search size={13} /> {searching ? 'Searching…' : 'Search Kanoon'}
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] text-ink-3">Quick queries:</span>
          {QUICK_QUERIES.map((q) => (
            <button
              key={q}
              type="button"
              disabled={searching}
              onClick={() => runSearch(q)}
              className="rounded-[4px] border border-line bg-sunken px-2.5 py-1 text-[11px] text-ink-2 transition-colors hover:border-navy hover:text-navy"
            >
              {q}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {d.results.map((r, i) => (
          <Card
            key={`${r.rank}-${r.sources[0]?.source_id ?? i}`}
            className={
              r.stance === 'against'
                ? 'flex h-full flex-col justify-between border-l-[3px] border-l-bad'
                : 'flex h-full flex-col justify-between border-l-[3px] border-l-ok'
            }
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <Badge tone={r.stance === 'for' ? 'ok' : 'bad'}>
                  {r.stance === 'for' ? 'Supports Claimant' : 'Adverse Authority'}
                </Badge>
                <span className="tabular font-mono text-[11px] text-ink-3">
                  Similarity {Math.round(r.similarity * 100)}%
                </span>
              </div>
              <h3 className="serif mt-2.5 text-[20px] leading-snug text-ink">{r.sources[0]?.title}</h3>
              <p className="mt-0.5 text-[12px] text-ink-3">
                {r.sources[0]?.court || 'Court'} · {r.sources[0]?.date}
              </p>
              <Label className="mt-3">Ratio / Match Basis</Label>
              <p className="mt-1 text-[13px] leading-snug text-ink-2">{r.why_similar}</p>
              <Bar value={r.similarity} tone={r.stance === 'for' ? 'ok' : 'bad'} className="mt-3" />
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-2.5">
              {r.sources.map((s) => (
                <SourceChip key={s.source_id} s={s} onOpen={onOpen} />
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
