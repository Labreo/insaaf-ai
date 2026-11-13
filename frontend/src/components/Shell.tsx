import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Bell,
  ChevronRight,
  FolderPlus,
  LayoutList,
  Menu,
  RefreshCw,
  Scale,
  ScrollText,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useDB } from '@/lib/store'
import type { Matter, Role } from '@/lib/types'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'

const NAV = [
  { to: '/docket', label: 'Docket & Queue', icon: LayoutList },
  { to: '/new', label: 'Matter Intake', icon: FolderPlus },
  { to: '/alerts', label: 'Limitation Watch', icon: Bell },
  { to: '/ledger', label: 'Audit Ledger & ML', icon: ScrollText },
  { to: '/me', label: 'Chamber & RBAC', icon: UserCheck },
]

const ROLES: { k: Role; label: string }[] = [
  { k: 'senior', label: 'Senior' },
  { k: 'junior', label: 'Junior' },
  { k: 'clerk', label: 'Clerk' },
  { k: 'student', label: 'Student' },
]

const caseTag: Record<Matter['case_type'], string> = {
  property: 'PRP',
  civil_recovery: 'CIV',
  criminal: 'CRM',
}

const statusDot: Record<Matter['status'], string> = {
  draft: 'bg-ink-4',
  running: 'bg-info',
  ready: 'bg-navy',
  in_review: 'bg-warn',
  approved: 'bg-ok',
}

