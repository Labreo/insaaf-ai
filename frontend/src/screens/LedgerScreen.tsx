import { useState } from 'react'
import { Bug, Cpu, RotateCw } from 'lucide-react'
import { api } from '@/lib/api'
import { can } from '@/lib/store'
import { confirmAction, toast } from '@/lib/feedback'
import type { RetrainResult } from '@/lib/types'
import {
  Badge,
  Card,
  ErrorBanner,
  Label,
  PageHeader,
  Skeleton,
  Well,
  useAsync,
} from '@/components/primitives'
import LedgerTab from './matter/LedgerTab'
import { sfx } from '@/lib/sound'

/** F11 chamber-wide hash-chained ledger + F13 disagreement retraining loop. */
export default function LedgerScreen() {
  const model = useAsync(() => api.model(), [])
  const ledgerRes = useAsync(() => api.ledger('all'), [])
  const [result, setResult] = useState<RetrainResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [tampering, setTampering] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const isTampered = ledgerRes.data ? !ledgerRes.data.verify.valid : false
  const overrides = ledgerRes.data?.entries.filter((e) => e.action === 'override').length ?? 0

  const retrain = async () => {
    setBusy(true)
    setErr(null)
    sfx.tick()
    try {
      const r = await api.retrain()
      setResult(r)
      sfx.seal()
      toast('ok', 'Model retrained', `Now ${r.new_version}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const toggleTamper = async () => {
    const ok = isTampered || await confirmAction({
      title: 'Run tamper simulation?',
      body: 'This alters a stored ledger entry on the server to demonstrate hash-chain detection. Use it only for the demonstration; click again to restore.',
      confirmLabel: 'Simulate tamper',
      tone: 'primary',
    })
    if (!ok) return
    setTampering(true)
    setErr(null)
    try {
      const res = await api.tamperLedger()
      if (res.tampered) {
        sfx.reject()
        toast('bad', 'Ledger tampered', `Verification now fails at ${res.broken_at ?? 'an entry'}.`)
      } else {
        sfx.accept()
        toast('ok', 'Ledger restored', 'Hash chain verifies again.')
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setTampering(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Chamber Governance & Calibration Loop"
        title="Audit Ledger & Model Retraining"
        description="Every senior override is SHA-256 hash-chained onto the reviewer ledger and converted into supervised calibration data."
        right={
          <button
            type="button"
            disabled={tampering || !can('ledger.tamper')}
            title={can('ledger.tamper') ? undefined : 'Only a senior advocate can run the tamper simulation'}
            onClick={toggleTamper}
            className="inline-flex items-center gap-1.5 rounded-[5px] border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 transition-colors hover:border-bad-200 hover:bg-bad-50 hover:text-bad disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Bug size={13} /> {isTampered ? 'Restore Intact Chain' : 'Simulate Tamper'}
          </button>
        }
      />

      {err && <ErrorBanner error={err} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-4">
          <div className="flex items-center justify-between">
            <Label>Disagreement → Retraining Loop</Label>
            <Badge tone="info">
              <Cpu size={11} /> {model.data?.version ?? '…'}
            </Badge>
          </div>

          {model.loading && !model.data ? (
            <Skeleton className="h-52" />
          ) : model.data ? (
            <Card className="space-y-4">
              <div className="grid grid-cols-3 gap-2 border-b border-line pb-4">
                <div>
                  <p className="tabular font-mono text-[22px] font-semibold text-ink">{model.data.labels}</p>
                  <Label className="mt-1">Labels</Label>
                </div>
                <div>
                  <p className="tabular font-mono text-[22px] font-semibold text-brass">{overrides}</p>
                  <Label className="mt-1">Overrides</Label>
                </div>
                <div>
                  <p className="tabular font-mono text-[22px] font-semibold text-ink">
                    {model.data.metrics.accuracy != null
                      ? `${Math.round(model.data.metrics.accuracy * 100)}%`
                      : '—'}
                  </p>
                  <Label className="mt-1">Held-Out Acc.</Label>
                </div>
              </div>

              <p className="text-[12.5px] leading-relaxed text-ink-2">
                Every senior advocate disagreement becomes a labelled training example. Retraining is opt-in per chamber; public Indian Kanoon judgments remain the baseline prior.
              </p>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={busy || !can('ml.retrain')}
                  title={can('ml.retrain') ? undefined : 'Only a senior advocate can retrain the model'}
                  onClick={retrain}
                  className="inline-flex items-center gap-1.5 rounded-[5px] bg-navy px-4 py-2 text-[12px] font-medium text-white transition-colors hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RotateCw size={13} className={busy ? 'animate-spin' : ''} />
                  {busy ? 'Training…' : 'Retrain Model Now'}
                </button>
                <span className="font-mono text-[11px] text-ink-3">
                  Brier {model.data.metrics.brier ?? '—'}
                </span>
              </div>

              {result && (
                <Well className="grid grid-cols-2 gap-3 text-[12px]">
                  <div>
                    <Label>Before · {result.old_version}</Label>
                    <p className="mt-1 font-mono text-ink">
                      acc {result.metrics_before.accuracy != null ? `${(result.metrics_before.accuracy * 100).toFixed(1)}%` : '—'} · brier {result.metrics_before.brier ?? '—'}
                    </p>
                  </div>
                  <div>
                    <Label>After · {result.new_version}</Label>
                    <p className="mt-1 font-mono font-semibold text-ok">
                      acc {result.metrics_after.accuracy != null ? `${(result.metrics_after.accuracy * 100).toFixed(1)}%` : '—'} · brier {result.metrics_after.brier ?? '—'}
                    </p>
                  </div>
                  <p className="col-span-2 text-ink-3">
                    {result.labels_added} override{result.labels_added === 1 ? '' : 's'} folded into calibration set.
                  </p>
                </Well>
              )}

              {model.data.history.length > 0 && (
                <div className="border-t border-line pt-3">
                  <Label className="mb-2">Recent Calibration Runs</Label>
                  <div className="space-y-1.5">
                    {model.data.history.slice(-4).reverse().map((h) => (
                      <div key={h.version + h.at} className="flex items-center justify-between font-mono text-[11px] text-ink-2">
                        <span className="font-medium text-ink">{h.version}</span>
                        <span>+{h.labels_added} labels</span>
                        <span>{h.accuracy != null ? `${Math.round(h.accuracy * 100)}%` : '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ) : null}
        </div>

        <div className="space-y-3 lg:col-span-8">
          <Label>Chamber-Wide Reviewer Ledger</Label>
          <LedgerTab id="all" />
        </div>
      </div>
    </div>
  )
}
