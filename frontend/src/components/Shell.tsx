import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, FolderOpen, ListOrdered, Menu, Plus, Scale, ScrollText, UserRound, Wifi, WifiOff, X } from 'lucide-react'
import Backdrop from './Backdrop'
import { cn } from '@/lib/utils'
import { api, useConnection } from '@/lib/api'
import { useDB } from '@/lib/store'
import type { Role } from '@/lib/types'
import { sfx } from '@/lib/sound'

export function Logo({ size = 18 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-md border border-brass/35 bg-brass/10">
        <Scale size={size - 2} className="text-brass" strokeWidth={1.7} />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[15px] font-medium tracking-[-0.02em] text-marble">Insaaf AI</span>
        <span className="text-[10px] uppercase tracking-[0.08em] text-smoke">Legal Workbench</span>
      </span>
    </span>
  )
}

export function ConnChip() {
  const c = useConnection()
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.1em]', c === 'live' ? 'border-followed/30 bg-followed/10 text-followed' : c === 'local' ? 'border-brass/30 bg-brass/10 text-brass' : 'border-seam text-smoke')}>
      {c === 'live' ? <Wifi size={11} /> : <WifiOff size={11} />}
      {c === 'live' ? 'backend' : c === 'local' ? 'local engine' : 'probing'}
    </span>
  )
}

const navItems = [
  { to: '/', label: 'Nyaya Queue & Docket', icon: ListOrdered },
  { to: '/alerts', label: 'Statute Clock & Alerts', icon: Bell },
  { to: '/ledger', label: 'Audit Ledger & ML', icon: ScrollText },
  { to: '/me', label: 'Chamber & Access', icon: UserRound },
]

const ROLES: Role[] = ['senior', 'junior', 'clerk', 'student']

export default function Shell() {
  const loc = useLocation()
  const nav = useNavigate()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const me = useDB((d) => d.me)
  const matters = useDB((d) => d.matters)
  const alerts = useDB((d) => d.matters.filter((m) => (m.days_left ?? 99) <= 30 || m.status === 'in_review').length)

  useEffect(() => {
    setMobileNavOpen(false)
  }, [loc.pathname])

  const activeMatterId = loc.pathname.startsWith('/matters/') ? loc.pathname.split('/')[2] : null
  const activeMatter = activeMatterId ? matters.find((m) => m.id === activeMatterId) : null

  const pageTitle = activeMatter
    ? activeMatter.title.replace(' (FICTIONAL)', '')
    : loc.pathname === '/alerts'
      ? 'Statute Clock & Limitation Alerts'
      : loc.pathname === '/ledger'
        ? 'Reviewer Audit Ledger & Model Retraining'
        : loc.pathname === '/new'
          ? 'New Matter Intake & Ingestion'
          : loc.pathname === '/me'
            ? 'Chamber Workspace & Role Governance'
            : 'Chamber Docket & Nyaya Queue'

  const SidebarBody = (
    <div className="flex h-full flex-col justify-between">
      <div className="space-y-5 p-4">
        <button onClick={() => { sfx.tap(); nav('/') }} className="flex w-full items-center justify-between text-left">
          <Logo />
        </button>

        <button
          onClick={() => { sfx.tap(); nav('/new') }}
          className={cn(
            'flex h-9 w-full items-center justify-center gap-2 rounded-md bg-brass px-3 text-[12px] font-medium uppercase tracking-[0.06em] text-void transition-colors hover:bg-[#d6b676]',
            loc.pathname === '/new' && 'ring-1 ring-ray/40',
          )}
        >
          <Plus size={14} strokeWidth={2.2} /> New Matter Intake
        </button>

        <div className="space-y-1">
          <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.1em] text-smoke">Workspace</p>
          <nav className="space-y-0.5">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                onClick={() => sfx.tap()}
                className={({ isActive }) =>
                  cn(
                    'flex items-center justify-between rounded-md px-2.5 py-2 text-[13px] transition-colors',
                    isActive
                      ? 'bg-graphite font-medium text-marble border border-seam'
                      : 'text-pewter hover:bg-graphite/60 hover:text-marble border border-transparent',
                  )
                }
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon size={15} strokeWidth={1.7} />
                  <span className="truncate">{label}</span>
                </span>
                {to === '/alerts' && alerts > 0 && (
                  <span className="grid h-4 min-w-4 place-items-center rounded bg-overruled/90 px-1 text-[10px] font-medium text-marble">
                    {alerts}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="space-y-1 border-t border-seam pt-4">
          <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.1em] text-smoke">Active Matters ({matters.length})</p>
          <div className="max-h-56 space-y-0.5 overflow-y-auto pr-0.5">
            {matters.map((mt) => {
              const selected = activeMatterId === mt.id
              return (
                <button
                  key={mt.id}
                  onClick={() => { sfx.tap(); nav(`/matters/${mt.id}`) }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors',
                    selected ? 'bg-brass/12 text-brass border border-brass/25' : 'text-pewter hover:bg-graphite/60 hover:text-marble border border-transparent',
                  )}
                >
                  <FolderOpen size={13} className="shrink-0 opacity-75" />
                  <span className="min-w-0 flex-1 truncate">{mt.title.replace(' (FICTIONAL)', '')}</span>
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', mt.status === 'approved' ? 'bg-followed' : mt.status === 'in_review' ? 'bg-overruled' : mt.status === 'ready' ? 'bg-brass' : 'bg-smoke')} />
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="border-t border-seam bg-void/40 p-4 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-marble">{me.name}</p>
            <p className="truncate text-[11px] text-smoke">{me.org.name}</p>
          </div>
          <ConnChip />
        </div>
        <div className="grid grid-cols-4 gap-1" aria-label="Quick role selector">
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => { sfx.tick(); api.setRole(r) }}
              className={cn(
                'rounded px-1.5 py-1 text-[10px] font-medium uppercase tracking-[0.04em] transition-colors',
                me.role === r ? 'bg-brass text-void' : 'border border-seam bg-graphite text-smoke hover:text-marble',
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-dvh w-full bg-void text-marble">
      <Backdrop />

      {/* Desktop persistent left sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-seam bg-velvet lg:block">
        {SidebarBody}
      </aside>

      {/* Mobile slide-over sidebar */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-black/70" onClick={() => setMobileNavOpen(false)} />
          <aside className="relative z-10 h-full w-72 border-r border-seam bg-velvet">
            <button aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} className="absolute right-3 top-3 rounded-md p-1.5 text-smoke hover:text-marble">
              <X size={16} />
            </button>
            {SidebarBody}
          </aside>
        </div>
      )}

      {/* Main workspace column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-seam bg-velvet/85 px-4 backdrop-blur-md lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button aria-label="Open navigation" onClick={() => setMobileNavOpen(true)} className="rounded-md border border-seam p-1.5 text-pewter hover:text-marble lg:hidden">
              <Menu size={16} />
            </button>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-marble">{pageTitle}</p>
              <p className="hidden text-[11px] text-smoke sm:block">
                {activeMatter ? `${activeMatter.case_type.replace('_', ' ')} · ${activeMatter.forum_hint || 'District & High Court Practice'}` : `${me.org.name} · Authority-Locked Research & Drafting`}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <span className="hidden rounded-md border border-seam bg-graphite px-2.5 py-1 text-[11px] text-pewter sm:inline-flex">
              Active role: <strong className="ml-1 font-medium capitalize text-marble">{me.role}</strong>
            </span>
            <ConnChip />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
