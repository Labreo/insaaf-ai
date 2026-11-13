import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Lock, LockOpen, Download, ShieldCheck, Stamp } from 'lucide-react'
import { api } from '@/lib/api'
import { useDB } from '@/lib/store'
import type { SourceRef } from '@/lib/types'
import { ConfidenceDot, Glass, Label, NoAuthority, Skeleton, SourceChip, Well, ease, stagger, useAsync } from '@/components/primitives'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ShineBorder } from '@/components/magicui/shine-border'
import { draftToDocx, download } from '@/lib/docx'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'
import type { TabProps } from '../Matter'

/** F8 draft with locked citations, Authority Lock, approval, real DOCX export. */
export default function DraftTab({ id, onOpen, onReview }: TabProps) {
  const v = useDB((d) => d.stages[id]?.draft.paragraphs.length + ':' + d.stages[id]?.draft.watermark)
  const matter = useDB((d) => d.matters.find((m) => m.id === id))
  const role = useDB((d) => d.me.role)
  const d = useAsync(() => api.draft(id), [id, v])
  const [exporting, setExporting] = useState(false)
  if (d.loading || !d.data || !matter) return <Skeleton className="h-96" />
  const draft = d.data
  const approved = matter.status === 'approved'

  const exportDocx = async () => {
    setExporting(true); sfx.tick()
    const blob = await draftToDocx(matter, draft)
    download(blob, `${matter.title.replace(/[^a-z0-9]+/gi, '_').replace(/_+$/, '')}_${draft.type}.docx`)
    setExporting(false); sfx.accept()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Label>{draft.type.replace(/_/g, ' ')} · {draft.model_version}</Label>
          <p className={cn('mt-1 flex items-center gap-1.5 text-[12px]', approved ? 'text-followed' : 'text-brass')}><ShieldCheck size={13} /> <span className="truncate">{draft.watermark}</span></p>
        </div>
        <Button variant="ghost" disabled={exporting} onClick={exportDocx} className="h-9 shrink-0 rounded-full text-pewter"><Download size={14} /> {exporting ? '…' : 'DOCX'}</Button>
      </div>

      <article className="glass space-y-4 p-5">
        {draft.paragraphs.map((p, i) => (
          <motion.div key={p.id} {...stagger(i)} className="space-y-2">
            <p className="serif text-[18px] leading-relaxed text-marble">{p.locked_out_claim ? <NoAuthority /> : p.text}</p>
            {p.locked_out_claim && <Well className="text-[12px] text-smoke"><Lock size={11} className="mr-1 inline" />Authority Lock removed: <span className="text-pewter line-through">{p.locked_out_claim}</span></Well>}
            <div className="flex flex-wrap items-center gap-1.5">
              <ConfidenceDot c={p.confidence} />
              {p.sources.map((s) => <SourceChip key={s.source_id} s={s} onOpen={onOpen} />)}
            </div>
          </motion.div>
        ))}
      </article>

      <AuthorityLock id={id} onOpen={onOpen} />

      {!approved ? (
        <Button onClick={() => onReview({ target: 'draft', target_id: draft.type, title: `Approve ${draft.type.replace(/_/g, ' ')}`, action: 'approve' })} className="h-12 w-full rounded-full bg-brass text-void uppercase tracking-[0.1em] hover:bg-[#d6b676]">
          <Stamp size={15} /> {role === 'senior' ? 'Approve & seal' : 'Send to senior for approval'}
        </Button>
      ) : (
        <div className="glass flex items-center gap-3 border-followed/30 p-4"><ShieldCheck size={18} className="text-followed" /><p className="text-[13px] text-pewter">Approved. The approval, who gave it and when are in the ledger.</p></div>
      )}
    </div>
  )
}

/** Hero demo moment: paste a citation; the lock rejects anything not in the stored corpus. */
function AuthorityLock({ id, onOpen }: { id: string; onOpen: (s: SourceRef) => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ verified: boolean; source?: SourceRef; message: string } | null>(null)

  const check = async () => {
    if (!text.trim()) return
    setBusy(true); setResult(null); sfx.tick()
    const r = await api.verifyCitation(id, text)
    setResult(r); setBusy(false)
    if (r.verified) { sfx.accept(); setText('') } else sfx.reject()
  }

  return (
    <div className="relative">
      <Glass className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Authority lock · try to insert a citation</Label>
          <motion.span animate={result ? (result.verified ? { color: '#6fae8d' } : { color: '#d95c54', x: [0, -6, 6, -4, 4, 0] }) : { color: '#74747b' }} transition={{ duration: 0.45 }}>
            {result?.verified ? <LockOpen size={16} /> : <Lock size={16} />}
          </motion.span>
        </div>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder='e.g. "Sharma v. Union of India (2019) 4 SCC 112 held that…"' className="glass-well resize-none border-0 text-[14px] text-marble placeholder:text-smoke" />
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-smoke">Only text that matches a stored paragraph can enter the draft.</p>
          <Button onClick={check} disabled={busy} className="h-9 rounded-full bg-brass px-4 text-void uppercase tracking-[0.1em] hover:bg-[#d6b676]">{busy ? 'Checking…' : 'Verify'}</Button>
        </div>
        <AnimatePresence mode="wait">
          {result && (
            <motion.div key={result.message + String(result.verified)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ ease }} className={cn('rounded-xl p-3 text-[13px]', result.verified ? 'bg-followed/10 text-followed' : 'bg-overruled/10 text-overruled')}>
              <p className="serif text-[17px]">{result.message}</p>
              {result.source && <div className="mt-2"><SourceChip s={result.source} onOpen={onOpen} /></div>}
              {!result.verified && <p className="mt-1 text-[11px] text-overruled/80">Refused to insert. The model is not allowed to invent a case.</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </Glass>
      {result && !result.verified && <ShineBorder shineColor={['#d95c54', '#7a2b27']} duration={6} borderWidth={1.5} className="rounded-card" />}
      {result?.verified && <ShineBorder shineColor={['#6fae8d', '#c9a868']} duration={6} borderWidth={1.5} className="rounded-card" />}
    </div>
  )
}
