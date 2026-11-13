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
  { k: 'baseline', label: 'Baseline' }, { k: 'muslim', label: 'Muslim' }, { k: 'dalit', label: 'Dalit' },
  { k: 'tribal', label: 'Tribal' }, { k: 'female', label: 'Female' }, { k: 'non_english_speaking', label: 'Non-English' },
]

/** F9 + F10 + F2: the band, why, court-aware pooling, and the live bias flip test. */
export default function ScoreTab({ id, onReview }: TabProps) {
  const v = useDB((d) => d.stages[id]?.score.band + ':' + d.stages[id]?.score.model_version)
  const s = useAsync(() => api.score(id), [id, v])
  const b = useAsync(() => api.biasFirewall(id), [id])
  if (s.loading || !s.data) return <Skeleton className="h-96" />
  const sc = s.data
  const bandTone = sc.band === 'strong' ? 'text-followed' : sc.band === 'weak' ? 'text-overruled' : 'text-distinguished'
  const maxAbs = Math.max(...sc.factors.map((f) => Math.abs(f.effect)), 0.01)

  return (
    <div className="space-y-4">
      <Glass spotlight className="lamp">
        <div className="flex items-start justify-between">
          <div>
            <Label>Insaaf AI-B score · {sc.model_version}</Label>
            <motion.p key={sc.band} initial={{ opacity: 0, y: 8, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.6, ease }} className={cn('text-display font-normal capitalize', bandTone)}>{sc.band}</motion.p>
          </div>
          <button onClick={() => onReview({ target: 'score', target_id: 'score', title: `Disagree with "${sc.band}"` })} className="text-[11px] text-smoke hover:text-brass">disagree →</button>
        </div>
        <p className="text-[12px] text-smoke">A band, not a fake-precise percentage. <span className="text-pewter">B</span> = released only after the bias firewall passes.</p>
      </Glass>

      <Glass>
        <Label>Why</Label>
        <div className="mt-3 space-y-3">
          {sc.factors.map((f, i) => (
            <div key={f.name}>
              <div className="flex justify-between text-[13px]"><span className="text-marble">{f.name}</span><span className={cn('tabular-nums', f.effect >= 0 ? 'text-followed' : 'text-overruled')}>{f.effect > 0 ? '+' : ''}{f.effect.toFixed(2)}</span></div>
              <div className="relative mt-1.5 h-1 w-full rounded-full bg-marble/8">
                <span className="absolute left-1/2 top-0 h-full w-px bg-marble/20" />
                <motion.div className={cn('absolute top-0 h-full rounded-full', f.effect >= 0 ? 'bg-followed left-1/2' : 'bg-overruled right-1/2')} initial={{ width: 0 }} animate={{ width: `${(Math.abs(f.effect) / maxAbs) * 50}%` }} transition={{ duration: 1, delay: 0.1 * i, ease }} />
              </div>
            </div>
          ))}
        </div>
      </Glass>

      <div className="grid grid-cols-2 gap-2">
        <Glass>
          <Label>Court-aware</Label>
          <p className="mt-1 text-[14px] text-marble">{sc.court_aware.court}</p>
          <p className="text-[11px] text-smoke">{sc.court_aware.n_judgments} local judgments pooled with {sc.court_aware.pooled_from} (k = {sc.court_aware.shrinkage_k}). Court level, never named judges.</p>
        </Glass>
        <Glass>
          <Label>Held-out eval</Label>
          <p className="mt-1 text-[14px] text-marble">{sc.eval.heldout_total ? `${sc.eval.heldout_correct} of ${sc.eval.heldout_total} unseen cases` : 'Pending retrain'}</p>
          <p className="text-[11px] text-smoke">{sc.eval.brier != null ? `Brier ${sc.eval.brier} · ` : ''}numbers come from the eval run, never typed by hand.</p>
        </Glass>
      </div>

      {b.data && <Firewall id={id} data={b.data} />}
    </div>
  )
}

/** Hero demo moment: pick any identity, the score must not move. */
function Firewall({ id, data }: { id: string; data: BiasFirewall }) {
  const [rows, setRows] = useState(data.rows)
  const [busy, setBusy] = useState<Identity | null>(null)
  const passed = rows.every((r) => Math.abs(r.delta) <= data.epsilon)

  const flip = async (k: Identity) => {
    setBusy(k); sfx.tick()
    const r = await api.flip(id, k)
    setRows((rs) => rs.map((x) => (x.identity === k ? r : x)))
    setBusy(null); sfx.accept()
  }

  const W = 300, H = 56
  const pts = rows.map((r, i) => `${(i / (rows.length - 1)) * W},${H / 2 - r.delta * 900}`).join(' ')

  return (
    <Glass spotlight className="relative overflow-hidden">
      <div className="flex items-center justify-between">
        <Label>Bias firewall · ε = {data.epsilon}</Label>
        <motion.span key={String(passed)} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={cn('inline-flex items-center gap-1 text-[12px]', passed ? 'text-followed' : 'text-overruled')}>
          {passed ? <><ShieldCheck size={14} /> passed</> : <><ShieldOff size={14} /> abstaining</>}
        </motion.span>
      </div>
      <p className="mt-1 text-[12px] text-smoke">Tap an identity. The claimant is swapped and the model re-runs. If the score moves more than ε, Insaaf refuses to release it.</p>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-14 w-full overflow-visible">
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="rgba(242,241,238,0.12)" />
        <line x1={0} y1={H / 2 - data.epsilon * 900} x2={W} y2={H / 2 - data.epsilon * 900} stroke="rgba(242,241,238,0.12)" strokeDasharray="3 4" />
        <line x1={0} y1={H / 2 + data.epsilon * 900} x2={W} y2={H / 2 + data.epsilon * 900} stroke="rgba(242,241,238,0.12)" strokeDasharray="3 4" />
        <motion.polyline points={pts} fill="none" stroke={passed ? '#6fae8d' : '#d95c54'} strokeWidth={2} strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease }} style={{ filter: 'drop-shadow(0 0 6px rgba(111,174,141,0.5))' }} />
        {rows.map((r, i) => <circle key={r.identity} cx={(i / (rows.length - 1)) * W} cy={H / 2 - r.delta * 900} r={3} fill={passed ? '#6fae8d' : '#d95c54'} />)}
      </svg>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {identities.map(({ k, label }) => {
          const r = rows.find((x) => x.identity === k)!
          return (
            <button key={k} onClick={() => flip(k)} disabled={busy !== null} className={cn('glass-well p-2.5 text-left transition-colors hover:border-brass/30', busy === k && 'animate-pulse')}>
              <p className="text-[12px] text-marble">{label}</p>
              <p className="text-[11px] tabular-nums text-smoke">{r.score.toFixed(2)} <span className={Math.abs(r.delta) > data.epsilon ? 'text-overruled' : 'text-smoke'}>Δ{r.delta.toFixed(2)}</span></p>
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5"><Chip tone="steel">identity masked before scoring</Chip><Chip tone="steel">counterfactual re-run</Chip></div>
    </Glass>
  )
}
