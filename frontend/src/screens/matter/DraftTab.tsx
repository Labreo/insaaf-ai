import { useState } from 'react'
import { Download, FileText, Lock, LockOpen, ShieldCheck, Stamp } from 'lucide-react'
import { api } from '@/lib/api'
import { useDB } from '@/lib/store'
import type { Draft, SourceRef } from '@/lib/types'
import {
  Badge,
  Card,
  ConfidenceDot,
  ErrorBanner,
  Label,
  NoAuthority,
  Skeleton,
  SourceChip,
  Well,
  useAsync,
} from '@/components/primitives'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'
import type { TabProps } from '../Matter'

const INSTRUMENTS: { k: 'legal_notice' | 'plaint' | 'plea_application'; label: string; header: string }[] = [
  {
    k: 'legal_notice',
    label: 'Legal Notice',
    header: 'STATUTORY LEGAL NOTICE UNDER REGISTERED POST A.D.',
  },
  {
    k: 'plaint',
    label: 'Suit Plaint (Order VII CPC)',
    header: 'SUIT PLAINT (ORDER VII RULE 1 CPC)',
  },
  {
    k: 'plea_application',
    label: 'Sec. 290 BNSS Application',
    header: 'APPLICATION UNDER CHAPTER XXIII BNSS (SEC. 290)',
  },
]

