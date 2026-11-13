import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { ShieldCheck, ShieldOff } from 'lucide-react'
import { api } from '@/lib/api'
import type { BiasFirewall, Identity } from '@/lib/types'
import {
  Badge,
  Card,
  ErrorBanner,
  Label,
  Skeleton,
  ease,
  useAsync,
} from '@/components/primitives'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'
import type { TabProps } from '../Matter'

const identities: { k: Identity; label: string }[] = [
  { k: 'baseline', label: 'Baseline' },
  { k: 'muslim', label: 'Muslim' },
  { k: 'dalit', label: 'Dalit' },
  { k: 'tribal', label: 'Tribal' },
  { k: 'female', label: 'Female' },
  { k: 'non_english_speaking', label: 'Non-English' },
]

/** F9 + F10 + F2: Outcome band, court-aware pooling, and live 6-identity Bias Firewall. */
export default function ScoreTab({ id, onReview }: TabProps) {
  const s = useAsync(() => api.score(id), [id])
  const b = useAsync(() => api.biasFirewall(id), [id])

  if (s.loading && !s.data) return <Skeleton className="h-96" />
  if (s.error && !s.data) return <ErrorBanner error={s.error} onRetry={s.reload} />
  if (!s.data) return null

  const sc = s.data
  const bandColor =
    sc.band === 'strong' ? 'text-ok' : sc.band === 'weak' ? 'text-bad' : 'text-warn'
  const maxAbs = Math.max(...sc.factors.map((f) => Math.abs(f.effect)), 0.01)

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="space-y-4 lg:col-span-6">
        <Card className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Label>Insaaf AI-B Outcome Band · {sc.model_version}</Label>
              <p className={cn('mt-1 text-[32px] leading-none font-semibold capitalize', bandColor)}>
                {sc.band}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onReview({
                  target: 'score',
                  target_id: 'score',
                  title: `Disagree with "${sc.band}" outcome band`,
                })
              }
              className="rounded-[5px] border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-navy hover:bg-navy-50"
            >
              Disagree / Override →
            </button>
          </div>
          <p className="text-[12px] text-ink-3">
            Calibrated outcome band rather than an uncalibrated percentage.{' '}
            <strong className="font-medium text-ink">B</strong> denotes scores released strictly after counterfactual bias verification.
          </p>
        </Card>

        <Card>
          <Label>Feature Attributions</Label>
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
                <div className="relative mt-1.5 h-2 w-full rounded-sm bg-sunken border border-line">
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
          <Card>
            <Label>F10 · Court-Aware Shrinkage</Label>
            <p className="mt-1.5 text-[14px] font-semibold text-ink">{sc.court_aware.court}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
              {sc.court_aware.n_judgments} local judgments pooled with {sc.court_aware.pooled_from} (k ={' '}
              {sc.court_aware.shrinkage_k}). Court level only, never named judges.
            </p>
          </Card>
          <Card>
            <Label>Held-Out Calibration Eval</Label>
            <p className="tabular mt-1.5 font-mono text-[14px] font-semibold text-ink">
              {sc.eval.heldout_total
                ? `${sc.eval.heldout_correct} / ${sc.eval.heldout_total} unseen cases`
                : 'Pending retrain'}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
              {sc.eval.brier != null ? `Brier ${sc.eval.brier} · ` : ''}
              {sc.eval.note}
            </p>
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

  useEffect(() => {
    setRows(data.rows)
  }, [data])

  const passed = rows.every((r) => Math.abs(r.delta) <= data.epsilon)

  const flip = async (k: Identity) => {
    setBusy(k)
    setErr(null)
    sfx.tick()
    try {
      const r = await api.flip(id, k)
      setRows((rs) => rs.map((x) => (x.identity === k ? r : x)))
      sfx.accept()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const W = 360
  const H = 64
  const pts = rows
    .map((r, i) => `${(i / Math.max(1, rows.length - 1)) * W},${H / 2 - r.delta * 900}`)
    .join(' ')

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div>
          <Label>F2 · Counterfactual Bias Firewall (ε = {data.epsilon})</Label>
          <p className="mt-0.5 text-[12px] text-ink-3">6-identity invariance gate before score release</p>
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
        Click any protected identity below to inject counterfactual markers, mask via NER, and re-run scoring live. If score movement exceeds ε = {data.epsilon}, Insaaf blocks the score.
      </p>

      <div className="rounded-[5px] border border-line bg-sunken p-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full overflow-visible">
          <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="#d4d0c4" />
          <line
            x1={0}
            y1={H / 2 - data.epsilon * 900}
            x2={W}
            y2={H / 2 - data.epsilon * 900}
            stroke="#c4e0cf"
            strokeDasharray="3 4"
          />
          <line
            x1={0}
            y1={H / 2 + data.epsilon * 900}
            x2={W}
            y2={H / 2 + data.epsilon * 900}
            stroke="#c4e0cf"
            strokeDasharray="3 4"
          />
          <polyline
            points={pts}
            fill="none"
            stroke={passed ? '#2e7350' : '#b03a2e'}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {rows.map((r, i) => (
            <circle
              key={r.identity}
              cx={(i / Math.max(1, rows.length - 1)) * W}
              cy={H / 2 - r.delta * 900}
              r={4}
              fill={passed ? '#2e7350' : '#b03a2e'}
            />
          ))}
        </svg>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {identities.map(({ k, label }) => {
          const r = rows.find((x) => x.identity === k) ?? { identity: k, score: 0, delta: 0 }
          const ok = Math.abs(r.delta) <= data.epsilon
          return (
            <button
              key={k}
              type="button"
              onClick={() => flip(k)}
              disabled={busy !== null}
              className={cn(
                'rounded-[5px] border border-line bg-sunken p-3 text-left transition-colors hover:border-navy hover:bg-navy-50/40',
                busy === k && 'animate-pulse',
              )}
            >
              <p className="text-[12.5px] font-semibold text-ink">{label}</p>
              <p className="tabular mt-1 font-mono text-[11px] text-ink-3">
                {r.score.toFixed(2)}{' '}
                <span className={ok ? 'font-medium text-ok' : 'font-medium text-bad'}>
                  Δ{r.delta.toFixed(2)}
                </span>
              </p>
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
