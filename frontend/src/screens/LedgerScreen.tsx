import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Bug, Cpu, RotateCw } from 'lucide-react'
import { api } from '@/lib/api'
import { mut, useDB } from '@/lib/store'
import { Chip, Glass, Label, Section, Skeleton, Title, Well, ease, useAsync } from '@/components/primitives'
import { Button } from '@/components/ui/button'
import { NumberTicker } from '@/components/magicui/number-ticker'
import LedgerTab from './matter/LedgerTab'
import { sfx } from '@/lib/sound'

/** F11 ledger (chamber-wide) + F13 retraining loop. */
export default function LedgerScreen() {
  const version = useDB((d) => d.ledger.length + ':' + d.model.version + ':' + String(d.tampered))
  const model = useAsync(() => api.model(), [version])
  const overrides = useDB((d) => d.ledger.filter((e) => e.action === 'override').length)
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.retrain>> | null>(null)
  const [busy, setBusy] = useState(false)

  const retrain = async () => {
    setBusy(true); sfx.tick()
    const r = await api.retrain()
    setResult(r); setBusy(false); sfx.seal()
  }

  return (
    <div className="space-y-7">
      <Title kicker="Chamber-wide">Nothing reviewed is <span className="serif italic brass-text">hidden</span>.</Title>

      <Section title="Disagreement → retraining loop" right={<Chip tone="steel"><Cpu size={11} /> {model.data?.version ?? '…'}</Chip>}>
        {model.loading && <Skeleton className="h-36" />}
        {model.data && (
          <Glass spotlight>
            <div className="grid grid-cols-3 gap-3">
              <div><p className="text-[26px] leading-none tabular-nums text-marble"><NumberTicker value={model.data.labels} /></p><Label className="mt-1.5">labels</Label></div>
              <div><p className="text-[26px] leading-none tabular-nums brass-text">{overrides}</p><Label className="mt-1.5">new overrides</Label></div>
              <div><p className="text-[26px] leading-none tabular-nums text-marble">{model.data.metrics.accuracy != null ? `${Math.round(model.data.metrics.accuracy * 100)}%` : '—'}</p><Label className="mt-1.5">held-out acc.</Label></div>
            </div>
            <p className="mt-3 text-[12px] text-smoke">Every senior override is a labelled example. Retraining is opt-in per organisation; public judgments are the default corpus.</p>
            <div className="mt-3 flex items-center gap-2">
              <Button disabled={busy} onClick={retrain} className="h-10 rounded-full bg-brass text-void uppercase tracking-[0.1em] hover:bg-[#d6b676]"><RotateCw size={14} className={busy ? 'animate-spin' : ''} /> {busy ? 'Training…' : 'Retrain now'}</Button>
              <span className="text-[11px] text-smoke">nightly in production</span>
            </div>
            <AnimatePresence>
              {result && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ ease }} className="mt-3">
                  <Well className="grid grid-cols-2 gap-3 text-[12px]">
                    <div><Label>Before · {result.old_version}</Label><p className="mt-1 text-marble">acc {result.metrics_before.accuracy != null ? `${(result.metrics_before.accuracy * 100).toFixed(1)}%` : '—'} · brier {result.metrics_before.brier ?? '—'}</p></div>
                    <div><Label>After · {result.new_version}</Label><p className="mt-1 text-followed">acc {(result.metrics_after.accuracy! * 100).toFixed(1)}% · brier {result.metrics_after.brier}</p></div>
                    <p className="col-span-2 text-smoke">{result.labels_added} override{result.labels_added === 1 ? '' : 's'} added as labels. Numbers come from the eval run, never typed by hand.</p>
                  </Well>
                </motion.div>
              )}
            </AnimatePresence>
          </Glass>
        )}
      </Section>

      <Section title="Reviewer ledger" right={<button onClick={() => { if (confirm('Demo: edit a past ledger row to show the chain breaking?')) { mut.tamper(); sfx.reject() } }} className="inline-flex items-center gap-1 text-[11px] text-smoke hover:text-overruled"><Bug size={11} /> tamper demo</button>}>
        <LedgerTab id="all" />
      </Section>
    </div>
  )
}
