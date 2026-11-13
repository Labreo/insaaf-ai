import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { motion } from 'motion/react'
import { Scale, ListOrdered, Plus, ScrollText, UserRound } from 'lucide-react'
import { cx } from './ui'

export function Logo({ size = 18 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Scale size={size} className="text-brass" strokeWidth={1.6} />
      <span className="text-[15px] font-normal tracking-[-0.02em] text-marble">Insaaf</span>
    </span>
  )
}

const tabs = [
  { to: '/', label: 'Queue', icon: ListOrdered },
  { to: '/ledger', label: 'Ledger', icon: ScrollText },
  { to: '/new', label: 'New', icon: Plus, fab: true },
  { to: '/me', label: 'Me', icon: UserRound },
]

export default function Shell() {
  const loc = useLocation()
  const hideNav = loc.pathname.startsWith('/matters/')
  return (
    <div className="grain mx-auto min-h-dvh w-full max-w-xl">
      <motion.main key={loc.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} className={cx('px-5 pt-3 safe-t', hideNav ? 'pb-10' : 'pb-28')}>
        <Outlet />
      </motion.main>

      {!hideNav && (
        <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl px-5 safe-b">
          <div className="flex items-center justify-around rounded-full bg-velvet/90 px-2 py-2 backdrop-blur-md hairline">
            {tabs.map(({ to, label, icon: Icon, fab }) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cx('flex flex-col items-center gap-1 rounded-full px-4 py-1.5 text-[10px] uppercase tracking-[0.12em] transition-colors', fab ? '' : isActive ? 'text-marble' : 'text-smoke hover:text-pewter')}>
                {fab ? (
                  <span className="-my-3 flex h-12 w-12 items-center justify-center rounded-full bg-brass text-void shadow-[0_0_30px_rgba(201,168,104,0.35)]"><Icon size={20} /></span>
                ) : (
                  <><Icon size={18} strokeWidth={1.6} />{label}</>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}
