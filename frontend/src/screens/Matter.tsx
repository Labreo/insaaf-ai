import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft } from 'lucide-react'
import { api } from '@/lib/api'
import type { SourceRef } from '@/lib/types'
import { Chip, SourceSheet, cx, useAsync } from '@/components/ui'
import Pipeline from './matter/Pipeline'
import Facts from './matter/Facts'
import Proof from './matter/Proof'
import Clock from './matter/Clock'
import Precedents from './matter/Precedents'
import DraftTab from './matter/DraftTab'
import Citations from './matter/Citations'
import ScoreTab from './matter/ScoreTab'
import AdviceTab from './matter/AdviceTab'
import LedgerTab from './matter/LedgerTab'

const TABS = [
  ['pipeline', 'Pipeline'], ['facts', 'Facts'], ['proof', 'Proof'], ['clock', 'Clock'], ['precedents', 'Precedents'],
  ['draft', 'Draft'], ['citations', 'Citations'], ['score', 'Score'], ['advice', 'Advice'], ['ledger', 'Ledger'],
] as const
type Tab = (typeof TABS)[number][0]

export default function Matter() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'pipeline'
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true })
  const m = useAsync(() => api.matter(id), [id])
  const [source, setSource] = useState<SourceRef | null>(null)
  const railRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    railRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [tab])

  const open = (s: SourceRef) => setSource(s)
  const title = m.data?.title.replace(' (FICTIONAL)', '') ?? '…'

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <button onClick={() => nav(-1)} className="rounded-full p-2 text-pewter hover:text-marble" aria-label="Back"><ArrowLeft size={20} /></button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] text-marble">{title}</p>
          <p className="text-[11px] text-smoke">{m.data?.case_type.replace('_', ' ')} · {m.data?.status.replace('_', ' ')}</p>
        </div>
        <Chip tone="smoke">fictional</Chip>
      </header>

      <div ref={railRef} className="no-scrollbar -mx-5 flex gap-1 overflow-x-auto px-5">
        {TABS.map(([k, label]) => (
          <button key={k} data-tab={k} onClick={() => setTab(k)} className={cx('relative shrink-0 rounded-full px-3.5 py-2 text-[12px] uppercase tracking-[0.1em] transition-colors', tab === k ? 'text-marble' : 'text-smoke hover:text-pewter')}>
            {tab === k && <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-full bg-graphite" transition={{ type: 'spring', stiffness: 400, damping: 36 }} />}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
          {tab === 'pipeline' && <Pipeline id={id} onJump={setTab} />}
          {tab === 'facts' && <Facts id={id} />}
          {tab === 'proof' && <Proof id={id} onOpen={open} />}
          {tab === 'clock' && <Clock id={id} onOpen={open} />}
          {tab === 'precedents' && <Precedents id={id} onOpen={open} />}
          {tab === 'draft' && <DraftTab id={id} onOpen={open} />}
          {tab === 'citations' && <Citations id={id} onOpen={open} />}
          {tab === 'score' && <ScoreTab id={id} />}
          {tab === 'advice' && <AdviceTab id={id} onOpen={open} />}
          {tab === 'ledger' && <LedgerTab id={id} />}
        </motion.div>
      </AnimatePresence>

      <SourceSheet s={source} onClose={() => setSource(null)} />
    </div>
  )
}
