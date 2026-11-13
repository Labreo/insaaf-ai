import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Play, RotateCcw } from 'lucide-react'
import { api } from '@/lib/api'
import { useDB } from '@/lib/store'
import type { PipelineEvent, Stage } from '@/lib/types'
import { Chip, Glass, Label, Ring, Well, ease } from '@/components/primitives'
import { Button } from '@/components/ui/button'
import { BorderBeam } from '@/components/magicui/border-beam'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'
import type { TabProps } from '../Matter'

const STAGES: { key: Stage; label: string; tab: TabProps['onJump'] extends (t: infer T) => void ? T : never; what: string }[] = [
  { key: 'intake', label: 'Intake', tab: 'facts', what: 'PDF · DOCX · Konkani voice' },
  { key: 'facts', label: 'Fact cards', tab: 'facts', what: 'allegation ≠ fact' },
  { key: 'proof_ledger', label: 'Proof ledger', tab: 'proof', what: 'rule pack by the legal lead' },
  { key: 'statute_clock', label: 'Statute clock', tab: 'clock', what: 'limitation · forum · ADR' },
  { key: 'search', label: 'Time-boxed search', tab: 'precedents', what: '20 judgments, 8 s budget' },
  { key: 'rag', label: 'Authority lock', tab: 'draft', what: 'no quote, no claim' },
  { key: 'citation_health', label: 'Citation health', tab: 'citations', what: 'overruled? distinguished?' },
  { key: 'bias_firewall', label: 'Bias firewall', tab: 'score', what: '6 identities, ε = 0.02' },
  { key: 'score', label: 'Insaaf B score', tab: 'score', what: 'band, not a fake %' },
  { key: 'advice', label: 'Settle or fight', tab: 'advice', what: 'eligibility rules' },
  { key: 'draft', label: 'Draft', tab: 'draft', what: 'advocate review required' },
]

/** F1: the whole pipeline, live. Stages light up from the event stream; search shows its fixed budget. */
export default function Pipeline({ id, onJump, autorun }: TabProps & { autorun?: boolean }) {
  const matter = useDB((d) => d.matters.find((m) => m.id === id))
  const hasStages = useDB((d) => !!d.stages[id])
  const [events, setEvents] = useState<Partial<Record<Stage, PipelineEvent>>>({})
  const [running, setRunning] = useState(false)
  const [run, setRun] = useState(0)
  const started = useRef(false)

  useEffect(() => { if (autorun && !started.current) { started.current = true; setRun(1) } }, [autorun])

  useEffect(() => {
    if (!run) return
    let alive = true
    setEvents({}); setRunning(true)
    ;(async () => {
      let last: Stage | null = null
      for await (const ev of api.pipeline(id)) {
        if (!alive) return
        if (ev.status === 'done' && ev.stage !== last) { last = ev.stage; sfx.stage() }
        setEvents((e) => ({ ...e, [ev.stage]: ev }))
      }
      if (alive) { setRunning(false); sfx.seal() }
    })()
    return () => { alive = false }
  }, [run, id])

  const doneCount = Object.values(events).filter((e) => e?.status === 'done').length
  const search = events.search
  const total = STAGES.length
  const headline = running ? 'Running' : run > 0 ? 'Complete' : hasStages ? 'Last run on record' : 'Ready to run'

  return (
    <div className="space-y-5">
      <div className="relative">
        <Glass className="flex items-center justify-between">
          <div>
            <p className="text-title font-normal text-marble">{headline}{running && <span className="animate-pulse">…</span>}</p>
            <p className="text-[12px] text-smoke">{running || run > 0 ? `${doneCount}/${total} stages` : `${matter?.documents?.length ?? 0} documents attached`} · every conclusion links to a source</p>
          </div>
          <Button onClick={() => { sfx.tap(); setRun((r) => r + 1) }} disabled={running} className="h-10 rounded-full bg-brass px-4 text-void uppercase tracking-[0.1em] hover:bg-[#d6b676]">
            {run === 0 && !hasStages ? <><Play size={14} /> Run</> : <><RotateCcw size={14} /> Re-run</>}
          </Button>
        </Glass>
        {running && <BorderBeam size={110} duration={6} colorFrom="#c9a868" colorTo="#e9e7e1" borderWidth={1.2} className="rounded-card" />}
      </div>

      <ol className="relative ml-3 border-l border-marble/10">
        {STAGES.map((s, i) => {
          const ev = events[s.key]
          const st = ev?.status ?? (hasStages && run === 0 ? 'done' : 'queued')
          const clickable = st === 'done'
          return (
            <motion.li key={s.key} className="relative pl-6 pb-5 last:pb-0" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i, ease }}>
              <span className={cn('absolute -left-[7px] top-1.5 flex h-[13px] w-[13px] items-center justify-center rounded-full transition-colors duration-500', st === 'done' ? 'bg-brass shadow-[0_0_12px_rgba(201,168,104,0.6)]' : st === 'running' ? 'bg-marble' : 'bg-marble/15')}>
                {st === 'done' && <Check size={9} className="text-void" strokeWidth={3} />}
                {st === 'running' && <motion.span className="absolute inset-0 rounded-full bg-marble" animate={{ scale: [1, 2.4], opacity: [0.6, 0] }} transition={{ duration: 1.2, repeat: Infinity }} />}
              </span>
              <button onClick={() => clickable && onJump(s.tab)} className={cn('w-full text-left', !clickable && 'cursor-default')}>
                <div className="flex items-center justify-between gap-3">
                  <p className={cn('text-[15px] transition-colors', st === 'queued' ? 'text-smoke' : 'text-marble')}>{s.label}</p>
                  {ev?.elapsed_ms && st === 'done' ? <span className="text-[11px] tabular-nums text-smoke">{(ev.elapsed_ms / 1000).toFixed(1)}s</span> : st === 'queued' ? <span className="text-[11px] text-smoke/70">{s.what}</span> : null}
                </div>
                <AnimatePresence mode="wait">
                  {ev?.message && st !== 'queued' && <motion.p key={ev.message} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-0.5 text-[12px] text-pewter">{ev.message}</motion.p>}
                </AnimatePresence>
                {s.key === 'search' && st === 'running' && search && (
                  <Well className="mt-3 flex items-center gap-4">
                    <Ring value={search.progress} size={56} stroke={4}><span className="text-[11px] tabular-nums text-marble">{(search.progress * 8).toFixed(1)}s</span></Ring>
                    <div><Label>Fixed 8-second budget</Label><p className="mt-1 text-[12px] leading-snug text-pewter">Indian Kanoon already indexes 50 million. We fetch 20 and read 5.</p></div>
                  </Well>
                )}
              </button>
            </motion.li>
          )
        })}
      </ol>

      {hasStages && !running && (
        <div className="flex flex-wrap gap-1.5"><Chip tone="brass">tap any stage to open it</Chip><Chip tone="steel">cached results replay offline</Chip></div>
      )}
    </div>
  )
}
