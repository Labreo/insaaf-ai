import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  BookOpen,
  ExternalLink,
  Filter,
  FolderPlus,
  Globe,
  MapPin,
  Scale,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { api } from '@/lib/api'
import { areaLabel, useMeta } from '@/lib/meta'
import type { PrecedentDetail, PrecedentExploreResult, PrecedentHit } from '@/lib/types'
import { Badge, Bar, Card, Empty, ErrorBanner, Label, PageHeader, Skeleton, Well, ease } from '@/components/primitives'
import { sfx } from '@/lib/sound'

const PRESET_QUERIES: { label: string; area?: string; state?: string; query: string }[] = [
  {
    label: 'Unregistered Sale Agreement & GPA Title (Suraj Lamp)',
    area: 'property',
    state: 'Goa',
    query: 'unregistered agreement of sale general power of attorney title registration section 17',
  },
  {
    label: 'Commercial Suits · Mandatory s.12A Mediation (Patil Automation)',
    area: 'commercial',
    state: 'Maharashtra',
    query: 'section 12A commercial courts act pre-institution mediation mandatory plaint rejection',
  },
  {
    label: 'Cheque Dishonour · NI Act s.138 & s.139 Presumption',
    area: 'cheque_bounce',
    query: 'section 138 negotiable instruments act dishonour cheque legally enforceable debt presumption section 139',
  },
  {
    label: 'Bail Triple Test & BNSS Plea Bargaining',
    area: 'criminal',
    query: 'bail parity custody period triple test plea bargaining under seven years',
  },
  {
    label: 'Specific Performance · Readiness & Willingness',
    area: 'civil_recovery',
    query: 'specific performance readiness willingness delay latches compensation contract breach',
  },
]

const OUTCOME_LABEL: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' }> = {
  allowed: { label: 'Relief Granted / Allowed', tone: 'ok' },
  partly_allowed: { label: 'Partly Allowed', tone: 'warn' },
  dismissed: { label: 'Dismissed / Rejected', tone: 'bad' },
  unknown: { label: 'Outcome Unlabelled', tone: 'neutral' },
}

