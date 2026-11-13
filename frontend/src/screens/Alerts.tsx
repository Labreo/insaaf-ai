import { Bell, ChevronRight } from 'lucide-react'
import { motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { mut, useDB } from '@/lib/store'
import { Chip, Empty, Glass, Label, Skeleton, stagger, useAsync } from '@/components/primitives'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'

const tone = {
  urgent: { chip: 'distinguished' as const, label: 'Urgent · ≤ 7 days', ring: 'border-l-crimson' },
  warn: { chip: 'brass' as const, label: 'Soon · ≤ 30 days', ring: 'border-l-brass' },
  info: { chip: 'smoke' as const, label: 'On the radar', ring: 'border-l-pewter' },
}

export default function Alerts() {
  const nav = useNavigate()
  const push = useDB((d) => d.pushEnabled)
  const v = useDB((d) => d.matters.map((m) => `${m.id}:${m.days_left}`).join('|'))
  const res = useAsync(() => api.alerts(), [v])

  if (res.loading || !res.data) return <Skeleton className="h-96" />
  const items = res.data
  const groups = {
    urgent: items.filter((a) => a.level === 'urgent'),
    warn: items.filter((a) => a.level === 'warn'),
    info: items.filter((a) => a.level === 'info'),
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-seam pb-5">
        <div>
          <Label>Statute Clock · Limitation & Procedural Watchlist</Label>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-marble">Deadlines & Alerts</h1>
          <p className="mt-1 text-[13px] text-pewter">
            Statutory limitation periods, court return dates, and statutory compliance notices across active chamber matters.
          </p>
        </div>

        <Glass className="flex items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Bell size={16} className="text-brass" />
            <div>
              <p className="text-[13px] font-medium text-marble">Push notifications</p>
              <p className="text-[11px] text-smoke">30d, 7d, 1d before expiry</p>
            </div>
          </div>
          <Switch
            checked={push}
            onCheckedChange={(checked) => {
              sfx.tick()
              mut.setPush(checked)
              res.reload()
            }}
            aria-label="Toggle push alerts"
          />
        </Glass>
      </div>

      {items.length === 0 ? (
        <Empty text="No upcoming deadlines across open matters." />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {(['urgent', 'warn', 'info'] as const).map((lvl) => (
            <section key={lvl} className="space-y-3">
              <div className="flex items-center justify-between border-b border-seam pb-2">
                <Label>{tone[lvl].label}</Label>
                <Chip tone={tone[lvl].chip}>{groups[lvl].length}</Chip>
              </div>
              {groups[lvl].length === 0 ? (
                <Glass className="py-6 text-center text-[12px] text-smoke">No items in this bucket.</Glass>
              ) : (
                <div className="space-y-2.5">
                  {groups[lvl].map((a, i) => (
                    <motion.div key={a.id} {...stagger(i)}>
                      <Glass
                        onClick={() => {
                          sfx.tick()
                          nav(`/matters/${a.matter_id}`)
                        }}
                        className={cn(
                          'flex items-center justify-between gap-3 border-l-2 py-3 transition-colors hover:border-brass/40',
                          tone[lvl].ring,
                        )}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-marble">{a.title}</p>
                          <p className="mt-1 truncate font-mono text-[11px] text-pewter">
                            {a.kind.replace(/_/g, ' ')} · due {a.due}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="font-mono text-[12px] text-marble">
                            {a.days_left >= 0 ? `${a.days_left}d` : 'past'}
                          </span>
                          <ChevronRight size={15} className="text-smoke" />
                        </div>
                      </Glass>
                    </motion.div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      <p className="px-1 text-[11px] text-smoke">
        Computed from the cause-of-action date under the Limitation Act, 1963. Section 5 condonation and SUO MOTU COVID-19 extension windows apply per matter facts.
      </p>
    </div>
  )
}
