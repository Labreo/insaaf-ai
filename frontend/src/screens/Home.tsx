import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Bell, FileText, FolderPlus, Hourglass, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useDB } from '@/lib/store'
import type { Matter } from '@/lib/types'
import {
  Badge,
  Bar,
  Card,
  Empty,
  ErrorBanner,
  PageHeader,
  Section,
  Skeleton,
  Stat,
  type Tone,
  useAsync,
} from '@/components/primitives'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'

const caseLabel: Record<Matter['case_type'], string> = {
  property: 'Property',
  civil_recovery: 'Civil recovery',
  criminal: 'Criminal',
}

const statusTone: Record<Matter['status'], Tone> = {
  draft: 'neutral',
  running: 'info',
  ready: 'navy',
  in_review: 'warn',
  approved: 'ok',
}

const flagTone = (f: string): Tone =>
  f.includes('missing') || f.includes('overruled') ? 'bad' : f.includes('plea') || f.includes('pipeline') ? 'warn' : 'neutral'

export default function Home() {
  const nav = useNavigate()
  const me = useDB((s) => s.me)
  const mattersStore = useDB((s) => s.matters)
  const [deleting, setDeleting] = useState<string | null>(null)

  const q = useAsync(() => api.queue(), [])
  const m = useAsync(() => api.matters(), [])
  const a = useAsync(() => api.alerts(), [])

  const matters = m.data ?? mattersStore
  const queue = q.data ?? []
  const alerts = (a.data ?? []).slice(0, 5)

  const under45 = matters.filter((x) => x.days_left != null && x.days_left <= 45).length
  const inReview = matters.filter((x) => x.status === 'in_review').length
  const nextLimitation = queue.find((x) => x.days_left != null)

  const removeMatter = async (id: string) => {
    setDeleting(id)
    try {
      await api.deleteMatter(id)
      sfx.tick()
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={`${me.org.name} · Chamber Docket`}
        title={
          nextLimitation
            ? `Chamber Docket · Next limitation in ${nextLimitation.days_left} days`
            : 'Chamber Matter Docket & Nyaya Queue'
        }
        description="Prioritised by statutory limitation urgency, evidentiary readiness, and senior review state."
        right={
          <>
            <button
              type="button"
              onClick={() => nav('/ledger')}
              className="rounded-[5px] border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink"
            >
              Audit Ledger
            </button>
            <button
              type="button"
              onClick={() => {
                sfx.tap()
                nav('/new')
              }}
              className="inline-flex items-center gap-1.5 rounded-[5px] bg-navy px-3.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-navy-600"
            >
              <FolderPlus size={14} /> New Matter Intake
            </button>
          </>
        }
      />

      {(q.error || m.error) && (
        <ErrorBanner
          error={q.error || m.error || 'Failed to load docket'}
          onRetry={() => {
            q.reload()
            m.reload()
            a.reload()
          }}
        />
      )}

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={matters.length} label="Active Matters" sub={`${matters.filter((x) => x.status === 'approved').length} sealed by senior`} />
        <Stat
          value={under45}
          label="Limitation ≤ 45 Days"
          tone={under45 > 0 ? 'warn' : undefined}
          sub="Deterministic Limitation Act clock"
        />
        <Stat
          value={inReview}
          label="Awaiting Senior Sign-Off"
          tone={inReview > 0 ? 'bad' : undefined}
          sub="Requires senior advocate seal"
        />
        <Stat
          value={nextLimitation?.days_left != null ? `${nextLimitation.days_left}d` : '—'}
          label="Top Queue Deadline"
          tone={nextLimitation?.days_left != null && nextLimitation.days_left <= 45 ? 'navy' : 'ok'}
          sub={nextLimitation ? nextLimitation.title.replace(' (FICTIONAL)', '').slice(0, 34) : 'No active deadline'}
        />
      </div>

      {/* Main 12-Column Workbench Layout */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          {/* Nyaya Priority Queue Table */}
          <Section
            title="Nyaya Priority Queue"
            subtitle="ranked by deadline × merit × proof gaps"
          >
            {q.loading && !q.data ? (
              <Skeleton className="h-44" />
            ) : queue.length === 0 ? (
              <Empty
                text="Docket queue is empty."
                action={
                  <button
                    type="button"
                    onClick={() => nav('/new')}
                    className="rounded-[5px] bg-navy px-3.5 py-1.5 text-[12px] font-medium text-white"
                  >
                    Create first matter
                  </button>
                }
              />
            ) : (
              <Card className="overflow-x-auto p-0">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Matter</th>
                      <th>Priority Score</th>
                      <th>Flags</th>
                      <th>Limitation</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queue.map((it) => (
                      <tr
                        key={it.matter_id}
                        onClick={() => {
                          sfx.tap()
                          nav(`/matters/${it.matter_id}`)
                        }}
                        className="row-link cursor-pointer"
                      >
                        <td className="font-medium text-ink">
                          <p>{it.title.replace(' (FICTIONAL)', '')}</p>
                          <p className="mt-0.5 font-mono text-[11px] text-ink-3">{it.matter_id}</p>
                        </td>
                        <td className="w-36">
                          <div className="flex items-center gap-2">
                            <span className="tabular font-mono text-[12px] font-medium text-ink">
                              {Math.round(it.priority * 100)}
                            </span>
                            <Bar value={it.priority} tone={it.priority >= 0.7 ? 'bad' : it.priority >= 0.45 ? 'warn' : 'navy'} />
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {it.flags.length ? (
                              it.flags.map((f) => (
                                <Badge key={f} tone={flagTone(f)}>
                                  {f.replace(/_/g, ' ')}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-[11px] text-ink-4">clear</span>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap font-mono text-[12px]">
                          {it.days_left != null ? (
                            <span className={cn('inline-flex items-center gap-1', it.days_left <= 45 ? 'font-semibold text-bad' : 'text-ink-2')}>
                              <Hourglass size={11} /> {it.days_left}d
                            </span>
                          ) : (
                            <span className="text-ink-4">—</span>
                          )}
                        </td>
                        <td className="text-right">
                          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-navy">
                            Open <ArrowRight size={12} />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </Section>

          {/* Chamber Matters Register Table */}
          <Section title="Chamber Matters Register" subtitle={`${matters.length} matters on record`}>
            {m.loading && !matters.length ? (
              <Skeleton className="h-44" />
            ) : matters.length === 0 ? (
              <Empty text="No matters registered yet." />
            ) : (
              <Card className="overflow-x-auto p-0">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Matter &amp; Forum</th>
                      <th>Practice</th>
                      <th>Docs</th>
                      <th>Status</th>
                      <th>Deadline</th>
                      <th className="text-right">Workbench</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matters.map((mt) => (
                      <tr key={mt.id} className="row-link">
                        <td>
                          <button
                            type="button"
                            onClick={() => {
                              sfx.tap()
                              nav(`/matters/${mt.id}`)
                            }}
                            className="text-left"
                          >
                            <p className="font-medium text-ink hover:text-navy">
                              {mt.title.replace(' (FICTIONAL)', '')}
                            </p>
                            <p className="mt-0.5 text-[11px] text-ink-3">
                              {mt.forum_hint || 'District Court'} · {mt.id}
                            </p>
                          </button>
                        </td>
                        <td className="whitespace-nowrap text-[12px] text-ink-2">
                          {caseLabel[mt.case_type]}
                        </td>
                        <td className="tabular font-mono text-[12px] text-ink-2">
                          {mt.documents?.length ?? 0}
                        </td>
                        <td>
                          <Badge tone={statusTone[mt.status]}>{mt.status.replace('_', ' ')}</Badge>
                        </td>
                        <td className="whitespace-nowrap font-mono text-[11px] text-ink-2">
                          {mt.next_deadline ?? '—'}
                        </td>
                        <td className="whitespace-nowrap text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => nav(`/matters/${mt.id}?tab=draft`)}
                              className="inline-flex items-center gap-1 rounded-[4px] border border-line bg-sunken px-2 py-1 text-[11px] font-medium text-ink-2 hover:bg-hover hover:text-ink"
                            >
                              <FileText size={11} /> Draft
                            </button>
                            <button
                              type="button"
                              onClick={() => nav(`/matters/${mt.id}`)}
                              className="rounded-[4px] bg-navy px-2.5 py-1 text-[11px] font-medium text-white hover:bg-navy-600"
                            >
                              Open
                            </button>
                            <button
                              type="button"
                              disabled={deleting === mt.id}
                              aria-label={`Delete ${mt.title}`}
                              onClick={() => removeMatter(mt.id)}
                              className="rounded-[4px] border border-transparent p-1 text-ink-3 hover:border-bad-200 hover:bg-bad-50 hover:text-bad"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </Section>
        </div>

        {/* Right 4-Col Rail: Statutory Deadlines & Intake */}
        <div className="space-y-6 lg:col-span-4">
          <Section
            title="Statutory Watchlist"
            right={
              <button
                type="button"
                onClick={() => nav('/alerts')}
                className="text-[11px] font-medium text-navy hover:underline"
              >
                View all
              </button>
            }
          >
            <Card className="divide-y divide-line p-0">
              {alerts.map((al) => (
                <button
                  key={al.id}
                  type="button"
                  onClick={() => {
                    sfx.tick()
                    nav(`/matters/${al.matter_id}?tab=clock`)
                  }}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-sunken"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-medium text-ink">
                      {al.title.replace(' (FICTIONAL)', '')}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-ink-3">
                      <Bell size={10} />
                      {al.kind.replace(/_/g, ' ')} · {al.due}
                    </p>
                  </div>
                  <Badge tone={al.level === 'urgent' ? 'bad' : al.level === 'warn' ? 'warn' : 'neutral'}>
                    {al.days_left >= 0 ? `${al.days_left}d` : 'past'}
                  </Badge>
                </button>
              ))}
              {alerts.length === 0 && (
                <p className="px-4 py-6 text-center text-[12px] text-ink-3">No active deadline alerts.</p>
              )}
            </Card>
          </Section>

          <Section title="Intake & Ingestion">
            <Card className="space-y-3 bg-sunken">
              <p className="eyebrow">Authority-Locked Drafting</p>
              <p className="text-[13px] leading-relaxed text-ink-2">
                Ingest client PDFs, DOCX deeds, or Konkani/Marathi voice statements. Every legal proposition binds to an indexed authority paragraph or is withheld.
              </p>
              <button
                type="button"
                onClick={() => {
                  sfx.tap()
                  nav('/new')
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[5px] bg-navy px-3.5 py-2 text-[12px] font-medium text-white hover:bg-navy-600"
              >
                Start New Matter Intake <ArrowRight size={13} />
              </button>
            </Card>
          </Section>
        </div>
      </div>
    </div>
  )
}
