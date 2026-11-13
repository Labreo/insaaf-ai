import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Lock, LockOpen, Download, ShieldCheck } from 'lucide-react'
import { api } from '@/lib/api'
import type { SourceRef } from '@/lib/types'
import { Button, ConfidenceDot, Label, NoAuthority, Row, Skeleton, SourceChip, cx, ease, stagger, useAsync } from '@/components/ui'

export default function DraftTab({ id, onOpen }: { id: string; onOpen: (s: SourceRef) => void }) {
  const d = useAsync(() => api.draft(id), [id])
  if (d.loading || !d.data) return <Skeleton className="h-96" />
  const draft = d.data
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <Label>{draft.type.replace('_', ' ')} · {draft.model_version}</Label>
          <p className="mt-1 flex items-center gap-1.5 text-[12px] text-brass"><ShieldCheck size={13} /> {draft.watermark}</p>
        </div>
        <Button variant="ghost"><Download size={14} /> DOCX</Button>
      </div>

      <article className="space-y-4 rounded-card bg-velvet p-5 hairline">
        {draft.paragraphs.map((p, i) => (
          <motion.div key={p.id} {...stagger(i)} className="space-y-2">
            <p className={cx('serif text-[18px] leading-relaxed', p.sources.length === 0 && !p.locked_out_claim ? 'text-marble/90' : 'text-marble')}>
              {p.locked_out_claim ? <NoAuthority /> : p.text}
            </p>
            {p.locked_out_claim && (
              <p className="rounded-xl bg-graphite p-3 text-[12px] text-smoke"><Lock size={11} className="mr-1 inline" />Authority Lock removed: <span className="text-pewter line-through">{p.locked_out_claim}</span></p>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              <ConfidenceDot c={p.confidence} />
              {p.sources.map((s) => <SourceChip key={s.source_id} s={s} onOpen={onOpen} />)}
            </div>
          </motion.div>
        ))}
      </article>

      <AuthorityLock id={id} onOpen={onOpen} />
    </div>
  )
}

/** Hero demo moment: a judge pastes a citation; the lock rejects anything not in the stored corpus. */
function AuthorityLock({ id, onOpen }: { id: string; onOpen: (s: SourceRef) => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ verified: boolean; source?: SourceRef; message: string } | null>(null)

  const check = async () => {
    if (!text.trim()) return
    setBusy(true); setResult(null)
    const r = await api.verifyCitation(id, text)
    setResult(r); setBusy(false)
    if (navigator.vibrate) navigator.vibrate(r.verified ? 20 : [40, 40, 40])
  }

  return (
    <Row className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Authority lock · try to insert a citation</Label>
        <motion.span animate={result ? (result.verified ? { color: '#6fae8d' } : { color: '#d95c54', x: [0, -6, 6, -4, 4, 0] }) : { color: '#6f6f76' }} transition={{ duration: 0.45 }}>
          {result?.verified ? <LockOpen size={16} /> : <Lock size={16} />}
        </motion.span>
      </div>
      <textarea
        value={text} onChange={(e) => setText(e.target.value)} rows={2}
        placeholder='e.g. "Sharma v. Union of India (2019) 4 SCC 112 held that…"'
        className="w-full resize-none rounded-xl bg-graphite p-3 text-[14px] text-marble placeholder:text-smoke focus:outline-none focus:ring-1 focus:ring-brass/60"
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-smoke">Only text that matches a stored paragraph can enter the draft.</p>
        <Button onClick={check} disabled={busy} className={cx('h-10 px-4', busy && 'opacity-60')}>{busy ? 'Checking…' : 'Verify'}</Button>
      </div>
      <AnimatePresence mode="wait">
        {result && (
          <motion.div key={result.message + String(result.verified)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ ease }}
            className={cx('rounded-xl p-3 text-[13px]', result.verified ? 'bg-followed/10 text-followed' : 'bg-overruled/10 text-overruled')}>
            <p className="serif text-[16px]">{result.message}</p>
            {result.source && <div className="mt-2"><SourceChip s={result.source} onOpen={onOpen} /></div>}
            {!result.verified && <p className="mt-1 text-[11px] text-overruled/80">Refused to insert. The model is not allowed to invent a case.</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </Row>
  )
}
