import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { FileText, FileUp, Mic, Square, Trash2, Upload } from 'lucide-react'
import { api } from '@/lib/api'
import type { CaseType, Matter, MatterDocument } from '@/lib/types'
import { Chip, Glass, Label, Title, Well, ease } from '@/components/primitives'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ShimmerButton } from '@/components/magicui/shimmer-button'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'

const types: { k: CaseType; label: string; hint: string }[] = [
  { k: 'property', label: 'Property', hint: 'title · possession · injunction' },
  { k: 'civil_recovery', label: 'Civil recovery', hint: 'money suits · contracts' },
  { k: 'criminal', label: 'Criminal', hint: 'bail · plea eligibility' },
]
const langs: { k: NonNullable<Matter['client_language']>; label: string }[] = [{ k: 'en', label: 'English' }, { k: 'kok', label: 'कोंकणी' }, { k: 'mr', label: 'मराठी' }, { k: 'hi', label: 'हिन्दी' }]

/** F4 intake: real file picking + in-browser voice recording, then the pipeline runs. */
export default function NewMatter() {
  const nav = useNavigate()
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [type, setType] = useState<CaseType>('property')
  const [lang, setLang] = useState<NonNullable<Matter['client_language']>>('kok')
  const [title, setTitle] = useState('')
  const [forum, setForum] = useState('')
  const [matter, setMatter] = useState<Matter | null>(null)
  const [docs, setDocs] = useState<MatterDocument[]>([])
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const next = async () => {
    sfx.tap()
    if (step === 0) return setStep(1)
    if (step === 1) {
      setBusy(true)
      const m = await api.createMatter({ title, case_type: type, client_language: lang, forum_hint: forum || undefined })
      setMatter(m); setBusy(false); setStep(2)
      return
    }
    if (matter) nav(`/matters/${matter.id}?tab=pipeline&run=1`)
  }

  const onFiles = async (files: FileList | null) => {
    if (!files || !matter) return
    setBusy(true)
    for (const f of Array.from(files)) { const d = await api.addDocument(matter.id, f); setDocs((x) => [...x, d]); sfx.tick() }
    setBusy(false)
  }

  return (
    <div className="space-y-6">
      <Title kicker={`New matter · step ${step + 1} of 3`}>{step === 0 ? 'What kind of dispute?' : step === 1 ? 'Name the matter.' : 'What did the client bring?'}</Title>

      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => <motion.span key={i} className={cn('h-1 flex-1 rounded-full', i <= step ? 'bg-brass' : 'bg-marble/10')} layout transition={{ duration: 0.4, ease }} />)}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.35, ease }} className="space-y-5">
          {step === 0 && (
            <>
              <div className="grid gap-2">
                {types.map((t) => (
                  <button key={t.k} onClick={() => { sfx.tick(); setType(t.k) }} className={cn('glass relative flex items-center justify-between p-4 text-left transition-colors', type === t.k ? 'border-brass/40' : '')}>
                    {type === t.k && <motion.span layoutId="type-pill" className="absolute inset-0 rounded-card bg-brass/8" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
                    <span className="relative"><p className="text-[16px] text-marble">{t.label}</p><p className="text-[11px] text-smoke">{t.hint}</p></span>
                    <span className={cn('relative h-4 w-4 rounded-full border', type === t.k ? 'border-brass bg-brass' : 'border-marble/20')} />
                  </button>
                ))}
              </div>
              <div>
                <Label className="mb-2">Client speaks</Label>
                <div className="flex flex-wrap gap-2">
                  {langs.map((l) => <button key={l.k} onClick={() => { sfx.tick(); setLang(l.k) }} className={cn('devanagari rounded-full border px-3.5 py-2 text-[13px] transition-colors', lang === l.k ? 'border-brass/40 bg-brass/10 text-marble' : 'border-marble/10 text-pewter')}>{l.label}</button>)}
                </div>
                <p className="mt-2 text-[11px] text-smoke">Voice notes are transcribed and translated with the original shown next to the English, so the advocate verifies rather than trusts.</p>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div>
                <Label className="mb-2">Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fernandes v. Naik — possession, Mapusa" className="glass-well h-12 border-0 text-[15px] text-marble placeholder:text-smoke" autoFocus />
              </div>
              <div>
                <Label className="mb-2">Forum hint (optional)</Label>
                <Input value={forum} onChange={(e) => setForum(e.target.value)} placeholder="Civil Judge Senior Division, Mapusa" className="glass-well h-12 border-0 text-[15px] text-marble placeholder:text-smoke" />
              </div>
              <Well><p className="text-[12px] text-pewter"><Chip tone="brass" className="mr-2">{types.find((t) => t.k === type)?.label}</Chip>The Proof Ledger and Statute Clock use the {type.replace('_', ' ')} rule pack written by the legal lead.</p></Well>
            </>
          )}

          {step === 2 && matter && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => fileRef.current?.click()} className="glass flex flex-col items-start gap-2 p-4 text-left hover:border-brass/40">
                  <FileUp size={18} className="text-brass" strokeWidth={1.6} />
                  <p className="text-[14px] text-marble">PDF / DOCX</p>
                  <p className="text-[11px] text-smoke">agreements · notices · replies</p>
                </button>
                <Recorder onDone={async (file) => { const d = await api.addDocument(matter.id, file); setDocs((x) => [...x, d]) }} />
              </div>
              <input ref={fileRef} type="file" multiple accept=".pdf,.doc,.docx,audio/*" className="hidden" onChange={(e) => onFiles(e.target.files)} />

              <div
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files) }}
                className="glass-well flex items-center justify-center gap-2 border-dashed py-4 text-[12px] text-smoke"
              >
                <Upload size={14} /> drop files here
              </div>

              {docs.length > 0 && (
                <Glass>
                  <Label className="mb-2">Attached · {docs.length}</Label>
                  <ul className="divide-y divide-marble/6">
                    {docs.map((d) => (
                      <li key={d.id} className="flex items-center gap-3 py-2.5">
                        {d.kind === 'voice' ? <Mic size={15} className="text-steel" /> : <FileText size={15} className="text-steel" />}
                        <span className="min-w-0 flex-1 truncate text-[13px] text-marble">{d.name}</span>
                        <span className="text-[11px] text-smoke">{(d.size / 1024).toFixed(0)} KB</span>
                        <button aria-label="Remove" onClick={async () => { await api.removeDocument(matter.id, d.id); setDocs((x) => x.filter((y) => y.id !== d.id)) }} className="p-1 text-smoke hover:text-overruled"><Trash2 size={13} /></button>
                      </li>
                    ))}
                  </ul>
                </Glass>
              )}
              <p className="text-[11px] text-smoke">Files stay on your device until a backend is connected. Nothing is uploaded elsewhere.</p>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex gap-2 pt-2">
        {step > 0 && <Button variant="ghost" className="h-12 rounded-full px-5" onClick={() => setStep((s) => (s - 1) as 0 | 1 | 2)}>Back</Button>}
        {step < 2 ? (
          <Button disabled={busy || (step === 1 && !title.trim())} onClick={next} className="h-12 flex-1 rounded-full bg-brass text-void uppercase tracking-[0.1em] hover:bg-[#d6b676]">{busy ? 'Creating…' : 'Continue'}</Button>
        ) : (
          <ShimmerButton onClick={next} background="#c9a868" shimmerColor="#fff6dc" className="h-12 flex-1 text-[13px] font-medium uppercase tracking-[0.1em] text-void">Run the pipeline{docs.length === 0 ? ' with demo documents' : ''}</ShimmerButton>
        )}
      </div>
      {step === 2 && <p className="text-center text-[11px] text-smoke">You can run with no files: the engine uses the bundled demo documents for this case type.</p>}
    </div>
  )
}

