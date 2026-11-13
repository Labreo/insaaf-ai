import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { ChevronRight, Hourglass, ShieldAlert, TriangleAlert, Trash2, UserCheck } from 'lucide-react'
import { api } from '@/lib/api'
import { useDB } from '@/lib/store'
import type { Matter, QueueItem } from '@/lib/types'
import { Bar, Chip, Empty, Glass, Label, Section, Skeleton, Stat, Title, stagger, useAsync } from '@/components/primitives'
import { NumberTicker } from '@/components/magicui/number-ticker'
import { BorderBeam } from '@/components/magicui/border-beam'
import { BlurFade } from '@/components/magicui/blur-fade'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'

const caseLabel: Record<Matter['case_type'], string> = { property: 'Property', civil_recovery: 'Civil recovery', criminal: 'Criminal' }
const statusTone: Record<Matter['status'], 'smoke' | 'brass' | 'followed' | 'steel' | 'distinguished'> = { draft: 'smoke', running: 'steel', ready: 'brass', in_review: 'distinguished', approved: 'followed' }

export default function Home() {
  const nav = useNavigate()
  const version = useDB((d) => d.matters.map((m) => m.id + m.status + m.updated_at).join('|'))
  const me = useDB((d) => d.me)
  const q = useAsync(() => api.queue(), [version])
  const m = useAsync(() => api.matters(), [version])
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const top = q.data?.find((x) => x.days_left != null)
  const matters = m.data ?? []
  const inReview = matters.filter((x) => x.status === 'in_review').length
  const under30 = matters.filter((x) => (x.days_left ?? 99) <= 30).length

  return (
    <div className="relative space-y-8">
      {/* ghosted statue: the room from the intro */}
      <img src="/intro/lady.webp" alt="" aria-hidden className="pointer-events-none absolute -right-24 -top-6 h-[420px] opacity-[0.07] mix-blend-screen select-none" />

      <BlurFade delay={0.05} inView={false}>
        <Title kicker={`${greet}, ${me.name}`}>
          {top ? (<><span className="tabular-nums"><NumberTicker value={top.days_left ?? 0} className="text-marble" /></span> days until <span className="serif italic brass-text">limitation</span> on your top matter.</>) : 'Nothing is burning.'}
        </Title>
      </BlurFade>

      <div className="grid grid-cols-3 gap-2">
        <Stat value={matters.length} label="matters" />
        <Stat value={under30} label="due ≤ 30 days" tone={under30 ? 'brass' : undefined} />
        <Stat value={inReview} label="await senior" tone={inReview ? 'overruled' : undefined} />
      </div>

      <Section title="Nyaya queue" right={<span className="text-[11px] text-smoke">deadline × merit × gaps</span>}>
        {q.loading && <><Skeleton className="h-24" /><Skeleton className="h-24" /></>}
        {q.data?.length === 0 && <Empty text="Queue is empty." action={<Button className="rounded-full bg-brass text-void" onClick={() => nav('/new')}>Start a matter</Button>} />}
        {q.data?.map((it, i) => <QueueCard key={it.matter_id} it={it} i={i} onOpen={() => { sfx.tap(); nav(`/matters/${it.matter_id}`) }} />)}
      </Section>

      <Section title="All matters">
        {m.loading && <Skeleton className="h-16" />}
        {matters.length === 0 && <Empty text="No matters yet. Tap + to start one." />}
        {matters.length > 0 && (
          <div className="glass divide-y divide-marble/6 p-0">
            {matters.map((mt) => (
              <div key={mt.id} className="flex items-center gap-2 pr-2">
                <button onClick={() => { sfx.tap(); nav(`/matters/${mt.id}`) }} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 text-left">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] text-marble">{mt.title.replace(' (FICTIONAL)', '')}</p>
                    <p className="mt-0.5 text-[11px] text-smoke">{caseLabel[mt.case_type]} · {mt.documents?.length ?? 0} docs · {new Date(mt.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                  </div>
                  <Chip tone={statusTone[mt.status]}>{mt.status.replace('_', ' ')}</Chip>
                  <ChevronRight size={16} className="text-smoke" />
                </button>
                {mt.status === 'draft' && (
                  <button aria-label="Delete draft" onClick={() => { if (confirm('Delete this draft matter?')) api.deleteMatter(mt.id) }} className="rounded-full p-2 text-smoke hover:text-overruled"><Trash2 size={14} /></button>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <p className="px-1 text-[11px] leading-relaxed text-smoke">Confidential chamber workspace · Insaaf assists advocates with verification and drafting; it does not give legal advice.</p>
    </div>
  )
}

function QueueCard({ it, i, onOpen }: { it: QueueItem; i: number; onOpen: () => void }) {
  const hot = (it.days_left ?? 999) <= 45
  return (
    <motion.div {...stagger(i + 1)}>
      <div className="relative">
        <Glass spotlight onClick={onOpen} className="relative overflow-hidden">
          <div className="flex items-start gap-4">
            <div className="flex w-16 shrink-0 flex-col items-center">
              <span className={cn('text-[36px] leading-none font-normal tracking-[-0.03em] tabular-nums', hot ? 'brass-text' : 'text-marble')}>{it.days_left ?? '—'}</span>
              <Label className="mt-1">days</Label>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] text-marble">{it.title.replace(' (FICTIONAL)', '')}</p>
              <div className="mt-2 flex items-center gap-2">
                <Bar value={it.priority} className="flex-1" tone={hot ? 'brass' : 'steel'} />
                <span className="text-[11px] tabular-nums text-smoke">{Math.round(it.priority * 100)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {it.flags.includes('title_missing') && <Chip tone="overruled"><TriangleAlert size={11} /> title doc missing</Chip>}
                {it.flags.includes('overruled_citation') && <Chip tone="overruled"><ShieldAlert size={11} /> overruled citation</Chip>}
                {it.flags.includes('plea_check') && <Chip tone="steel"><Hourglass size={11} /> plea eligibility</Chip>}
                {it.flags.includes('awaiting_senior') && <Chip tone="distinguished"><UserCheck size={11} /> awaiting senior</Chip>}
                {it.days_left === null && <Chip>run pipeline to set deadline</Chip>}
              </div>
            </div>
          </div>
        </Glass>
        {i === 0 && <BorderBeam size={120} duration={9} colorFrom="#c9a868" colorTo="#8fa3bd" borderWidth={1.2} className="rounded-card" />}
      </div>
    </motion.div>
  )
}
