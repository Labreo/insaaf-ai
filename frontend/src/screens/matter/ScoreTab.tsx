import { useState } from 'react'
import { motion } from 'motion/react'
import { ShieldCheck, ShieldOff } from 'lucide-react'
import { api } from '@/lib/api'
import { useDB } from '@/lib/store'
import type { BiasFirewall, Identity } from '@/lib/types'
import { Chip, Glass, Label, Skeleton, ease, useAsync } from '@/components/primitives'
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

/** F9 + F10 + F2: Outcome band, court-aware pooling, and live counterfactual bias firewall. */
export default function ScoreTab({ id, onReview }: TabProps) {
  const v = useDB((d) => d.stages[id]?.score.band + ':' + d.stages[id]?.score.model_version)
  const s = useAsync(() => api.score(id), [id, v])
  const b = useAsync(() => api.biasFirewall(id), [id, v])
  if (s.loading || !s.data) return <Skeleton className="h-96" />
  const sc = s.data
  const bandTone = sc.band === 'strong' ? 'text-followed' : sc.band === 'weak' ? 'text-overruled' : 'text-distinguished'
  const maxAbs = Math.max(...sc.factors.map((f) => Math.abs(f.effect)), 0.01)

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left 6 Cols: Score Band, Feature Attribution & Court Pooling */}
      <div className="space-y-4 lg:col-span-6">
        <Glass className="space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <Label>Insaaf AI-B score · {sc.model_version}</Label>
              <p className={cn('mt-1 text-[34px] leading-none font-medium capitalize', bandTone)}>{sc.band}</p>
            </div>
            <button onClick={() => onReview({ target: 'score', target_id: 'score', title: `Disagree with "${sc.band}"` })} className="rounded-md border border-seam bg-graphite px-2.5 py-1 text-[11px] font-medium text-brass hover:border-brass/40">
              disagree →
            </button>
          </div>
          <p className="text-[12px] text-smoke">Calibrated outcome band (not an uncalibrated percentage). <strong className="text-pewter">B</strong> = released strictly after counterfactual bias verification.</p>
        </Glass>

        <Glass>
          <Label>Feature attributions</Label>
          <div className="mt-3 space-y-3">
            {sc.factors.map((f, i) => (
              <div key={f.name}>
                <div className="flex justify-between text-[13px]">
                  <span className="text-marble">{f.name}</span>
                  <span className={cn('font-mono tabular-nums', f.effect >= 0 ? 'text-followed' : 'text-overruled')}>
                    {f.effect > 0 ? '+' : ''}{f.effect.toFixed(2)}
                  </span>
                </div>
                <div className="relative mt-1.5 h-1.5 w-full rounded-sm bg-marble/8">
                  <span className="absolute left-1/2 top-0 h-full w-px bg-marble/25" />
                  <motion.div
                    className={cn('absolute top-0 h-full rounded-sm', f.effect >= 0 ? 'bg-followed left-1/2' : 'bg-overruled right-1/2')}
                    initial={{ width: 0 }}
                    animate={{ width: `${(Math.abs(f.effect) / maxAbs) * 50}%` }}
                    transition={{ duration: 0.7, delay: 0.05 * i, ease }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Glass>

        <div className="grid gap-4 sm:grid-cols-2">
          <Glass>
            <Label>Court-aware shrinkage</Label>
            <p className="mt-1.5 text-[14px] font-medium text-marble">{sc.court_aware.court}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-smoke">
              {sc.court_aware.n_judgments} local judgments pooled with {sc.court_aware.pooled_from} (k = {sc.court_aware.shrinkage_k}). Court level only, never named judges.
            </p>
          </Glass>
          <Glass>
            <Label>Held-out evaluation</Label>
            <p className="mt-1.5 font-mono text-[14px] font-medium text-marble">
              {sc.eval.heldout_total ? `${sc.eval.heldout_correct} / ${sc.eval.heldout_total} unseen cases` : 'Pending retrain'}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-smoke">
              {sc.eval.brier != null ? `Brier ${sc.eval.brier} · ` : ''}Measured directly on held-out eval split.
            </p>
          </Glass>
        </div>
      </div>

      {/* Right 6 Cols: Interactive Counterfactual Bias Firewall */}
      <div className="lg:col-span-6">
        {b.data && <Firewall id={id} data={b.data} />}
      </div>
    </div>
  )
}

function Firewall({ id, data }: { id: string; data: BiasFirewall }) {
  const [rows, setRows] = useState(data.rows)
  const [busy, setBusy] = useState<Identity | null>(null)
  const passed = rows.every((r) => Math.abs(r.delta) <= data.epsilon)

  const flip = async (k: Identity) => {
    setBusy(k)
    sfx.tick()
    const r = await api.flip(id, k)
    setRows((rs) => rs.map((x) => (x.identity === k ? r : x)))
    setBusy(null)
    sfx.accept()
  }

  const W = 360
  const H = 56
  const pts = rows.map((r, i) => `${(i / (rows.length - 1)) * W},${H / 2 - r.delta * 900}`).join(' ')

  return (
    <Glass className="space-y-4">
      <div className="flex items-center justify-between border-b border-seam pb-3">
        <div>
          <Label>Bias firewall · ε = {data.epsilon}</Label>
          <p className="mt-1 text-[12px] text-smoke">Counterfactual identity invariance gate</p>
        </div>
        <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-medium', passed ? 'border-followed/30 bg-followed/10 text-followed' : 'border-overruled/30 bg-overruled/10 text-overruled')}>
          {passed ? <><ShieldCheck size={14} /> passed</> : <><ShieldOff size={14} /> abstaining</>}
        </span>
      </div>

      <p className="text-[12px] leading-relaxed text-pewter">
        Select any protected identity to inject counterfactual markers, mask via NER, and re-run scoring. If score movement exceeds ε = {data.epsilon}, Insaaf refuses to release the score.
      </p>

      <div className="rounded-md border border-seam bg-graphite/60 p-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-14 w-full overflow-visible">
          <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="rgba(242,241,238,0.14)" />
          <line x1={0} y1={H / 2 - data.epsilon * 900} x2={W} y2={H / 2 - data.epsilon * 900} stroke="rgba(242,241,238,0.14)" strokeDasharray="3 4" />
          <line x1={0} y1={H / 2 + data.epsilon * 900} x2={W} y2={H / 2 + data.epsilon * 900} stroke="rgba(242,241,238,0.14)" strokeDasharray="3 4" />
          <polyline points={pts} fill="none" stroke={passed ? '#6fae8d' : '#d95c54'} strokeWidth={2} strokeLinejoin="round" />
          {rows.map((r, i) => (
            <circle key={r.identity} cx={(i / (rows.length - 1)) * W} cy={H / 2 - r.delta * 900} r={3.5} fill={passed ? '#6fae8d' : '#d95c54'} />
          ))}
        </svg>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {identities.map(({ k, label }) => {
          const r = rows.find((x) => x.identity === k)!
          return (
            <button
              key={k}
              onClick={() => flip(k)}
              disabled={busy !== null}
              className={cn('glass-well p-3 text-left transition-colors hover:border-brass/40', busy === k && 'animate-pulse')}
            >
              <p className="text-[13px] font-medium text-marble">{label}</p>
              <p className="mt-1 font-mono text-[11px] tabular-nums text-smoke">
                {r.score.toFixed(2)} <span className={Math.abs(r.delta) > data.epsilon ? 'text-overruled' : 'text-followed'}>Δ{r.delta.toFixed(2)}</span>
              </p>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-seam pt-3">
        <Chip tone="steel">identity masked before scoring</Chip>
        <Chip tone="steel">counterfactual re-run verified</Chip>
      </div>
    </Glass>
  )
}
