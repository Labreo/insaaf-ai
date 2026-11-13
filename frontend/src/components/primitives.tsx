import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, BookOpen, ExternalLink, RefreshCw, X } from 'lucide-react'
import type { Confidence, SourceRef } from '@/lib/types'
import { useDB } from '@/lib/store'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'

export const ease = [0.16, 1, 0.3, 1] as const

export function Card({
  children,
  className,
  onClick,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-[6px] border border-line bg-surface p-4 shadow-[var(--shadow-card)]',
        onClick && 'cursor-pointer transition-colors hover:border-line-strong hover:bg-sunken/50',
        className,
      )}
    >
      {children}
    </div>
  )
}

export const Glass = Card

export function Well({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-[5px] border border-line bg-sunken px-3.5 py-2.5', className)}>
      {children}
    </div>
  )
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('eyebrow', className)}>{children}</p>
}

export function Section({
  title,
  subtitle,
  right,
  children,
  className,
  id,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <section id={id} className={cn('scroll-mt-20 space-y-3', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
          {subtitle && <span className="text-[12px] text-ink-3">{subtitle}</span>}
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

export function PageHeader({
  kicker,
  title,
  description,
  right,
}: {
  kicker: string
  title: ReactNode
  description?: string
  right?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
      <div className="min-w-0 space-y-1">
        <p className="eyebrow">{kicker}</p>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{title}</h1>
        {description && <p className="max-w-2xl text-[13px] text-ink-2">{description}</p>}
      </div>
      {right && <div className="flex max-w-full flex-wrap items-center gap-2">{right}</div>}
    </div>
  )
}

export function Title({
  kicker,
  children,
  right,
}: {
  kicker?: string
  children: ReactNode
  right?: ReactNode
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        {kicker && <p className="eyebrow mb-1">{kicker}</p>}
        <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.02em] text-ink">{children}</h1>
      </div>
      {right}
    </div>
  )
}

export type Tone = 'neutral' | 'smoke' | 'navy' | 'brass' | 'ok' | 'followed' | 'warn' | 'distinguished' | 'bad' | 'overruled' | 'info' | 'steel'

const toneClass: Record<Tone, string> = {
  neutral: 'border-line bg-sunken text-ink-2',
  smoke: 'border-line bg-sunken text-ink-2',
  navy: 'border-navy-100 bg-navy-50 text-navy',
  brass: 'border-brass-200 bg-brass-50 text-brass',
  ok: 'border-ok-200 bg-ok-50 text-ok',
  followed: 'border-ok-200 bg-ok-50 text-ok',
  warn: 'border-warn-200 bg-warn-50 text-warn',
  distinguished: 'border-warn-200 bg-warn-50 text-warn',
  bad: 'border-bad-200 bg-bad-50 text-bad',
  overruled: 'border-bad-200 bg-bad-50 text-bad',
  info: 'border-info-200 bg-info-50 text-info',
  steel: 'border-info-200 bg-info-50 text-info',
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: Tone
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[4px] border px-2 py-0.5 text-[11px] font-medium leading-[1.35] whitespace-nowrap',
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export const Chip = Badge

export function ConfidenceDot({ c }: { c: Confidence }) {
  const map: Record<Confidence, { dot: string; label: string }> = {
    high: { dot: 'bg-ok', label: 'high confidence' },
    medium: { dot: 'bg-warn', label: 'medium confidence' },
    low: { dot: 'bg-bad', label: 'low confidence' },
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-3">
      <span className={cn('h-1.5 w-1.5 rounded-full', map[c].dot)} />
      {map[c].label}
    </span>
  )
}

export function Bar({
  value,
  tone = 'navy',
  className,
}: {
  value: number
  tone?: 'navy' | 'brass' | 'ok' | 'followed' | 'warn' | 'distinguished' | 'bad' | 'overruled' | 'info' | 'steel'
  className?: string
}) {
  const fillMap: Record<string, string> = {
    navy: 'bg-navy',
    brass: 'bg-brass',
    ok: 'bg-ok',
    followed: 'bg-ok',
    warn: 'bg-warn',
    distinguished: 'bg-warn',
    bad: 'bg-bad',
    overruled: 'bg-bad',
    info: 'bg-info',
    steel: 'bg-info',
  }
  const pct = Math.max(0, Math.min(100, value * 100))
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-line', className)}>
      <motion.div
        className={cn('h-full rounded-full', fillMap[tone] ?? 'bg-navy')}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.45, ease }}
      />
    </div>
  )
}

export function Ring({
  value,
  size = 104,
  stroke = 6,
  tone = '#1f3a5c',
  children,
}: {
  value: number
  size?: number
  stroke?: number
  tone?: string
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#e5e2d9" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={tone}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - Math.min(1, Math.max(0, value))) }}
          transition={{ duration: 0.65, ease }}
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
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        sfx.tick()
        onOpen(s)
      }}
      className="inline-flex max-w-full items-center gap-1 rounded-[4px] border border-info-200 bg-info-50 px-2 py-0.5 font-mono text-[11px] text-info transition-colors hover:border-navy hover:bg-navy-50 hover:text-navy"
    >
      <BookOpen size={11} className="shrink-0 opacity-75" />
      <span className="truncate">
        {short}
        {s.paragraph && s.paragraph !== '—' ? ` ¶${s.paragraph}` : ''}
      </span>
    </button>
  )
}

