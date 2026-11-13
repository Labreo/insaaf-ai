import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  Bell,
  BookOpenCheck,
  ChevronRight,
  ClipboardCheck,
  FileSignature,
  FileText,
  FolderPlus,
  Gavel,
  Hourglass,
  KeyRound,
  LayoutDashboard,
  LayoutList,
  ListOrdered,
  LogOut,
  Menu,
  Radar,
  RefreshCw,
  Scale,
  ScanSearch,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import AuthModal from './AuthModal'
import { api } from '@/lib/api'
import { can, openAuth, useDB } from '@/lib/store'
import type { Matter } from '@/lib/types'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'

/**
 * Five navigation areas over the existing routes. Items marked `matter` open a tab of
 * the matter you are in (or the most urgent one on the docket) and are disabled when
 * the chamber has no matters yet.
 */
interface NavItem {
  label: string
  icon: LucideIcon
  to?: string
  tab?: string
  action?: 'auth'
  hash?: string
}
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Workspace',
    items: [
      { label: 'Overview', icon: LayoutDashboard, to: '/docket' },
      { label: 'Nyaya Queue', icon: ListOrdered, to: '/docket', hash: 'queue' },
      { label: 'Alerts', icon: Bell, to: '/alerts' },
    ],
  },
  {
    title: 'Matters',
    items: [
      { label: 'Matter intake', icon: FolderPlus, to: '/new' },
      { label: 'Matter list', icon: LayoutList, to: '/docket', hash: 'matters' },
      { label: 'Documents & facts', icon: FileText, tab: 'facts' },
    ],
  },
  {
    title: 'Legal Intelligence',
    items: [
      { label: 'Precedents', icon: BookOpenCheck, tab: 'precedents' },
      { label: 'AI-B score & Bias Firewall', icon: Scale, tab: 'score' },
      { label: 'Citation health', icon: ScanSearch, tab: 'citations' },
      { label: 'Law Change Radar', icon: Radar, tab: 'radar' },
    ],
  },
  {
    title: 'Drafting & Advisory',
    items: [
      { label: 'Draft generation', icon: FileSignature, tab: 'draft' },
      { label: 'Proof Ledger', icon: ClipboardCheck, tab: 'proof' },
      { label: 'Settlement advice', icon: Gavel, tab: 'advice' },
      { label: 'Statute Clock', icon: Hourglass, tab: 'clock' },
    ],
  },
  {
    title: 'Chamber Administration',
    items: [
      { label: 'Members & roles', icon: Users, to: '/me' },
      { label: 'Switch account', icon: KeyRound, action: 'auth' },
      { label: 'Audit ledger', icon: ScrollText, to: '/ledger' },
      { label: 'Security & chamber', icon: ShieldCheck, to: '/me', hash: 'security' },
    ],
  },
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
  const [params] = useSearchParams()
  const [mobileNav, setMobileNav] = useState(false)

  const me = useDB((s) => s.me)
  const matters = useDB((s) => s.matters)
  const conn = useDB((s) => s.conn)
  const error = useDB((s) => s.error)
  const authed = useDB((s) => s.authed)
  const authReady = useDB((s) => s.authReady)
  const authModalOpen = useDB((s) => s.authModal.open)

  useEffect(() => {
    setMobileNav(false)
  }, [loc.pathname, loc.search])

  // In-page anchors (#queue, #matters, #security): the router does not scroll to them itself.
  useEffect(() => {
    if (!loc.hash) return
    const t = setTimeout(() => document.getElementById(loc.hash.slice(1))?.scrollIntoView({ block: 'start' }), 60)
    return () => clearTimeout(t)
  }, [loc.hash, loc.pathname, authed, matters.length])

  const activeMatterId = loc.pathname.startsWith('/matters/') ? loc.pathname.split('/')[2] : null
  const activeTab = activeMatterId ? params.get('tab') || 'pipeline' : null
  // Matter-scoped items target the matter being viewed, otherwise the most urgent one on the docket.
  const contextMatter =
    matters.find((m) => m.id === activeMatterId) ??
    [...matters].sort((a, b) => (a.days_left ?? 9999) - (b.days_left ?? 9999))[0]
  const urgentCount = matters.filter((m) => m.days_left != null && m.days_left <= 45).length

  const hrefFor = (it: NavItem): string | null => {
    if (it.tab) return contextMatter ? `/matters/${contextMatter.id}?tab=${it.tab}` : null
    return it.to ? `${it.to}${it.hash ? `#${it.hash}` : ''}` : null
  }
  const isActive = (it: NavItem): boolean => {
    if (it.tab) return activeTab === it.tab
    if (!it.to || loc.pathname !== it.to) return false
    if (it.hash) return loc.hash === `#${it.hash}`
    return !(it.to === '/docket' && loc.hash) && !(it.to === '/me' && loc.hash)
  }

  const RailBody = (
    <div className="flex h-full flex-col justify-between bg-surface">
      <nav aria-label="Primary" className="scroll-thin flex-1 space-y-4 overflow-y-auto p-3">
        {NAV_GROUPS.map((g) => (
          <div key={g.title} className="space-y-0.5">
            <p className="eyebrow px-2 pb-1">{g.title}</p>
            {g.items.map((it) => {
              const Icon = it.icon
              const href = hrefFor(it)
              const active = isActive(it)
              const cls = cn(
                'flex w-full items-center justify-between rounded-[5px] px-2.5 py-1.5 text-left text-[13px] transition-colors',
                active ? 'bg-navy-50 font-medium text-navy' : 'text-ink-2 hover:bg-hover hover:text-ink',
                !href && !it.action && 'pointer-events-none opacity-45',
              )
              const inner = (
                <>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Icon size={15} strokeWidth={1.75} className="shrink-0" />
                    <span className="truncate">{it.label}</span>
                  </span>
                  {it.to === '/alerts' && urgentCount > 0 && (
                    <span className="tabular rounded-[4px] bg-bad-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-bad">
                      {urgentCount}
                    </span>
                  )}
                </>
              )
              if (it.action === 'auth') {
                return (
                  <button
                    key={it.label}
                    type="button"
                    className={cls}
                    onClick={() => {
                      sfx.tap()
                      openAuth()
                    }}
                  >
                    {inner}
                  </button>
                )
              }
              if (!href) {
                return (
                  <span
                    key={it.label}
                    aria-disabled="true"
                    title="Register a matter to open this view"
                    className={cls}
                  >
                    {inner}
                  </span>
                )
              }
              return (
                <Link
                  key={it.label}
                  to={href}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => sfx.tap()}
                  className={cls}
                >
                  {inner}
                </Link>
              )
            })}
            {g.title === 'Matters' && contextMatter && (
              <p className="truncate px-2.5 pt-0.5 text-[10.5px] text-ink-3">
                Matter views open on: {contextMatter.title.replace(' (FICTIONAL)', '')}
              </p>
            )}
          </div>
        ))}

        <div className="space-y-1 border-t border-line pt-3">
          <p className="eyebrow px-2 pb-1">Recent matters</p>
          {matters.slice(0, 6).map((mt) => (
            <Link
              key={mt.id}
              to={`/matters/${mt.id}`}
              onClick={() => sfx.tap()}
              className={cn(
                'flex w-full items-center gap-2 rounded-[5px] border px-2 py-1.5 text-left transition-colors',
                activeMatterId === mt.id
                  ? 'border-navy-100 bg-navy-50 text-navy'
                  : 'border-transparent text-ink-2 hover:bg-hover hover:text-ink',
              )}
            >
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', statusDot[mt.status])} />
              <span className="rounded border border-line bg-sunken px-1 py-0.5 font-mono text-[9px] font-medium text-ink-3">
                {caseTag[mt.case_type]}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{mt.title.replace(' (FICTIONAL)', '')}</span>
              {mt.days_left != null && <span className="tabular shrink-0 font-mono text-[10px] text-ink-3">{mt.days_left}d</span>}
            </Link>
          ))}
          {matters.length === 0 && <p className="px-2 py-2 text-[12px] text-ink-3">No matters registered yet.</p>}
        </div>
      </nav>

      <div className="space-y-2 border-t border-line bg-sunken p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[12px] font-medium text-ink">{me.name}</p>
            <p className="truncate font-mono text-[10px] text-ink-3">{me.email ?? me.user_id}</p>
          </div>
          <span className="shrink-0 rounded-[4px] bg-navy px-2 py-0.5 text-[10px] font-medium uppercase text-white">{me.role}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
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
            {conn === 'live' ? 'Backend connected' : conn === 'down' ? 'Backend offline' : 'Checking…'}
          </span>
          <button
            type="button"
            onClick={() => {
              sfx.tap()
              api.logout().then(() => nav('/'))
            }}
            className="inline-flex items-center gap-1 rounded-[4px] border border-line-strong bg-surface px-1.5 py-0.5 text-[10px] font-medium text-ink-2 hover:text-bad"
          >
            <LogOut size={10} /> Sign out
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded focus:bg-navy focus:px-3 focus:py-1.5 focus:text-white"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex h-13 max-w-[1600px] items-center justify-between gap-4 px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
              className="rounded-[5px] border border-line p-1.5 text-ink-2 hover:bg-hover lg:hidden"
            >
              <Menu size={16} />
            </button>
            <Link to="/docket" className="flex items-center gap-2.5 text-ink">
              <span className="grid h-7 w-7 place-items-center rounded-[5px] border border-brass-200 bg-brass-50 text-brass">
                <Scale size={15} strokeWidth={1.8} />
              </span>
              <span className="flex items-baseline gap-2">
                <span className="text-[15px] font-semibold tracking-[-0.02em]">Insaaf AI</span>
                <span className="hidden text-[11px] text-ink-3 sm:inline">{me.org.name}</span>
              </span>
            </Link>
            {contextMatter && activeMatterId && (
              <span className="ml-1 hidden items-center gap-1.5 text-[12px] text-ink-3 md:flex">
                <ChevronRight size={12} />
                <span className="max-w-[320px] truncate text-ink-2">{contextMatter.title.replace(' (FICTIONAL)', '')}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onReplayIntro}
              className="hidden items-center gap-1.5 rounded-[5px] border border-line bg-sunken px-2.5 py-1 text-[11px] font-medium text-ink-2 hover:border-line-strong hover:text-ink xl:inline-flex"
            >
              <Sparkles size={12} className="text-brass" /> Replay intro
            </button>
            <button
              type="button"
              onClick={() => {
                sfx.tap()
                openAuth()
              }}
              title="Switch account"
              className="hidden items-center gap-1.5 rounded-[5px] border border-line bg-sunken px-2.5 py-1 text-[11px] text-ink-2 hover:border-line-strong hover:text-ink sm:inline-flex"
            >
              <span>{me.name}</span>
              <span className="font-semibold capitalize text-navy">{me.role}</span>
            </button>
            {can('matter.create') ? (
              <button
                type="button"
                onClick={() => {
                  sfx.tap()
                  nav('/new')
                }}
                className="inline-flex items-center gap-1.5 rounded-[5px] bg-navy px-3 py-1.5 text-[12px] font-medium text-white hover:bg-navy-600"
              >
                <FolderPlus size={13} /> New matter
              </button>
            ) : (
              authed && (
                <span
                  title={`The ${me.role} role cannot create matters`}
                  className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-[5px] border border-line bg-sunken px-3 py-1.5 text-[12px] font-medium text-ink-4"
                >
                  <FolderPlus size={13} /> New matter
                </span>
              )
            )}
          </div>
        </div>
      </header>

      {conn === 'down' && (
        <div className="border-b border-bad-200 bg-bad-50 px-4 py-2 text-[12px] text-bad">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2">
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

      <div className="mx-auto flex w-full max-w-[1600px] flex-1">
        {/* Desktop Persistent Left Rail */}
        <aside aria-label="Navigation" className="sticky top-13 hidden h-[calc(100dvh-3.25rem)] w-64 shrink-0 border-r border-line lg:block">
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
        <main id="main" className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-7">
          {authed && me.role === 'student' && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-brass-200 bg-brass-50 px-4 py-2.5 text-[12px] text-ink">
              <span className="font-semibold text-brass">Moot Court &amp; Law-School Evaluation Mode — Read-Only</span>
              <span className="text-ink-2">Bench memorial &amp; citation grading active · Pleading sealing &amp; overrides disabled for student interns.</span>
            </div>
          )}
          {authed ? (
            <Outlet />
          ) : authReady ? (
            <>
              <p className="py-10 text-center text-[13px] text-ink-3">Sign in to open the chamber workbench.</p>
              {!authModalOpen && <AuthModal required />}
            </>
          ) : (
            <p className="py-10 text-center text-[13px] text-ink-3">Restoring session…</p>
          )}
        </main>
      </div>
    </div>
  )
}
