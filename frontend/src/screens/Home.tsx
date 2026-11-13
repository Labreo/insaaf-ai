import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { ChevronRight, Hourglass, TriangleAlert } from 'lucide-react'
import { api } from '@/lib/api'
import type { Matter, QueueItem } from '@/lib/types'
import { Bar, Chip, Empty, Label, Row, Section, Skeleton, cx, stagger, useAsync } from '@/components/ui'
import { Logo } from '@/components/Shell'

const caseLabel: Record<Matter['case_type'], string> = { property: 'Property', civil_recovery: 'Civil recovery', criminal: 'Criminal' }
const statusTone: Record<Matter['status'], 'smoke' | 'brass' | 'followed' | 'steel'> = { draft: 'smoke', running: 'steel', ready: 'brass', in_review: 'steel', approved: 'followed' }

export default function Home() {
  const nav = useNavigate()
  const q = useAsync(() => api.queue())
  const m = useAsync(() => api.matters())
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const urgent = q.data?.[0]

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <Logo />
        <Chip tone="brass">Junior · Chamber A</Chip>
      </header>

      <motion.div {...stagger(0)} className="space-y-1">
        <p className="text-pewter text-[14px] font-light">{greet}, Adv. Kanak</p>
        <h1 className="text-heading font-normal text-marble">
          {urgent ? (<>{urgent.days_left} days until <span className="serif italic text-brass">limitation</span> on your top matter.</>) : 'Nothing is burning.'}
        </h1>
      </motion.div>

      <Section title="Nyaya queue" right={<span className="text-[11px] text-smoke">by deadline × merit</span>}>
        {q.loading && <><Skeleton className="h-24" /><Skeleton className="h-24" /></>}
        {q.error && <Empty text="Queue unavailable. Pull to retry." />}
        {q.data?.map((it, i) => <QueueCard key={it.matter_id} it={it} i={i} onOpen={() => nav(`/matters/${it.matter_id}`)} />)}
      </Section>

      <Section title="All matters">
        {m.loading && <Skeleton className="h-16" />}
        {m.data?.length === 0 && <Empty text="No matters yet. Tap + to start one." />}
        <div className="divide-y divide-seam rounded-card bg-velvet hairline">
          {m.data?.map((mt) => (
            <button key={mt.id} onClick={() => nav(`/matters/${mt.id}`)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] text-marble">{mt.title.replace(' (FICTIONAL)', '')}</p>
                <p className="mt-0.5 text-[11px] text-smoke">{caseLabel[mt.case_type]} · updated {new Date(mt.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
              </div>
              <Chip tone={statusTone[mt.status]}>{mt.status.replace('_', ' ')}</Chip>
              <ChevronRight size={16} className="text-smoke" />
            </button>
          ))}
        </div>
      </Section>

      <p className="px-1 text-[11px] leading-relaxed text-smoke">All matters shown are fictional demo data. Insaaf is a drafting and research assistant for advocates; it does not give legal advice.</p>
    </div>
  )
}

function QueueCard({ it, i, onOpen }: { it: QueueItem; i: number; onOpen: () => void }) {
  const hot = (it.days_left ?? 999) <= 45
  return (
    <motion.div {...stagger(i + 1)}>
      <Row onClick={onOpen} className="relative overflow-hidden">
        {i === 0 && <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brass/10 blur-2xl" />}
        <div className="flex items-start gap-4">
          <div className="flex w-16 shrink-0 flex-col items-center">
            <span className={cx('text-[34px] leading-none font-normal tracking-[-0.03em]', hot ? 'text-brass' : 'text-marble')}>{it.days_left ?? '—'}</span>
            <Label className="mt-1">days</Label>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] text-marble">{it.title.replace(' (FICTIONAL)', '')}</p>
            <div className="mt-2 flex items-center gap-2">
              <Bar value={it.priority} className="flex-1" tone={hot ? 'brass' : 'steel'} />
              <span className="text-[11px] text-smoke">{Math.round(it.priority * 100)}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {it.flags.includes('title_missing') && <Chip tone="overruled"><TriangleAlert size={11} /> title doc missing</Chip>}
              {it.flags.includes('plea_check') && <Chip tone="steel"><Hourglass size={11} /> plea eligibility</Chip>}
              {it.days_left === null && <Chip>no limitation set</Chip>}
            </div>
          </div>
        </div>
      </Row>
    </motion.div>
  )
}
