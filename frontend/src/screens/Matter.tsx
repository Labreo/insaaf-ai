import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Clock3, Download, FileText, Hourglass, Play } from 'lucide-react'
import { api } from '@/lib/api'
import { can, useDB } from '@/lib/store'
import { run } from '@/lib/feedback'
import type { Matter as MatterModel, SourceRef } from '@/lib/types'
import { Badge, Card, ErrorBanner, Skeleton, SourceSheet, type Tone } from '@/components/primitives'
import ReviewDrawer, { type ReviewRequest } from '@/components/ReviewDrawer'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'

import Pipeline from './matter/Pipeline'
import Facts from './matter/Facts'
import Proof from './matter/Proof'
import Clock from './matter/Clock'
import Precedents from './matter/Precedents'
import Citations from './matter/Citations'
import ScoreTab from './matter/ScoreTab'
import AdviceTab from './matter/AdviceTab'
import DraftTab from './matter/DraftTab'
import Radar from './matter/Radar'
import LedgerTab from './matter/LedgerTab'
import ContextRail from './matter/ContextRail'

export const TABS = [
  ['pipeline', 'Pipeline'],
  ['facts', 'Facts'],
  ['precedents', 'Precedents'],
  ['citations', 'Citations'],
  ['score', 'Score & Bias Firewall'],
  ['radar', 'Law Radar'],
  ['proof', 'Proof Ledger'],
  ['clock', 'Statute Clock'],
  ['advice', 'Advice'],
  ['draft', 'Draft'],
  ['ledger', 'Ledger'],
] as const

/** Matter tabs grouped to mirror the sidebar areas; every tab keeps its existing route key. */
export const TAB_GROUPS: { title: string; tabs: readonly (typeof TABS)[number][0][] }[] = [
  { title: 'Processing', tabs: ['pipeline'] },
  { title: 'Record', tabs: ['facts'] },
  { title: 'Legal Intelligence', tabs: ['precedents', 'citations', 'score', 'radar'] },
  { title: 'Drafting & Advisory', tabs: ['proof', 'clock', 'advice', 'draft'] },
  { title: 'Oversight', tabs: ['ledger'] },
]

export type Tab = (typeof TABS)[number][0]

export interface TabProps {
  id: string
  onOpen: (s: SourceRef) => void
  onReview: (r: ReviewRequest) => void
  onJump: (t: Tab) => void
}

const statusLabel: Record<MatterModel['status'], string> = {
  draft: 'Draft — not analysed',
  running: 'Analysis running',
  ready: 'Analysed — ready for review',
  in_review: 'Awaiting senior review',
  approved: 'Approved by senior',
}