export default function Shell({ onReplayIntro }: { onReplayIntro: () => void }) {
  const loc = useLocation()
  const nav = useNavigate()
  const [mobileNav, setMobileNav] = useState(false)

  const me = useDB((s) => s.me)
  const matters = useDB((s) => s.matters)
  const health = useDB((s) => s.health)
  const conn = useDB((s) => s.conn)
  const error = useDB((s) => s.error)

  useEffect(() => {
    setMobileNav(false)
  }, [loc.pathname])

  const activeMatterId = loc.pathname.startsWith('/matters/') ? loc.pathname.split('/')[2] : null
  const urgentCount = matters.filter((m) => m.days_left != null && m.days_left <= 45).length

  const RailBody = (
    <div className="flex h-full flex-col justify-between bg-surface">
      <div className="space-y-5 p-3.5">
        <div className="space-y-1">
          <p className="eyebrow px-2 pb-1">Chamber Navigation</p>
          <nav className="space-y-0.5">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => sfx.tap()}
                className={({ isActive }) =>
                  cn(
                    'flex items-center justify-between rounded-[5px] px-2.5 py-2 text-[13px] transition-colors',
                    isActive
                      ? 'bg-navy-50 font-medium text-navy'
                      : 'text-ink-2 hover:bg-hover hover:text-ink',
                  )
                }
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon size={15} strokeWidth={1.75} />
                  <span className="truncate">{label}</span>
                </span>
                {to === '/alerts' && urgentCount > 0 && (
                  <span className="tabular rounded-[4px] bg-bad-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-bad">
                    {urgentCount}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="space-y-1.5 border-t border-line pt-4">
          <div className="flex items-center justify-between px-2">
            <p className="eyebrow">Active Matters ({matters.length})</p>
          </div>
          <div className="scroll-thin max-h-[44dvh] space-y-0.5 overflow-y-auto pr-0.5">
            {matters.map((mt) => {
              const selected = activeMatterId === mt.id
              return (
                <button
                  key={mt.id}
                  type="button"
                  onClick={() => {
                    sfx.tap()
                    nav(`/matters/${mt.id}`)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-[5px] border px-2 py-1.5 text-left transition-colors',
                    selected
                      ? 'border-navy-100 bg-navy-50 text-navy'
                      : 'border-transparent text-ink-2 hover:bg-hover hover:text-ink',
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', statusDot[mt.status])} />
                  <span className="rounded bg-sunken px-1 py-0.5 font-mono text-[9px] font-medium text-ink-3 border border-line">
                    {caseTag[mt.case_type]}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
                    {mt.title.replace(' (FICTIONAL)', '')}
                  </span>
                  {mt.days_left != null && (
                    <span className="tabular shrink-0 font-mono text-[10px] text-ink-3">{mt.days_left}d</span>
                  )}
                </button>
              )
            })}
            {matters.length === 0 && (
              <p className="px-2 py-3 text-[12px] text-ink-3">No matters registered on docket.</p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t border-line bg-sunken p-3.5">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="font-medium text-ink-2">{me.org.name}</span>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 font-mono text-[10px]',
              conn === 'live'
                ? 'border-ok-200 bg-ok-50 text-ok'
                : conn === 'down'
                  ? 'border-bad-200 bg-bad-50 text-bad'
                  : 'border-line bg-surface text-ink-3',
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', conn === 'live' ? 'bg-ok' : conn === 'down' ? 'bg-bad' : 'bg-ink-4')} />
            {conn === 'live' ? 'DPDP VAULT · SYNCED' : conn === 'down' ? 'OFFLINE CUSTODY' : 'VERIFYING'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px] text-ink-3">
          <div className="rounded-[4px] border border-line bg-surface px-2 py-1">
            Custody <span className="font-medium text-ink">AES-256</span>
          </div>
          <div className="rounded-[4px] border border-line bg-surface px-2 py-1">
            Privilege <span className="font-medium text-ink">BSA s.132</span>
          </div>
        </div>

        <div className="space-y-1">
          <p className="eyebrow">Active Role (RBAC)</p>
          <div className="grid grid-cols-4 gap-1">
            {ROLES.map((r) => (
              <button
                key={r.k}
                type="button"
                onClick={() => {
                  sfx.tick()
                  api.setRole(r.k)
                }}
                className={cn(
                  'rounded-[4px] border px-1 py-1 text-[10px] font-medium transition-colors',
                  me.role === r.k
                    ? 'border-navy bg-navy text-white'
                    : 'border-line bg-surface text-ink-2 hover:bg-hover',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      {/* Top Website + Workbench Header */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex h-13 max-w-[1440px] items-center justify-between gap-4 px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open docket rail"
              onClick={() => setMobileNav(true)}
              className="rounded-[5px] border border-line p-1.5 text-ink-2 hover:bg-hover lg:hidden"
            >
              <Menu size={16} />
            </button>

            <NavLink to="/" className="flex items-center gap-2.5 text-ink">
              <span className="grid h-7 w-7 place-items-center rounded-[5px] border border-brass-200 bg-brass-50 text-brass">
                <Scale size={15} strokeWidth={1.8} />
              </span>
              <span className="flex items-baseline gap-2">
                <span className="text-[15px] font-semibold tracking-[-0.02em]">Insaaf AI</span>
                <span className="hidden text-[11px] text-ink-3 sm:inline">Chamber Legal Workbench</span>
              </span>
            </NavLink>

            <nav className="ml-4 hidden items-center gap-1 md:flex">
              <NavLink
                to="/"
                end
                className="rounded-[5px] px-2.5 py-1 text-[12px] font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink"
              >
                Overview
              </NavLink>
              <NavLink
                to="/docket"
                className={({ isActive }) =>
                  cn(
                    'rounded-[5px] px-2.5 py-1 text-[12px] font-medium transition-colors',
                    isActive ? 'bg-navy-50 text-navy' : 'text-ink-2 hover:bg-hover hover:text-ink',
                  )
                }
              >
                Docket
              </NavLink>
              <NavLink
                to="/ledger"
                className={({ isActive }) =>
                  cn(
                    'rounded-[5px] px-2.5 py-1 text-[12px] font-medium transition-colors',
                    isActive ? 'bg-navy-50 text-navy' : 'text-ink-2 hover:bg-hover hover:text-ink',
                  )
                }
              >
                Ledger & ML
              </NavLink>
              <NavLink
                to="/me"
                className={({ isActive }) =>
                  cn(
                    'rounded-[5px] px-2.5 py-1 text-[12px] font-medium transition-colors',
                    isActive ? 'bg-navy-50 text-navy' : 'text-ink-2 hover:bg-hover hover:text-ink',
                  )
                }
              >
                Chamber
              </NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onReplayIntro}
              className="hidden items-center gap-1.5 rounded-[5px] border border-line bg-sunken px-2.5 py-1 text-[11px] font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink sm:inline-flex"
            >
              <Sparkles size={12} className="text-brass" /> Justice Intro
            </button>

            <div className="hidden items-center gap-1.5 rounded-[5px] border border-line bg-sunken px-2.5 py-1 text-[11px] text-ink-2 sm:flex">
              <span>{me.name}</span>
              <ChevronRight size={11} className="text-ink-4" />
              <span className="font-semibold capitalize text-navy">{me.role}</span>
            </div>

            <button
              type="button"
              onClick={() => {
                sfx.tap()
                nav('/new')
              }}
              className="inline-flex items-center gap-1.5 rounded-[5px] bg-navy px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-navy-600"
            >
              <FolderPlus size={13} /> New Matter
            </button>
          </div>
        </div>
      </header>

      {conn === 'down' && (
        <div className="border-b border-bad-200 bg-bad-50 px-4 py-2 text-[12px] text-bad">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <AlertTriangle size={14} />
              Chamber registry unreachable ({error || 'connection failed'}). Verify custody service and retry.
            </span>
            <button
              type="button"
              onClick={() => api.bootstrap()}
              className="inline-flex items-center gap-1 rounded-[4px] border border-bad-200 bg-surface px-2.5 py-0.5 text-[11px] font-medium text-bad"
            >
              <RefreshCw size={11} /> Reconnect
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-[1440px] flex-1">
        {/* Desktop Persistent Left Rail */}
        <aside className="sticky top-13 hidden h-[calc(100dvh-3.25rem)] w-64 shrink-0 border-r border-line lg:block">
          {RailBody}
        </aside>

        {/* Mobile Drawer Rail */}
        {mobileNav && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div className="fixed inset-0 bg-ink/30" onClick={() => setMobileNav(false)} />
            <aside className="relative z-10 h-full w-72 border-r border-line bg-surface shadow-[var(--shadow-sheet)]">
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setMobileNav(false)}
                className="absolute right-3 top-3 rounded-[5px] border border-line p-1 text-ink-3 hover:text-ink"
              >
                <X size={15} />
              </button>
              {RailBody}
            </aside>
          </div>
        )}

        {/* Main Workspace Content */}
        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-7">
          {me.role === 'student' && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-brass-200 bg-brass-50 px-4 py-2.5 text-[12px] text-ink">
              <span className="font-semibold text-brass">Moot Court &amp; Law-School Evaluation Mode — Read-Only</span>
              <span className="text-ink-2">Bench memorial &amp; citation grading active · Pleading sealing &amp; overrides disabled for student interns.</span>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  )
}
