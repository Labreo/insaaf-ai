import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Bug, Cpu, RotateCw } from 'lucide-react'
import { api } from '@/lib/api'
import { mut, useDB } from '@/lib/store'
import { Chip, Glass, Label, Skeleton, Well, ease, useAsync } from '@/components/primitives'
import { Button } from '@/components/ui/button'
import { NumberTicker } from '@/components/magicui/number-ticker'
import LedgerTab from './matter/LedgerTab'
import { sfx } from '@/lib/sound'

/** F11 ledger (chamber-wide) + F13 retraining loop. */
export default function LedgerScreen() {
  const version = useDB((d) => d.ledger.length + ':' + d.model.version + ':' + String(d.tampered))
  const tampered = useDB((d) => d.tampered)
  const model = useAsync(() => api.model(), [version])
  const overrides = useDB((d) => d.ledger.filter((e) => e.action === 'override').length)
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.retrain>> | null>(null)
  const [busy, setBusy] = useState(false)

  const retrain = async () => {
    setBusy(true)
    sfx.tick()
    const r = await api.retrain()
    setResult(r)
    setBusy(false)
    sfx.seal()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-seam pb-5">
        <div>
          <Label>Chamber Governance & Feedback Loop</Label>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-marble">Audit Ledger & Model Calibration</h1>
          <p className="mt-1 text-[13px] text-pewter">
            Cryptographically linked advocate review log and supervised outcome calibration pipeline.
          </p>
        </div>
        <button
          onClick={() => {
            mut.tamper()
            tampered ? sfx.accept() : sfx.reject()
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-seam bg-graphite px-3 py-1.5 text-[12px] text-pewter transition-colors hover:border-overruled/40 hover:text-overruled"
        >
          <Bug size={13} /> {tampered ? 'Restore intact chain' : 'Simulate tamper'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-4">
          <div className="flex items-center justify-between">
            <Label>Disagreement → Retraining Loop</Label>
            <Chip tone="steel">
              <Cpu size={11} /> {model.data?.version ?? '…'}
            </Chip>
          </div>
          {model.loading && <Skeleton className="h-44" />}
          {model.data && (
            <Glass spotlight className="space-y-4">
              <div className="grid grid-cols-3 gap-3 border-b border-seam pb-4">
                <div>
                  <p className="font-mono text-2xl font-semibold tabular-nums text-marble">
                    <NumberTicker value={model.data.labels} />
                  </p>
                  <Label className="mt-1">Labels</Label>
                </div>
                <div>
                  <p className="font-mono text-2xl font-semibold tabular-nums text-brass">{overrides}</p>
                  <Label className="mt-1">Overrides</Label>
                </div>
                <div>
                  <p className="font-mono text-2xl font-semibold tabular-nums text-marble">
                    {model.data.metrics.accuracy != null ? `${Math.round(model.data.metrics.accuracy * 100)}%` : '—'}
                  </p>
                  <Label className="mt-1">Held-out acc.</Label>
                </div>
              </div>
              <p className="text-[12px] leading-relaxed text-pewter">
                Every senior override becomes a labelled calibration record. Retraining is strictly opt-in per organisation; public judgments remain the default baseline.
              </p>
              <div className="flex items-center justify-between gap-3">
                <Button
                  disabled={busy}
                  onClick={retrain}
                  className="h-9 rounded-md bg-brass px-4 text-[12px] font-medium uppercase tracking-[0.08em] text-void hover:bg-[#d6b676]"
                >
                  <RotateCw size={14} className={busy ? 'animate-spin' : ''} /> {busy ? 'Training…' : 'Retrain now'}
                </Button>
                <span className="font-mono text-[11px] text-smoke">nightly schedule</span>
              </div>
              <AnimatePresence>
                {result && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ ease }}>
                    <Well className="grid grid-cols-2 gap-3 text-[12px]">
                      <div>
                        <Label>Before · {result.old_version}</Label>
                        <p className="mt-1 font-mono text-marble">
                          acc {result.metrics_before.accuracy != null ? `${(result.metrics_before.accuracy * 100).toFixed(1)}%` : '—'} · brier {result.metrics_before.brier ?? '—'}
                        </p>
                      </div>
                      <div>
                        <Label>After · {result.new_version}</Label>
                        <p className="mt-1 font-mono text-followed">
                          acc {(result.metrics_after.accuracy! * 100).toFixed(1)}% · brier {result.metrics_after.brier}
                        </p>
                      </div>
                      <p className="col-span-2 text-smoke">
                        {result.labels_added} override{result.labels_added === 1 ? '' : 's'} added as labels. Metrics are live evaluation outputs.
                      </p>
                    </Well>
                  </motion.div>
                )}
              </AnimatePresence>
            </Glass>
          )}
        </div>

        <div className="space-y-4 lg:col-span-8">
          <Label>Chamber-Wide Reviewer Ledger</Label>
          <LedgerTab id="all" />
        </div>
      </div>
    </div>
  )
}
