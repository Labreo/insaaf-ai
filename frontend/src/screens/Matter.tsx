import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Hourglass } from 'lucide-react'
import { useDB } from '@/lib/store'
import type { SourceRef } from '@/lib/types'
import { Chip, Glass, SourceSheet, type Tone } from '@/components/primitives'
import ReviewDrawer, { type ReviewRequest } from '@/components/ReviewDrawer'
import { Button } from '@/components/ui/button'
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
  ['pipeline', 'Pipeline'],
  ['facts', 'Facts'],
  ['proof', 'Proof'],
  ['clock', 'Clock'],
  ['precedents', 'Precedents'],
  ['draft', 'Draft'],
  ['citations', 'Citations'],
  ['score', 'Score'],
  ['advice', 'Advice'],
  ['radar', 'Law radar'],
  ['ledger', 'Ledger'],
] as const
export type Tab = (typeof TABS)[number][0]

const statusTone: Record<string, Tone> = {
  draft: 'smoke',
  running: 'steel',
  ready: 'brass',
  in_review: 'distinguished',
  approved: 'followed',
}

export interface TabProps {
  id: string
  onOpen: (s: SourceRef) => void
  onReview: (r: ReviewRequest) => void
  onJump: (t: Tab) => void
}

export default function Matter() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'pipeline'
  const autorun = params.get('run') === '1'
  const setTab = (t: Tab) => {
    sfx.tick()
    setParams({ tab: t }, { replace: true })
  }
  const m = useDB((d) => d.matters.find((x) => x.id === id))
  const hasStages = useDB((d) => !!d.stages[id])
  const [source, setSource] = useState<SourceRef | null>(null)
  const [review, setReview] = useState<ReviewRequest | null>(null)

  if (!m) {
    return (
      <Glass className="space-y-4">
        <p className="text-[15px] text-marble">Matter not found.</p>
        <Button variant="ghost" onClick={() => nav('/')} className="h-9 rounded-md border border-seam text-brass">
          Back to docket
        </Button>
      </Glass>
    )
  }

  const locked = !hasStages && tab !== 'pipeline'
  const props: TabProps = { id, onOpen: setSource, onReview: setReview, onJump: setTab }

  return (
    <div className="space-y-5">
      {/* Matter Workspace Header */}
      <Glass className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={() => { sfx.tap(); nav('/') }} className="rounded-md border border-seam bg-graphite p-2 text-pewter hover:text-marble" aria-label="Back">
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-[18px] font-medium text-marble">{m.title.replace(' (FICTIONAL)', '')}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-smoke">
              <span className="capitalize">{m.case_type.replace('_', ' ')}</span>
              <span>·</span>
              <span>{m.forum_hint || 'District Court'}</span>
              {m.client_language && (
                <>
                  <span>·</span>
                  <span className="uppercase">{m.client_language}</span>
                </>
              )}
              {m.days_left != null && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 font-mono text-brass">
                    <Hourglass size={11} /> {m.days_left} days left
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Chip tone={statusTone[m.status]}>{m.status.replace('_', ' ')}</Chip>
          <Button variant="ghost" onClick={() => setTab('draft')} className="h-8 rounded-md border border-seam px-3 text-[11px] uppercase tracking-[0.06em] text-pewter hover:text-marble">
            Open Pleading
          </Button>
        </div>
      </Glass>

      {/* Full-Width Desktop Tab Bar */}
      <div className="flex flex-wrap gap-1 border-b border-seam pb-2">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            data-tab={k}
            onClick={() => setTab(k)}
            className={cn(
              'rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors',
              tab === k
                ? 'border border-brass/35 bg-brass/12 text-brass'
                : 'border border-transparent text-smoke hover:bg-graphite hover:text-pewter',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {locked ? (
          <Glass className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-[14px] text-pewter">Run the pipeline first.</p>
            <Button onClick={() => setTab('pipeline')} className="h-9 rounded-md bg-brass px-4 text-[12px] font-medium uppercase tracking-[0.06em] text-void">
              Go to pipeline
            </Button>
          </Glass>
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
      </div>

      <SourceSheet s={source} onClose={() => setSource(null)} />
      <ReviewDrawer matterId={id} req={review} onClose={() => setReview(null)} />
    </div>
  )
}
