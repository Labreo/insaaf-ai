import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useScroll, useTransform } from 'motion/react'
import { Scale, ListOrdered, Plus, ScrollText, Bell, UserRound, Wifi, WifiOff } from 'lucide-react'
import { Dock, DockIcon } from '@/components/magicui/dock'
import Backdrop from './Backdrop'
import { cn } from '@/lib/utils'
import { useConnection } from '@/lib/api'
import { useDB } from '@/lib/store'
import { sfx } from '@/lib/sound'

export function Logo({ size = 18 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-full border border-brass/30 bg-brass/10"><Scale size={size - 4} className="text-brass" strokeWidth={1.6} /></span>
      <span className="text-[15px] font-normal tracking-[-0.02em] text-marble">Insaaf</span>
    </span>
  )
}

export function ConnChip() {
  const c = useConnection()
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em]', c === 'live' ? 'border-followed/25 text-followed' : c === 'local' ? 'border-brass/25 text-brass' : 'border-marble/10 text-smoke')}>
      {c === 'live' ? <Wifi size={11} /> : <WifiOff size={11} />}{c === 'live' ? 'backend' : c === 'local' ? 'local engine' : 'probing'}
    </span>
  )
}

const tabs = [
  { to: '/', label: 'Queue', icon: ListOrdered },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/new', label: 'New', icon: Plus, fab: true },
  { to: '/ledger', label: 'Ledger', icon: ScrollText },
  { to: '/me', label: 'Me', icon: UserRound },
]

export default function Shell() {
  const loc = useLocation()
  const nav = useNavigate()
  const inMatter = loc.pathname.startsWith('/matters/')
  const alerts = useDB((d) => d.matters.filter((m) => (m.days_left ?? 99) <= 30 || m.status === 'in_review').length)
  const { scrollY } = useScroll()
  const barBg = useTransform(scrollY, [0, 80], ['rgba(10,10,12,0)', 'rgba(10,10,12,0.72)'])
  const barBlur = useTransform(scrollY, [0, 80], ['blur(0px)', 'blur(16px)'])
  const barBorder = useTransform(scrollY, [0, 80], ['rgba(242,241,238,0)', 'rgba(242,241,238,0.07)'])
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => scrollY.on('change', (v) => setScrolled(v > 24)), [scrollY])

  return (
    <div className="mx-auto min-h-dvh w-full max-w-xl">
      <Backdrop />

      {!inMatter && (
        <motion.header style={{ backgroundColor: barBg, backdropFilter: barBlur, WebkitBackdropFilter: barBlur, borderBottomColor: barBorder }} className="sticky top-0 z-30 border-b safe-t">
          <div className={cn('flex items-center justify-between px-5 transition-[padding] duration-300', scrolled ? 'py-2' : 'py-3')}>
            <button onClick={() => nav('/')}><Logo /></button>
            <ConnChip />
          </div>
        </motion.header>
      )}

      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={loc.pathname}
          initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className={cn('px-5', inMatter ? 'pb-12 pt-2 safe-t' : 'pb-32 pt-2')}
        >
          <Outlet />
        </motion.main>
      </AnimatePresence>

      {!inMatter && (
        <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-center safe-b">
          <Dock className="mt-0 h-16 gap-1 rounded-full border-marble/8 bg-velvet/80 px-3 backdrop-blur-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)]" iconSize={44} iconMagnification={58} iconDistance={110}>
            {tabs.map(({ to, label, icon: Icon, fab }) => (
              <DockIcon key={to} className="rounded-full">
                <NavLink to={to} end={to === '/'} onClick={() => sfx.tap()} aria-label={label} className={({ isActive }) => cn('relative flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-full transition-colors', fab ? 'bg-brass text-void shadow-[0_0_28px_rgba(201,168,104,0.45)]' : isActive ? 'text-marble' : 'text-smoke hover:text-pewter')}>
                  {({ isActive }) => (
                    <>
                      <Icon size={fab ? 22 : 19} strokeWidth={fab ? 2 : 1.6} />
                      {!fab && isActive && <motion.span layoutId="dock-dot" className="absolute -bottom-1 h-1 w-1 rounded-full bg-brass" transition={{ type: 'spring', stiffness: 500, damping: 30 }} />}
                      {to === '/alerts' && alerts > 0 && <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-overruled px-1 text-[9px] font-medium text-marble">{alerts}</span>}
                    </>
                  )}
                </NavLink>
              </DockIcon>
            ))}
          </Dock>
        </nav>
      )}
    </div>
  )
}