export default function PrecedentSearch() {
  const meta = useMeta()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()

  const initialQuery = params.get('q') || PRESET_QUERIES[0].query
  const initialArea = params.get('area') || ''

  const [query, setQuery] = useState(initialQuery)
  const [area, setArea] = useState(initialArea)
  const [stateFilter, setStateFilter] = useState('')
  const [courtFilter, setCourtFilter] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState('')

  const [data, setData] = useState<PrecedentExploreResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [selectedHit, setSelectedHit] = useState<PrecedentHit | null>(null)
  const [detail, setDetail] = useState<PrecedentDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailErr, setDetailErr] = useState<string | null>(null)

  const runSearch = useCallback(
    async (overrides?: { q?: string; a?: string; st?: string; c?: string; o?: string }) => {
      const qText = (overrides?.q ?? query).trim()
      if (qText.length < 3) {
        setErr('Enter at least 3 characters describing the legal issue, section, or factual pattern.')
        return
      }
      const nextArea = overrides?.a !== undefined ? overrides.a : area
      const nextState = overrides?.st !== undefined ? overrides.st : stateFilter
      const nextCourt = overrides?.c !== undefined ? overrides.c : courtFilter
      const nextOutcome = overrides?.o !== undefined ? overrides.o : outcomeFilter

      setLoading(true)
      setErr(null)
      sfx.tick()
      try {
        const res = await api.explorePrecedents({
          query: qText,
          area: nextArea || undefined,
          state: nextState.trim() || undefined,
          court: nextCourt.trim() || undefined,
          outcome: nextOutcome || undefined,
          limit: 20,
        })
        setData(res)
        sfx.accept()
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    },
    [query, area, stateFilter, courtFilter, outcomeFilter],
  )

  useEffect(() => {
    void runSearch({ q: initialQuery, a: initialArea })
    // Run once on initial mount with URL params or lead preset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openJudgment = async (hit: PrecedentHit) => {
    setSelectedHit(hit)
    setDetail(null)
    setDetailErr(null)
    setDetailLoading(true)
    sfx.tick()
    try {
      const full = await api.getPrecedent(hit.doc_id)
      setDetail(full)
    } catch (e) {
      setDetailErr(e instanceof Error ? e.message : String(e))
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    if (!selectedHit) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedHit(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedHit])

  const stats = data?.outcome_stats
  const labelledTotal = stats ? stats.allowed + stats.partly_allowed + stats.dismissed : 0
  const allowedRate = labelledTotal > 0 && stats ? Math.round(((stats.allowed + 0.5 * stats.partly_allowed) / labelledTotal) * 100) : null

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        kicker="PS 29 · Semantic Legal Precedent Discovery"
        title="Insaaf Precedent Index"
        description="Search verified public Indian judgments across the Supreme Court, High Courts, and Tribunals with jurisdictional locality ranking and empirical outcome distributions."
        right={
          <button
            type="button"
            onClick={() => nav('/new')}
            className="inline-flex items-center gap-1.5 rounded-[5px] bg-navy px-3.5 py-2 text-[12px] font-semibold text-night hover:bg-navy-600"
          >
            <FolderPlus size={14} /> Predict Outcome for a Case
          </button>
        }
      />

      {/* Search Bar & Filters */}
      <Card className="space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const next = new URLSearchParams()
            next.set('q', query.trim())
            if (area) next.set('area', area)
            setParams(next, { replace: true })
            void runSearch()
          }}
          className="space-y-3"
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Describe facts, statute sections, or legal proposition (e.g. unregistered sale agreement s.17 Registration Act)…"
                className="field pl-9"
              />
            </div>
            <button
              type="submit"
              disabled={loading || query.trim().length < 3}
              className="inline-flex h-[36px] shrink-0 items-center justify-center gap-1.5 rounded-[5px] bg-navy px-5 text-[12.5px] font-semibold text-night hover:bg-navy-600 disabled:opacity-50"
            >
              <Search size={13} /> {loading ? 'Searching Index…' : 'Search Precedents'}
            </button>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <label className="min-w-0 space-y-1 text-[11px] text-ink-3">
              <span className="flex items-center gap-1 font-medium">
                <Filter size={10} /> Practice Area
              </span>
              <select
                value={area}
                onChange={(e) => {
                  const val = e.target.value
                  setArea(val)
                  void runSearch({ a: val })
                }}
                className="field h-8 w-full min-w-0 text-[12px]"
              >
                <option value="">All 15 practice areas</option>
                {meta.areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-0 space-y-1 text-[11px] text-ink-3">
              <span className="flex items-center gap-1 font-medium">
                <MapPin size={10} /> State Jurisdiction Boost
              </span>
              <input
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                placeholder="e.g. Goa, Maharashtra, Delhi…"
                className="field h-8 w-full min-w-0 text-[12px]"
              />
            </label>

            <label className="min-w-0 space-y-1 text-[11px] text-ink-3">
              <span className="flex items-center gap-1 font-medium">
                <Scale size={10} /> Court Filter
              </span>
              <input
                value={courtFilter}
                onChange={(e) => setCourtFilter(e.target.value)}
                placeholder="e.g. Supreme Court, Bombay…"
                className="field h-8 w-full min-w-0 text-[12px]"
              />
            </label>

            <label className="min-w-0 space-y-1 text-[11px] text-ink-3">
              <span className="font-medium">Holding / Outcome</span>
              <select
                value={outcomeFilter}
                onChange={(e) => {
                  const val = e.target.value
                  setOutcomeFilter(val)
                  void runSearch({ o: val })
                }}
                className="field h-8 w-full min-w-0 text-[12px]"
              >
                <option value="">All outcomes</option>
                <option value="allowed">Allowed / Relief Granted</option>
                <option value="partly_allowed">Partly Allowed</option>
                <option value="dismissed">Dismissed</option>
              </select>
            </label>
          </div>
        </form>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
          <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-medium text-ink-3">
            <Sparkles size={11} className="text-brass" /> Research queries:
          </span>
          {PRESET_QUERIES.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setQuery(p.query)
                setArea(p.area ?? '')
                setStateFilter(p.state ?? '')
                void runSearch({ q: p.query, a: p.area ?? '', st: p.state ?? '' })
              }}
              className="max-w-full rounded-[4px] border border-line bg-sunken px-2.5 py-1 text-left text-[11px] text-ink-2 transition-colors hover:border-navy hover:text-navy"
            >
              {p.label}
            </button>
          ))}
        </div>
      </Card>

      {err && <ErrorBanner error={err} onRetry={() => void runSearch()} />}

      {/* Index Stats + Empirical Outcome Distribution */}
      {data && (
        <div className="grid gap-4 lg:grid-cols-12">
          <Card className="flex min-w-0 flex-wrap items-center justify-between gap-4 lg:col-span-5">
            <div>
              <Label>Verified Public Corpus</Label>
              <p className="mt-1 tabular font-mono text-[22px] font-semibold text-ink">
                {data.results.length} matched
                <span className="ml-1.5 text-[13px] font-normal text-ink-3">
                  / {data.index_size.toLocaleString('en-IN')} indexed judgments
                </span>
              </p>
              <p className="mt-0.5 text-[11.5px] text-ink-3">
                Completed in {data.elapsed_ms} ms ·{' '}
                {data.web_swept > 0 ? `${data.web_swept} newly added via Live Web Sweep` : 'Served from local semantic index'}
              </p>
            </div>
            <Badge tone="info">Verified Public Records</Badge>
          </Card>

          <Card className="min-w-0 space-y-2.5 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>How Courts Ruled on Matching Precedents</Label>
              {allowedRate != null && (
                <span className="font-mono text-[12px] font-semibold text-brass">
                  {allowedRate}% relief rate ({labelledTotal} labelled)
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              <div className="rounded-[5px] border border-ok-200 bg-ok-50 px-2 py-2">
                <p className="tabular font-mono text-[17px] font-semibold text-ok">{stats?.allowed ?? 0}</p>
                <p className="text-[10.5px] text-ink-2">Allowed</p>
              </div>
              <div className="rounded-[5px] border border-warn-200 bg-warn-50 px-2 py-2">
                <p className="tabular font-mono text-[17px] font-semibold text-warn">{stats?.partly_allowed ?? 0}</p>
                <p className="text-[10.5px] text-ink-2">Partly</p>
              </div>
              <div className="rounded-[5px] border border-bad-200 bg-bad-50 px-2 py-2">
                <p className="tabular font-mono text-[17px] font-semibold text-bad">{stats?.dismissed ?? 0}</p>
                <p className="text-[10.5px] text-ink-2">Dismissed</p>
              </div>
              <div className="rounded-[5px] border border-line bg-sunken px-2 py-2">
                <p className="tabular font-mono text-[17px] font-semibold text-ink-3">{stats?.unknown ?? 0}</p>
                <p className="text-[10.5px] text-ink-3">Unlabelled</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Results List */}
      {loading && !data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      ) : data && data.results.length === 0 ? (
        <Empty text="No matching public judgments found for this filter combination. Clear court/outcome filters or broaden your query." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(data?.results ?? []).map((hit) => {
            const oSpec = OUTCOME_LABEL[hit.outcome] ?? OUTCOME_LABEL.unknown
            return (
              <Card key={hit.doc_id} className="flex h-full min-w-0 flex-col justify-between gap-3">
                <div className="min-w-0 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={oSpec.tone}>{oSpec.label}</Badge>
                      <Badge tone="info">Verified Public Judgment</Badge>
                      {hit.origin === 'web_sweep' && (
                        <Badge tone="brass">
                          <Globe size={10} /> Live Web Sweep
                        </Badge>
                      )}
                    </div>
                    <span className="tabular font-mono text-[11px] font-medium text-ink-2">
                      Match {Math.round(hit.score * 100)}%
                    </span>
                  </div>

                  <div className="min-w-0">
                    <h3 className="serif break-words text-[20px] leading-snug text-ink">{hit.title}</h3>
                    <p className="mt-1 break-words text-[12px] text-ink-3">
                      {hit.court}
                      {hit.seat ? ` (${hit.seat})` : ''} · {hit.date || 'Date unreported'}
                    </p>
                  </div>

                  {hit.locality && (
                    <p className="flex items-start gap-1.5 rounded-[4px] border border-brass-200 bg-brass-50 px-2.5 py-1.5 text-[11.5px] text-brass">
                      <MapPin size={12} className="mt-0.5 shrink-0" />
                      <span className="min-w-0 break-words">{hit.locality}</span>
                    </p>
                  )}

                  {hit.headnote && (
                    <p className="line-clamp-4 break-words text-[13px] leading-relaxed text-ink-2">{hit.headnote}</p>
                  )}

                  {hit.statutes.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {hit.statutes.slice(0, 4).map((st) => (
                        <span
                          key={st}
                          className="max-w-full break-words rounded border border-line bg-sunken px-1.5 py-0.5 font-mono text-[10px] text-ink-3"
                        >
                          {st}
                        </span>
                      ))}
                    </div>
                  )}

                  <Bar value={Math.min(1, hit.score)} tone={oSpec.tone === 'bad' ? 'bad' : 'navy'} />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                  <div className="flex flex-wrap gap-1">
                    {hit.practice_areas.slice(0, 2).map((pa) => (
                      <Badge key={pa} tone="neutral">
                        {areaLabel(meta, pa)}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    {hit.url && (
                      <a
                        href={hit.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-[4px] border border-line bg-sunken px-2.5 py-1 text-[11.5px] text-ink-2 hover:text-ink"
                      >
                        Source <ExternalLink size={11} />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => void openJudgment(hit)}
                      className="inline-flex items-center gap-1.5 rounded-[5px] bg-navy px-3 py-1 text-[11.5px] font-semibold text-night hover:bg-navy-600"
                    >
                      <BookOpen size={12} /> Read Paragraphs
                    </button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Judgment Detail Drawer */}
      <AnimatePresence>
        {selectedHit && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setSelectedHit(null)}
              className="fixed inset-0 bg-night/75 backdrop-blur-[2px]"
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label="Verified Public Judgment Detail"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.28, ease }}
              className="relative z-10 flex h-full w-full max-w-2xl flex-col border-l border-line-strong bg-surface shadow-[var(--shadow-sheet)]"
            >
              <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="eyebrow">Verified Public Judgment Record</span>
                    <Badge tone={(OUTCOME_LABEL[selectedHit.outcome] ?? OUTCOME_LABEL.unknown).tone}>
                      {(OUTCOME_LABEL[selectedHit.outcome] ?? OUTCOME_LABEL.unknown).label}
                    </Badge>
                  </div>
                  <h2 className="serif mt-1.5 text-[24px] leading-snug font-medium text-ink">
                    {selectedHit.title}
                  </h2>
                  <p className="mt-1 font-mono text-[11px] text-ink-3">
                    {selectedHit.court}
                    {selectedHit.seat ? ` · ${selectedHit.seat}` : ''} · {selectedHit.date} · ID {selectedHit.doc_id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedHit(null)}
                  aria-label="Close judgment detail"
                  className="rounded-[5px] border border-line p-1.5 text-ink-3 hover:bg-sunken hover:text-ink"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
                {detailLoading && <Skeleton className="h-48" />}
                {detailErr && <ErrorBanner error={detailErr} />}
                {detail && (
                  <>
                    {(detail.bench || detail.state) && (
                      <Well className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
                        {detail.bench && (
                          <span>
                            <strong className="text-ink">Bench:</strong> {detail.bench}
                          </span>
                        )}
                        {detail.state && (
                          <span>
                            <strong className="text-ink">Jurisdiction:</strong> {detail.state}
                          </span>
                        )}
                        <span>
                          <strong className="text-ink">Indexed Paragraphs:</strong> {detail.paragraph_count}
                        </span>
                      </Well>
                    )}

                    {detail.holding && (
                      <div className="rounded-[6px] border border-brass-200 bg-brass-50 px-4 py-3">
                        <p className="eyebrow text-brass">Ratio / Holding</p>
                        <p className="mt-1 text-[13.5px] leading-relaxed text-ink">{detail.holding}</p>
                      </div>
                    )}

                    {detail.headnote && (
                      <div>
                        <p className="eyebrow mb-1.5">Headnote Summary</p>
                        <p className="text-[13.5px] leading-relaxed text-ink-2">{detail.headnote}</p>
                      </div>
                    )}

                    <div className="space-y-3">
                      <p className="eyebrow">Extracted Paragraphs ({(detail.paras ?? []).length})</p>
                      {(detail.paras ?? []).map((p) => (
                        <div key={p.n} className="rounded-[6px] border border-line bg-sunken px-4 py-3">
                          <span className="font-mono text-[11px] font-semibold text-brass">¶ {p.n}</span>
                          <p className="serif mt-1 text-[15.5px] leading-[1.7] text-ink">{p.text}</p>
                        </div>
                      ))}
                      {(detail.paras ?? []).length === 0 && (
                        <p className="text-[12px] text-ink-3">No individual paragraph segments stored for this record.</p>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-line bg-sunken px-6 py-3.5">
                <button
                  type="button"
                  onClick={() => setSelectedHit(null)}
                  className="rounded-[5px] border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 hover:bg-hover"
                >
                  Close
                </button>
                {selectedHit.url && (
                  <a
                    href={selectedHit.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-[5px] bg-navy px-3.5 py-1.5 text-[12px] font-semibold text-night hover:bg-navy-600"
                  >
                    Open full judgment <ExternalLink size={13} />
                  </a>
                )}
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
