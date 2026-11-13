import { useState } from 'react'
import { Bug, Cpu, RotateCw, ShieldAlert, ShieldCheck } from 'lucide-react'
import { api } from '@/lib/api'
import { can } from '@/lib/store'
import { confirmAction, toast } from '@/lib/feedback'
import type { RetrainResult, TamperResult } from '@/lib/types'
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
  const [tamperDetail, setTamperDetail] = useState<TamperResult | null>(null)
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
      title: 'Run integrity drill?',
      body: 'Simulates an unauthorized insider database edit on one ledger entry so you can verify SHA-256 hash-chain and Merkle root detection. Click again to restore.',
      confirmLabel: 'Simulate Insider DB Edit',
      tone: 'primary',
    })
    if (!ok) return
    setTampering(true)
    setErr(null)
    try {
      const res = await api.tamperLedger()
      setTamperDetail(res)
      ledgerRes.reload()
      if (res.tampered) {
        sfx.reject()
        toast('bad', 'Integrity breach detected', `Hash chain broken at ${res.broken_at ?? res.entry_id ?? 'entry'}.`)
      } else {
        sfx.accept()
        toast('ok', 'Ledger integrity restored', 'SHA-256 hash chain and Merkle root verify cleanly.')
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
        description="Every senior override is recorded on a SHA-256 hash chain anchored to a Solana devnet blockhash timestamp and converted into supervised calibration data."
        right={
          <button
            type="button"
            disabled={tampering || !can('ledger.tamper')}
            title={can('ledger.tamper') ? undefined : 'Only a senior advocate can run the integrity drill'}
            onClick={toggleTamper}
            className="inline-flex items-center gap-1.5 rounded-[5px] border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 transition-colors hover:border-bad-200 hover:bg-bad-50 hover:text-bad disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Bug size={13} /> {isTampered ? 'Restore Intact Chain' : 'Integrity Drill: Simulate Insider DB Edit'}
          </button>
        }
      />

      {err && <ErrorBanner error={err} />}

      {tamperDetail && (
        <Card className={tamperDetail.tampered ? 'space-y-3 border-bad-200 bg-bad-50/40' : 'space-y-2 border-ok-200 bg-ok-50/40'}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {tamperDetail.tampered ? (
                <ShieldAlert size={16} className="text-bad" />
              ) : (
                <ShieldCheck size={16} className="text-ok" />
              )}
              <Label>
                {tamperDetail.tampered
                  ? 'Integrity Drill · Cryptographic Tamper Diff Exposed'
                  : 'Integrity Drill · Chain Restored & Verified'}
              </Label>
            </div>
            <Badge tone={tamperDetail.tampered ? 'bad' : 'ok'}>
              {tamperDetail.tampered ? `BROKEN AT ${tamperDetail.broken_at ?? tamperDetail.entry_id ?? 'ENTRY'}` : 'CHAIN VALID'}
            </Badge>
          </div>

          <p className="text-[12.5px] text-ink-2">
            {tamperDetail.explanation ||
              'Mutating a stored record invalidates its deterministic SHA-256 link and shifts the Merkle root checked against the Solana devnet blockhash timestamp anchor.'}
          </p>

          {(tamperDetail.entry_id || tamperDetail.stored_hash || tamperDetail.merkle_root_after) && (
            <div className="grid gap-3 border-t border-line pt-3 font-mono text-[11px] sm:grid-cols-2 lg:grid-cols-3">
              {tamperDetail.entry_id && (
                <Well className="space-y-1">
                  <Label>Mutated Entry &amp; Field</Label>
                  <p className="text-ink">
                    {tamperDetail.entry_id}
                    {tamperDetail.field ? ` · ${tamperDetail.field}` : ''}
                  </p>
                  {tamperDetail.before != null && (
                    <p className="text-ok">Before: &ldquo;{tamperDetail.before}&rdquo;</p>
                  )}
                  {tamperDetail.after != null && (
                    <p className="text-bad">After: &ldquo;{tamperDetail.after}&rdquo;</p>
                  )}
                </Well>
              )}
              {(tamperDetail.stored_hash || tamperDetail.recomputed_hash) && (
                <Well className="space-y-1">
                  <Label>SHA-256 Entry Hash Check</Label>
                  {tamperDetail.stored_hash && (
                    <p className="truncate text-ink-2" title={tamperDetail.stored_hash}>
                      Stored: {tamperDetail.stored_hash}
                    </p>
                  )}
                  {tamperDetail.recomputed_hash && (
                    <p className="truncate text-bad" title={tamperDetail.recomputed_hash}>
                      Recomputed: {tamperDetail.recomputed_hash}
                    </p>
                  )}
                </Well>
              )}
              {(tamperDetail.merkle_root_before || tamperDetail.merkle_root_after) && (
                <Well className="space-y-1">
                  <Label>Solana Devnet Blockhash Anchor Diff</Label>
                  {tamperDetail.merkle_root_before && (
                    <p className="truncate text-ok" title={tamperDetail.merkle_root_before}>
                      Anchored Root: {tamperDetail.merkle_root_before}
                    </p>
                  )}
                  {tamperDetail.merkle_root_after && (
                    <p className="truncate text-bad" title={tamperDetail.merkle_root_after}>
                      Post-Edit Root: {tamperDetail.merkle_root_after}
                    </p>
                  )}
                </Well>
              )}
            </div>
          )}
        </Card>
      )}

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
                Every senior advocate disagreement becomes a labelled training example. Retraining is opt-in per chamber; public Insaaf Precedent Index judgments remain the baseline prior.
              </p>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={busy || !can('ml.retrain')}
                  title={can('ml.retrain') ? undefined : 'Only a senior advocate can retrain the model'}
                  onClick={retrain}
                  className="inline-flex items-center gap-1.5 rounded-[5px] bg-navy px-4 py-2 text-[12px] font-semibold text-night transition-colors hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-50"
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