const statusTone: Record<MatterModel['status'], Tone> = {
  draft: 'neutral',
  running: 'info',
  ready: 'navy',
  in_review: 'warn',
  approved: 'ok',
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

  const me = useDB((d) => d.me)
  const matterFromStore = useDB((d) => d.matters.find((x) => x.id === id))
  const [fetched, setFetched] = useState<MatterModel | null>(null)
  const [loading, setLoading] = useState(!matterFromStore)
  const [err, setErr] = useState<string | null>(null)
  const [source, setSource] = useState<SourceRef | null>(null)
  const [review, setReview] = useState<ReviewRequest | null>(null)
  const [exporting, setExporting] = useState(false)

  // Keep the active tab visible when the tab bar scrolls horizontally (narrow screens).
  useEffect(() => {
    document.querySelector<HTMLElement>(`[data-tab="${tab}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [tab, loading])

  const exportDocx = async () => {
    if (exporting) return
    setExporting(true)
    const file = await run('DOCX export', () => api.exportDraft(id, 'docx'), 'DOCX downloaded')
    setExporting(false)
    if (!file) return
    const url = URL.createObjectURL(file.blob)
    Object.assign(document.createElement('a'), { href: url, download: file.filename }).click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  useEffect(() => {
    let alive = true
    setErr(null)
    if (!matterFromStore) setLoading(true)
    api
      .matter(id)
      .then((m) => {
        if (alive) {
          setFetched(m)
          setLoading(false)
        }
      })
      .catch((e) => {
        if (alive) {
          setErr(e instanceof Error ? e.message : String(e))
          setLoading(false)
        }
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const m = matterFromStore ?? fetched

  if (loading && !m) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-10" />
        <Skeleton className="h-80" />
      </div>
    )
  }

  if (!m) {
    return (
      <Card className="space-y-4">
        {err && <ErrorBanner error={err} />}
        <p className="text-[14px] text-ink-2">Matter &ldquo;{id}&rdquo; was not found in Chamber A.</p>
        <button
          type="button"
          onClick={() => nav('/docket')}
          className="rounded-[5px] bg-navy px-3.5 py-1.5 text-[12px] font-medium text-white"
        >
          Back to Chamber Docket
        </button>
      </Card>
    )
  }

  const props: TabProps = { id, onOpen: setSource, onReview: setReview, onJump: setTab }

  const canExport = can('draft.export')
  const canRun = can('analysis.run')
  const tabLabel = Object.fromEntries(TABS) as Record<Tab, string>
  const title = m.title.replace(' (FICTIONAL)', '')
  const updated = new Date(m.updated_at)
  const updatedLabel = Number.isNaN(updated.getTime())
    ? m.updated_at
    : updated.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="space-y-4">
      {/* Persistent matter header */}
      <header className="rounded-[6px] border border-line bg-surface px-5 py-4 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3.5">
            <button
              type="button"
              onClick={() => {
                sfx.tap()
                nav('/docket')
              }}
              aria-label="Back to docket"
              className="mt-0.5 rounded-[5px] border border-line bg-sunken p-2 text-ink-2 transition-colors hover:bg-hover hover:text-ink"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-line bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{m.id}</span>
                <Badge tone={statusTone[m.status]}>{statusLabel[m.status]}</Badge>
                {m.days_left != null && (
                  <Badge tone={m.days_left <= 45 ? 'bad' : 'brass'}>
                    <Hourglass size={11} /> {m.days_left}d to limitation
                  </Badge>
                )}
              </div>
              <h1 className="mt-1.5 text-[20px] font-semibold leading-snug tracking-[-0.02em] text-ink">{title}</h1>
              <dl className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[12px] text-ink-3">
                <div className="flex gap-1.5">
                  <dt className="sr-only">Court</dt>
                  <dd className="font-medium text-ink-2">{m.forum_hint || 'Forum not set'}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt>Case type</dt>
                  <dd className="capitalize text-ink-2">{m.case_type.replace('_', ' ')}</dd>
                </div>
                {m.client_language && (
                  <div className="flex gap-1.5">
                    <dt>Client language</dt>
                    <dd className="uppercase text-ink-2">{m.client_language}</dd>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <dt className="sr-only">Last updated</dt>
                  <Clock3 size={11} />
                  <dd>Updated {updatedLabel}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!canRun}
              title={canRun ? undefined : `The ${me.role} role cannot run analysis`}
              onClick={() => setTab('pipeline')}
              className="inline-flex items-center gap-1.5 rounded-[5px] border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Play size={12} /> Run pipeline
            </button>
            <button
              type="button"
              disabled={!canExport || exporting}
              title={canExport ? undefined : `The ${me.role} role cannot export drafts`}
              onClick={exportDocx}
              className="inline-flex items-center gap-1.5 rounded-[5px] border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Download size={12} /> {exporting ? 'Exporting…' : 'Export DOCX'}
            </button>
            <button
              type="button"
              onClick={() => setTab('draft')}
              className="inline-flex items-center gap-1.5 rounded-[5px] bg-navy px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-navy-600"
            >
              <FileText size={13} /> Open pleading
            </button>
          </div>
        </div>
      </header>

      {/* Grouped tab navigation */}
      <nav aria-label="Matter sections" className="no-scrollbar flex gap-4 overflow-x-auto border-b border-line">
        {TAB_GROUPS.map((g) => (
          <div key={g.title} className="shrink-0">
            <p className="eyebrow px-1 pb-1 text-[10px]">{g.title}</p>
            <div role="tablist" aria-label={g.title} className="flex gap-0.5">
              {g.tabs.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={tab === k}
                  data-tab={k}
                  onClick={() => setTab(k)}
                  className={cn(
                    '-mb-px shrink-0 whitespace-nowrap border-b-2 px-2.5 py-2 text-[12.5px] font-medium transition-colors',
                    tab === k ? 'border-navy text-navy' : 'border-transparent text-ink-2 hover:border-line-strong hover:text-ink',
                  )}
                >
                  {tabLabel[k]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {!canRun && (
        <div role="note" className="rounded-[6px] border border-brass-200 bg-brass-50 px-4 py-2 text-[12px] text-ink-2">
          <span className="font-semibold text-brass">Read-only access.</span> The {me.role} role can read findings and sources
          {can('draft.export') ? ' and export drafts' : ''}; running analysis, editing facts and recording reviews are disabled.
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Main working area */}
        <div className="min-w-0 space-y-4" role="tabpanel" aria-label={tabLabel[tab] ?? 'Pipeline'}>
          {tab === 'pipeline' && <Pipeline {...props} autorun={autorun} />}
          {tab === 'facts' && <Facts {...props} />}
          {tab === 'proof' && <Proof {...props} />}
          {tab === 'clock' && <Clock {...props} />}
          {tab === 'precedents' && <Precedents {...props} />}
          {tab === 'citations' && <Citations {...props} />}
          {tab === 'score' && <ScoreTab {...props} />}
          {tab === 'advice' && <AdviceTab {...props} />}
          {tab === 'draft' && <DraftTab {...props} />}
          {tab === 'radar' && <Radar {...props} />}
          {tab === 'ledger' && <LedgerTab id={id} />}
        </div>

        {/* Contextual rail: findings, review status, case record */}
        <aside aria-label="Matter context" className="min-w-0 xl:sticky xl:top-[4.25rem] xl:self-start">
          <ContextRail id={id} matter={m} onJump={setTab} />
        </aside>
      </div>

      <SourceSheet s={source} onClose={() => setSource(null)} />
      <ReviewDrawer matterId={id} req={review} onClose={() => setReview(null)} />
    </div>
  )
}
