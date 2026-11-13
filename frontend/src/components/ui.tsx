import { type ReactNode, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ExternalLink, X } from 'lucide-react'
import type { Confidence, SourceRef } from '@/lib/types'

export const ease = [0.16, 1, 0.3, 1] as const

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

/* ---------- primitives ---------- */

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('label', className)}>{children}</p>
}

export function Button({
  children, variant = 'primary', className, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      className={cx(
        'inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-[13px] font-medium uppercase tracking-[0.1em] transition-colors',
        variant === 'primary' && 'bg-brass text-void hover:bg-[#d6b676]',
        variant === 'ghost' && 'text-pewter hover:text-marble',
        variant === 'danger' && 'bg-overruled/15 text-overruled hairline',
        className,
      )}
      {...(rest as object)}
    >
      {children}
    </motion.button>
  )
}

export function Chip({ children, tone = 'smoke', className }: { children: ReactNode; tone?: 'smoke' | 'brass' | 'followed' | 'distinguished' | 'overruled' | 'steel'; className?: string }) {
  const tones = {
    smoke: 'text-pewter bg-graphite',
    brass: 'text-brass bg-brass/10',
    followed: 'text-followed bg-followed/10',
    distinguished: 'text-distinguished bg-distinguished/10',
    overruled: 'text-overruled bg-overruled/10',
    steel: 'text-steel bg-steel/10',
  }
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium tracking-wide', tones[tone], className)}>{children}</span>
}

export function ConfidenceDot({ c }: { c: Confidence }) {
  const tone = c === 'high' ? 'bg-followed' : c === 'medium' ? 'bg-distinguished' : 'bg-overruled'
  return <span className="inline-flex items-center gap-1.5 text-[11px] text-smoke"><span className={cx('h-1.5 w-1.5 rounded-full', tone)} />{c}</span>
}

export function Row({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <motion.div
      whileTap={onClick ? { scale: 0.99 } : undefined}
      onClick={onClick}
      className={cx('rounded-card bg-velvet p-4 hairline', onClick && 'cursor-pointer', className)}
    >
      {children}
    </motion.div>
  )
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between px-1">
        <Label>{title}</Label>
        {right}
      </div>
      {children}
    </section>
  )
}

/* ---------- animated number / bar ---------- */

export function Bar({ value, tone = 'brass', className }: { value: number; tone?: 'brass' | 'followed' | 'overruled' | 'steel'; className?: string }) {
  const bg = { brass: 'bg-brass', followed: 'bg-followed', overruled: 'bg-overruled', steel: 'bg-steel' }[tone]
  return (
    <div className={cx('h-1 w-full overflow-hidden rounded-full bg-graphite', className)}>
      <motion.div className={cx('h-full rounded-full', bg)} initial={{ width: 0 }} animate={{ width: `${Math.round(value * 100)}%` }} transition={{ duration: 1.1, ease }} />
    </div>
  )
}

export function Ring({ value, size = 120, stroke = 6, tone = '#c9a868', children }: { value: number; size?: number; stroke?: number; tone?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#232329" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} stroke={tone} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.min(1, Math.max(0, value))) }}
          transition={{ duration: 1.2, ease }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

/* ---------- source sheet (every legal conclusion opens to its paragraph) ---------- */

export function SourceChip({ s, onOpen }: { s: SourceRef; onOpen: (s: SourceRef) => void }) {
  const short = s.title.split(' v. ')[0].replace(/ & Industries| Pvt\. Ltd\./g, '')
  return (
    <button onClick={() => onOpen(s)} className="inline-flex max-w-full items-center gap-1 rounded-full bg-graphite px-2.5 py-1 text-[11px] text-steel hover:text-marble">
      <span className="truncate">{short}{s.paragraph !== '—' ? ` ¶${s.paragraph}` : ''}</span>
    </button>
  )
}

export function NoAuthority() {
  return <span className="serif italic text-overruled/90">No verified authority found.</span>
}

export function SourceSheet({ s, onClose }: { s: SourceRef | null; onClose: () => void }) {
  useEffect(() => {
    if (!s) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [s, onClose])
  return (
    <AnimatePresence>
      {s && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-xl rounded-t-sheet bg-velvet p-5 safe-b hairline"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ duration: 0.45, ease }}
            drag="y" dragConstraints={{ top: 0 }} dragElastic={0.15} onDragEnd={(_, i) => i.offset.y > 90 && onClose()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-seam" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label className="mb-1">{s.kind} · {s.court || 'statute'}</Label>
                <h3 className="serif text-[22px] leading-tight text-marble">{s.title}</h3>
                <p className="mt-1 text-[12px] text-smoke">{s.date}{s.paragraph !== '—' ? ` · para ${s.paragraph}` : ''}</p>
              </div>
              <button onClick={onClose} className="rounded-full p-2 text-smoke hover:text-marble" aria-label="Close"><X size={18} /></button>
            </div>
            <blockquote className="serif mt-4 border-l-2 border-brass/60 pl-4 text-[17px] leading-relaxed text-marble/90">
              {s.snippet}
            </blockquote>
            <a href={s.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-[12px] uppercase tracking-[0.1em] text-brass">
              Open on Indian Kanoon <ExternalLink size={13} />
            </a>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/* ---------- data hook ---------- */

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, set] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true })
  useEffect(() => {
    let alive = true
    set({ loading: true })
    fn().then((data) => alive && set({ data, loading: false })).catch((e) => alive && set({ error: String(e), loading: false }))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-card bg-graphite', className)} />
}

export function Empty({ text }: { text: string }) {
  return <p className="px-1 py-8 text-center text-[13px] text-smoke">{text}</p>
}

export const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease },
}

export const stagger = (i: number) => ({ ...fadeUp, transition: { ...fadeUp.transition, delay: 0.05 * i } })
