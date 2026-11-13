import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, FileUp, Mic, PenLine, Play, Sparkles, Square, Trash2, Upload } from 'lucide-react'
import { api } from '@/lib/api'
import type { CaseType, Matter } from '@/lib/types'
import { Chip, Glass, Label, Section, Title, Well } from '@/components/primitives'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'

const types: { k: CaseType; label: string; hint: string }[] = [
  { k: 'property', label: 'Property', hint: 'title · possession · injunction' },
  { k: 'civil_recovery', label: 'Civil recovery', hint: 'money suits · contracts · s.12A' },
  { k: 'criminal', label: 'Criminal', hint: 'bail · BNS/BNSS · plea eligibility' },
]
const langs: { k: NonNullable<Matter['client_language']>; label: string }[] = [
  { k: 'en', label: 'English' },
  { k: 'kok', label: 'कोंकणी' },
  { k: 'mr', label: 'मराठी' },
  { k: 'hi', label: 'हिन्दी' },
]

const SAMPLES: Record<CaseType, { filename: string; label: string; content: string }[]> = {
  property: [
    {
      filename: 'agreement_of_sale_gpa.txt',
      label: 'Sale Agreement + GPA',
      content: 'AGREEMENT OF SALE AND GENERAL POWER OF ATTORNEY executed on 2009-02-14 at Mapusa, Goa between Shri Naik (bhatkar representative) and Smt. Maria Fernandes regarding Survey No. 44/2, Sub-Division 3. Unregistered notarised instrument; Stamp duty paid at Rs. 100. Buyer has paid Rs. 8,50,000 in instalments (receipt for final payment pending); Form I & XIV still stands in opposite party name.',
    },
    {
      filename: 'client_voice_transcript_kok.json',
      label: 'Konkani client note',
      content: JSON.stringify({
        language: 'kok',
        duration_range: '00:12–00:24',
        original_text: 'हांव २००९ सावन ह्या जमनीर रावतां. म्हाका मुखत्यारपत्र आनी करार दिलो, पूण रजिस्टर विक्री खत जावंक ना.',
        english_translation: 'I have lived on this plot since 2009. I was given a power of attorney and agreement, but no registered sale deed was executed.',
        translation_confidence: 'medium',
      }),
    },
  ],
  civil_recovery: [
    {
      filename: 'shetty_commercial_invoices.txt',
      label: 'Invoices + s.18 Ack',
      content: 'Commercial dispute Rs. 4,20,000 against 6 invoices (Jan–Apr 2026) supplied by Shetty Traders to Coastal Hospitality. Written email acknowledgment dated 2026-05-12 confirms Rs. 4,20,000 balance. Statutory demand notice sent by email; no postal acknowledgment on file. Commercial Courts Act s.12A pre-institution mediation required.',
    },
  ],
  criminal: [
    {
      filename: 'bns_303_chargesheet.txt',
      label: 'BNS s.303(2) Chargesheet',
      content: 'FIR & Chargesheet under BNS s.303(2) (punishable up to 3 years imprisonment, below 7 years) filed before JMFC Mapusa on 2026-09-03. Offence is not a socio-economic offence and is not committed against a woman or child under 14. Antecedents verification report awaited; complainant open to restitution under BNSS s.290.',
    },
  ],
}

interface StagedDoc {
  id: string
  file: File
  kind: 'voice' | 'doc'
}