/** F8 + Authority Lock: formal bond-paper pleading + live citation insertion gate. */
export default function DraftTab({ id, onOpen, onReview }: TabProps) {
  const matter = useDB((d) => d.matters.find((m) => m.id === id))
  const role = useDB((d) => d.me.role)
  const d = useAsync(() => api.draft(id), [id])
  const [liveDraft, setLiveDraft] = useState<Draft | null>(null)
  const [switching, setSwitching] = useState(false)
  const [exporting, setExporting] = useState(false)

  const draft = liveDraft ?? d.data
  if (d.loading && !draft) return <Skeleton className="h-96" />
  if (d.error && !draft) return <ErrorBanner error={d.error} onRetry={d.reload} />
  if (!draft) return null

  const approved = matter?.status === 'approved'
  const currentInst = INSTRUMENTS.find((x) => x.k === draft.type) ?? INSTRUMENTS[0]

  const switchInstrument = async (k: 'legal_notice' | 'plaint' | 'plea_application') => {
    if (k === draft.type || switching) return
    setSwitching(true)
    sfx.tick()
    try {
      const next = await api.setDraftType(id, k)
      setLiveDraft(next)
      sfx.accept()
    } finally {
      setSwitching(false)
    }
  }

  const exportDocx = async () => {
    if (!matter) return
    setExporting(true)
    sfx.tick()
    try {
      const res = await fetch(api.exportDraftUrl(id))
      if (!res.ok) throw new Error(`Export failed (${res.status})`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${matter.title.replace(/[^a-z0-9]+/gi, '_').replace(/_+$/, '')}_${draft.type}.docx`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      sfx.accept()
    } finally {
      setExporting(false)
    }
  }

  const firstSource = draft.paragraphs.flatMap((p) => p.sources)[0]
  const verifiedSample = firstSource
    ? `${firstSource.title} governs the relief claimed on record.`
    : 'Suraj Lamp & Industries v. State of Haryana held that an unregistered agreement or power of attorney does not convey title.'

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left 7 Cols: Formal Legal Pleading Document */}
      <div className="space-y-4 lg:col-span-7">
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Label>{draft.type.replace(/_/g, ' ')}</Label>
                <Badge tone={approved ? 'ok' : 'brass'}>{approved ? 'Counsel Sealed' : 'Chamber Draft'}</Badge>
              </div>
              <p className={cn('mt-1 flex items-center gap-1.5 text-[12px] font-medium', approved ? 'text-ok' : 'text-brass')}>
                <ShieldCheck size={14} />
                <span className="truncate">{draft.watermark}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={exporting}
                onClick={exportDocx}
                className="inline-flex items-center gap-1.5 rounded-[5px] border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-50"
              >
                <Download size={13} /> {exporting ? 'Exporting…' : 'Export DOCX'}
              </button>
              {!approved && (
                <button
                  type="button"
                  onClick={() =>
                    onReview({
                      target: 'draft',
                      target_id: draft.type,
                      title: `Approve ${draft.type.replace(/_/g, ' ')}`,
                      action: 'approve',
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-[5px] bg-navy px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-navy-600"
                >
                  <Stamp size={13} /> {role === 'senior' ? 'Approve & Seal' : 'Send to Senior'}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
            <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-medium text-ink-3">
              <FileText size={11} /> Instrument format:
            </span>
            {INSTRUMENTS.map((inst) => (
              <button
                key={inst.k}
                type="button"
                disabled={switching}
                onClick={() => switchInstrument(inst.k)}
                className={cn(
                  'rounded-[4px] border px-2.5 py-1 text-[11px] font-medium transition-colors',
                  draft.type === inst.k
                    ? 'border-navy bg-navy text-white'
                    : 'border-line bg-sunken text-ink-2 hover:bg-hover hover:text-ink',
                )}
              >
                {inst.label}
              </button>
            ))}
          </div>
        </Card>

        {/* Bond-paper formal legal document */}
        <article className="page-doc rounded-[4px] px-7 py-8 sm:px-10">
          <div className="border-b border-line pb-4 text-center">
            <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-3">
              In the Court of {matter?.forum_hint || 'Competent Jurisdiction'} · {currentInst.header}
            </p>
            <h2 className="mt-1.5 text-[23px] font-medium text-ink">
              {matter?.title.replace(' (FICTIONAL)', '')}
            </h2>
            <p className="mt-1 font-sans text-[11px] text-ink-3">{draft.watermark}</p>
          </div>

          <div className="mt-6 space-y-5">
            {draft.paragraphs.map((p, i) => (
              <div key={p.id} className="border-b border-line/70 pb-5 last:border-b-0 last:pb-0">
                <div className="flex items-start gap-3.5">
                  <span className="mt-1 w-6 shrink-0 font-mono text-[12px] font-medium text-ink-3">
                    {i + 1}.
                  </span>
                  <div className="min-w-0 flex-1 space-y-2.5">
                    {p.locked_out_claim ? (
                      <div className="space-y-2">
                        <NoAuthority />
                        <div className="rounded-[5px] border border-bad-200 bg-bad-50/70 px-3 py-2 font-sans text-[12px] text-bad">
                          <Lock size={12} className="mr-1.5 inline" />
                          <span className="font-medium">Quarantined by Authority Lock:</span>{' '}
                          <span className="line-through opacity-85">{p.locked_out_claim}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[16.5px] leading-[1.75] text-ink">{p.text}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 font-sans">
                      <ConfidenceDot c={p.confidence} />
                      {p.sources.map((s) => (
                        <SourceChip key={s.source_id} s={s} onOpen={onOpen} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {draft.type === 'plaint' && (
            <div className="mt-6 border-t border-line pt-4 font-sans text-[12px] leading-relaxed text-ink-2">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                Verification (Order VI Rule 15 CPC)
              </p>
              <p className="mt-1">
                Verified at Mapusa, Goa that the contents of the paragraphs above are true and correct to the Plaintiff&rsquo;s knowledge and belief founded upon documents on record.
              </p>
            </div>
          )}
        </article>

        {approved && (
          <Well className="flex items-center gap-3 border-ok-200 bg-ok-50 text-ok">
            <ShieldCheck size={17} className="shrink-0" />
            <p className="text-[12.5px] font-medium">
              Approved &amp; sealed by Senior Counsel. Actor identity and SHA-256 hash recorded in the reviewer ledger.
            </p>
          </Well>
        )}
      </div>

      {/* Right 5 Cols: Persistent Authority Lock Gate */}
      <div className="lg:col-span-5">
        <AuthorityLock id={id} onOpen={onOpen} verifiedSample={verifiedSample} />
      </div>
    </div>
  )
}

function AuthorityLock({
  id,
  onOpen,
  verifiedSample,
}: {
  id: string
  onOpen: (s: SourceRef) => void
  verifiedSample: string
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ verified: boolean; source?: SourceRef; message: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const check = async () => {
    if (!text.trim()) return
    setBusy(true)
    setErr(null)
    setResult(null)
    sfx.tick()
    try {
      const r = await api.verifyCitation(id, text)
      setResult(r)
      if (r.verified) {
        sfx.accept()
        setText('')
      } else {
        sfx.reject()
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="sticky top-20 space-y-4">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div>
          <Label>Authority Lock · Citation Insertion Gate</Label>
          <p className="mt-0.5 text-[12px] text-ink-3">
            Only claims grounded in stored Indian Kanoon paragraphs can enter this pleading.
          </p>
        </div>
        <span
          className={cn(
            'rounded-[5px] border p-1.5',
            result
              ? result.verified
                ? 'border-ok-200 bg-ok-50 text-ok'
                : 'border-bad-200 bg-bad-50 text-bad'
              : 'border-line bg-sunken text-ink-3',
          )}
        >
          {result?.verified ? <LockOpen size={15} /> : <Lock size={15} />}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => {
            sfx.tick()
            setText('Sharma v. Union of India (2019) 4 SCC 112 held that an unregistered GPA confers absolute ownership.')
          }}
          className="rounded-[4px] border border-bad-200 bg-bad-50 px-2.5 py-1 text-[11px] font-medium text-bad hover:bg-bad-50/70"
        >
          Try Fabricated Citation (Rejects)
        </button>
        <button
          type="button"
          onClick={() => {
            sfx.tick()
            setText(verifiedSample)
          }}
          className="rounded-[4px] border border-ok-200 bg-ok-50 px-2.5 py-1 text-[11px] font-medium text-ok hover:bg-ok-50/70"
        >
          Try Verified Authority (Locks In)
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder='Paste a case citation or legal proposition to check against stored corpus (e.g. "Sharma v. Union of India (2019) 4 SCC 112…")'
        className="field"
      />

      {err && <ErrorBanner error={err} />}

      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-ink-3">Zero unverified citations permitted.</span>
        <button
          type="button"
          onClick={check}
          disabled={busy || !text.trim()}
          className="rounded-[5px] bg-navy px-4 py-1.5 text-[12px] font-medium text-white hover:bg-navy-600 disabled:opacity-50"
        >
          {busy ? 'Verifying…' : 'Verify & Insert'}
        </button>
      </div>

      {result && (
        <div
          className={cn(
            'rounded-[5px] border p-3 text-[13px]',
            result.verified ? 'border-ok-200 bg-ok-50 text-ok' : 'border-bad-200 bg-bad-50 text-bad',
          )}
        >
          <p className="serif text-[16px] font-medium">{result.message}</p>
          {result.source && (
            <div className="mt-2">
              <SourceChip s={result.source} onOpen={onOpen} />
            </div>
          )}
          {!result.verified && (
            <p className="mt-1 text-[11px]">Refused to insert into pleading. Authority Lock blocked unverified case law.</p>
          )}
        </div>
      )}
    </Card>
  )
}
