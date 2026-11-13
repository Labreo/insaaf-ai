import { useEffect, useRef, useState } from 'react'
import { Check, ChevronRight, Play, RotateCcw, Zap } from 'lucide-react'
import { api } from '@/lib/api'
import { can, useDB } from '@/lib/store'
import type { PipelineEvent, Stage } from '@/lib/types'
import { Badge, Bar, Card, ErrorBanner, Label, Ring, Well, type Tone } from '@/components/primitives'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'
import type { Tab, TabProps } from '../Matter'

const STAGES: { key: Stage; label: string; engine: string; tab: Tab; what: string }[] = [
  { key: 'intake', label: 'Intake & OCR', engine: 'PyMuPDF · Insaaf Translate', tab: 'facts', what: 'PDF · DOCX · voice notes' },
  { key: 'facts', label: 'Fact cards', engine: 'Source-Span Lock', tab: 'facts', what: 'allegation ≠ fact' },
  { key: 'proof_ledger', label: 'Proof ledger', engine: 'Deterministic YAML', tab: 'proof', what: 'statutory rule checklist' },
  { key: 'statute_clock', label: 'Statute clock', engine: 'Deterministic Rules', tab: 'clock', what: 'limitation · forum · ADR' },
  { key: 'search', label: 'Time-boxed search', engine: 'Insaaf Index 8s', tab: 'precedents', what: '20 judgments, 8s budget' },
  { key: 'rag', label: 'Authority lock', engine: 'Corpus Binding', tab: 'draft', what: 'no quote, no claim' },
  { key: 'citation_health', label: 'Citation health', engine: 'Downstream Check', tab: 'citations', what: 'overruled? distinguished?' },
  { key: 'bias_firewall', label: 'Bias firewall', engine: '6-Identity Flip', tab: 'score', what: '6 identities, ε = 0.02' },
  { key: 'score', label: 'Insaaf B score', engine: 'Court-Pooled ML', tab: 'score', what: 'calibrated band + shrinkage' },
  { key: 'advice', label: 'Settle or fight', engine: 'Statutory Rules', tab: 'advice', what: 's.12A · Lok Adalat · BNSS' },
  { key: 'draft', label: 'Draft pleading', engine: 'DOCX + Ledger', tab: 'draft', what: 'senior review required' },
]

const statusTone: Record<string, Tone> = {
  done: 'ok',
  running: 'info',
  failed: 'bad',
  skipped: 'neutral',
  queued: 'neutral',
}

