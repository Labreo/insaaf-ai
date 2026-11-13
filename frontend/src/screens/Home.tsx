import { useNavigate } from 'react-router-dom'
import { ArrowRight, Bell, ChevronRight, FolderPlus, Hourglass, Scale, ShieldAlert, Trash2, TriangleAlert, UserCheck } from 'lucide-react'
import { api } from '@/lib/api'
import { useDB } from '@/lib/store'
import type { Matter, QueueItem } from '@/lib/types'
import { Bar, Chip, Empty, Glass, Section, Skeleton, Stat, Title, useAsync } from '@/components/primitives'
import { Button } from '@/components/ui/button'
import { NumberTicker } from '@/components/magicui/number-ticker'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'

const caseLabel: Record<Matter['case_type'], string> = {
  property: 'Property',
  civil_recovery: 'Civil recovery',
  criminal: 'Criminal',
}
const statusTone: Record<Matter['status'], 'smoke' | 'brass' | 'followed' | 'steel' | 'distinguished'> = {
  draft: 'smoke',
  running: 'steel',
  ready: 'brass',
  in_review: 'distinguished',
  approved: 'followed',
}

export default function Home() {
  const nav = useNavigate()
  const version = useDB((d) => d.matters.map((m) => m.id + m.status + m.updated_at).join('|'))
  const me = useDB((d) => d.me)
  const q = useAsync(() => api.queue(), [version])
  const m = useAsync(() => api.matters(), [version])
  const a = useAsync(() => api.alerts(), [version])

  const matters = m.data ?? []
  const top = q.data?.find((x) => x.days_left != null)
  const inReview = matters.filter((x) => x.status === 'in_review').length
  const under30 = matters.filter((x) => (x.days_left ?? 99) <= 30).length
  const urgentAlerts = (a.data ?? []).slice(0, 4)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-seam pb-5">
        <Title kicker={`${me.org.name} · Chamber Docket`}>
          {top ? (
            <>
              Top limitation expires in <span className="tabular-nums text-brass">{top.days_left} days</span>
            </>
          ) : (
            'Chamber Matter Docket'
          )}
        </Title>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => nav('/ledger')} className="h-9 rounded-md border border-seam px-3 text-[12px] text-pewter hover:text-marble">
            Audit Ledger
          </Button>
          <Button onClick={() => { sfx.tap(); nav('/new') }} className="h-9 rounded-md bg-brass px-4 text-[12px] font-medium uppercase tracking-[0.06em] text-void hover:bg-[#d6b676]">
            <FolderPlus size={14} /> New Matter Intake
          </Button>
        </div>
      </div>

      {/* 4-Column KPI Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={matters.length} label="Active Matters" />
        <Stat value={under30} label="Limitation ≤ 30 Days" tone={under30 ? 'brass' : undefined} />
        <Stat value={inReview} label="Awaiting Senior Sign-Off" tone={inReview ? 'overruled' : undefined} />
        <Stat
          value={top ? <span className="tabular-nums"><NumberTicker value={top.days_left ?? 0} className="text-marble" />d</span> : '—'}
          label="Top Queue Deadline"
          tone={top && (top.days_left ?? 999) <= 45 ? 'brass' : 'followed'}
        />
      </div>

      {/* Main 12-Column Desktop Split */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <Section title="Nyaya queue" right={<span className="text-[11px] font-mono text-smoke">ranked by deadline × merit × proof gaps</span>}>
            {q.loading && <><Skeleton className="h-24" /><Skeleton className="h-24" /></>}
            {q.data?.length === 0 && (
              <Empty
                text="Docket queue is empty."
                action={<Button className="rounded-md bg-brass text-void" onClick={() => nav('/new')}>Start a matter</Button>}
              />
            )}
            <div className="space-y-2.5">
              {q.data?.map((it) => (
                <QueueRow key={it.matter_id} it={it} onOpen={() => { sfx.tap(); nav(`/matters/${it.matter_id}`) }} />
              ))}
            </div>
          </Section>

          <Section title="Chamber matters register" right={<span className="text-[11px] text-smoke">{matters.length} on record</span>}>
            {m.loading && <Skeleton className="h-32" />}
            {matters.length === 0 && <Empty text="No matters registered yet." />}
            {matters.length > 0 && (
              <div className="glass overflow-hidden p-0">
                <table className="w-full text-left text-[13px]">
                  <thead className="border-b border-seam bg-graphite/70 text-[11px] uppercase tracking-[0.06em] text-smoke">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Matter Title & Forum</th>
                      <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Practice Area</th>
                      <th className="hidden px-3 py-2.5 font-medium md:table-cell">Docs</th>
                      <th className="px-3 py-2.5 font-medium">Status</th>
                      <th className="px-4 py-2.5 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-seam/70">
                    {matters.map((mt) => (
                      <tr key={mt.id} className="transition-colors hover:bg-graphite/40">
                        <td className="px-4 py-3">
                          <button onClick={() => { sfx.tap(); nav(`/matters/${mt.id}`) }} className="text-left">
                            <p className="font-medium text-marble hover:text-brass">{mt.title.replace(' (FICTIONAL)', '')}</p>
                            <p className="text-[11px] text-smoke">{mt.forum_hint || 'District Court'} · updated {new Date(mt.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                          </button>
                        </td>
                        <td className="hidden px-3 py-3 text-pewter sm:table-cell">{caseLabel[mt.case_type]}</td>
                        <td className="hidden px-3 py-3 font-mono text-[12px] text-smoke md:table-cell">{mt.documents?.length ?? 0}</td>
                        <td className="px-3 py-3">
                          <Chip tone={statusTone[mt.status]}>{mt.status.replace('_', ' ')}</Chip>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <Button variant="ghost" onClick={() => { sfx.tap(); nav(`/matters/${mt.id}?tab=draft`) }} className="h-7 rounded border border-seam px-2.5 text-[11px] text-pewter hover:text-marble">
                              Draft
                            </Button>
                            <Button variant="ghost" onClick={() => { sfx.tap(); nav(`/matters/${mt.id}`) }} className="h-7 rounded border border-seam px-2.5 text-[11px] text-brass hover:bg-brass/10">
                              Open <ChevronRight size={12} />
                            </Button>
                            {mt.status === 'draft' && (
                              <button aria-label="Delete draft" onClick={() => api.deleteMatter(mt.id)} className="rounded p-1.5 text-smoke hover:text-overruled">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        {/* Right Operations Rail */}
        <aside className="space-y-6 lg:col-span-4">
          <Section title="Intake & pipeline">
            <Glass className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-brass/30 bg-brass/10 text-brass">
                  <Scale size={17} />
                </span>
                <div>
                  <p className="text-[14px] font-medium text-marble">Authority-Locked Drafting</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-smoke">
                    Ingest client PDFs, DOCX instruments, or Konkani/Marathi voice notes. Every pleading paragraph links to a verified record or Indian Kanoon paragraph.
                  </p>
                </div>
              </div>
              <Button onClick={() => { sfx.tap(); nav('/new') }} className="h-9 w-full rounded-md bg-brass text-[12px] font-medium uppercase tracking-[0.06em] text-void hover:bg-[#d6b676]">
                Open Matter Intake <ArrowRight size={13} />
              </Button>
            </Glass>
          </Section>

          <Section title="Upcoming statutory deadlines" right={<button onClick={() => nav('/alerts')} className="text-[11px] text-brass hover:underline">View all</button>}>
            <Glass className="divide-y divide-seam/70 p-0">
              {urgentAlerts.length === 0 ? (
                <p className="p-4 text-[12px] text-smoke">No active deadlines indexed.</p>
              ) : (
                urgentAlerts.map((al) => (
                  <button
                    key={al.id}
                    onClick={() => { sfx.tap(); nav(`/matters/${al.matter_id}?tab=clock`) }}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-graphite/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-marble">{al.title.replace(' (FICTIONAL)', '')}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-smoke">
                        <Bell size={11} /> {al.kind.replace('_', ' ')} · {al.due}
                      </p>
                    </div>
                    <span className={cn('shrink-0 font-mono text-[13px] font-medium tabular-nums', al.days_left <= 30 ? 'text-overruled' : al.days_left <= 90 ? 'text-brass' : 'text-steel')}>
                      {al.days_left}d
                    </span>
                  </button>
                ))
              )}
            </Glass>
          </Section>

          <p className="rounded-md border border-seam bg-graphite/40 px-3.5 py-2.5 text-[11px] leading-relaxed text-smoke">
            Confidential chamber workspace · Insaaf assists advocates with verification and drafting; it does not give legal advice.
          </p>
        </aside>
      </div>
    </div>
  )
}

function QueueRow({ it, onOpen }: { it: QueueItem; onOpen: () => void }) {
  const hot = (it.days_left ?? 999) <= 45
  return (
    <Glass onClick={onOpen} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className={cn('flex h-14 w-20 shrink-0 flex-col items-center justify-center rounded-md border', hot ? 'border-brass/35 bg-brass/8' : 'border-seam bg-graphite')}>
          <span className={cn('font-mono text-[22px] leading-none font-medium tabular-nums', hot ? 'text-brass' : 'text-marble')}>{it.days_left ?? '—'}</span>
          <span className="mt-1 text-[10px] uppercase tracking-[0.08em] text-smoke">days</span>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-[15px] font-medium text-marble">{it.title.replace(' (FICTIONAL)', '')}</p>
            <span className="shrink-0 font-mono text-[11px] text-smoke">priority {Math.round(it.priority * 100)}</span>
          </div>
          <Bar value={it.priority} tone={hot ? 'brass' : 'steel'} />
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {it.flags.includes('title_missing') && <Chip tone="overruled"><TriangleAlert size={11} /> title doc missing</Chip>}
            {it.flags.includes('overruled_citation') && <Chip tone="overruled"><ShieldAlert size={11} /> overruled citation</Chip>}
            {it.flags.includes('plea_check') && <Chip tone="steel"><Hourglass size={11} /> plea eligibility</Chip>}
            {it.flags.includes('awaiting_senior') && <Chip tone="distinguished"><UserCheck size={11} /> awaiting senior</Chip>}
            {it.days_left === null && <Chip>run pipeline to set deadline</Chip>}
          </div>
        </div>
      </div>
      <ChevronRight size={16} className="hidden shrink-0 text-smoke sm:block" />
    </Glass>
  )
}
