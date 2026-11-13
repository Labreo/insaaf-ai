import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Download, FileText, FileUp, Flag, Hourglass, Play } from 'lucide-react'
import { api } from '@/lib/api'
import { useDB } from '@/lib/store'
import type { Matter as MatterModel, SourceRef } from '@/lib/types'
import { Badge, Card, ErrorBanner, Skeleton, SourceSheet, type Tone, useAsync } from '@/components/primitives'
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

export const TABS = [
  ['pipeline', '01 Pipeline'],
  ['facts', '02 Facts'],
  ['proof', '03 Proof Ledger'],
  ['clock', '04 Statute Clock'],
  ['precedents', '05 Precedents'],
  ['citations', '06 Citations'],
  ['score', '07 B-Score & Bias'],
  ['advice', '08 Settle / Fight'],
  ['draft', '09 Pleading Draft'],
  ['radar', '10 Law Radar'],
  ['ledger', '11 Audit Ledger'],
] as const

export type Tab = (typeof TABS)[number][0]

export interface TabProps {
  id: string
  onOpen: (s: SourceRef) => void
  onReview: (r: ReviewRequest) => void
  onJump: (t: Tab) => void
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

  const matterFromStore = useDB((d) => d.matters.find((x) => x.id === id))
  const [fetched, setFetched] = useState<MatterModel | null>(null)
  const [loading, setLoading] = useState(!matterFromStore)
  const [err, setErr] = useState<string | null>(null)
  const [source, setSource] = useState<SourceRef | null>(null)
  const [review, setReview] = useState<ReviewRequest | null>(null)
  const [uploading, setUploading] = useState(false)
  const [flagBusy, setFlagBusy] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const q = useAsync(() => api.queue(), [id])
  const queueFlags = q.data?.find((x) => x.matter_id === id)?.flags ?? []

  const attachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || uploading) return
    setUploading(true)
    sfx.tick()
    try {
      const uploaded = await api.addDocument(id, file)
      setFetched((prev) =>
        prev ? { ...prev, documents: [...(prev.documents ?? []), uploaded] } : prev,
      )
      sfx.accept()
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const toggleUrgencyFlag = async (flag: 'senior_citizen' | 'interim_relief' | 'undertrial_custody') => {
    if (flagBusy) return
    setFlagBusy(flag)
    sfx.tick()
    try {
      await api.toggleFlag(id, flag)
      sfx.accept()
    } finally {
      setFlagBusy(null)
    }
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

  return (
    <div className="space-y-5">
      {/* Formal Matter Header */}
      <Card className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <button
              type="button"
              onClick={() => {
                sfx.tap()
                nav('/docket')
              }}
              aria-label="Back to docket"
              className="rounded-[5px] border border-line bg-sunken p-2 text-ink-2 transition-colors hover:bg-hover hover:text-ink"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] text-ink-3">{m.id}</span>
                <Badge tone={statusTone[m.status]}>{m.status.replace('_', ' ')}</Badge>
                {m.days_left != null && (
                  <Badge tone={m.days_left <= 45 ? 'bad' : 'brass'}>
                    <Hourglass size={11} /> {m.days_left}d limitation
                  </Badge>
                )}
              </div>
              <h1 className="mt-1 truncate text-[19px] font-semibold tracking-[-0.02em] text-ink">
                {m.title.replace(' (FICTIONAL)', '')}
              </h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
                <span className="capitalize">{m.case_type.replace('_', ' ')}</span>
                <span>·</span>
                <span>{m.forum_hint || 'District Court'}</span>
                {m.client_language && (
                  <>
                    <span>·</span>
                    <span className="uppercase">Client lang: {m.client_language}</span>
                  </>
                )}
                <span>·</span>
                <span>{m.documents?.length ?? 0} documents</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTab('pipeline')}
              className="inline-flex items-center gap-1.5 rounded-[5px] border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 hover:bg-hover hover:text-ink"
            >
              <Play size={12} /> Pipeline
            </button>
            <a
              href={api.exportDraftUrl(id)}
              className="inline-flex items-center gap-1.5 rounded-[5px] border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 hover:bg-hover hover:text-ink"
            >
              <Download size={12} /> DOCX
            </a>
            <button
              type="button"
              onClick={() => setTab('draft')}
              className="inline-flex items-center gap-1.5 rounded-[5px] bg-navy px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-navy-600"
            >
              <FileText size={13} /> Open Pleading
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-[11px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 font-medium uppercase tracking-[0.06em] text-ink-3">
              Case Record ({m.documents?.length ?? 0}):
            </span>
            {(m.documents ?? []).map((doc) => (
              <span
                key={doc.id}
                className="inline-flex items-center gap-1 rounded-[4px] border border-line bg-sunken px-2 py-0.5 text-ink-2"
              >
                <FileText size={11} className="text-brass" />
                <span className="max-w-[170px] truncate">{doc.name}</span>
                {doc.pages ? <span className="font-mono text-ink-3">{doc.pages}p</span> : null}
              </span>
            ))}
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt,.wav,.mp3,.ogg,.m4a,.json"
              onChange={attachFile}
              className="hidden"
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-[4px] border border-navy-100 bg-navy-50 px-2.5 py-0.5 font-medium text-navy hover:bg-navy/10 disabled:opacity-50"
            >
              <FileUp size={11} /> {uploading ? 'Attaching…' : '+ Attach Document / Voice Note'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 font-medium text-ink-3">
              <Flag size={11} /> Docket urgency:
            </span>
            {([
              { k: 'senior_citizen', label: 'Senior Citizen' },
              { k: 'interim_relief', label: 'Interim Relief (O.XXXIX)' },
              { k: 'undertrial_custody', label: 'Undertrial Custody' },
            ] as const).map((flg) => {
              const active = queueFlags.includes(flg.k)
              return (
                <button
                  key={flg.k}
                  type="button"
                  disabled={flagBusy !== null}
                  onClick={() => toggleUrgencyFlag(flg.k)}
                  className={cn(
                    'rounded-[4px] border px-2 py-0.5 font-medium transition-colors',
                    active
                      ? 'border-warn-200 bg-warn-50 text-warn'
                      : 'border-line bg-surface text-ink-2 hover:bg-hover hover:text-ink',
                  )}
                >
                  {flg.label}
                </button>
              )
            })}
          </div>
        </div>
      </Card>

      {/* 11-Tab Bar */}
      <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line pb-2">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            data-tab={k}
            onClick={() => setTab(k)}
            className={cn(
              'shrink-0 rounded-[5px] border px-3 py-1.5 text-[12px] font-medium transition-colors',
              tab === k
                ? 'border-navy-100 bg-navy-50 text-navy'
                : 'border-transparent text-ink-2 hover:bg-hover hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Active Tab */}
      <div>
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

      <SourceSheet s={source} onClose={() => setSource(null)} />
      <ReviewDrawer matterId={id} req={review} onClose={() => setReview(null)} />
    </div>
  )
}
