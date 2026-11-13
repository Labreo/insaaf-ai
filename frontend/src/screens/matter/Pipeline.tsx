import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Check, Play, RotateCcw } from 'lucide-react'
import { api } from '@/lib/api'
import type { PipelineEvent, Stage } from '@/lib/types'
import { Button, Ring, cx, ease } from '@/components/ui'

const STAGES: { key: Stage; label: string; tab: string }[] = [
  { key: 'intake', label: 'Intake', tab: 'facts' },
  { key: 'facts', label: 'Fact cards', tab: 'facts' },
  { key: 'proof_ledger', label: 'Proof ledger', tab: 'proof' },
  { key: 'statute_clock', label: 'Statute clock', tab: 'clock' },
  { key: 'search', label: 'Time-boxed search', tab: 'precedents' },
  { key: 'rag', label: 'Authority lock', tab: 'draft' },
  { key: 'citation_health', label: 'Citation health', tab: 'citations' },
  { key: 'bias_firewall', label: 'Bias firewall', tab: 'score' },
  { key: 'score', label: 'Insaaf B score', tab: 'score' },
  { key: 'advice', label: 'Settle or fight', tab: 'advice' },
  { key: 'draft', label: 'Draft', tab: 'draft' },
]

export default function Pipeline({ id, onJump }: { id: string; onJump: (tab: never) => void }) {
  const [events, setEvents] = useState<Partial<Record<Stage, PipelineEvent>>>({})
  const [running, setRunning] = useState(false)
  const [run, setRun] = useState(0)

  useEffect(() => {
    if (!run) return
    let alive = true
    setEvents({}); setRunning(true)
    ;(async () => {
      for await (const ev of api.pipeline(id)) {
        if (!alive) return
        setEvents((e) => ({ ...e, [ev.stage]: ev }))
      }
      if (alive) setRunning(false)
    })()
    return () => { alive = false }
  }, [run, id])

  const doneCount = Object.values(events).filter((e) => e?.status === 'done').length
  const search = events.search

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-title font-normal text-marble">{run === 0 ? 'Ready to run' : running ? 'Running…' : 'Complete'}</p>
          <p className="text-[12px] text-smoke">{doneCount}/{STAGES.length} stages · every conclusion links to a source</p>
        </div>
        <Button onClick={() => setRun((r) => r + 1)} disabled={running} className={cx(running && 'opacity-60')}>
          {run === 0 ? <><Play size={14} /> Run</> : <><RotateCcw size={14} /> Re-run</>}
        </Button>
      </div>

      <ol className="relative ml-3 border-l border-seam">
        {STAGES.map((s, i) => {
          const ev = events[s.key]
          const st = ev?.status ?? 'queued'
          return (
            <motion.li key={s.key} className="relative pl-6 pb-6 last:pb-0" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i, ease }}>
              <span className={cx('absolute -left-[7px] top-1 flex h-[13px] w-[13px] items-center justify-center rounded-full transition-colors duration-500', st === 'done' ? 'bg-brass' : st === 'running' ? 'bg-marble' : 'bg-graphite')}>
                {st === 'done' && <Check size={9} className="text-void" strokeWidth={3} />}
                {st === 'running' && <motion.span className="absolute inset-0 rounded-full bg-marble" animate={{ scale: [1, 2.2], opacity: [0.6, 0] }} transition={{ duration: 1.2, repeat: Infinity }} />}
              </span>
              <button onClick={() => st === 'done' && onJump(s.tab as never)} className="w-full text-left">
                <div className="flex items-center justify-between gap-3">
                  <p className={cx('text-[15px] transition-colors', st === 'queued' ? 'text-smoke' : 'text-marble')}>{s.label}</p>
                  {ev?.elapsed_ms && st === 'done' ? <span className="text-[11px] text-smoke">{(ev.elapsed_ms / 1000).toFixed(1)}s</span> : null}
                </div>
                {ev?.message && st !== 'queued' && <p className="mt-0.5 text-[12px] text-pewter">{ev.message}</p>}
                {s.key === 'search' && st === 'running' && search && (
                  <div className="mt-3 flex items-center gap-4">
                    <Ring value={search.progress} size={56} stroke={4}><span className="text-[11px] text-marble">{Math.round(search.progress * 8)}s</span></Ring>
                    <p className="text-[12px] leading-snug text-smoke">Fixed 8-second budget.<br />Fetches 20 judgments, not 50 million.</p>
                  </div>
                )}
              </button>
            </motion.li>
          )
        })}
      </ol>
    </div>
  )
}
