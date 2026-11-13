import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, FileUp, Mic, PenLine, Play, Sparkles, Square, Trash2, Upload } from 'lucide-react'
import { api } from '@/lib/api'
import type { CaseType, Matter } from '@/lib/types'
import { Badge, Card, ErrorBanner, Label, PageHeader, Section } from '@/components/primitives'
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
      content:
        'AGREEMENT OF SALE AND GENERAL POWER OF ATTORNEY executed on 2009-02-14 at Mapusa, Goa between Shri Naik (bhatkar representative) and Smt. Maria Fernandes regarding Survey No. 44/2, Sub-Division 3. Unregistered notarised instrument; Stamp duty paid at Rs. 100. Buyer has paid Rs. 8,50,000 in instalments (receipt for final payment pending); Form I & XIV still stands in opposite party name.',
    },
    {
      filename: 'client_voice_transcript_kok.json',
      label: 'Konkani client note',
      content: JSON.stringify({
        language: 'kok',
        duration_range: '00:12–00:24',
        original_text:
          'हांव २००९ सावन ह्या जमनीर रावतां. म्हाका मुखत्यारपत्र आनी करार दिलो, पूण रजिस्टर विक्री खत जावंक ना.',
        english_translation:
          'I have lived on this plot since 2009. I was given a power of attorney and agreement, but no registered sale deed was executed.',
        translation_confidence: 'medium',
      }),
    },
  ],
  civil_recovery: [
    {
      filename: 'shetty_commercial_invoices.txt',
      label: 'Invoices + s.18 Ack',
      content:
        'Commercial dispute Rs. 4,20,000 against 6 invoices (Jan–Apr 2026) supplied by Shetty Traders to Coastal Hospitality. Written email acknowledgment dated 2026-05-12 confirms Rs. 4,20,000 balance. Statutory demand notice sent by email; no postal acknowledgment on file. Commercial Courts Act s.12A pre-institution mediation required.',
    },
  ],
  criminal: [
    {
      filename: 'bns_303_chargesheet.txt',
      label: 'BNS s.303(2) Chargesheet',
      content:
        'FIR & Chargesheet under BNS s.303(2) (punishable up to 3 years imprisonment, below 7 years) filed before JMFC Mapusa on 2026-09-03. Offence is not a socio-economic offence and is not committed against a woman or child under 14. Antecedents verification report awaited; complainant open to restitution under BNSS s.290.',
    },
  ],
}