export function NoAuthority() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-bad-200 bg-bad-50 px-2.5 py-0.5 text-[13px] font-medium text-bad">
      No verified authority found.
    </span>
  )
}

export function SourceSheet({ s, onClose }: { s: SourceRef | null; onClose: () => void }) {
  useEffect(() => {
    if (!s) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [s, onClose])

  return (
    <AnimatePresence>
      {s && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-ink/30 backdrop-blur-[1px]"
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Legal Authority Inspector"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.28, ease }}
            className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-line bg-surface shadow-[var(--shadow-sheet)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
              <div className="min-w-0">
                <p className="eyebrow">
                  Legal Authority Inspector · {s.kind} · {s.court || 'Statute'}
                </p>
                <h2 className="serif mt-1 text-[23px] leading-snug font-medium text-ink">{s.title}</h2>
                <p className="mt-1 font-mono text-[11px] text-ink-3">
                  {s.date}
                  {s.paragraph && s.paragraph !== '—' ? ` · Paragraph ${s.paragraph}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close authority inspector"
                className="rounded-[5px] border border-line p-1.5 text-ink-3 hover:bg-sunken hover:text-ink"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <div>
                <p className="eyebrow mb-2">Verified Excerpt on Record</p>
                <blockquote className="serif rounded-[6px] border border-line border-l-[3px] border-l-brass bg-sunken px-4 py-3.5 text-[16px] leading-[1.7] text-ink">
                  {s.snippet}
                </blockquote>
              </div>

              <Well className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                <span className="font-mono text-ink-3">Source ID: {s.source_id}</span>
                <span className="text-ok font-medium">Cached & Authority-Locked</span>
              </Well>
            </div>

            <div className="flex items-center justify-between border-t border-line bg-sunken px-6 py-3.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-[5px] border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 hover:bg-hover"
              >
                Close
              </button>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-[5px] bg-navy px-3.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-navy-600"
              >
                Open on Indian Kanoon <ExternalLink size={13} />
              </a>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  )
}

/* ---------- data ---------- */

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const rev = useDB((s) => s.rev)
  const [state, set] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    set((prev) => ({ ...prev, loading: !prev.data, error: undefined }))
    fn()
      .then((data) => {
        if (alive) set({ data, loading: false, error: undefined })
      })
      .catch((e) => {
        if (alive) set((prev) => ({ ...prev, error: e instanceof Error ? e.message : String(e), loading: false }))
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, rev, tick])

  return { ...state, reload: () => setTick((t) => t + 1) }
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton border border-line', className)} />
}

export function ErrorBanner({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[6px] border border-bad-200 bg-bad-50 px-4 py-3 text-[13px] text-bad">
      <div className="flex items-center gap-2">
        <AlertTriangle size={15} className="shrink-0" />
        <span>{error}</span>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-[4px] border border-bad-200 bg-surface px-2.5 py-1 text-[12px] font-medium text-bad hover:bg-bad-50"
        >
          <RefreshCw size={12} /> Retry
        </button>
      )}
    </div>
  )
}

export function Empty({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-10 text-center">
      <p className="text-[13px] text-ink-3">{text}</p>
      {action}
    </Card>
  )
}

export const fadeUp = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease },
}

export const stagger = (i: number) => ({
  ...fadeUp,
  transition: { ...fadeUp.transition, delay: Math.min(0.15, 0.02 * i) },
})

export function Stat({
  value,
  label,
  sub,
  tone,
}: {
  value: ReactNode
  label: string
  sub?: string
  tone?: 'navy' | 'brass' | 'ok' | 'followed' | 'warn' | 'bad' | 'overruled'
}) {
  const color =
    tone === 'bad' || tone === 'overruled'
      ? 'text-bad'
      : tone === 'warn' || tone === 'brass'
        ? 'text-warn'
        : tone === 'ok' || tone === 'followed'
          ? 'text-ok'
          : tone === 'navy'
            ? 'text-navy'
            : 'text-ink'

  return (
    <Card className="px-4 py-3.5">
      <p className="eyebrow">{label}</p>
      <p className={cn('tabular mt-1.5 text-[24px] leading-none font-semibold tracking-[-0.02em]', color)}>{value}</p>
      {sub && <p className="mt-1.5 text-[11px] text-ink-3">{sub}</p>}
    </Card>
  )
}
