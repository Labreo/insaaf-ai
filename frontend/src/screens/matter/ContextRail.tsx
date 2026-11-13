import { useRef, useState } from 'react'
import { FileText, FileUp, Flag, RefreshCw, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { can } from '@/lib/store'
import { confirmAction, run, toast } from '@/lib/feedback'
import type { Matter } from '@/lib/types'
import { Badge, Skeleton, type Tone, useAsync } from '@/components/primitives'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'
import type { Tab } from '../Matter'

type Row = { tone: Tone; label: string; detail: string; tab: Tab }

const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const FLAGS = [
  { k: 'senior_citizen', label: 'Senior citizen' },
  { k: 'interim_relief', label: 'Interim relief (O.XXXIX)' },
  { k: 'undertrial_custody', label: 'Undertrial custody' },
] as const

/** Contextual rail: what the system has processed, what needs a lawyer, and the case record. */
export default function ContextRail({
  id,
  matter,
  onJump,
}: {
  id: string
  matter: Matter
  onJump: (t: Tab) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [flagBusy, setFlagBusy] = useState<string | null>(null)
  // A brand-new matter has no stored analysis; reading stages would silently start the pipeline.
  const [optIn, setOptIn] = useState(false)
  const analysed = matter.status !== 'draft' || optIn

  const facts = useAsync(() => (analysed ? api.facts(id) : Promise.resolve(null)), [id, analysed])
  const proof = useAsync(() => (analysed ? api.proofLedger(id) : Promise.resolve(null)), [id, analysed])
  const clock = useAsync(() => (analysed ? api.statuteClock(id) : Promise.resolve(null)), [id, analysed])
  const precs = useAsync(() => (analysed ? api.precedents(id) : Promise.resolve(null)), [id, analysed])
  const cites = useAsync(() => (analysed ? api.citationHealth(id) : Promise.resolve(null)), [id, analysed])
  const score = useAsync(() => (analysed ? api.score(id) : Promise.resolve(null)), [id, analysed])
  const draft = useAsync(() => (analysed ? api.draft(id) : Promise.resolve(null)), [id, analysed])
  const ledger = useAsync(() => api.ledger(id), [id])
  const queue = useAsync(() => api.queue(), [id])
  const flags = queue.data?.find((x) => x.matter_id === id)?.flags ?? []

  const all = [facts, proof, clock, precs, cites, score, draft]
  const refreshAll = () => all.forEach((q) => q.reload())

  const rows: { key: string; title: string; q: { loading: boolean; error?: string; reload: () => void }; row: Row | null }[] = [
    {
      key: 'facts',
      title: 'Facts',
      q: facts,
      row: facts.data
        ? (() => {
            const open = facts.data.filter((f) => f.status !== 'documented').length
            return {
              tone: open ? 'warn' : 'ok',
              label: `${facts.data.length} fact cards`,
              detail: open ? `${open} not yet documented — verify` : 'All documented',
              tab: 'facts',
            } satisfies Row
          })()
        : null,
    },
    {
      key: 'proof',
      title: 'Proof Ledger',
      q: proof,
      row: proof.data
        ? (() => {
            const crit = proof.data.items.filter((i) => i.state === 'missing' && (i.severity === 'critical' || i.severity === 'high')).length
            const weak = proof.data.items.filter((i) => i.state === 'weak').length
            return {
              tone: crit ? 'bad' : weak ? 'warn' : 'ok',
              label: crit ? `${crit} critical gap${crit > 1 ? 's' : ''}` : weak ? `${weak} weak item${weak > 1 ? 's' : ''}` : 'No critical gaps',
              detail: `${proof.data.items.length} requirements checked`,
              tab: 'proof',
            } satisfies Row
          })()
        : null,
    },
    {
      key: 'clock',
      title: 'Statute Clock',
      q: clock,
      row: clock.data
        ? {
            tone: clock.data.days_left != null && clock.data.days_left <= 45 ? 'bad' : 'ok',
            label:
              clock.data.applicable === false
                ? 'No fixed limitation'
                : clock.data.days_left == null
                  ? 'Cause date needed'
                  : clock.data.days_left >= 0
                    ? `${clock.data.days_left} days left`
                    : 'Limitation expired',
            detail: clock.data.limitation_expires ? `Expires ${clock.data.limitation_expires} · ${clock.data.article}` : clock.data.article,
            tab: 'clock',
          }
        : null,
    },
    {
      key: 'precs',
      title: 'Precedents',
      q: precs,
      row: precs.data
        ? (() => {
            const against = precs.data.results.filter((r) => r.stance === 'against').length
            return {
              tone: against ? 'warn' : 'neutral',
              label: `${precs.data.results.length} authorities`,
              detail: against ? `${against} adverse to client` : `Searched ${precs.data.searched} in ${precs.data.elapsed_ms} ms`,
              tab: 'precedents',
            } satisfies Row
          })()
        : null,
    },
    {
      key: 'cites',
      title: 'Citation health',
      q: cites,
      row: cites.data
        ? (() => {
            const blocking = cites.data.filter((c) => c.blocks_draft).length
            return {
              tone: blocking ? 'bad' : 'ok',
              label: blocking ? `${blocking} blocking the draft` : 'No blocking citations',
              detail: `${cites.data.length} citation${cites.data.length === 1 ? '' : 's'} checked`,
              tab: 'citations',
            } satisfies Row
          })()
        : null,
    },
    {
      key: 'score',
      title: 'AI-B score',
      q: score,
      row: score.data
        ? {
            tone: score.data.bias_firewall_passed ? (score.data.band === 'weak' ? 'warn' : 'ok') : 'bad',
            label: `${score.data.band} band`,
            detail: score.data.bias_firewall_passed ? 'Bias Firewall passed' : 'Bias Firewall FAILED',
            tab: 'score',
          }
        : null,
    },
    {
      key: 'draft',
      title: 'Pleading draft',
      q: draft,
      row: draft.data
        ? {
            tone: /^APPROVED/i.test(draft.data.watermark) ? 'ok' : /AWAITING/i.test(draft.data.watermark) ? 'warn' : 'neutral',
            label: /^APPROVED/i.test(draft.data.watermark) ? 'Approved by senior' : /AWAITING/i.test(draft.data.watermark) ? 'Awaiting senior approval' : 'AI draft — not reviewed',
            detail: draft.data.watermark,
            tab: 'draft',
          }
        : null,
    },
  ]

  const attach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || uploading) return
    setUploading(true)
    sfx.tick()
    const doc = await run('Attach document', () => api.addDocument(id, file))
    setUploading(false)
    if (doc) {
      sfx.accept()
      refreshAll()
      toast('ok', `${file.name} attached`, 'Derived analysis was cleared and will recompute from the updated record.')
    }
  }

  const remove = async (docId: string, name: string) => {
    const ok = await confirmAction({
      title: 'Remove this document?',
      body: `"${name}" will be removed from the case record. Facts, scores and drafts derived from it are cleared and recomputed.`,
      confirmLabel: 'Remove document',
    })
    if (!ok) return
    setRemoving(docId)
    const done = await run('Remove document', () => api.removeDocument(id, docId), `${name} removed`)
    setRemoving(null)
    if (done !== undefined) refreshAll()
  }

  const toggleFlag = async (flag: (typeof FLAGS)[number]['k']) => {
    if (flagBusy) return
    setFlagBusy(flag)
    sfx.tick()
    await run('Update urgency flag', () => api.toggleFlag(id, flag))
    queue.reload()
    setFlagBusy(null)
  }

  const docs = matter.documents ?? []
  const canUpload = can('document.upload')
  const canRemove = can('document.delete')
  const canFlag = can('queue.flag')

  return (
    <div className="space-y-4">
      {/* Review status */}
      <section aria-labelledby="rail-review" className="rounded-[6px] border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
          <h2 id="rail-review" className="text-[12px] font-semibold text-ink">
            System findings &amp; review
          </h2>
          {analysed && (
            <button
              type="button"
              onClick={refreshAll}
              aria-label="Refresh findings"
              className="rounded p-1 text-ink-3 hover:bg-hover hover:text-ink"
            >
              <RefreshCw size={12} />
            </button>
          )}
        </div>

        {!analysed ? (
          <div className="space-y-2.5 px-3.5 py-3.5 text-[12px] text-ink-2">
            <p>This matter has not been analysed yet, so there are no findings to review.</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onJump('pipeline')}
                className="rounded-[5px] bg-navy px-3 py-1.5 text-[12px] font-medium text-white hover:bg-navy-600"
              >
                Open pipeline
              </button>
              <button
                type="button"
                onClick={() => setOptIn(true)}
                className="rounded-[5px] border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 hover:bg-hover"
              >
                Load saved results
              </button>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map(({ key, title, q, row }) => (
              <li key={key}>
                {q.loading && !row ? (
                  <div className="px-3.5 py-2.5">
                    <Skeleton className="h-8" />
                  </div>
                ) : q.error && !row ? (
                  <button
                    type="button"
                    onClick={q.reload}
                    className="flex w-full items-start justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-sunken"
                  >
                    <span>
                      <span className="block text-[11px] font-medium text-ink-3">{title}</span>
                      <span className="block text-[12px] text-bad">Could not load — {q.error}</span>
                    </span>
                  </button>
                ) : row ? (
                  <button
                    type="button"
                    onClick={() => {
                      sfx.tick()
                      onJump(row.tab)
                    }}
                    className="flex w-full items-start justify-between gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-sunken"
                  >
                    <span className="min-w-0">
                      <span className="block text-[11px] font-medium text-ink-3">{title}</span>
                      <span className="block truncate text-[12.5px] font-medium text-ink">{row.label}</span>
                      <span className="block truncate text-[11px] text-ink-3" title={row.detail}>
                        {row.detail}
                      </span>
                    </span>
                    <Badge tone={row.tone}>{row.tone === 'ok' ? 'OK' : row.tone === 'bad' ? 'Review' : row.tone === 'warn' ? 'Check' : 'Info'}</Badge>
                  </button>
                ) : null}
              </li>
            ))}
            <li className="px-3.5 py-2.5">
              <span className="block text-[11px] font-medium text-ink-3">Audit ledger</span>
              {ledger.loading && !ledger.data ? (
                <Skeleton className="mt-1 h-4" />
              ) : ledger.error ? (
                <span className="text-[12px] text-bad">Could not load — {ledger.error}</span>
              ) : (
                <button type="button" onClick={() => onJump('ledger')} className="text-left">
                  <span className="block text-[12.5px] font-medium text-ink">
                    {ledger.data?.entries.length ?? 0} lawyer review entr{(ledger.data?.entries.length ?? 0) === 1 ? 'y' : 'ies'}
                  </span>
                  <span className={cn('block text-[11px]', ledger.data?.verify.valid ? 'text-ok' : 'text-bad')}>
                    {ledger.data?.verify.valid ? 'Hash chain verified' : 'Hash chain BROKEN'}
                  </span>
                </button>
              )}
            </li>
          </ul>
        )}
      </section>

      {/* Case record */}
      <section aria-labelledby="rail-docs" className="rounded-[6px] border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
          <h2 id="rail-docs" className="text-[12px] font-semibold text-ink">
            Case record ({docs.length})
          </h2>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt,.wav,.mp3,.ogg,.m4a,.json"
            onChange={attach}
            className="hidden"
            aria-label="Attach document"
          />
          <button
            type="button"
            disabled={uploading || !canUpload}
            title={canUpload ? 'Attach a PDF, DOCX or voice note' : 'Your role cannot attach documents'}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-[4px] border border-navy-100 bg-navy-50 px-2 py-0.5 text-[11px] font-medium text-navy hover:bg-navy/10 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <FileUp size={11} /> {uploading ? 'Uploading…' : 'Attach'}
          </button>
        </div>
        {docs.length === 0 ? (
          <p className="px-3.5 py-4 text-[12px] text-ink-3">
            No documents yet. Attach a sale deed, invoice, notice, or a Konkani/Marathi voice statement to begin the analysis.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {docs.map((d) => (
              <li key={d.id} className="flex items-start gap-2 px-3.5 py-2.5">
                <FileText size={13} className="mt-0.5 shrink-0 text-brass" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium text-ink" title={d.name}>
                    {d.name}
                  </p>
                  <p className="text-[11px] text-ink-3">
                    {d.kind === 'voice' || d.kind === 'audio' ? 'Voice note' : d.kind.toUpperCase()}
                    {d.pages ? ` · ${d.pages} p` : ''} · {fmtDate(d.added_at)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!canRemove || removing === d.id}
                  title={canRemove ? 'Remove document' : 'Your role cannot remove documents'}
                  aria-label={`Remove ${d.name}`}
                  onClick={() => remove(d.id, d.name)}
                  className="rounded p-1 text-ink-3 hover:bg-bad-50 hover:text-bad disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-3"
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Urgency flags */}
      <section aria-labelledby="rail-flags" className="rounded-[6px] border border-line bg-surface p-3.5 shadow-[var(--shadow-card)]">
        <h2 id="rail-flags" className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
          <Flag size={12} /> Docket urgency
        </h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {FLAGS.map((f) => {
            const active = flags.includes(f.k)
            return (
              <button
                key={f.k}
                type="button"
                aria-pressed={active}
                disabled={!canFlag || flagBusy !== null}
                title={canFlag ? undefined : 'Your role cannot change urgency flags'}
                onClick={() => toggleFlag(f.k)}
                className={cn(
                  'rounded-[4px] border px-2 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45',
                  active ? 'border-warn-200 bg-warn-50 text-warn' : 'border-line bg-surface text-ink-2 hover:bg-hover hover:text-ink',
                )}
              >
                {f.label}
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
