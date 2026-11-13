import { useEffect, useState } from 'react'
import { Globe, MapPin, Search } from 'lucide-react'
import { api } from '@/lib/api'
import { can } from '@/lib/store'
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

/** F3: time-boxed Insaaf Precedent Index search (20 judgments within 8s) with empirical outcomes. */
export default function Precedents({ id, onOpen }: TabProps) {
  const canRun = can('analysis.run') || can('matter.edit')
  const denied = 'Only Senior Counsel or Junior Advocates can re-query precedents'
  const p = useAsync(() => api.precedents(id), [id])
  const [liveData, setLiveData] = useState<PrecedentsData | null>(null)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setLiveData(null)
  }, [id])

  useEffect(() => {
    if (p.data) setLiveData(p.data)
  }, [p.data])

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

  const stats = d.outcome_stats
  const labelledTotal = stats ? stats.allowed + stats.partly_allowed + stats.dismissed : 0

  return (
    <div className="space-y-4">
      {err && <ErrorBanner error={err} />}

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="tabular text-[16px] font-semibold text-ink">
              {d.searched} verified judgments inspected{' '}
              <span className="font-normal text-ink-3">
                of {(d.index_size || d.total_matches).toLocaleString('en-IN')} indexed records
              </span>
            </p>
            <p className="text-[12px] text-ink-3">
              Completed in {(d.elapsed_ms / 1000).toFixed(2)}s within {(d.budget_ms / 1000).toFixed(0)}s hard budget
              {' · '}Supporting &amp; adverse authorities retrieved together
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {d.web_swept != null && d.web_swept > 0 && (
              <Badge tone="brass">
                <Globe size={10} /> Live Web Sweep (+{d.web_swept})
              </Badge>
            )}
            <Badge tone={d.cached ? 'neutral' : 'ok'}>
              {d.cached ? 'Index Cache' : 'Live Index Sweep'}
            </Badge>
          </div>
        </div>

        {stats && labelledTotal > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[5px] border border-line bg-sunken px-3 py-2 text-[12px]">
            <span className="font-medium text-ink">
              Outcome distribution across retrieved precedents:
            </span>
            <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
              <span className="text-ok">{stats.allowed} allowed</span>
              <span className="text-warn">{stats.partly_allowed} partly</span>
              <span className="text-bad">{stats.dismissed} dismissed</span>
              {stats.unknown > 0 && <span className="text-ink-3">{stats.unknown} unlabelled</span>}
            </div>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void runSearch()
          }}
          className="flex gap-2"
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Query Insaaf Precedent Index live (8s budget)…"
            className="field flex-1"
          />
          <button
            type="submit"
            disabled={searching || !query.trim() || !canRun}
            title={canRun ? undefined : denied}
            className="inline-flex h-[34px] items-center gap-1.5 rounded-[5px] bg-navy px-4 text-[12px] font-semibold text-night hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Search size={13} /> {searching ? 'Searching…' : 'Search Precedents'}
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] text-ink-3">Quick queries:</span>
          {QUICK_QUERIES.map((q) => (
            <button
              key={q}
              type="button"
              disabled={searching || !canRun}
              title={canRun ? undefined : denied}
              onClick={() => void runSearch(q)}
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={r.stance === 'for' ? 'ok' : 'bad'}>
                    {r.stance === 'for' ? 'Supports Claimant' : 'Adverse Authority'}
                  </Badge>
                  <Badge tone="info">Verified Judgment</Badge>
                  {r.outcome && (
                    <Badge tone={r.outcome === 'allowed' ? 'ok' : r.outcome === 'dismissed' ? 'bad' : r.outcome === 'partly_allowed' ? 'warn' : 'neutral'}>
                      {r.outcome.replace(/_/g, ' ')}
                    </Badge>
                  )}
                  {r.origin === 'web_sweep' && (
                    <Badge tone="brass">Web Sweep</Badge>
                  )}
                </div>
                <span className="tabular font-mono text-[11px] text-ink-3">
                  Similarity {Math.round(r.similarity * 100)}%
                </span>
              </div>
              <h3 className="serif mt-2.5 text-[20px] leading-snug text-ink">{r.sources[0]?.title}</h3>
              <p className="mt-0.5 text-[12px] text-ink-3">
                {r.sources[0]?.court || 'Court'} · {r.sources[0]?.date}
              </p>
              {r.locality && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] font-medium text-brass">
                  <MapPin size={11} className="shrink-0" />
                  <span>{r.locality}</span>
                </p>
              )}
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
