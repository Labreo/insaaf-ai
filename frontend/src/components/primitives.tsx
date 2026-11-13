import { type ReactNode, useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { ExternalLink } from 'lucide-react'
import type { Confidence, SourceRef } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { sfx } from '@/lib/sound'

export const ease = [0.16, 1, 0.3, 1] as const
export const spring = { type: 'spring', stiffness: 380, damping: 32, mass: 0.8 } as const

/* ---------- type ---------- */

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('label', className)}>{children}</p>
}

export function Title({ children, className, kicker }: { children: ReactNode; className?: string; kicker?: ReactNode }) {
  return (
    <div className={cn('space-y-1', className)}>
      {kicker && <Label>{kicker}</Label>}
      <h1 className="text-heading font-medium text-marble">{children}</h1>
    </div>
  )
}

/* ---------- surfaces ---------- */

export function Glass({ children, className, onClick }: { children: ReactNode; className?: string; spotlight?: boolean; onClick?: () => void }) {
  return (
    <div
      className={cn('glass p-4', onClick && 'cursor-pointer transition-colors hover:border-brass/35', className)}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

export function Well({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('glass-well p-3', className)}>{children}</div>
}

export function Section({ title, children, right, className }: { title: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-2.5', className)}>
      <div className="flex items-center justify-between border-b border-seam/70 pb-1.5">
        <Label>{title}</Label>
        {right}
      </div>
      {children}
    </section>
  )
}

/* ---------- chips ---------- */

export type Tone = 'smoke' | 'brass' | 'followed' | 'distinguished' | 'overruled' | 'steel'
const tones: Record<Tone, string> = {
  smoke: 'text-pewter bg-graphite border-seam',
  brass: 'text-brass bg-brass/10 border-brass/30',
  followed: 'text-followed bg-followed/10 border-followed/30',
  distinguished: 'text-distinguished bg-distinguished/10 border-distinguished/30',
  overruled: 'text-overruled bg-overruled/10 border-overruled/30',
  steel: 'text-steel bg-steel/10 border-steel/25',
}
export function Chip({ children, tone = 'smoke', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-wide whitespace-nowrap', tones[tone], className)}>{children}</span>
}

export function ConfidenceDot({ c }: { c: Confidence }) {
  const t = c === 'high' ? 'bg-followed' : c === 'medium' ? 'bg-distinguished' : 'bg-overruled'
  return <span className="inline-flex items-center gap-1.5 text-[11px] text-smoke"><span className={cn('h-1.5 w-1.5 rounded-full', t)} />{c}</span>
}

/* ---------- meters ---------- */

export function Bar({ value, tone = 'brass', className }: { value: number; tone?: 'brass' | 'followed' | 'overruled' | 'steel'; className?: string }) {
  const bg = { brass: 'bg-brass', followed: 'bg-followed', overruled: 'bg-overruled', steel: 'bg-steel' }[tone]
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-sm bg-marble/8', className)}>
      <motion.div className={cn('h-full rounded-sm', bg)} initial={{ width: 0 }} animate={{ width: `${Math.round(value * 100)}%` }} transition={{ duration: 0.7, ease }} />
    </div>
  )
}

export function Ring({ value, size = 108, stroke = 6, tone = '#c9a868', children }: { value: number; size?: number; stroke?: number; tone?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(242,241,238,0.08)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} stroke={tone} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.min(1, Math.max(0, value))) }}
          transition={{ duration: 0.8, ease }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

/* ---------- sources: every legal conclusion opens to its paragraph ---------- */

export function SourceChip({ s, onOpen }: { s: SourceRef; onOpen: (s: SourceRef) => void }) {
  const short = s.title.split(' v. ')[0].replace(/ & Industries| Pvt\. Ltd\./g, '')
  return (
    <button onClick={() => { sfx.tick(); onOpen(s) }} className="inline-flex max-w-full items-center gap-1 rounded border border-steel/25 bg-steel/10 px-2 py-0.5 font-mono text-[11px] text-steel transition-colors hover:border-brass/40 hover:text-marble">
      <span className="truncate">{short}{s.paragraph !== '—' ? ` ¶${s.paragraph}` : ''}</span>
    </button>
  )
}

export function NoAuthority() {
  return <span className="serif italic text-overruled/90">No verified authority found.</span>
}

export function SourceSheet({ s, onClose }: { s: SourceRef | null; onClose: () => void }) {
  return (
    <Drawer open={!!s} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="mx-auto max-w-2xl rounded-t-lg border border-seam bg-velvet p-6">
        {s && (
          <div className="space-y-4">
            <div className="border-b border-seam pb-3">
              <Label className="mb-1">Legal Authority Inspector · {s.kind} · {s.court || 'statute'}</Label>
              <DrawerTitle className="serif text-[24px] leading-tight font-normal text-marble">{s.title}</DrawerTitle>
              <DrawerDescription className="mt-1 text-[12px] text-smoke">{s.date}{s.paragraph !== '—' ? ` · para ${s.paragraph}` : ''}</DrawerDescription>
            </div>
            <blockquote className="serif border-l-2 border-brass/60 bg-graphite/60 py-3 pl-4 pr-3 text-[17px] leading-relaxed text-marble/95">{s.snippet}</blockquote>
            <div className="flex items-center justify-between pt-1">
              <span className="font-mono text-[11px] text-smoke">Source ID: {s.source_id}</span>
              <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-brass/30 bg-brass/10 px-3 py-1.5 text-[12px] font-medium uppercase tracking-[0.06em] text-brass hover:bg-brass/20">
                Open on Indian Kanoon <ExternalLink size={13} />
              </a>
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}

/* ---------- data ---------- */

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, set] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    fn().then((data) => alive && set({ data, loading: false })).catch((e) => alive && set({ error: String(e), loading: false }))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return { ...state, reload: () => setTick((t) => t + 1) }
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md border border-seam bg-graphite/60', className)} />
}

export function Empty({ text, action }: { text: string; action?: ReactNode }) {
  return <div className="glass flex flex-col items-center gap-3 px-4 py-10 text-center"><p className="text-[13px] text-smoke">{text}</p>{action}</div>
}

export const fadeUp = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.25, ease } }
export const stagger = (i: number) => ({ ...fadeUp, transition: { ...fadeUp.transition, delay: Math.min(0.2, 0.025 * i) } })

export function Stat({ value, label, tone }: { value: ReactNode; label: string; tone?: 'brass' | 'overruled' | 'followed' }) {
  return (
    <div className="glass px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-smoke">{label}</p>
      <p className={cn('mt-1.5 text-[28px] leading-none font-normal tracking-[-0.03em] tabular-nums', tone === 'brass' ? 'text-brass' : tone === 'overruled' ? 'text-overruled' : tone === 'followed' ? 'text-followed' : 'text-marble')}>{value}</p>
    </div>
  )
}
