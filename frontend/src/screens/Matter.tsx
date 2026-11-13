import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Hourglass } from 'lucide-react'
import { useDB } from '@/lib/store'
import type { SourceRef } from '@/lib/types'
import { Chip, SourceSheet, type Tone } from '@/components/primitives'
import ReviewDrawer, { type ReviewRequest } from '@/components/ReviewDrawer'
import { ConnChip } from '@/components/Shell'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'
import Pipeline from './matter/Pipeline'
import Facts from './matter/Facts'
import Proof from './matter/Proof'
import Clock from './matter/Clock'
import Precedents from './matter/Precedents'
import DraftTab from './matter/DraftTab'
import Citations from './matter/Citations'
import ScoreTab from './matter/ScoreTab'
import AdviceTab from './matter/AdviceTab'
import Radar from './matter/Radar'
import LedgerTab from './matter/LedgerTab'

export const TABS = [
  ['pipeline', 'Pipeline'], ['facts', 'Facts'], ['proof', 'Proof'], ['clock', 'Clock'], ['precedents', 'Precedents'],
  ['draft', 'Draft'], ['citations', 'Citations'], ['score', 'Score'], ['advice', 'Advice'], ['radar', 'Law radar'], ['ledger', 'Ledger'],
] as const
export type Tab = (typeof TABS)[number][0]

const statusTone: Record<string, Tone> = { draft: 'smoke', running: 'steel', ready: 'brass', in_review: 'distinguished', approved: 'followed' }

export interface TabProps { id: string; onOpen: (s: SourceRef) => void; onReview: (r: ReviewRequest) => void; onJump: (t: Tab) => void }

export default function Matter() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'pipeline'
  const autorun = params.get('run') === '1'
  const setTab = (t: Tab) => { sfx.tick(); setParams({ tab: t }, { replace: true }) }
  const m = useDB((d) => d.matters.find((x) => x.id === id))
  const hasStages = useDB((d) => !!d.stages[id])
  const [source, setSource] = useState<SourceRef | null>(null)
  const [review, setReview] = useState<ReviewRequest | null>(null)
  const railRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    railRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [tab])

  if (!m) return <div className="space-y-4 pt-6"><p className="text-marble">Matter not found.</p><button onClick={() => nav('/')} className="text-brass">Back to queue</button></div>

  const locked = !hasStages && tab !== 'pipeline'
  const props: TabProps = { id, onOpen: setSource, onReview: setReview, onJump: setTab }

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <button onClick={() => { sfx.tap(); nav(-1) }} className="rounded-full p-2 text-pewter hover:text-marble" aria-label="Back"><ArrowLeft size={20} /></button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] text-marble">{m.title.replace(' (FICTIONAL)', '')}</p>
          <p className="flex items-center gap-2 text-[11px] text-smoke"><span className="capitalize">{m.case_type.replace('_', ' ')}</span>{m.days_left != null && <span className="inline-flex items-center gap-1"><Hourglass size={10} />{m.days_left}d</span>}</p>
        </div>
        <Chip tone={statusTone[m.status]}>{m.status.replace('_', ' ')}</Chip>
        <ConnChip />
      </header>

      <div ref={railRef} className="no-scrollbar -mx-5 flex gap-1 overflow-x-auto px-5">
        {TABS.map(([k, label]) => (
          <button key={k} data-tab={k} onClick={() => setTab(k)} className={cn('relative shrink-0 rounded-full px-3.5 py-2 text-[12px] uppercase tracking-[0.1em] transition-colors', tab === k ? 'text-marble' : 'text-smoke hover:text-pewter')}>
            {tab === k && <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-full border border-marble/10 bg-marble/8" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 10, filter: 'blur(3px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -6, filter: 'blur(3px)' }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
          {locked ? (
            <div className="glass flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-[14px] text-pewter">Run the pipeline first.</p>
              <button onClick={() => setTab('pipeline')} className="text-[12px] uppercase tracking-[0.1em] text-brass">Go to pipeline</button>
            </div>
          ) : (
            <>
              {tab === 'pipeline' && <Pipeline {...props} autorun={autorun} />}
              {tab === 'facts' && <Facts {...props} />}
              {tab === 'proof' && <Proof {...props} />}
              {tab === 'clock' && <Clock {...props} />}
              {tab === 'precedents' && <Precedents {...props} />}
              {tab === 'draft' && <DraftTab {...props} />}
              {tab === 'citations' && <Citations {...props} />}
              {tab === 'score' && <ScoreTab {...props} />}
              {tab === 'advice' && <AdviceTab {...props} />}
              {tab === 'radar' && <Radar {...props} />}
              {tab === 'ledger' && <LedgerTab id={id} />}
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <SourceSheet s={source} onClose={() => setSource(null)} />
      <ReviewDrawer matterId={id} req={review} onClose={() => setReview(null)} />
    </div>
  )
}
