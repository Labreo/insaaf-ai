import { useEffect, useRef, useState } from 'react'
import { Check, ChevronRight, Play, RotateCcw } from 'lucide-react'
import { api } from '@/lib/api'
import { useDB } from '@/lib/store'
import type { PipelineEvent, Stage } from '@/lib/types'
import { Bar, Chip, Glass, Label, Ring, Well } from '@/components/primitives'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'
import type { TabProps } from '../Matter'

const STAGES: { key: Stage; label: string; tab: TabProps['onJump'] extends (t: infer T) => void ? T : never; what: string }[] = [
  { key: 'intake', label: 'Intake & OCR', tab: 'facts', what: 'PDF · DOCX · Konkani voice' },
  { key: 'facts', label: 'Fact cards', tab: 'facts', what: 'allegation ≠ fact' },
  { key: 'proof_ledger', label: 'Proof ledger', tab: 'proof', what: 'deterministic rule pack' },
  { key: 'statute_clock', label: 'Statute clock', tab: 'clock', what: 'limitation · forum · ADR' },
  { key: 'search', label: 'Time-boxed search', tab: 'precedents', what: '20 judgments, 8 s budget' },
  { key: 'rag', label: 'Authority lock', tab: 'draft', what: 'no quote, no claim' },
  { key: 'citation_health', label: 'Citation health', tab: 'citations', what: 'overruled? distinguished?' },
  { key: 'bias_firewall', label: 'Bias firewall', tab: 'score', what: '6 identities, ε = 0.02' },
  { key: 'score', label: 'Insaaf B score', tab: 'score', what: 'court-pooled band' },
  { key: 'advice', label: 'Settle or fight', tab: 'advice', what: 'eligibility rules' },
  { key: 'draft', label: 'Draft pleading', tab: 'draft', what: 'senior review required' },
]

/** F1: the whole pipeline, live. Stages light up from the event stream; search shows its fixed budget. */
export default function Pipeline({ id, onJump, autorun }: TabProps & { autorun?: boolean }) {
  const matter = useDB((d) => d.matters.find((m) => m.id === id))
  const hasStages = useDB((d) => !!d.stages[id])
  const [events, setEvents] = useState<Partial<Record<Stage, PipelineEvent>>>({})
  const [running, setRunning] = useState(false)
  const [run, setRun] = useState(0)
  const started = useRef(false)

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
    setRunning(true)
    ;(async () => {
      let last: Stage | null = null
      for await (const ev of api.pipeline(id)) {
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
    })()
    return () => {
      alive = false
    }
  }, [run, id])

  const doneCount = Object.values(events).filter((e) => e?.status === 'done').length
  const completedCount = running || run > 0 ? doneCount : hasStages ? STAGES.length : 0
  const search = events.search
  const total = STAGES.length
  const headline = running ? 'Running' : run > 0 ? 'Complete' : hasStages ? 'Last run on record' : 'Ready to run'

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-8">
        <div className="glass overflow-hidden p-0">
          <div className="border-b border-seam bg-graphite/70 px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-smoke">
            11-Stage Deterministic & AI Verification Orchestration
          </div>
          <div className="divide-y divide-seam">
            {STAGES.map((s, idx) => {
              const ev = events[s.key]
              const st = ev?.status ?? (hasStages && run === 0 ? 'done' : 'queued')
              const clickable = st === 'done'
              return (
                <button
                  key={s.key}
                  onClick={() => clickable && onJump(s.tab)}
                  className={cn(
                    'flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors',
                    clickable ? 'hover:bg-graphite/50 cursor-pointer' : 'cursor-default',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        'grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-mono',
                        st === 'done'
                          ? 'bg-brass text-void font-medium'
                          : st === 'running'
                            ? 'bg-steel/25 text-marble border border-steel/40 animate-pulse'
                            : 'bg-graphite text-smoke border border-seam',
                      )}
                    >
                      {st === 'done' ? <Check size={12} strokeWidth={2.8} /> : idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className={cn('text-[14px] font-medium', st === 'queued' ? 'text-smoke' : 'text-marble')}>{s.label}</p>
                      <p className="truncate text-[12px] text-smoke">{ev?.message && st !== 'queued' ? ev.message : s.what}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {ev?.elapsed_ms && st === 'done' ? (
                      <span className="font-mono text-[11px] tabular-nums text-smoke">{(ev.elapsed_ms / 1000).toFixed(1)}s</span>
                    ) : (
                      <Chip tone={st === 'done' ? 'followed' : st === 'running' ? 'steel' : 'smoke'}>{st}</Chip>
                    )}
                    {clickable && <ChevronRight size={14} className="text-smoke" />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="space-y-4 lg:col-span-4">
        <Glass className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Label>Orchestration state</Label>
              <p className="mt-1 text-[22px] font-medium text-marble">
                {headline}
                {running && <span className="animate-pulse">…</span>}
              </p>
              <p className="mt-1 font-mono text-[12px] text-smoke">
                {running || run > 0 ? `${doneCount}/${total} stages` : `${completedCount}/${total} stages`} · {matter?.documents?.length ?? 0} documents
              </p>
            </div>
            <Button
              onClick={() => { sfx.tap(); setRun((r) => r + 1) }}
              disabled={running}
              className="h-9 rounded-md bg-brass px-4 text-[12px] font-medium uppercase tracking-[0.06em] text-void hover:bg-[#d6b676]"
            >
              {run === 0 && !hasStages ? <><Play size={13} /> Run</> : <><RotateCcw size={13} /> Re-run</>}
            </Button>
          </div>
          <Bar value={completedCount / total} tone={running ? 'steel' : 'brass'} />
          <p className="text-[12px] leading-relaxed text-smoke">
            Click any completed stage on the left to inspect the source-linked output in its dedicated module.
          </p>
        </Glass>

        {search && search.status === 'running' && (
          <Well className="flex items-center gap-4">
            <Ring value={search.progress} size={60} stroke={4}>
              <span className="font-mono text-[11px] tabular-nums text-marble">{(search.progress * 8).toFixed(1)}s</span>
            </Ring>
            <div>
              <Label>Fixed 8-second budget</Label>
              <p className="mt-1 text-[12px] leading-snug text-pewter">Indian Kanoon already indexes 50 million. We fetch 20 and rerank top 5.</p>
            </div>
          </Well>
        )}

        {hasStages && !running && (
          <Glass className="space-y-2">
            <Label>Audit guarantees</Label>
            <div className="flex flex-wrap gap-1.5">
              <Chip tone="brass">every claim linked to source</Chip>
              <Chip tone="steel">cached results replay offline</Chip>
              <Chip tone="followed">authority lock enforced</Chip>
            </div>
          </Glass>
        )}
      </div>
    </div>
  )
}
