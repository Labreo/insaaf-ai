import { motion } from 'motion/react'
import { Eye, RotateCcw, Sparkles } from 'lucide-react'
import { api, useConnection } from '@/lib/api'
import { resetDB, useDB } from '@/lib/store'
import type { Role } from '@/lib/types'
import { Chip, Glass, Label, Section, Title, useAsync } from '@/components/primitives'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'

const roles: { k: Role; label: string; can: string }[] = [
  { k: 'senior', label: 'Senior', can: 'approve · override · export' },
  { k: 'junior', label: 'Junior', can: 'intake · run · edit' },
  { k: 'clerk', label: 'Clerk', can: 'intake · documents' },
  { k: 'student', label: 'Student', can: 'moot mode · read only' },
]

/** F11 chamber workspace: roles, visible access, org-level encryption. */
export default function Me({ onReplayIntro }: { onReplayIntro: () => void }) {
  const me = useDB((d) => d.me)
  const conn = useConnection()
  const logs = useAsync(() => api.accessLogs(), [me.role])
  const ago = (iso: string) => { const h = Math.round((Date.now() - +new Date(iso)) / 3600e3); return h < 1 ? 'now' : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago` }

  return (
    <div className="space-y-7">
      <Title kicker={`${me.org.name} · ${me.org.plan} plan`}>{me.name}</Title>

      <Section title="Active chamber profile">
        <div className="grid grid-cols-2 gap-2">
          {roles.map((r) => (
            <button key={r.k} onClick={() => { sfx.tick(); api.setRole(r.k) }} className={cn('glass relative p-3.5 text-left transition-colors', me.role === r.k ? 'border-brass/40' : '')}>
              {me.role === r.k && <motion.span layoutId="role-pill" className="absolute inset-0 rounded-card bg-brass/8" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
              <p className="relative text-[15px] text-marble">{r.label}</p>
              <p className="relative text-[11px] text-smoke">{r.can}</p>
            </button>
          ))}
        </div>
        <p className="px-1 text-[11px] text-smoke">Only a senior can approve a draft or override Insaaf. Switch profile above to verify permission checks live across the app.</p>
      </Section>

      <Section title="Chamber members · access is visible, never hidden" right={<Chip tone="steel"><Eye size={11} /> audit on</Chip>}>
        <Glass className="divide-y divide-marble/6 p-0">
          {me.org.members.map((m) => (
            <div key={m.name} className="flex items-center justify-between px-4 py-3">
              <div><p className="text-[14px] text-marble">{m.name}</p><p className="text-[11px] capitalize text-smoke">{m.role}</p></div>
              <span className="text-[11px] text-smoke">seen {ago(m.last_seen)}</span>
            </div>
          ))}
        </Glass>
        <p className="px-1 text-[11px] text-smoke">Client documents are encrypted per organisation (envelope keys). Every member can see who opened which matter and when.</p>
      </Section>

      {logs.data && logs.data.length > 0 && (
        <Section title="Recent chamber access log">
          <Glass className="divide-y divide-marble/6 p-0">
            {logs.data.slice(0, 5).map((entry, idx) => (
              <div key={`${entry.at}-${idx}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[12px]">
                <div className="min-w-0 truncate">
                  <span className="text-marble">{entry.actor}</span>
                  <span className="text-smoke"> · {entry.role} · {entry.matter_id}</span>
                </div>
                <span className="shrink-0 font-mono text-[10px] text-smoke">{ago(entry.at)}</span>
              </div>
            ))}
          </Glass>
        </Section>
      )}

      <Section title="System">
        <Glass className="space-y-3">
          <div className="flex items-center justify-between"><span className="text-[13px] text-pewter">Backend</span><Chip tone={conn === 'live' ? 'followed' : 'brass'}>{conn === 'live' ? 'connected' : conn === 'local' ? 'local engine (offline)' : 'probing'}</Chip></div>
          <div className="flex items-center justify-between"><span className="text-[13px] text-pewter">API base</span><span className="font-mono text-[11px] text-smoke">{import.meta.env.VITE_API_BASE ?? '/v1'}</span></div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="ghost" className="h-9 rounded-full px-3 text-pewter" onClick={onReplayIntro}><Sparkles size={14} /> Replay intro</Button>
            <Button variant="ghost" className="h-9 rounded-full px-3 text-pewter" onClick={() => { resetDB(); sfx.reject() }}><RotateCcw size={14} /> Restore baseline matters</Button>
          </div>
        </Glass>
      </Section>

      <p className="px-1 text-[11px] leading-relaxed text-smoke">Insaaf is a drafting and research assistant for advocates. Every draft needs an advocate&rsquo;s approval, which is logged. It is not legal advice.</p>
      <Label>Insaaf · Chamber A, Mapusa · Goa Bench</Label>
    </div>
  )
}
