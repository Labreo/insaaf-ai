import { useEffect, useRef } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { dismissToast, errorMessage, settleConfirm, toast, useConfirm, useToasts } from '@/lib/feedback'
import { cn } from '@/lib/utils'

const toneStyle = {
  ok: 'border-ok-200 bg-ok-50 text-ok',
  bad: 'border-bad-200 bg-bad-50 text-bad',
  info: 'border-info-200 bg-info-50 text-info',
} as const
const toneIcon = { ok: CheckCircle2, bad: AlertTriangle, info: Info } as const

/** Mounted once in App: toast stack + confirmation dialog. */
export default function Feedback() {
  const toasts = useToasts()
  const req = useConfirm()
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Safety net: any backend action whose handler has no catch surfaces its real error instead of failing silently.
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      const err = e.reason
      if (err instanceof ApiError && err.status === 401) return // session expiry already reopens sign-in
      if (err instanceof DOMException && err.name === 'AbortError') return
      e.preventDefault()
      toast('bad', err instanceof ApiError && err.status === 403 ? 'Not permitted' : 'Action failed', errorMessage(err))
    }
    window.addEventListener('unhandledrejection', onRejection)
    return () => window.removeEventListener('unhandledrejection', onRejection)
  }, [])

  useEffect(() => {
    if (!req) return
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && settleConfirm(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [req])

  return (
    <>
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((t) => {
          const Icon = toneIcon[t.tone]
          return (
            <div
              key={t.id}
              role={t.tone === 'bad' ? 'alert' : 'status'}
              className={cn(
                'pointer-events-auto flex items-start gap-2.5 rounded-[6px] border bg-surface px-3.5 py-3 shadow-[var(--shadow-pop)]',
                toneStyle[t.tone],
              )}
            >
              <Icon size={15} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1 text-[12.5px]">
                <p className="font-medium">{t.title}</p>
                {t.detail && <p className="mt-0.5 break-words text-ink-2">{t.detail}</p>}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismissToast(t.id)}
                className="shrink-0 rounded p-0.5 text-ink-3 hover:text-ink"
              >
                <X size={13} />
              </button>
            </div>
          )
        })}
      </div>

      {req && (
        <div className="fixed inset-0 z-[90] grid place-items-center p-4">
          <div className="fixed inset-0 bg-ink/40" onClick={() => settleConfirm(false)} />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-body"
            className="relative w-full max-w-sm rounded-[8px] border border-line bg-surface p-5 shadow-[var(--shadow-pop)]"
          >
            <h2 id="confirm-title" className="text-[15px] font-semibold text-ink">
              {req.title}
            </h2>
            <p id="confirm-body" className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
              {req.body}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                ref={cancelRef}
                type="button"
                onClick={() => settleConfirm(false)}
                className="rounded-[5px] border border-line-strong bg-surface px-3.5 py-1.5 text-[12px] font-medium text-ink-2 hover:bg-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => settleConfirm(true)}
                className={cn(
                  'rounded-[5px] px-3.5 py-1.5 text-[12px] font-medium text-white',
                  req.tone === 'danger' ? 'bg-bad hover:bg-bad/90' : 'bg-navy hover:bg-navy-600',
                )}
              >
                {req.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
