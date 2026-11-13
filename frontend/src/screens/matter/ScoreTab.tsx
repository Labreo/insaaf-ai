import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Building2, RotateCcw, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react'
import { api } from '@/lib/api'
import { errorMessage, toast } from '@/lib/feedback'
import { can } from '@/lib/store'
import type { BiasFirewall, Identity, Score } from '@/lib/types'
import {
  Badge,
  Card,
  ErrorBanner,
  Label,
  Skeleton,
  Well,
  ease,
  useAsync,
} from '@/components/primitives'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'
import type { TabProps } from '../Matter'

const DEFAULT_FORUMS = [
  'Civil Judge Senior Division, Mapusa',
  'District Court, North Goa',
  'Bombay High Court (Goa bench)',
  'Supreme Court of India',
]

/** F9 + F10 + F2: Outcome-grounded B-Score prediction, court-aware pooling, and live Bias Firewall. */
export default function ScoreTab({ id, onReview }: TabProps) {
  const s = useAsync(() => api.score(id), [id])
  const b = useAsync(() => api.biasFirewall(id), [id])
  const [liveScore, setLiveScore] = useState<Score | null>(null)
  const [switchingCourt, setSwitchingCourt] = useState(false)
  const [clearingOverride, setClearingOverride] = useState(false)

  const canOverride = can('review.override')
  const canSwitchCourt = can('analysis.run') || can('matter.edit')

  useEffect(() => {
    setLiveScore(null)
  }, [id])

  useEffect(() => {
    if (s.data) setLiveScore(s.data)
  }, [s.data])

  const sc = liveScore ?? s.data
  if (s.loading && !sc) return <Skeleton className="h-96" />
  if (s.error && !sc) return <ErrorBanner error={s.error} onRetry={s.reload} />
  if (!sc) return null

  const forums = Array.from(new Set([sc.court_aware.court, ...DEFAULT_FORUMS].filter(Boolean)))

  const switchCourt = async (court: string) => {
    if (switchingCourt || !canSwitchCourt || court === sc.court_aware.court) return
    setSwitchingCourt(true)
    sfx.tick()
    try {
      const next = await api.setCourt(id, court)
      setLiveScore(next)
      sfx.accept()
      toast(
        'ok',
        `Forum set to ${court}`,
        `Court-aware prior recomputed (pooled ${
          next.court_aware.pooled_rate != null ? `${Math.round(next.court_aware.pooled_rate * 1000) / 10}%` : 'n/a'
        }).`,
      )
    } catch (e) {
      sfx.reject()
      toast('bad', 'Could not switch forum', errorMessage(e))
    } finally {
      setSwitchingCourt(false)
    }
  }

  const clearOverride = async () => {
    if (!canOverride || clearingOverride) return
    setClearingOverride(true)
    sfx.tick()
    try {
      await api.review(id, {
        action: 'override',
        target: 'score',
        target_id: 'score',
        reason_code: 'score_disagree',
        note: 'Cleared advocate override to restore model score band.',
        diff: { clear: true },
      })
      sfx.accept()
      toast('ok', 'Override cleared', 'Model prediction band restored.')
      s.reload()
    } catch (e) {
      sfx.reject()
      toast('bad', 'Could not clear override', errorMessage(e))
    } finally {
      setClearingOverride(false)
    }
  }

  const bandColor =
    sc.band === 'strong'
      ? 'text-ok'
      : sc.band === 'moderate'
        ? 'text-info'
        : sc.band === 'weak'
          ? 'text-bad'
          : 'text-warn'
  const maxAbs = Math.max(...sc.factors.map((f) => Math.abs(f.effect)), 0.01)
  const basis = sc.prediction_basis

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="space-y-4 lg:col-span-6">
        <Card className="space-y-3.5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Label>Insaaf AI-B Outcome Prediction · {sc.model_version}</Label>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-3">
                <p className={cn('text-[32px] font-semibold capitalize leading-none', bandColor)}>
                  {sc.band}
                </p>
                {sc.probability != null && (
                  <span className="tabular rounded-[5px] border border-line bg-sunken px-2.5 py-1 font-mono text-[16px] font-semibold text-ink">
                    {Math.round(sc.probability * 100)}%
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              disabled={!canOverride}
              title={canOverride ? 'Record a senior advocate score override' : 'Only Senior Counsel can record an outcome override'}
              onClick={() =>
                onReview({
                  target: 'score',
                  target_id: 'score',
                  title: `Override "${sc.band}" outcome prediction`,
                })
              }
              className="rounded-[5px] border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-navy hover:bg-navy-50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Disagree / Override &rarr;
            </button>
          </div>

          {sc.override && (
            <Well className="space-y-2 border-brass-200 bg-brass-50/70">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-brass">
                  Advocate assessment: <span className="capitalize">{sc.override.band}</span> (model:{' '}
                  <span className="capitalize">{sc.override.model_band}</span>) · by {sc.override.by}
                </span>
                {canOverride && (
                  <button
                    type="button"
                    disabled={clearingOverride}
                    onClick={() => void clearOverride()}
                    className="inline-flex items-center gap-1 rounded-[4px] border border-line-strong bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-2 hover:text-ink disabled:opacity-50"
                  >
                    <RotateCcw size={10} /> {clearingOverride ? 'Clearing…' : 'Clear override'}
                  </button>
                )}
              </div>
              {sc.override.note && (
                <p className="text-[12px] text-ink-2">&ldquo;{sc.override.note}&rdquo;</p>
              )}
            </Well>
          )}

          {basis && (
            <div className="rounded-[6px] border border-line bg-sunken p-3 text-[12px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-brass">
                  Prediction Blend Basis
                </p>
                <span className="font-mono text-[11px] text-ink-2">
                  {basis.similar_judgments_used} similar judgments ({Math.round(basis.similar_judgments_rate * 100)}% smoothed rate)
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-[4px] border border-line bg-surface px-2 py-1.5">
                  <p className="font-mono text-[13px] font-semibold text-ink">
                    {Math.round(basis.evidence_model_weight * 100)}%
                  </p>
                  <p className="text-[10.5px] text-ink-3">Evidence Model</p>
                </div>
                <div className="rounded-[4px] border border-line bg-surface px-2 py-1.5">
                  <p className="font-mono text-[13px] font-semibold text-brass">
                    {Math.round(basis.similar_judgments_weight * 100)}%
                  </p>
                  <p className="text-[10.5px] text-ink-3">
                    Precedents ({basis.similar_judgments_allowed}/{basis.similar_judgments_used})
                  </p>
                </div>
                <div className="rounded-[4px] border border-line bg-surface px-2 py-1.5">
                  <p className="font-mono text-[13px] font-semibold text-ink">
                    {Math.round(basis.court_prior_weight * 100)}%
                  </p>
                  <p className="text-[10.5px] text-ink-3">Court Prior</p>
                </div>
              </div>
            </div>
          )}

          <p className="text-[12px] text-ink-3">
            Blends evidentiary feature scoring, Beta-smoothed outcomes of retrieved real public judgments, and hierarchical court priors.{' '}
            <strong className="font-medium text-ink">B</strong> denotes release only after passing the counterfactual Bias Firewall.
          </p>
        </Card>

        <Card>
          <Label>Evidence &amp; Precedent Feature Attributions</Label>
          <div className="mt-3 space-y-3">
            {sc.factors.map((f, i) => (
              <div key={f.name}>
                <div className="flex justify-between gap-3 text-[13px]">
                  <span className="text-ink">{f.name}</span>
                  <span className={cn('tabular font-mono font-medium', f.effect >= 0 ? 'text-ok' : 'text-bad')}>
                    {f.effect > 0 ? '+' : ''}
                    {f.effect.toFixed(2)}
                  </span>
                </div>
                <div className="relative mt-1.5 h-2 w-full rounded-sm border border-line bg-sunken">
                  <span className="absolute left-1/2 top-0 h-full w-px bg-line-strong" />
                  <motion.div
                    className={cn(
                      'absolute top-0 h-full rounded-[2px]',
                      f.effect >= 0 ? 'left-1/2 bg-ok' : 'right-1/2 bg-bad',
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: `${(Math.abs(f.effect) / maxAbs) * 48}%` }}
                    transition={{ duration: 0.45, delay: 0.04 * i, ease }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Label>Court-Aware Shrinkage</Label>
                <p className="mt-1.5 text-[14px] font-semibold text-ink">{sc.court_aware.court}</p>
              </div>
              {sc.court_aware.pooled_rate != null && (
                <Badge tone="navy">p&#770; = {(sc.court_aware.pooled_rate * 100).toFixed(1)}%</Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {forums.map((court) => {
                const active = sc.court_aware.court === court
                return (
                  <button
                    key={court}
                    type="button"
                    disabled={switchingCourt || !canSwitchCourt}
                    title={canSwitchCourt ? undefined : 'Your role cannot switch the court forum'}
                    onClick={() => void switchCourt(court)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-[4px] border px-2 py-1 text-[11px] font-medium transition-colors',
                      active
                        ? 'border-navy bg-navy font-semibold text-night'
                        : 'border-line bg-sunken text-ink-2 hover:bg-hover hover:text-ink',
                    )}
                  >
                    <Building2 size={10} /> {court}
                  </button>
                )
              })}
            </div>
            <p className="text-[12px] leading-relaxed text-ink-3">
              {sc.court_aware.n_judgments} local judgments pooled with {sc.court_aware.pooled_from} (k ={' '}
              {sc.court_aware.shrinkage_k}
              {sc.court_aware.local_rate != null
                ? ` · local ${(sc.court_aware.local_rate * 100).toFixed(0)}% / parent ${((sc.court_aware.parent_rate ?? 0) * 100).toFixed(0)}%`
                : ''}
              ). Court level only, never named judges.
            </p>
          </Card>

          <Card className="space-y-2.5">
            <Label>Held-Out Calibration Eval</Label>
            <p className="tabular mt-1 font-mono text-[14px] font-semibold text-ink">
              {sc.eval.heldout_total
                ? `${sc.eval.heldout_correct} / ${sc.eval.heldout_total} unseen cases`
                : 'Pending retrain'}
              {sc.eval.brier != null ? ` · Brier ${sc.eval.brier}` : ''}
            </p>
            {sc.eval.calibration ? (
              <CalibrationPlot pred={sc.eval.calibration.prob_pred} actual={sc.eval.calibration.prob_true} />
            ) : null}
            <p className="text-[12px] leading-relaxed text-ink-3">{sc.eval.note}</p>
          </Card>
        </div>
      </div>

      <div className="lg:col-span-6">
        {b.loading && !b.data ? (
          <Skeleton className="h-96" />
        ) : b.error && !b.data ? (
          <ErrorBanner error={b.error} onRetry={b.reload} />
        ) : b.data ? (
          <Firewall id={id} data={b.data} />
        ) : null}
      </div>
    </div>
  )
}

function Firewall({ id, data }: { id: string; data: BiasFirewall }) {
  const [rows, setRows] = useState(data.rows)
  const [busy, setBusy] = useState<Identity | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const canFlip = can('analysis.run') || can('matter.edit')

  useEffect(() => {
    setRows(data.rows)
  }, [data])

  const passed = data.passed && rows.every((r) => Math.abs(r.delta) <= data.epsilon)

  const flip = async (k: Identity) => {
    if (k === 'baseline' || !canFlip || busy !== null) return
    setBusy(k)
    setErr(null)
    sfx.tick()
    try {
      const r = await api.flip(id, k)
      setRows((rs) => rs.map((x) => (x.identity === k ? { ...x, ...r } : x)))
      sfx.accept()
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const W = 360
  const H = 68
  const yForDelta = (delta: number) => Math.max(8, Math.min(H - 8, H / 2 - delta * 400))
  const pts = rows
    .map((r, i) => `${(i / Math.max(1, rows.length - 1)) * W},${yForDelta(r.delta)}`)
    .join(' ')

  const maxDeltaScale = Math.max(
    data.epsilon * 2,
    ...rows.map((r) => Math.max(Math.abs(r.delta), Math.abs(r.unprotected_delta ?? 0))),
    0.05,
  )

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div>
          <Label>Counterfactual Bias Firewall (&epsilon; = {data.epsilon})</Label>
          <p className="mt-0.5 text-[12px] text-ink-3">
            {rows.length}-identity invariance gate · unprotected vs NER-masked comparison
          </p>
        </div>
        <Badge tone={passed ? 'ok' : 'bad'}>
          {passed ? (
            <>
              <ShieldCheck size={13} /> Passed
            </>
          ) : (
            <>
              <ShieldOff size={13} /> Abstaining
            </>
          )}
        </Badge>
      </div>

      {err && <ErrorBanner error={err} />}

      <p className="text-[12.5px] leading-relaxed text-ink-2">
        Click any counterfactual identity below to mask identity tokens and re-run scoring live. Any protected attribute movement exceeding &epsilon; = {data.epsilon} blocks score release.
      </p>

      {(data.comparison_model || data.max_unprotected_gap != null) && (
        <Well className="space-y-1.5 text-[12px]">
          {data.comparison_model && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-ink">{data.comparison_model}</span>
              {data.max_unprotected_gap != null && (
                <Badge tone="bad">
                  <ShieldAlert size={11} /> Max unprotected gap {(data.max_unprotected_gap * 100).toFixed(1)}%
                </Badge>
              )}
            </div>
          )}
          {data.masked_tokens_example && (
            <p className="font-mono text-[11px] text-ink-3">
              Masked sample: <span className="text-ink-2">{data.masked_tokens_example}</span>
            </p>
          )}
        </Well>
      )}

      <div className="rounded-[5px] border border-line bg-sunken p-3">
        <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] text-ink-3">
          <span>Firewalled &Delta; across {rows.length} identities</span>
          <span className="text-ok">Threshold &plusmn;{data.epsilon}</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full overflow-visible" role="img" aria-label="Counterfactual Bias Firewall delta polyline across protected identities">
          <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="var(--color-line-strong)" />
          <line
            x1={0}
            y1={yForDelta(data.epsilon)}
            x2={W}
            y2={yForDelta(data.epsilon)}
            stroke="var(--color-ok-200)"
            strokeDasharray="3 4"
          />
          <line
            x1={0}
            y1={yForDelta(-data.epsilon)}
            x2={W}
            y2={yForDelta(-data.epsilon)}
            stroke="var(--color-ok-200)"
            strokeDasharray="3 4"
          />
          <polyline
            points={pts}
            fill="none"
            stroke={passed ? 'var(--color-ok)' : 'var(--color-bad)'}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {rows.map((r, i) => (
            <circle
              key={r.identity}
              cx={(i / Math.max(1, rows.length - 1)) * W}
              cy={yForDelta(r.delta)}
              r={3.5}
              fill={passed ? 'var(--color-ok)' : 'var(--color-bad)'}
            />
          ))}
        </svg>
      </div>

      {/* Grouped comparison per identity: Unprotected vs Firewalled */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {rows.map((r) => {
          const isBaseline = r.identity === 'baseline'
          const label = r.label || r.identity.replace(/_/g, ' ')
          const rowOk = Math.abs(r.delta) <= data.epsilon
          const unprotectedDelta = Math.abs(r.unprotected_delta ?? 0)
          const unprotectedWidth = Math.min(100, Math.round((unprotectedDelta / maxDeltaScale) * 100))
          const firewalledWidth = Math.min(100, Math.round((Math.abs(r.delta) / maxDeltaScale) * 100))

          return (
            <button
              key={r.identity}
              type="button"
              disabled={isBaseline || !canFlip || busy !== null}
              title={
                isBaseline
                  ? 'Reference baseline cannot be flipped'
                  : !canFlip
                    ? 'Only Senior Counsel or Junior Advocates can run live counterfactual flips'
                    : `Inject ${label} counterfactual markers and verify invariance`
              }
              onClick={() => void flip(r.identity)}
              className={cn(
                'rounded-[5px] border border-line bg-sunken p-3 text-left transition-colors',
                isBaseline
                  ? 'cursor-default border-navy/40'
                  : canFlip
                    ? 'hover:border-navy hover:bg-navy-50/40'
                    : 'cursor-not-allowed opacity-75',
                busy === r.identity && 'animate-pulse',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12.5px] font-semibold capitalize text-ink">{label}</p>
                {isBaseline ? (
                  <Badge tone="navy">Baseline</Badge>
                ) : (
                  <Badge tone={r.blocked ? 'bad' : rowOk ? 'ok' : 'bad'}>
                    {r.blocked ? 'Blocked' : rowOk ? 'Pass' : 'Drift'}
                  </Badge>
                )}
              </div>

              <div className="mt-2 space-y-1.5 font-mono text-[10.5px]">
                <div className="flex items-center justify-between text-ink-2">
                  <span>Firewalled {r.score.toFixed(2)}</span>
                  <span className={rowOk ? 'font-semibold text-ok' : 'font-semibold text-bad'}>
                    &Delta;{r.delta.toFixed(2)}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                  <div
                    className={cn('h-full rounded-full', rowOk ? 'bg-ok' : 'bg-bad')}
                    style={{ width: `${Math.max(4, firewalledWidth)}%` }}
                  />
                </div>

                {r.unprotected_score != null && (
                  <>
                    <div className="flex items-center justify-between text-ink-3">
                      <span>Unprotected {r.unprotected_score.toFixed(2)}</span>
                      <span className={unprotectedDelta > data.epsilon ? 'text-bad' : 'text-ink-3'}>
                        &Delta;{unprotectedDelta.toFixed(2)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                      <div
                        className="h-full rounded-full bg-bad/75"
                        style={{ width: `${Math.max(4, unprotectedWidth)}%` }}
                      />
                    </div>
                  </>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">
        <Badge tone="info">NER Identity Masked</Badge>
        <Badge tone="info">Counterfactual Re-Run Verified</Badge>
      </div>
    </Card>
  )
}

function CalibrationPlot({ pred, actual }: { pred: number[]; actual: number[] }) {
  const W = 240
  const H = 110
  const padL = 26
  const padR = 10
  const padT = 10
  const padB = 22
  const mapX = (v: number) => padL + v * (W - padL - padR)
  const mapY = (v: number) => H - padB - v * (H - padT - padB)
  const pts = pred.map((x, i) => `${mapX(x)},${mapY(actual[i] ?? x)}`).join(' ')

  return (
    <div className="rounded-[5px] border border-line bg-sunken p-2.5">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-28 w-full overflow-visible"
        role="img"
        aria-label="Calibration reliability curve comparing predicted probabilities with observed outcomes from 0% to 100%"
      >
        {/* Axis lines */}
        <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="var(--color-line-strong)" />
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="var(--color-line-strong)" />
        {/* Perfect calibration diagonal */}
        <line x1={mapX(0)} y1={mapY(0)} x2={mapX(1)} y2={mapY(1)} stroke="var(--color-line-strong)" strokeDasharray="3 3" />
        <polyline points={pts} fill="none" stroke="var(--color-navy)" strokeWidth={2} />
        {pred.map((x, i) => (
          <circle key={i} cx={mapX(x)} cy={mapY(actual[i] ?? x)} r={3} fill="var(--color-gold)" />
        ))}
        {/* Tick Labels */}
        <text x={2} y={mapY(1) + 4} fill="var(--color-ink-3)" fontSize="8" fontFamily="monospace">100%</text>
        <text x={2} y={mapY(0.5) + 3} fill="var(--color-ink-3)" fontSize="8" fontFamily="monospace">50%</text>
        <text x={8} y={mapY(0) + 3} fill="var(--color-ink-3)" fontSize="8" fontFamily="monospace">0%</text>
        <text x={mapX(0)} y={H - 6} fill="var(--color-ink-3)" fontSize="8" fontFamily="monospace">0%</text>
        <text x={mapX(0.45)} y={H - 6} fill="var(--color-ink-3)" fontSize="8" fontFamily="sans-serif">Predicted</text>
        <text x={mapX(1) - 20} y={H - 6} fill="var(--color-ink-3)" fontSize="8" fontFamily="monospace">100%</text>
      </svg>
      <p className="mt-1 flex items-center justify-between font-mono text-[9.5px] text-ink-3">
        <span>Dashed: perfect calibration</span>
        <span className="text-brass">Gold: observed frequency</span>
      </p>
    </div>
  )
}