/** Desktop Matter Intake & Evidence Ingestion Workbench. */
export default function NewMatter() {
  const nav = useNavigate()
  const [type, setType] = useState<CaseType>('property')
  const [lang, setLang] = useState<NonNullable<Matter['client_language']>>('kok')
  const [title, setTitle] = useState('')
  const [forum, setForum] = useState('')
  const [staged, setStaged] = useState<StagedDoc[]>([])
  const [composeOpen, setComposeOpen] = useState(false)
  const [docName, setDocName] = useState('chamber_brief_notes.txt')
  const [docText, setDocText] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const addFiles = (files: FileList | null) => {
    if (!files) return
    const items: StagedDoc[] = Array.from(files).map((f, idx) => ({
      id: `${Date.now()}-${idx}-${f.name}`,
      file: f,
      kind: f.type.startsWith('audio/') || f.name.endsWith('.wav') || f.name.endsWith('.webm') ? 'voice' : 'doc',
    }))
    setStaged((prev) => [...prev, ...items])
    sfx.tick()
  }

  const stageText = (name: string, text: string) => {
    if (!text.trim()) return
    const filename = name.trim() || 'case_notes.txt'
    const file = new File([text.trim()], filename, { type: 'text/plain' })
    setStaged((prev) => [...prev, { id: `${Date.now()}-${filename}`, file, kind: filename.includes('voice') ? 'voice' : 'doc' }])
    sfx.accept()
    setDocText('')
    setComposeOpen(false)
  }

  const launchPipeline = async () => {
    if (!title.trim() || busy) return
    setBusy(true)
    sfx.tap()
    try {
      const m = await api.createMatter({
        title: title.trim(),
        case_type: type,
        client_language: lang,
        forum_hint: forum.trim() || undefined,
      })
      for (const item of staged) {
        await api.addDocument(m.id, item.file)
      }
      nav(`/matters/${m.id}?tab=pipeline&run=1`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-seam pb-5">
        <Title kicker="Matter Intake & Evidence Ingestion">Create Matter & Launch Verification Pipeline</Title>
        <Button
          disabled={busy || !title.trim()}
          onClick={launchPipeline}
          className="h-10 rounded-md bg-brass px-5 text-[12px] font-medium uppercase tracking-[0.06em] text-void hover:bg-[#d6b676]"
        >
          <Play size={14} /> {busy ? 'Initializing workspace…' : 'Run live 11-stage pipeline'}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Matter Particulars */}
        <div className="space-y-5 lg:col-span-5">
          <Section title="1 · Dispute classification & jurisdiction">
            <Glass className="space-y-4">
              <div>
                <Label className="mb-2">Practice area / Rule pack</Label>
                <div className="grid gap-2">
                  {types.map((t) => (
                    <button
                      key={t.k}
                      type="button"
                      onClick={() => { sfx.tick(); setType(t.k) }}
                      className={cn(
                        'flex items-center justify-between rounded-md border p-3 text-left transition-colors',
                        type === t.k ? 'border-brass/45 bg-brass/10' : 'border-seam bg-graphite/60 hover:border-marble/20',
                      )}
                    >
                      <span>
                        <p className="text-[14px] font-medium text-marble">{t.label}</p>
                        <p className="text-[11px] text-smoke">{t.hint}</p>
                      </span>
                      <span className={cn('h-3.5 w-3.5 rounded-full border', type === t.k ? 'border-brass bg-brass' : 'border-marble/25')} />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="mb-2">Matter title</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Fernandes v. Naik — possession, Mapusa"
                  className="glass-well h-10 border border-seam text-[14px] text-marble placeholder:text-smoke"
                  autoFocus
                />
              </div>

              <div>
                <Label className="mb-2">Forum / Court hint (optional)</Label>
                <Input
                  value={forum}
                  onChange={(e) => setForum(e.target.value)}
                  placeholder="Civil Judge Senior Division, Mapusa"
                  className="glass-well h-10 border border-seam text-[14px] text-marble placeholder:text-smoke"
                />
              </div>

              <div>
                <Label className="mb-2">Client primary language</Label>
                <div className="flex flex-wrap gap-1.5">
                  {langs.map((l) => (
                    <button
                      key={l.k}
                      type="button"
                      onClick={() => { sfx.tick(); setLang(l.k) }}
                      className={cn(
                        'devanagari rounded-md border px-3 py-1.5 text-[12px] transition-colors',
                        lang === l.k ? 'border-brass/45 bg-brass/12 text-marble' : 'border-seam bg-graphite text-pewter hover:text-marble',
                      )}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-smoke">Voice transcripts preserve verbatim regional quotes side-by-side with English translation confidence.</p>
              </div>
            </Glass>
          </Section>

          <Well>
            <p className="text-[12px] text-pewter">
              <Chip tone="brass" className="mr-2">{types.find((t) => t.k === type)?.label}</Chip>
              Deterministic Proof Ledger & Statute Clock rules apply automatically for <strong className="text-marble">{type.replace('_', ' ')}</strong>.
            </p>
          </Well>
        </div>

        {/* Right Column: Evidence Upload, Paste Composer, Sample Briefs */}
        <div className="space-y-5 lg:col-span-7">
          <Section title="2 · Attach instruments, pleadings, or voice notes">
            <Glass className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => fileRef.current?.click()} className="flex items-start gap-3 rounded-md border border-seam bg-graphite p-3.5 text-left transition-colors hover:border-brass/40">
                  <FileUp size={18} className="mt-0.5 shrink-0 text-brass" strokeWidth={1.6} />
                  <div>
                    <p className="text-[13px] font-medium text-marble">Upload PDF / DOCX / Text</p>
                    <p className="text-[11px] text-smoke">Agreements, notices, pleadings, Form I & XIV</p>
                  </div>
                </button>
                <Recorder onDone={(file) => setStaged((prev) => [...prev, { id: `${Date.now()}-rec`, file, kind: 'voice' }])} />
              </div>

              <input ref={fileRef} type="file" multiple accept=".pdf,.doc,.docx,.txt,audio/*" className="hidden" onChange={(e) => addFiles(e.target.files)} />

              <div className="flex flex-wrap items-center gap-2 border-t border-seam pt-3">
                <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-smoke">Quick actions:</span>
                <Button variant="ghost" onClick={() => { sfx.tick(); setComposeOpen((o) => !o) }} className="h-8 rounded-md border border-seam px-3 text-[12px] text-pewter hover:border-brass/40 hover:text-marble">
                  <PenLine size={13} /> Paste facts / FIR / clause
                </Button>
                {SAMPLES[type].map((s) => (
                  <Button key={s.filename} variant="ghost" disabled={busy} onClick={() => stageText(s.filename, s.content)} className="h-8 rounded-md border border-brass/30 bg-brass/10 px-3 text-[11px] text-brass hover:bg-brass/20">
                    <Sparkles size={12} /> {s.label}
                  </Button>
                ))}
              </div>

              {composeOpen && (
                <div className="space-y-3 rounded-md border border-seam bg-graphite/60 p-3.5">
                  <Label>Paste case notes, contract text, or FIR excerpt</Label>
                  <Input value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="filename.txt" className="glass-well h-9 border border-seam text-[13px] text-marble placeholder:text-smoke" />
                  <Textarea value={docText} onChange={(e) => setDocText(e.target.value)} rows={4} placeholder="Paste facts, payment dates (YYYY-MM-DD), sections (e.g. IPC 420 / BNS 318), or party statements…" className="glass-well resize-none border border-seam text-[13px] text-marble placeholder:text-smoke" />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" className="h-8 rounded-md border border-seam" onClick={() => setComposeOpen(false)}>Cancel</Button>
                    <Button disabled={!docText.trim()} onClick={() => stageText(docName, docText)} className="h-8 rounded-md bg-brass px-3.5 text-void uppercase tracking-[0.06em] hover:bg-[#d6b676]">Attach document</Button>
                  </div>
                </div>
              )}

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
                className="flex items-center justify-center gap-2 rounded-md border border-dashed border-seam bg-void/40 py-6 text-[12px] text-smoke"
              >
                <Upload size={14} /> Drag & drop client files (PDF, DOCX, TXT, WAV/WEBM) here
              </div>

              <div>
                <Label className="mb-2">Staged documents ({staged.length})</Label>
                {staged.length === 0 ? (
                  <p className="rounded-md border border-seam/70 bg-void/30 px-3.5 py-3 text-[12px] text-smoke">
                    No files staged yet. Attach a file, record a voice note, or click a sample instrument button above.
                  </p>
                ) : (
                  <ul className="divide-y divide-seam rounded-md border border-seam bg-graphite/40">
                    {staged.map((d) => (
                      <li key={d.id} className="flex items-center gap-3 px-3.5 py-2.5">
                        {d.kind === 'voice' ? <Mic size={15} className="text-steel" /> : <FileText size={15} className="text-steel" />}
                        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-marble">{d.file.name}</span>
                        <span className="text-[11px] text-smoke">{Math.max(1, Math.round(d.file.size / 1024))} KB</span>
                        <button aria-label="Remove" onClick={() => setStaged((x) => x.filter((y) => y.id !== d.id))} className="p-1 text-smoke hover:text-overruled">
                          <Trash2 size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-seam pt-3">
                <p className="text-[11px] text-smoke">Processed strictly within Chamber A with paragraph-level source tracking.</p>
                <Button disabled={busy || !title.trim()} onClick={launchPipeline} className="h-9 rounded-md bg-brass px-4 text-[12px] font-medium uppercase tracking-[0.06em] text-void hover:bg-[#d6b676]">
                  <Play size={13} /> {busy ? 'Running…' : 'Create & Run Pipeline'}
                </Button>
              </div>
            </Glass>
          </Section>
        </div>
      </div>
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
        setSecs(0)
        setRec(null)
      }
      r.start()
      setRec(r)
      sfx.accept()
      timer.current = window.setInterval(() => setSecs((s) => s + 1), 1000)
    } catch {
      alert('Microphone not available. Pick an audio file instead.')
    }
  }

  return (
    <button type="button" onClick={() => (rec ? rec.stop() : start())} className={cn('relative flex items-start gap-3 rounded-md border p-3.5 text-left transition-colors', rec ? 'border-overruled/50 bg-overruled/10' : 'border-seam bg-graphite hover:border-brass/40')}>
      {rec ? <Square size={18} className="mt-0.5 shrink-0 text-overruled" /> : <Mic size={18} className="mt-0.5 shrink-0 text-brass" strokeWidth={1.6} />}
      <div>
        <p className="text-[13px] font-medium text-marble">{rec ? `Recording (${secs}s) — Click to stop` : 'Record Voice Statement'}</p>
        <p className="text-[11px] text-smoke">Konkani · Marathi · Hindi transcription</p>
      </div>
    </button>
  )
}
