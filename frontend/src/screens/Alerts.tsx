import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { Bell, BellRing, Hourglass, Scale, UserCheck } from 'lucide-react'
import { api } from '@/lib/api'
import { mut, useDB } from '@/lib/store'
import type { Alert } from '@/lib/types'
import { Chip, Empty, Glass, Label, Section, Skeleton, Title, stagger, useAsync } from '@/components/primitives'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'

const kindLabel: Record<Alert['kind'], string> = { limitation: 'Limitation expires', mediation_window: 'Pre-institution mediation window', review_pending: 'Draft awaiting senior approval' }
const kindIcon: Record<Alert['kind'], typeof Bell> = { limitation: Hourglass, mediation_window: Scale, review_pending: UserCheck }

/** Statute Clock across the chamber: T-30 / T-7 / T-1 alerts, with real browser push when allowed. */
export default function Alerts() {
  const nav = useNavigate()
  const version = useDB((d) => d.matters.map((m) => m.id + m.status + m.days_left).join('|'))
  const push = useDB((d) => d.pushEnabled)
  const a = useAsync(() => api.alerts(), [version])

  const togglePush = async (on: boolean) => {
    sfx.tick()
    if (!on) return mut.setPush(false)
    if (!('Notification' in window)) return alert('This browser has no notifications API.')
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return mut.setPush(false)
    mut.setPush(true)
    const first = a.data?.[0]
    setTimeout(() => { try { new Notification('Insaaf · Statute Clock', { body: first ? `${first.title}: ${first.days_left} days left` : 'Deadline alerts are on.', icon: '/icon.svg' }) } catch { /* ignore */ } }, 1200)
  }

  const groups = { urgent: a.data?.filter((x) => x.level === 'urgent') ?? [], warn: a.data?.filter((x) => x.level === 'warn') ?? [], info: a.data?.filter((x) => x.level === 'info') ?? [] }

  return (
    <div className="space-y-7">
      <Title kicker="Statute clock">Nothing expires <span className="serif italic brass-text">unnoticed</span>.</Title>

      <Glass className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={cn('grid h-9 w-9 place-items-center rounded-full', push ? 'bg-brass/15 text-brass' : 'bg-marble/6 text-smoke')}>{push ? <BellRing size={17} /> : <Bell size={17} />}</span>
          <div><p className="text-[14px] text-marble">Push alerts</p><p className="text-[11px] text-smoke">T−30 · T−7 · T−1 before every deadline</p></div>
        </div>
        <Switch checked={push} onCheckedChange={togglePush} />
      </Glass>

      {a.loading && <Skeleton className="h-40" />}
      {a.data?.length === 0 && <Empty text="No deadlines yet. Run a pipeline to set the Statute Clock." />}

      {(['urgent', 'warn', 'info'] as const).map((lvl) => groups[lvl].length > 0 && (
        <Section key={lvl} title={lvl === 'urgent' ? 'Urgent · ≤ 7 days' : lvl === 'warn' ? 'Soon · ≤ 30 days' : 'On the radar'}>
          {groups[lvl].map((al, i) => {
            const Icon = kindIcon[al.kind]
            return (
              <motion.div key={al.id} {...stagger(i)}>
                <Glass onClick={() => { sfx.tap(); nav(`/matters/${al.matter_id}?tab=clock`) }} className="flex items-center gap-4">
                  <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-full', lvl === 'urgent' ? 'bg-overruled/15 text-overruled' : lvl === 'warn' ? 'bg-distinguished/15 text-distinguished' : 'bg-steel/12 text-steel')}><Icon size={17} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] text-marble">{al.title}</p>
                    <p className="text-[11px] text-smoke">{kindLabel[al.kind]}{al.due ? ` · ${new Date(al.due).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}</p>
                  </div>
                  {al.kind !== 'review_pending' ? (
                    <div className="text-right"><p className={cn('text-[24px] leading-none tabular-nums', lvl === 'urgent' ? 'text-overruled' : lvl === 'warn' ? 'brass-text' : 'text-marble')}>{al.days_left}</p><Label>days</Label></div>
                  ) : <Chip tone="distinguished">review</Chip>}
                </Glass>
              </motion.div>
            )
          })}
        </Section>
      ))}

      <p className="px-1 text-[11px] text-smoke">Deadlines come from the deterministic Statute Clock rules (Limitation Act articles, the COVID exclusion window, s.12A mediation). No model guesses a date.</p>
    </div>
  )
}