function Recorder({ onDone }: { onDone: (f: File) => void }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null)
  const [secs, setSecs] = useState(0)
  const chunks = useRef<Blob[]>([])
  const timer = useRef<number | null>(null)

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const r = new MediaRecorder(stream)
      chunks.current = []
      r.ondataavailable = (e) => chunks.current.push(e.data)
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunks.current, { type: r.mimeType || 'audio/webm' })
        onDone(new File([blob], `client_note_${Date.now()}.webm`, { type: blob.type }))
        if (timer.current) window.clearInterval(timer.current)
        setSecs(0); setRec(null)
      }
      r.start(); setRec(r); sfx.accept()
      timer.current = window.setInterval(() => setSecs((s) => s + 1), 1000)
    } catch { alert('Microphone not available. Pick an audio file instead.') }
  }

  return (
    <button onClick={() => (rec ? rec.stop() : start())} className={cn('glass flex flex-col items-start gap-2 p-4 text-left transition-colors', rec ? 'border-overruled/50' : 'hover:border-brass/40')}>
      {rec ? <Square size={18} className="text-overruled" /> : <Mic size={18} className="text-brass" strokeWidth={1.6} />}
      <p className="text-[14px] text-marble">{rec ? `Recording ${secs}s` : 'Voice note'}</p>
      <p className="text-[11px] text-smoke">{rec ? 'tap to stop' : 'Konkani · Marathi · Hindi'}</p>
      {rec && <motion.span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-overruled" animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1, repeat: Infinity }} />}
    </button>
  )
}
