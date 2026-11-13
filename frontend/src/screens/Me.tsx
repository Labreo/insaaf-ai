import { Eye, RotateCcw, Sparkles } from 'lucide-react'
import { api, useConnection } from '@/lib/api'
import { resetDB, useDB } from '@/lib/store'
import type { Role } from '@/lib/types'
import { Chip, Glass, Label, useAsync } from '@/components/primitives'
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
  const ago = (iso: string) => {
    const h = Math.round((Date.now() - +new Date(iso)) / 3600e3)
    return h < 1 ? 'now' : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-seam pb-5">
        <div>
          <Label>{me.org.name} · {me.org.plan} plan</Label>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-marble">{me.name}</h1>
          <p className="mt-1 text-[13px] text-pewter">
            Role-based access controls, chamber membership, and zero-trust document custody audit logs.
          </p>
        </div>
        <Chip tone={conn === 'live' ? 'followed' : 'brass'}>
          {conn === 'live' ? 'connected' : conn === 'local' ? 'local engine (offline)' : 'probing'}
        </Chip>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-6">
          <section className="space-y-3">
            <Label>Active chamber profile</Label>
            <div className="grid grid-cols-2 gap-2.5">
              {roles.map((r) => (
                <button
                  key={r.k}
                  onClick={() => {
                    sfx.tick()
                    api.setRole(r.k)
                  }}
                  className={cn(
                    'glass relative p-3.5 text-left transition-colors',
                    me.role === r.k ? 'border-brass/50 bg-brass/8' : 'hover:border-marble/20',
                  )}
                >
                  <p className="text-[14px] font-medium text-marble">{r.label}</p>
                  <p className="mt-0.5 text-[11px] text-smoke">{r.can}</p>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-smoke">
              Only a senior counsel can approve a pleading draft or override Insaaf scores. Switching profile verifies RBAC gates live across the workspace.
            </p>
          </section>

          <section className="space-y-3">
            <Label>System & Runtime</Label>
            <Glass className="space-y-3">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-pewter">Backend connection</span>
                <Chip tone={conn === 'live' ? 'followed' : 'brass'}>
                  {conn === 'live' ? 'connected' : conn === 'local' ? 'local engine (offline)' : 'probing'}
                </Chip>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-pewter">API base</span>
                <span className="font-mono text-[11px] text-smoke">{import.meta.env.VITE_API_BASE ?? '/v1'}</span>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-seam pt-3">
                <Button variant="ghost" className="h-9 rounded-md px-3 text-[12px] text-pewter hover:text-marble" onClick={onReplayIntro}>
                  <Sparkles size={14} /> Replay intro
                </Button>
                <Button
                  variant="ghost"
                  className="h-9 rounded-md px-3 text-[12px] text-pewter hover:text-marble"
                  onClick={() => {
                    resetDB()
                    sfx.reject()
                  }}
                >
                  <RotateCcw size={14} /> Restore baseline matters
                </Button>
              </div>
            </Glass>
          </section>
        </div>

        <div className="space-y-5 lg:col-span-6">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Chamber members · access is visible, never hidden</Label>
              <Chip tone="steel">
                <Eye size={11} /> audit on
              </Chip>
            </div>
            <Glass className="divide-y divide-seam/70 p-0">
              {me.org.members.map((m) => (
                <div key={m.name} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-[14px] font-medium text-marble">{m.name}</p>
                    <p className="text-[11px] capitalize text-smoke">{m.role}</p>
                  </div>
                  <span className="font-mono text-[11px] text-smoke">seen {ago(m.last_seen)}</span>
                </div>
              ))}
            </Glass>
            <p className="text-[11px] text-smoke">
              Client documents are encrypted per organisation (envelope keys). Every member sees who accessed which matter and when.
            </p>
          </section>

          {logs.data && logs.data.length > 0 && (
            <section className="space-y-3">
              <Label>Recent chamber access log</Label>
              <Glass className="divide-y divide-seam/70 p-0">
                {logs.data.slice(0, 6).map((entry, idx) => (
                  <div key={`${entry.at}-${idx}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[12px]">
                    <div className="min-w-0 truncate">
                      <span className="font-medium text-marble">{entry.actor}</span>
                      <span className="text-smoke"> · {entry.role} · {entry.matter_id}</span>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-smoke">{ago(entry.at)}</span>
                  </div>
                ))}
              </Glass>
            </section>
          )}
        </div>
      </div>

      <p className="border-t border-seam pt-4 text-[11px] leading-relaxed text-smoke">
        Insaaf is a drafting and research assistant for advocates. Every draft requires an advocate&rsquo;s approval, which is cryptographically logged. It does not constitute legal advice. · Chamber A, Mapusa · Goa Bench
      </p>
    </div>
  )
}
