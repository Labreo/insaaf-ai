import { useState } from 'react'
import { Bell, ChevronRight, Send } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { can, setPushEnabled, useDB } from '@/lib/store'
import { Badge, Card, Empty, ErrorBanner, PageHeader, Skeleton, type Tone, useAsync } from '@/components/primitives'
import { sfx } from '@/lib/sound'

const toneMap: Record<'urgent' | 'warn' | 'info', { badge: Tone; label: string; accent: string }> = {
  urgent: { badge: 'bad', label: 'Urgent · ≤ 45 days', accent: 'border-l-[3px] border-l-bad' },
  warn: { badge: 'warn', label: 'Upcoming · ≤ 90 days', accent: 'border-l-[3px] border-l-warn' },
  info: { badge: 'neutral', label: 'On the Horizon', accent: 'border-l-[3px] border-l-ink-4' },
}

export default function Alerts() {
  const nav = useNavigate()
  const push = useDB((s) => s.pushEnabled)
  const me = useDB((s) => s.me)
  const res = useAsync(() => api.alerts(), [me.user_id, me.role])
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{
    sent: boolean
    matter_id: string
    title: string
    days_left: number
  } | null>(null)
  const [sendErr, setSendErr] = useState<string | null>(null)

  if (res.loading && !res.data) return <Skeleton className="h-80" />
  const items = res.data ?? []

  const triggerTelegramAlert = async () => {
    setSending(true)
    setSendErr(null)
    sfx.tap()
    try {
      const out = await api.sendTestAlert(items[0]?.matter_id)
      setSendResult(out)
      sfx.accept()
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  const groups = {
    urgent: items.filter((a) => a.level === 'urgent'),
    warn: items.filter((a) => a.level === 'warn'),
    info: items.filter((a) => a.level === 'info'),
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Statute Clock · Limitation & Procedural Watchlist"
        title="Statutory Deadlines & Alerts"
        description="Deterministic Limitation Act expiry dates, s.12A commercial mediation windows, and pending senior sign-offs."
        right={
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={sending || !push || !can('alerts.test')}
              title={can('alerts.test') ? undefined : `The ${me.role} role cannot dispatch test alerts`}
              onClick={triggerTelegramAlert}
              className="inline-flex items-center gap-1.5 rounded-[5px] bg-navy px-3 py-2 text-[12px] font-medium text-white hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={13} /> {sending ? 'Dispatching…' : 'Send Live Telegram Alert'}
            </button>
            <Card className="flex items-center gap-3 px-3.5 py-2">
              <Bell size={15} className="text-navy" />
              <div className="text-left">
                <p className="text-[12px] font-medium text-ink">Deadline Alerts</p>
                <p className="text-[10px] text-ink-3">30d · 7d · 1d Telegram / Push</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={push}
                onClick={() => {
                  sfx.tick()
                  setPushEnabled(!push)
                }}
                className={`relative h-5 w-9 rounded-full transition-colors ${push ? 'bg-navy' : 'bg-line-strong'}`}
              >
                <span
                  className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${push ? 'translate-x-4.5' : 'translate-x-0.5'}`}
                />
              </button>
            </Card>
          </div>
        }
      />

      {sendResult && (
        <Card
          className={
            sendResult.sent
              ? 'border-ok-200 bg-ok-50 py-2.5 text-[12px] text-ok'
              : 'border-warn-200 bg-warn-50 py-2.5 text-[12px] text-warn'
          }
        >
          {sendResult.sent
            ? `Telegram deadline alert dispatched for "${sendResult.title}" (${sendResult.days_left} days left · logged to custody audit).`
            : `Alert formatted for "${sendResult.title}" (${sendResult.days_left}d left), but Telegram Bot returned dry/disabled status. Check TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID.`}
        </Card>
      )}
      {sendErr && <ErrorBanner error={sendErr} />}
      {res.error && <ErrorBanner error={res.error} onRetry={res.reload} />}

      {items.length === 0 ? (
        <Empty text="No upcoming deadlines across open chamber matters." />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {(['urgent', 'warn', 'info'] as const).map((lvl) => (
            <section key={lvl} className="space-y-2.5">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <p className="eyebrow">{toneMap[lvl].label}</p>
                <Badge tone={toneMap[lvl].badge}>{groups[lvl].length}</Badge>
              </div>
              {groups[lvl].length === 0 ? (
                <Card className="py-6 text-center text-[12px] text-ink-3">No items in this bucket.</Card>
              ) : (
                <div className="space-y-2.5">
                  {groups[lvl].map((a) => (
                    <Card
                      key={a.id}
                      onClick={() => {
                        sfx.tick()
                        nav(`/matters/${a.matter_id}?tab=clock`)
                      }}
                      className={`flex items-center justify-between gap-3 py-3 ${toneMap[lvl].accent}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-ink">
                          {a.title.replace(' (FICTIONAL)', '')}
                        </p>
                        <p className="mt-1 truncate font-mono text-[11px] text-ink-3">
                          {a.kind.replace(/_/g, ' ')} · due {a.due}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="tabular font-mono text-[12px] font-semibold text-ink">
                          {a.days_left >= 0 ? `${a.days_left}d` : 'past'}
                        </span>
                        <ChevronRight size={14} className="text-ink-3" />
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      <p className="text-[11px] text-ink-3">
        Calculated deterministically from Limitation Act articles and Supreme Court suo motu COVID tolling rules. Models never compute statutory dates.
      </p>
    </div>
  )
}
