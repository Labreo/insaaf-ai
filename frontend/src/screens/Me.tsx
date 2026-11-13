import { useState } from 'react'
import { Eye, KeyRound, Lock, RotateCcw, Sparkles } from 'lucide-react'
import { api } from '@/lib/api'
import { confirmAction, toast } from '@/lib/feedback'
import { can, openAuth, useDB } from '@/lib/store'
import type { AuthAccount, Role } from '@/lib/types'
import { Badge, Card, ErrorBanner, PageHeader, Section, useAsync } from '@/components/primitives'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'

const roles: { k: Role; label: string; can: string }[] = [
  { k: 'senior', label: 'Senior Counsel', can: 'approve drafts · override findings · delete · export' },
  { k: 'junior', label: 'Junior Advocate', can: 'intake · run pipeline · edit facts · submit for review' },
  { k: 'clerk', label: 'Chamber Clerk', can: 'intake · upload · docket flags · export (no criminal)' },
  { k: 'student', label: 'Law Student', can: 'moot mode · read-only' },
]

export default function Me({ onReplayIntro }: { onReplayIntro: () => void }) {
  const me = useDB((s) => s.me)
  const conn = useDB((s) => s.conn)
  const health = useDB((s) => s.health)
  const logs = useAsync(() => api.accessLogs(), [me.user_id, me.role])
  const accounts = useAsync<AuthAccount[]>(() => api.accounts(), [me.user_id])
  const [resetting, setResetting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const ago = (iso: string) => {
    const h = Math.round((Date.now() - +new Date(iso)) / 3600e3)
    return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
  }

  const handleReset = async () => {
    const ok = await confirmAction({
      title: 'Reset demo data?',
      body: 'All matters, documents, analysis and reviewer ledger entries return to the seeded demo state. Anything you added will be lost.',
      confirmLabel: 'Reset demo data',
    })
    if (!ok) return
    setResetting(true)
    setErr(null)
    try {
      await api.resetDemo()
      sfx.accept()
      toast('ok', 'Demo data reset', 'Matters and ledger are back to the seeded state.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={`${me.org.name} · ${me.org.plan} plan`}
        title={me.name}
        description="Role-based access controls, chamber membership roster, statutory corpus & registry status, and zero-trust document custody audit logs."
        right={
          <Badge tone={conn === 'live' ? 'ok' : 'bad'}>
            {conn === 'live' ? 'DPDP Vault · Synced' : 'Offline Custody'}
          </Badge>
        }
      />

      {err && <ErrorBanner error={err} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-6">
          <Section
            title="Active Chamber Role (RBAC)"
            subtitle="your role is fixed by your account; highlighted below"
            right={
              <button
                type="button"
                onClick={() => {
                  sfx.tap()
                  openAuth()
                }}
                className="inline-flex items-center gap-1 rounded-[5px] border border-navy bg-navy-50 px-2.5 py-1 text-[11px] font-medium text-navy hover:bg-navy hover:text-white"
              >
                <KeyRound size={11} /> Sign In / Switch Chamber
              </button>
            }
          >
            <div className="grid grid-cols-2 gap-2.5">
              {roles.map((r) => (
                <div
                  key={r.k}
                  aria-current={me.role === r.k ? 'true' : undefined}
                  className={cn(
                    'rounded-[6px] border p-3.5 text-left transition-colors',
                    me.role === r.k
                      ? 'border-navy bg-navy-50'
                      : 'border-line bg-surface',
                  )}
                >
                  <p className={cn('text-[13px] font-semibold', me.role === r.k ? 'text-navy' : 'text-ink')}>
                    {r.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-3">{r.can}</p>
                </div>
              ))}
            </div>
            <Card className="space-y-2 bg-sunken">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1 font-medium text-ink">
                  <Lock size={12} className="text-navy" /> Row-Level Security Policy
                </span>
                <span className="font-mono text-[10px] text-ink-3">
                  Key: {me.key_fingerprint ?? '—'} · Session: {me.session_fingerprint ?? '—'}
                </span>
              </div>
              <p className="text-[12px] text-ink-2">
                {me.rls_policy ?? 'Chamber isolation and role-based filing gates enforced server-side.'}
              </p>
              {accounts.data && accounts.data.length > 0 && (
                <div className="border-t border-line pt-2">
                  <p className="eyebrow mb-1.5">Switch account (password required)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {accounts.data.map((acc) => {
                      const active = acc.user_id === me.user_id
                      return (
                        <button
                          key={acc.user_id}
                          type="button"
                          onClick={() => {
                            sfx.tick()
                            openAuth({ prefill: acc.user_id })
                          }}
                          className={cn(
                            'rounded-[4px] border px-2 py-1 text-[11px] transition-colors',
                            active
                              ? 'border-navy bg-navy text-white'
                              : 'border-line bg-surface text-ink-2 hover:bg-hover',
                          )}
                        >
                          {acc.name} · <span className="font-mono text-[10px] uppercase">{acc.role}</span> ({acc.org_id === 'org_chamber_b' ? 'Chamber B' : 'Chamber A'})
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </Card>
            <p className="text-[11px] text-ink-3">
              Enforced by the backend on every request: only Senior Counsel can approve, override, or delete; Junior Advocates edit facts and submit drafts for review; Clerks handle intake; Students are read-only. Another chamber's matters return 404, exactly like a matter that does not exist.
            </p>
          </Section>

          <Section id="security" title="Data Custody, Privilege & Registry Status">
            <Card className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5 text-[12px]">
                <div className="rounded-[5px] border border-line bg-sunken px-3 py-2">
                  <p className="eyebrow">Insaaf Precedent Index</p>
                  <p className="mt-1 font-mono font-medium text-ink">{health ? `${health.precedent_index} · ${health.index_size.toLocaleString('en-IN')} judgments` : '—'}</p>
                </div>
                <div className="rounded-[5px] border border-line bg-sunken px-3 py-2">
                  <p className="eyebrow">Authority Lock Verifier</p>
                  <p className="mt-1 font-mono font-medium text-ink">{health?.llm ?? '—'}</p>
                </div>
                <div className="rounded-[5px] border border-line bg-sunken px-3 py-2">
                  <p className="eyebrow">Insaaf Translate (12 languages)</p>
                  <p className="mt-1 font-mono font-medium text-ink">{health?.translation ?? '—'}</p>
                </div>
                <div className="rounded-[5px] border border-line bg-sunken px-3 py-2">
                  <p className="eyebrow">Live Web Sweep</p>
                  <p className="mt-1 font-mono font-medium text-ink">{health?.web_sweep ?? '—'}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                <button
                  type="button"
                  onClick={onReplayIntro}
                  className="inline-flex items-center gap-1.5 rounded-[5px] border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 hover:bg-hover hover:text-ink"
                >
                  <Sparkles size={13} className="text-brass" /> Replay Justice Intro
                </button>
                {can('demo.reset') && (
                <button
                  type="button"
                  disabled={resetting}
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 rounded-[5px] border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 hover:border-bad-200 hover:bg-bad-50 hover:text-bad disabled:opacity-50"
                >
                  <RotateCcw size={13} /> {resetting ? 'Resetting…' : 'Reset Baseline Chamber Matters'}
                </button>
                )}
              </div>
            </Card>
          </Section>
        </div>

        <div className="space-y-6 lg:col-span-6">
          <Section
            title="Chamber Members"
            right={
              <Badge tone="info">
                <Eye size={11} /> Custody Audit On
              </Badge>
            }
          >
            <Card className="overflow-hidden p-0">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Advocate / Staff</th>
                    <th>Role</th>
                    <th className="text-right">Last Active</th>
                  </tr>
                </thead>
                <tbody>
                  {me.org.members.map((m) => (
                    <tr key={m.name}>
                      <td className="font-medium text-ink">{m.name}</td>
                      <td className="capitalize text-ink-2">{m.role}</td>
                      <td className="text-right font-mono text-[11px] text-ink-3">{ago(m.last_seen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </Section>

          <Section title="Recent Document Custody Access Log">
            <Card className="overflow-hidden p-0">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Actor</th>
                    <th>Matter &amp; Endpoint</th>
                    <th className="text-right">When</th>
                  </tr>
                </thead>
                <tbody>
                  {(logs.data ?? []).slice(0, 8).map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        <span className="font-medium text-ink">{entry.actor}</span>{' '}
                        <Badge tone="neutral">{entry.role}</Badge>
                      </td>
                      <td className="font-mono text-[11px] text-ink-2">
                        {entry.matter_id} · {entry.endpoint}
                      </td>
                      <td className="text-right font-mono text-[11px] text-ink-3">{ago(entry.at)}</td>
                    </tr>
                  ))}
                  {(!logs.data || logs.data.length === 0) && (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-[12px] text-ink-3">
                        No custody access events recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
          </Section>
        </div>
      </div>

      <p className="border-t border-line pt-4 text-[11px] text-ink-3">
        Insaaf AI is a research and drafting workbench for advocates. Every pleading requires advocate verification and sign-off, logged on a hash chain. It does not constitute legal advice.
      </p>
    </div>
  )
}
