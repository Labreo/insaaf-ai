import { useState } from 'react'
import { motion } from 'motion/react'
import { Download, Lock, LockOpen, ShieldCheck, Stamp } from 'lucide-react'
import { api } from '@/lib/api'
import { useDB } from '@/lib/store'
import type { SourceRef } from '@/lib/types'
import { Chip, ConfidenceDot, Glass, Label, NoAuthority, Skeleton, SourceChip, Well, ease, stagger, useAsync } from '@/components/primitives'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { draftToDocx } from '@/lib/docx'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'
import type { TabProps } from '../Matter'

/** F8 + Authority Lock: side-by-side pleading workbench + live citation verification. */
export default function DraftTab({ id, onOpen, onReview }: TabProps) {
  const matter = useDB((d) => d.matters.find((m) => m.id === id))
  const v = useDB((d) => (d.stages[id]?.draft.paragraphs.length ?? 0) + ':' + d.matters.find((m) => m.id === id)?.status)
  const role = useDB((d) => d.me.role)
  const d = useAsync(() => api.draft(id), [id, v])
  const [exporting, setExporting] = useState(false)

  if (d.loading || !d.data) return <Skeleton className="h-96" />
  const draft = d.data
  const approved = matter?.status === 'approved'

  const exportDocx = async () => {
    if (!matter) return
    setExporting(true)
    sfx.tick()
    let blob: Blob
    try {
      const base = import.meta.env.VITE_API_BASE ?? '/v1'
      const res = await fetch(`${base}/matters/${id}/draft/export?format=docx`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      blob = await res.blob()
    } catch {
      blob = await draftToDocx(matter, draft)
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${matter.title.replace(/[^a-z0-9]+/gi, '_').replace(/_+$/, '')}_${draft.type}.docx`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setExporting(false)
    sfx.accept()
  }

  const firstSource = draft.paragraphs.flatMap((p) => p.sources)[0]
  const verifiedSample = firstSource
    ? `${firstSource.title} governs the relief claimed on record.`
    : 'Suraj Lamp & Industries v. State of Haryana held that an unregistered agreement or power of attorney does not convey title.'

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left 7 Cols: Formal Legal Pleading Document */}
      <div className="space-y-4 lg:col-span-7">
        <Glass className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Label>{draft.type.replace(/_/g, ' ')}</Label>
              <Chip tone="steel">{draft.model_version}</Chip>
            </div>
            <p className={cn('mt-1 flex items-center gap-1.5 text-[12px]', approved ? 'text-followed' : 'text-brass')}>
              <ShieldCheck size={13} />
              <span className="truncate">{draft.watermark}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" disabled={exporting} onClick={exportDocx} className="h-8 rounded-md border border-seam px-3 text-[12px] text-pewter hover:text-marble">
              <Download size={13} /> {exporting ? 'Exporting…' : 'Export DOCX'}
            </Button>
            {!approved && (
              <Button
                onClick={() => onReview({ target: 'draft', target_id: draft.type, title: `Approve ${draft.type.replace(/_/g, ' ')}`, action: 'approve' })}
                className="h-8 rounded-md bg-brass px-3.5 text-[11px] font-medium uppercase tracking-[0.06em] text-void hover:bg-[#d6b676]"
              >
                <Stamp size={13} /> {role === 'senior' ? 'Approve & seal' : 'Send to senior'}
              </Button>
            )}
          </div>
        </Glass>

        <article className="glass space-y-5 p-6">
          <div className="border-b border-seam pb-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-smoke">Draft Pleading · Verified Record Excerpts</p>
            <h2 className="serif mt-1 text-[24px] text-marble">{matter?.title.replace(' (FICTIONAL)', '')}</h2>
          </div>

          <div className="divide-y divide-seam/60">
            {draft.paragraphs.map((p, i) => (
              <motion.div key={p.id} {...stagger(i)} className="space-y-2 py-4 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <span className="mt-1 w-6 shrink-0 font-mono text-[11px] text-smoke">{i + 1}.</span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="serif text-[18px] leading-relaxed text-marble">
                      {p.locked_out_claim ? <NoAuthority /> : p.text}
                    </p>
                    {p.locked_out_claim && (
                      <Well className="text-[12px] text-smoke">
                        <Lock size={11} className="mr-1 inline text-overruled" />
                        Authority Lock removed: <span className="text-pewter line-through">{p.locked_out_claim}</span>
                      </Well>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ConfidenceDot c={p.confidence} />
                      {p.sources.map((s) => <SourceChip key={s.source_id} s={s} onOpen={onOpen} />)}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </article>

        {approved && (
          <Glass className="flex items-center gap-3 border-followed/35 bg-followed/[0.04]">
            <ShieldCheck size={18} className="shrink-0 text-followed" />
            <p className="text-[13px] text-pewter">Approved & sealed by senior counsel. Actor identity and timestamp recorded in the immutable ledger.</p>
          </Glass>
        )}
      </div>

      {/* Right 5 Cols: Persistent Authority Lock Workbench */}
      <div className="space-y-4 lg:col-span-5">
        <AuthorityLock id={id} onOpen={onOpen} verifiedSample={verifiedSample} />
      </div>
    </div>
  )
}

/** Hero demo moment: paste a citation; the lock rejects anything not in the stored corpus. */
function AuthorityLock({ id, onOpen, verifiedSample }: { id: string; onOpen: (s: SourceRef) => void; verifiedSample: string }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ verified: boolean; source?: SourceRef; message: string } | null>(null)

  const check = async () => {
    if (!text.trim()) return
    setBusy(true)
    setResult(null)
    sfx.tick()
    const r = await api.verifyCitation(id, text)
    setResult(r)
    setBusy(false)
    if (r.verified) {
      sfx.accept()
      setText('')
    } else {
      sfx.reject()
    }
  }

  return (
    <Glass className="space-y-4 sticky top-20">
      <div className="flex items-center justify-between border-b border-seam pb-3">
        <div>
          <Label>Authority lock · citation insertion gate</Label>
          <p className="mt-1 text-[12px] text-smoke">Only text grounded in the verified corpus can enter this pleading.</p>
        </div>
        <span className={cn('rounded-md p-1.5', result ? (result.verified ? 'bg-followed/15 text-followed' : 'bg-overruled/15 text-overruled') : 'bg-graphite text-smoke')}>
          {result?.verified ? <LockOpen size={15} /> : <Lock size={15} />}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => { sfx.tick(); setText('Sharma v. Union of India (2019) 4 SCC 112 held that an unregistered GPA confers absolute ownership.') }}
          className="rounded-md border border-overruled/30 bg-overruled/10 px-2.5 py-1 text-[11px] text-overruled hover:bg-overruled/20"
        >
          Try fabricated citation (rejects)
        </button>
        <button
          type="button"
          onClick={() => { sfx.tick(); setText(verifiedSample) }}
          className="rounded-md border border-followed/30 bg-followed/10 px-2.5 py-1 text-[11px] text-followed hover:bg-followed/20"
        >
          Try verified corpus authority (locks in)
        </button>
      </div>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder='Paste a case citation or legal proposition to verify against the corpus (e.g. "Sharma v. Union of India (2019) 4 SCC 112…")'
        className="glass-well resize-none border border-seam text-[13px] text-marble placeholder:text-smoke"
      />

      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-smoke">Zero unverified citations allowed.</span>
        <Button onClick={check} disabled={busy || !text.trim()} className="h-9 rounded-md bg-brass px-4 text-[12px] font-medium uppercase tracking-[0.06em] text-void hover:bg-[#d6b676]">
          {busy ? 'Checking…' : 'Verify'}
        </Button>
      </div>

      {result && (
        <motion.div
          key={result.message + String(result.verified)}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ease }}
          className={cn('rounded-md border p-3 text-[13px]', result.verified ? 'border-followed/35 bg-followed/10 text-followed' : 'border-overruled/35 bg-overruled/10 text-overruled')}
        >
          <p className="serif text-[17px]">{result.message}</p>
          {result.source && <div className="mt-2"><SourceChip s={result.source} onOpen={onOpen} /></div>}
          {!result.verified && <p className="mt-1 text-[11px] text-overruled/85">Refused to insert. Models cannot fabricate case law.</p>}
        </motion.div>
      )}
    </Glass>
  )
}