export default function Pipeline({ id, onJump, autorun }: TabProps & { autorun?: boolean }) {
  const matter = useDB((d) => d.matters.find((m) => m.id === id))
  const [events, setEvents] = useState<Partial<Record<Stage, PipelineEvent>>>({})
  const [running, setRunning] = useState(false)
  const [run, setRun] = useState(0)
  const [liveMode, setLiveMode] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const started = useRef(false)
  const liveRef = useRef(false)
  const canRun = can('analysis.run')

  useEffect(() => {
    if (autorun && !started.current) {
      started.current = true
      setRun(1)
    }
  }, [autorun])

  useEffect(() => {
    if (!run) return
    let alive = true
    setEvents({})
    setErr(null)
    setRunning(true)
    const runLive = liveRef.current
    ;(async () => {
      try {
        let last: Stage | null = null
        for await (const ev of api.pipeline(id, runLive)) {
          if (!alive) return
          if (ev.status === 'done' && ev.stage !== last) {
            last = ev.stage
            sfx.stage()
          }
          setEvents((e) => ({ ...e, [ev.stage]: ev }))
        }
        if (alive) {
          setRunning(false)
          sfx.seal()
        }
      } catch (e) {
        if (alive) {
          setRunning(false)
          setErr(e instanceof Error ? e.message : String(e))
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [run, id])

  const prewarmed = matter ? matter.status !== 'draft' : false
  const doneCount = Object.values(events).filter((e) => e?.status === 'done').length
  const completedCount = running || run > 0 ? doneCount : prewarmed ? STAGES.length : 0
  const search = events.search
  const total = STAGES.length
  const headline = running ? 'Executing Live Stream' : run > 0 ? 'Pipeline Complete' : prewarmed ? 'Stages Computed & Cached' : 'Ready to Run'

  return (
    <div className="space-y-4">
      {err && <ErrorBanner error={err} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8">
          <Card className="overflow-x-auto p-0">
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Stage</th>
                  <th>Engine</th>
                  <th>Status</th>
                  <th>Output</th>
                  <th className="text-right">Elapsed</th>
                </tr>
              </thead>
              <tbody>
                {STAGES.map((s, idx) => {
                  const ev = events[s.key]
                  const st = ev?.status ?? (prewarmed && run === 0 ? 'done' : 'queued')
                  const clickable = st === 'done'
                  return (
                    <tr
                      key={s.key}
                      onClick={() => clickable && onJump(s.tab)}
                      className={cn(clickable && 'row-link cursor-pointer')}
                    >
                      <td className="w-10 font-mono text-[11px] text-ink-3">
                        <span
                          className={cn(
                            'grid h-6 w-6 place-items-center rounded-[4px] border text-[11px] font-medium',
                            st === 'done'
                              ? 'border-ok-200 bg-ok-50 text-ok'
                              : st === 'running'
                                ? 'border-info-200 bg-info-50 text-info animate-pulse'
                                : 'border-line bg-sunken text-ink-3',
                          )}
                        >
                          {st === 'done' ? <Check size={12} strokeWidth={2.5} /> : idx + 1}
                        </span>
                      </td>
                      <td className="font-medium text-ink">
                        <div className="flex items-center gap-1.5">
                          <span>{s.label}</span>
                          {clickable && <ChevronRight size={13} className="text-ink-4" />}
                        </div>
                      </td>
                      <td>
                        <Badge tone="neutral">{s.engine}</Badge>
                      </td>
                      <td>
                        <Badge tone={statusTone[st] ?? 'neutral'}>{st}</Badge>
                      </td>
                      <td className="text-[12px] text-ink-2">
                        {ev?.message ?? s.what}
                      </td>
                      <td className="text-right font-mono text-[11px] text-ink-3 tabular">
                        {ev?.elapsed_ms ? `${ev.elapsed_ms} ms` : st === 'done' ? 'cached' : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        </div>

        <div className="min-w-0 space-y-4 lg:col-span-4">
          <Card className="space-y-4">
            <div className="flex items-center gap-4">
              <Ring value={completedCount / total} size={76} stroke={5} tone={completedCount === total ? 'var(--color-ok)' : 'var(--color-navy)'}>
                <span className="tabular font-mono text-[16px] font-semibold text-ink">
                  {completedCount}/{total}
                </span>
              </Ring>
              <div className="min-w-0">
                <Label>Pipeline State Machine</Label>
                <p className="mt-1 text-[16px] font-semibold text-ink">{headline}</p>
                <p className="mt-0.5 text-[11px] text-ink-3">SSE stream · resumable stages</p>
              </div>
            </div>

            <button
              type="button"
              disabled={running || !canRun}
              title={!canRun ? 'Your role cannot run pipeline analysis' : undefined}
              onClick={() => {
                sfx.tap()
                liveRef.current = false
                setLiveMode(false)
                setRun((r) => r + 1)
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[5px] bg-navy px-4 py-2 text-[12px] font-semibold text-night transition-colors hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running && !liveMode ? (
                <>Running Live SSE Stream…</>
              ) : prewarmed || run > 0 ? (
                <>
                  <RotateCcw size={13} /> Re-Run 11-Stage Pipeline
                </>
              ) : (
                <>
                  <Play size={13} /> Run 11-Stage Pipeline
                </>
              )}
            </button>

            <button
              type="button"
              disabled={running || !canRun}
              title={!canRun ? 'Your role cannot run pipeline analysis' : 'Force fresh live LLM, web sweep and OCR re-execution'}
              onClick={() => {
                sfx.tap()
                liveRef.current = true
                setLiveMode(true)
                setRun((r) => r + 1)
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[5px] border border-brass-200 bg-brass-50 px-4 py-2 text-[12px] font-medium text-brass transition-colors hover:bg-brass-50/80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Zap size={13} /> {running && liveMode ? 'Running Live Sweep (?live=true)…' : 'Re-analyse Live (?live=true)'}
            </button>

            <Well className="space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-ink">Time-Boxed Insaaf Precedent Search Budget</span>
                <span className="font-mono text-ink-2 tabular">
                  {search ? `${(search.elapsed_ms / 1000).toFixed(1)}s / 8.0s` : 'max 8.0s'}
                </span>
              </div>
              <Bar
                value={search ? Math.min(1, search.elapsed_ms / 8000) : completedCount >= 5 ? 0.18 : 0}
                tone="brass"
              />
              <p className="text-[11px] leading-snug text-ink-3">
                Whether the corpus holds 50 thousand or 50 million judgments, retrieval caps at 20 matches within 8 seconds.
              </p>
            </Well>

            {matter && (
              <div className="border-t border-line pt-3 text-[12px] text-ink-2">
                <span className="font-medium text-ink">Click any completed row</span> in the table to open that stage&rsquo;s dedicated legal workbench tab.
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
