import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, ShieldAlert, X } from 'lucide-react'
import { api } from '@/lib/api'
import { useDB, can, openAuth } from '@/lib/store'
import type { AdviceRoute, Fact, ReasonCode, ReviewInput, Score } from '@/lib/types'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'
import { ease, Well } from './primitives'

const reasons: { k: ReasonCode; label: string }[] = [
  { k: 'wrong_fact', label: 'Wrong fact' },
  { k: 'wrong_law', label: 'Wrong law' },
  { k: 'wrong_citation_treatment', label: 'Citation treatment' },
  { k: 'score_disagree', label: 'Score disagree' },
  { k: 'bias_concern', label: 'Bias concern' },
  { k: 'other', label: 'Other' },
]

const BANDS: { k: Score['band']; label: string }[] = [
  { k: 'strong', label: 'Strong' },
  { k: 'moderate', label: 'Moderate' },
  { k: 'uncertain', label: 'Uncertain' },
  { k: 'weak', label: 'Weak' },
]

const ADVICE_ROUTES: { k: AdviceRoute; label: string }[] = [
  { k: 'fight', label: 'Fight / Proceed' },
  { k: 'mediate', label: 'Mediate (s.89 / s.12A)' },
  { k: 'settle', label: 'Settle / Lok Adalat' },
  { k: 'plea_bargain', label: 'Plea Bargain (BNSS)' },
]

export interface ReviewRequest {
  target: ReviewInput['target']
  target_id: string
  title: string
  action?: ReviewInput['action']
}

/**
 * F11 + F13: every advocate review, edit, or override is recorded in the
 * SHA-256 hash-chained reviewer ledger and becomes a retraining label.
 */