interface StagedDoc {
  id: string
  file: File
  kind: 'voice' | 'doc'
}

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
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const addFiles = (files: FileList | null) => {
    if (!files) return
    const items: StagedDoc[] = Array.from(files).map((f, idx) => ({
      id: `${Date.now()}-${idx}-${f.name}`,
      file: f,
      kind:
        f.type.startsWith('audio/') || f.name.endsWith('.wav') || f.name.endsWith('.webm')
          ? 'voice'
          : 'doc',
    }))
    setStaged((prev) => [...prev, ...items])
    sfx.tick()
  }

  const stageText = (name: string, text: string) => {
    if (!text.trim()) return
    const filename = name.trim() || 'case_notes.txt'
    const file = new File([text.trim()], filename, { type: 'text/plain' })
    setStaged((prev) => [
      ...prev,
      { id: `${Date.now()}-${filename}`, file, kind: filename.includes('voice') ? 'voice' : 'doc' },
    ])
    sfx.accept()
    setDocText('')
    setComposeOpen(false)
  }

  const launchPipeline = async () => {
    if (!title.trim() || busy) return
    setBusy(true)
    setErr(null)
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
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Matter Intake & Evidence Ingestion"
        title="Create Matter & Launch 11-Stage Pipeline"
        description="Classify the dispute, select the client's primary language for Bhashini/Devanagari extraction, and stage evidentiary instruments."
        right={
          <button
            type="button"
            disabled={busy || !title.trim()}
            onClick={launchPipeline}
            className="inline-flex items-center gap-2 rounded-[5px] bg-navy px-4 py-2 text-[12px] font-medium text-white transition-colors hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play size={13} /> {busy ? 'Creating matter…' : 'Create & Run Pipeline'}
          </button>
        }
      />

      {err && <ErrorBanner error={err} />}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left 5 Cols: Matter Particulars */}
        <div className="space-y-5 lg:col-span-5">
          <Section title="1 · Dispute Classification & Jurisdiction">
            <Card className="space-y-4">
              <div>
                <Label className="mb-2">Practice Area / Rule Pack</Label>
                <div className="grid gap-2">
                  {types.map((t) => (
                    <button
                      key={t.k}
                      type="button"
                      onClick={() => {
                        sfx.tick()
                        setType(t.k)
                      }}
                      className={cn(
                        'flex items-center justify-between rounded-[5px] border px-3 py-2.5 text-left transition-colors',
                        type === t.k
                          ? 'border-navy bg-navy-50'
                          : 'border-line bg-sunken hover:bg-hover',
                      )}
                    >
                      <span>
                        <p className={cn('text-[13px] font-medium', type === t.k ? 'text-navy' : 'text-ink')}>
                          {t.label}
                        </p>
                        <p className="text-[11px] text-ink-3">{t.hint}</p>
                      </span>
                      <span
                        className={cn(
                          'h-3.5 w-3.5 rounded-full border',
                          type === t.k ? 'border-navy bg-navy' : 'border-line-strong bg-surface',
                        )}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="mb-1.5">Matter Title</Label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Desai v. Naik — Plot possession, Mapusa"
                  className="field"
                  autoFocus
                />
              </div>

              <div>
                <Label className="mb-1.5">Forum / Court Hint (Optional)</Label>
                <input
                  value={forum}
                  onChange={(e) => setForum(e.target.value)}
                  placeholder="Civil Judge Senior Division, Mapusa"
                  className="field"
                />
              </div>

              <div>
                <Label className="mb-2">Client Statement Language</Label>
                <div className="flex flex-wrap gap-1.5">
                  {langs.map((l) => (
                    <button
                      key={l.k}
                      type="button"
                      onClick={() => {
                        sfx.tick()
                        setLang(l.k)
                      }}
                      className={cn(
                        'rounded-[5px] border px-3 py-1.5 text-[12px] transition-colors',
                        lang === l.k
                          ? 'border-navy bg-navy text-white font-medium'
                          : 'border-line bg-sunken text-ink-2 hover:bg-hover',
                      )}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          </Section>
        </div>

        {/* Right 7 Cols: Evidence Ingestion */}
        <div className="space-y-5 lg:col-span-7">
          <Section
            title="2 · Client Documents & Voice Statements"
            right={
              <div className="flex flex-wrap items-center gap-1.5">
                {SAMPLES[type].map((s) => (
                  <button
                    key={s.filename}
                    type="button"
                    onClick={() => {
                      if (!title.trim()) {
                        setTitle(
                          type === 'property'
                            ? 'Desai v. Naik — unregistered agreement possession'
                            : type === 'civil_recovery'
                              ? 'Coastal Supply v. Zenith — ₹4.2L invoice recovery'
                              : 'State v. Kamat — BNS s.303(2) plea eligibility',
                        )
                      }
                      stageText(s.filename, s.content)
                    }}
                    className="inline-flex items-center gap-1 rounded-[4px] border border-brass-200 bg-brass-50 px-2.5 py-1 text-[11px] font-medium text-brass hover:bg-brass-50/70"
                  >
                    <Sparkles size={11} /> Load {s.label}
                  </button>
                ))}
              </div>
            }
          >
            <Card className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex items-start gap-3 rounded-[5px] border border-line bg-sunken p-3 text-left transition-colors hover:border-navy/40 hover:bg-hover"
                >
                  <FileUp size={17} className="mt-0.5 shrink-0 text-navy" />
                  <div>
                    <p className="text-[13px] font-medium text-ink">Upload PDF / DOCX</p>
                    <p className="text-[11px] text-ink-3">Deeds, notices, audio</p>
                  </div>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.doc,.txt,.json,audio/*,.wav,.webm,.mp3"
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />

                <button
                  type="button"
                  onClick={() => {
                    sfx.tick()
                    setComposeOpen((x) => !x)
                  }}
                  className={cn(
                    'flex items-start gap-3 rounded-[5px] border p-3 text-left transition-colors',
                    composeOpen ? 'border-navy bg-navy-50' : 'border-line bg-sunken hover:bg-hover',
                  )}
                >
                  <PenLine size={17} className="mt-0.5 shrink-0 text-navy" />
                  <div>
                    <p className="text-[13px] font-medium text-ink">Paste Case Notes</p>
                    <p className="text-[11px] text-ink-3">Briefs or transcripts</p>
                  </div>
                </button>

                <Recorder
                  onDone={(f) => {
                    setStaged((prev) => [...prev, { id: `${Date.now()}-${f.name}`, file: f, kind: 'voice' }])
                  }}
                />
              </div>

              {composeOpen && (
                <div className="space-y-2.5 rounded-[6px] border border-line bg-sunken p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label>Inline Text Instrument</Label>
                    <input
                      value={docName}
                      onChange={(e) => setDocName(e.target.value)}
                      className="field h-7 w-56 font-mono text-[11px]"
                      aria-label="Document filename"
                    />
                  </div>
                  <textarea
                    value={docText}
                    onChange={(e) => setDocText(e.target.value)}
                    rows={4}
                    placeholder="Paste case brief, sale agreement extract, invoices, or client statement…"
                    className="field"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setComposeOpen(false)}
                      className="rounded-[5px] border border-line-strong bg-surface px-3 py-1 text-[12px] text-ink-2"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!docText.trim()}
                      onClick={() => stageText(docName, docText)}
                      className="rounded-[5px] bg-navy px-3 py-1 text-[12px] font-medium text-white disabled:opacity-50"
                    >
                      Stage Document
                    </button>
                  </div>
                </div>
              )}

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  addFiles(e.dataTransfer.files)
                }}
                className="flex items-center justify-center gap-2 rounded-[5px] border border-dashed border-line-strong bg-sunken py-5 text-[12px] text-ink-3"
              >
                <Upload size={14} /> Drag &amp; drop client files (PDF, DOCX, TXT, WAV/WEBM) here
              </div>

              <div>
                <Label className="mb-2">Staged Documents ({staged.length})</Label>
                {staged.length === 0 ? (
                  <p className="rounded-[5px] border border-line bg-sunken px-3.5 py-2.5 text-[12px] text-ink-3">
                    No files staged yet. Attach a file, record a voice note, or load a sample instrument above.
                  </p>
                ) : (
                  <ul className="divide-y divide-line rounded-[5px] border border-line bg-surface">
                    {staged.map((d) => (
                      <li key={d.id} className="flex items-center gap-3 px-3.5 py-2">
                        {d.kind === 'voice' ? (
                          <Mic size={14} className="text-info" />
                        ) : (
                          <FileText size={14} className="text-info" />
                        )}
                        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">
                          {d.file.name}
                        </span>
                        <Badge tone="neutral">{Math.max(1, Math.round(d.file.size / 1024))} KB</Badge>
                        <button
                          type="button"
                          aria-label="Remove"
                          onClick={() => setStaged((x) => x.filter((y) => y.id !== d.id))}
                          className="p-1 text-ink-3 hover:text-bad"
                        >
                          <Trash2 size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                <p className="text-[11px] text-ink-3">
                  Processed inside Chamber A with paragraph-level source tracking.
                </p>
                <button
                  type="button"
                  disabled={busy || !title.trim()}
                  onClick={launchPipeline}
                  className="inline-flex items-center gap-1.5 rounded-[5px] bg-navy px-4 py-2 text-[12px] font-medium text-white hover:bg-navy-600 disabled:opacity-50"
                >
                  <Play size={13} /> {busy ? 'Running…' : 'Create & Run Pipeline'}
                </button>
              </div>
            </Card>
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
      alert('Microphone not available. Upload an audio file instead.')
    }
  }

  return (
    <button
      type="button"
      onClick={() => (rec ? rec.stop() : start())}
      className={cn(
        'flex items-start gap-3 rounded-[5px] border p-3 text-left transition-colors',
        rec ? 'border-bad-200 bg-bad-50' : 'border-line bg-sunken hover:bg-hover',
      )}
    >
      {rec ? (
        <Square size={17} className="mt-0.5 shrink-0 text-bad" />
      ) : (
        <Mic size={17} className="mt-0.5 shrink-0 text-navy" />
      )}
      <div>
        <p className="text-[13px] font-medium text-ink">
          {rec ? `Recording (${secs}s) — Stop` : 'Record Voice Note'}
        </p>
        <p className="text-[11px] text-ink-3">Konkani · Marathi · Hindi</p>
      </div>
    </button>
  )
}