export default function ReviewDrawer({
  matterId,
  req,
  onClose,
  onDone,
}: {
  matterId: string
  req: ReviewRequest | null
  onClose: () => void
  onDone?: () => void
}) {
  const role = useDB((d) => d.me.role)
  const [reason, setReason] = useState<ReasonCode>('score_disagree')
  const [note, setNote] = useState('')
  const [factStatus, setFactStatus] = useState<Fact['status']>('documented')
  const [scoreBand, setScoreBand] = useState<Score['band']>('uncertain')
  const [adviceRoute, setAdviceRoute] = useState<AdviceRoute>('mediate')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const action = req?.action ?? 'override'
  const canDecide = can(`review.${action}`)

  useEffect(() => {
    if (!req) return
    setErr(null)
    if (req.target === 'fact') {
      setReason('wrong_fact')
      setFactStatus('documented')
      setNote(req.target_id === 'new' ? '' : req.title)
    } else if (req.target === 'citation') {
      setReason('wrong_citation_treatment')
      setNote('')
    } else if (req.target === 'proof') {
      setReason('wrong_law')
      setNote('')
    } else if (req.target === 'advice') {
      setReason('wrong_law')
      setAdviceRoute('mediate')
      setNote('')
    } else {
      setReason('score_disagree')
      setScoreBand('moderate')
      setNote('')
    }
  }, [req])

  useEffect(() => {
    if (!req) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [req, onClose])

  const submit = async () => {
    if (!req || !canDecide || busy) return
    const trimmed = note.trim()
    if (req.target === 'fact' && action === 'edit' && !trimmed) {
      setErr('Enter the fact statement before saving.')
      return
    }
    if (action === 'override' && !trimmed) {
      setErr('Enter the senior counsel rationale for overriding this finding.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      let diff: Record<string, unknown> | undefined
      if (req.target === 'fact' && action !== 'delete') {
        diff = { status: factStatus }
      } else if (req.target === 'score' && action === 'override') {
        diff = { band: scoreBand }
      } else if (req.target === 'advice' && action === 'override') {
        diff = { recommendation: adviceRoute }
      }
      await api.review(matterId, {
        action,
        target: req.target,
        target_id: req.target_id,
        reason_code: action === 'approve' || action === 'submit' ? 'other' : reason,
        note: trimmed || note,
        diff,
      })
      sfx.seal()
      setNote('')
      onDone?.()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {req && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-night/75 backdrop-blur-[2px]"
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Advocate Review & Ledger Seal"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.26, ease }}
            className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-line-strong bg-surface shadow-[var(--shadow-sheet)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
              <div className="min-w-0">
                <p className="eyebrow">
                  Advocate Review · {action} · {req.target}
                </p>
                <h2 className="mt-1 text-[17px] font-semibold text-ink">{req.title}</h2>
                <p className="mt-0.5 text-[12px] text-ink-3">
                  Appended to the SHA-256 hash-chained reviewer ledger with actor, role, and timestamp.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close review drawer"
                className="rounded-[5px] border border-line p-1.5 text-ink-3 hover:bg-sunken hover:text-ink"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {!canDecide && (
                <div className="space-y-2.5 rounded-[6px] border border-warn-200 bg-warn-50 p-3.5 text-[13px] text-warn">
                  <div className="flex items-start gap-2">
                    <ShieldAlert size={16} className="mt-0.5 shrink-0" />
                    <p>
                      {action === 'edit' || action === 'submit' || action === 'delete'
                        ? 'A senior or junior advocate'
                        : (
                          <>
                            A <strong className="font-semibold">Senior Advocate</strong>
                          </>
                        )}{' '}
                      is required to {action} this item. You are currently signed in as{' '}
                      <span className="font-medium capitalize">{role}</span>.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      sfx.tick()
                      openAuth({ prefill: 'senior_1', notice: 'Sign in as a senior advocate to approve or override.' })
                    }}
                    className="rounded-[5px] border border-warn-200 bg-surface px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-hover"
                  >
                    Sign in as Senior Counsel
                  </button>
                </div>
              )}

              {req.target === 'fact' && action !== 'delete' && (
                <div className="space-y-2">
                  <p className="eyebrow">Evidentiary Fact Status</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['documented', 'alleged', 'disputed', 'unknown'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => {
                          sfx.tick()
                          setFactStatus(st)
                        }}
                        className={cn(
                          'rounded-[5px] border px-2 py-1.5 text-[12px] capitalize transition-colors',
                          factStatus === st
                            ? 'border-navy bg-navy-50 font-medium text-navy'
                            : 'border-line bg-sunken text-ink-2 hover:bg-hover',
                        )}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {req.target === 'score' && action === 'override' && (
                <div className="space-y-2">
                  <p className="eyebrow">Advocate Assessment Band</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {BANDS.map((b) => (
                      <button
                        key={b.k}
                        type="button"
                        onClick={() => {
                          sfx.tick()
                          setScoreBand(b.k)
                        }}
                        className={cn(
                          'rounded-[5px] border px-2.5 py-2 text-center text-[12px] transition-colors',
                          scoreBand === b.k
                            ? 'border-navy bg-navy font-semibold text-night'
                            : 'border-line bg-sunken text-ink-2 hover:bg-hover',
                        )}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {req.target === 'advice' && action === 'override' && (
                <div className="space-y-2">
                  <p className="eyebrow">Preferred Strategic Route</p>
                  <div className="grid grid-cols-2 gap-2">
                    {ADVICE_ROUTES.map((rt) => (
                      <button
                        key={rt.k}
                        type="button"
                        onClick={() => {
                          sfx.tick()
                          setAdviceRoute(rt.k)
                        }}
                        className={cn(
                          'rounded-[5px] border px-3 py-2 text-left text-[12px] transition-colors',
                          adviceRoute === rt.k
                            ? 'border-navy bg-navy font-semibold text-night'
                            : 'border-line bg-sunken text-ink-2 hover:bg-hover',
                        )}
                      >
                        {rt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {action !== 'approve' && action !== 'submit' && (
                <div className="space-y-2">
                  <p className="eyebrow">Reason Code (Used for ML Calibration)</p>
                  <div className="grid grid-cols-2 gap-2">
                    {reasons.map((r) => (
                      <button
                        key={r.k}
                        type="button"
                        onClick={() => {
                          sfx.tick()
                          setReason(r.k)
                        }}
                        className={cn(
                          'rounded-[5px] border px-3 py-2 text-left text-[12px] transition-colors',
                          reason === r.k
                            ? 'border-navy bg-navy-50 font-medium text-navy'
                            : 'border-line bg-sunken text-ink-2 hover:bg-hover',
                        )}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="eyebrow">
                  {req.target === 'fact'
                    ? action === 'delete'
                      ? 'Reason for Deleting Fact'
                      : 'Fact Statement / Verification Note'
                    : 'Advocate Rationale & Note'}
                </p>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  placeholder={
                    action === 'approve' || action === 'submit'
                      ? 'Optional note for the chamber record…'
                      : req.target === 'fact' && action === 'edit'
                        ? 'Enter the verified factual statement grounded in the record…'
                        : 'State why the finding or score is edited or overridden…'
                  }
                  className="field"
                />
              </div>

              <Well className="text-[12px] text-ink-2">
                Overrides are appended to the immutable ledger and converted into supervised calibration labels on the next model retrain.
              </Well>

              {err && (
                <div role="alert" className="rounded-[5px] border border-bad-200 bg-bad-50 px-3 py-2 text-[12px] text-bad">
                  {err}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-line bg-sunken px-6 py-3.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-[5px] border border-line-strong bg-surface px-3.5 py-1.5 text-[12px] font-medium text-ink-2 hover:bg-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canDecide || busy}
                onClick={() => void submit()}
                className="inline-flex items-center gap-1.5 rounded-[5px] bg-navy px-4 py-1.5 text-[12px] font-semibold text-night transition-colors hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check size={14} />
                {busy
                  ? 'Sealing…'
                  : action === 'approve'
                    ? 'Approve & Seal to Ledger'
                    : action === 'submit'
                      ? 'Submit for Senior Review'
                      : action === 'delete'
                        ? 'Confirm Delete & Seal'
                        : action === 'edit'
                          ? 'Save Edit & Seal'
                          : 'Record Override & Seal'}
              </button>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  )
}
