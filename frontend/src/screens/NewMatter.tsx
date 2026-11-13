import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, FileUp, Mic, PenLine, Play, Search, Sparkles, Trash2, Upload } from 'lucide-react'
import { api } from '@/lib/api'
import { DEMO_INTAKE_SAMPLES, type DemoIntakeSample } from '@/lib/demoData'
import { toast } from '@/lib/feedback'
import { areaOf, useMeta } from '@/lib/meta'
import { useDB } from '@/lib/store'
import { sfx } from '@/lib/sound'
import type { CaseType } from '@/lib/types'
import { Recorder } from '@/components/Recorder'
import { Badge, Card, ErrorBanner, Label, PageHeader, Section } from '@/components/primitives'
import { cn } from '@/lib/utils'

interface StagedDoc {
  id: string
  file: File
  kind: 'voice' | 'doc'
}

export default function NewMatter() {
  const nav = useNavigate()
  const me = useDB((s) => s.me)
  const meta = useMeta()

  const [type, setType] = useState<CaseType>('property')
  const [areaFilter, setAreaFilter] = useState('')
  const [groupFilter, setGroupFilter] = useState<string>('all')
  const [lang, setLang] = useState<string>('kok')
  const [title, setTitle] = useState('')
  const [forum, setForum] = useState('')
  const [stateName, setStateName] = useState('')
  const [district, setDistrict] = useState('')
  const [courtSeat, setCourtSeat] = useState('')
  const [clientName, setClientName] = useState('')
  const [oppositeParty, setOppositeParty] = useState('')
  const [causeDate, setCauseDate] = useState('')
  const [summary, setSummary] = useState('')

  const [staged, setStaged] = useState<StagedDoc[]>([])
  const [composeOpen, setComposeOpen] = useState(false)
  const [docName, setDocName] = useState('chamber_brief_notes.txt')
  const [docText, setDocText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [titleTouched, setTitleTouched] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const groups = ['all', ...Array.from(new Set(meta.areas.map((a) => a.group)))]
  const visibleAreas = meta.areas.filter((a) => {
    if (groupFilter !== 'all' && a.group !== groupFilter) return false
    const needle = areaFilter.trim().toLowerCase()
    if (!needle) return true
    return (
      a.label.toLowerCase().includes(needle) ||
      a.forum.toLowerCase().includes(needle) ||
      a.statutes.some((s) => s.toLowerCase().includes(needle))
    )
  })
  const selectedArea = areaOf(meta, type)

  const addFiles = (files: FileList | null) => {
    if (!files) return
    const items: StagedDoc[] = Array.from(files).map((f, idx) => ({
      id: `${Date.now()}-${idx}-${f.name}`,
      file: f,
      kind:
        f.type.startsWith('audio/') || f.name.endsWith('.wav') || f.name.endsWith('.webm') || f.name.endsWith('.m4a')
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

  const applyDemoSample = (sample: DemoIntakeSample) => {
    setType(sample.area)
    setLang(sample.client_language)
    setTitle(sample.title)
    setForum(sample.forum_hint)
    setStateName(sample.state)
    setDistrict(sample.district)
    setCourtSeat(sample.court_seat)
    setClientName(sample.client_name)
    setOppositeParty(sample.opposite_party)
    setCauseDate(sample.cause_date)
    setSummary(sample.summary)
    setTitleTouched(false)
    stageText(sample.filename, sample.content)
    toast('ok', 'Demo intake preset loaded', `${sample.label} — ready to create & run pipeline`)
  }

  const launchPipeline = async () => {
    if (!title.trim()) {
      setTitleTouched(true)
      return
    }
    if (busy) return
    setBusy(true)
    setErr(null)
    sfx.tap()
    try {
      const m = await api.createMatter({
        title: title.trim(),
        case_type: type,
        client_language: lang,
        forum_hint: forum.trim() || selectedArea?.forum || undefined,
        state: stateName.trim() || undefined,
        district: district.trim() || undefined,
        court_seat: courtSeat.trim() || undefined,
        cause_date: causeDate.trim() || undefined,
        client_name: clientName.trim() || undefined,
        opposite_party: oppositeParty.trim() || undefined,
        summary: summary.trim() || undefined,
      })
      const failed: string[] = []
      for (const item of staged) {
        try {
          await api.addDocument(m.id, item.file)
        } catch (e) {
          failed.push(`${item.file.name}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      if (failed.length) {
        toast(
          'bad',
          `${failed.length} document(s) did not upload`,
          `${failed.join(' · ')}. The matter was created — attach them from its Facts tab.`,
        )
      } else {
        toast('ok', 'Matter created')
      }
      nav(`/matters/${m.id}?tab=pipeline${failed.length < staged.length || staged.length === 0 ? '&run=1' : ''}`)
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
        description="Classify the dispute across all 15 practice areas, select client vernacular for Insaaf Translate (12 Indian languages), and stage evidentiary instruments."
        right={
          <button
            type="button"
            disabled={busy}
            onClick={() => void launchPipeline()}
            className="inline-flex items-center gap-2 rounded-[5px] bg-navy px-4 py-2 text-[12px] font-semibold text-night transition-colors hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play size={13} /> {busy ? 'Creating matter…' : 'Create & Run Pipeline'}
          </button>
        }
      />

      {err && <ErrorBanner error={err} />}

      <Card className="space-y-2.5 border-brass-200/70 bg-sunken">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Label>One-Click Illustrative Indian Demo Presets</Label>
            <Badge tone="warn">SYNTHETIC DEMO PRESETS</Badge>
          </div>
          <span className="text-[11px] text-ink-3">
            Populates parties, jurisdiction, limitation trigger date, and sample evidence
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DEMO_INTAKE_SAMPLES.map((sample) => (
            <button
              key={sample.id}
              type="button"
              onClick={() => applyDemoSample(sample)}
              className="inline-flex items-center gap-1 rounded-[4px] border border-brass-200 bg-brass-50 px-2.5 py-1 text-[11px] font-medium text-brass hover:bg-brass-50/75"
            >
              <Sparkles size={11} /> {sample.label}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left 5 Cols: Matter Particulars */}
        <div className="space-y-5 lg:col-span-5">
          <Section title="1 · Dispute Classification & Jurisdiction">
            <Card className="space-y-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <Label>Practice Area ({meta.areas.length} Indian Law Packs)</Label>
                  {selectedArea && <Badge tone="navy">{selectedArea.tag}</Badge>}
                </div>

                <div className="relative">
                  <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
                  <input
                    value={areaFilter}
                    onChange={(e) => setAreaFilter(e.target.value)}
                    placeholder="Filter areas, statutes, or forums…"
                    className="field pl-8 text-[12px]"
                  />
                </div>

                <div className="flex flex-wrap gap-1">
                  {groups.map((grp) => (
                    <button
                      key={grp}
                      type="button"
                      onClick={() => setGroupFilter(grp)}
                      className={cn(
                        'rounded-[4px] border px-2 py-0.5 text-[10.5px] font-medium capitalize transition-colors',
                        groupFilter === grp
                          ? 'border-navy bg-navy text-night font-semibold'
                          : 'border-line bg-sunken text-ink-2 hover:bg-hover',
                      )}
                    >
                      {grp}
                    </button>
                  ))}
                </div>

                <div className="scroll-thin max-h-60 space-y-1.5 overflow-y-auto pr-1">
                  {visibleAreas.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        sfx.tick()
                        setType(a.id)
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-[5px] border px-3 py-2 text-left transition-colors',
                        type === a.id
                          ? 'border-navy bg-navy-50'
                          : 'border-line bg-sunken hover:bg-hover',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="font-mono text-[9.5px] text-ink-3">{a.tag}</span>
                          <span className={cn('truncate text-[12.5px] font-medium', type === a.id ? 'text-navy' : 'text-ink')}>
                            {a.label}
                          </span>
                        </span>
                        <p className="mt-0.5 truncate text-[11px] text-ink-3">{a.forum}</p>
                      </span>
                      <span
                        className={cn(
                          'h-3.5 w-3.5 shrink-0 rounded-full border',
                          type === a.id ? 'border-navy bg-navy' : 'border-line-strong bg-surface',
                        )}
                      />
                    </button>
                  ))}
                  {visibleAreas.length === 0 && (
                    <p className="py-3 text-center text-[12px] text-ink-3">No practice area matches &ldquo;{areaFilter}&rdquo;.</p>
                  )}
                </div>
              </div>

              <div>
                <Label className="mb-1.5">Matter Title</Label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => setTitleTouched(true)}
                  placeholder="Desai v. Naik — Plot possession, Mapusa"
                  className={cn('field', titleTouched && !title.trim() && 'border-bad')}
                  aria-required="true"
                  aria-invalid={titleTouched && !title.trim()}
                  aria-describedby="title-err"
                  autoFocus
                />
                {titleTouched && !title.trim() && (
                  <p id="title-err" role="alert" className="mt-1 text-[11px] text-bad">
                    Enter the parties and subject, e.g. &ldquo;Desai v. Naik — plot possession&rdquo;. Required to open a matter.
                  </p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="mb-1">Client / Petitioner</Label>
                  <input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="e.g. Smt. Maria Fernandes"
                    className="field text-[12px]"
                  />
                </div>
                <div>
                  <Label className="mb-1">Opposite Party</Label>
                  <input
                    value={oppositeParty}
                    onChange={(e) => setOppositeParty(e.target.value)}
                    placeholder="e.g. Shri Ramesh Naik"
                    className="field text-[12px]"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="mb-1">Forum / Court Hint</Label>
                  <input
                    value={forum}
                    onChange={(e) => setForum(e.target.value)}
                    placeholder={selectedArea?.forum || 'Civil Judge Senior Division'}
                    className="field text-[12px]"
                  />
                </div>
                <div>
                  <Label className="mb-1">Cause / Trigger Date</Label>
                  <input
                    type="date"
                    value={causeDate}
                    onChange={(e) => setCauseDate(e.target.value)}
                    className="field font-mono text-[12px]"
                  />
                </div>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-3">
                <div>
                  <Label className="mb-1">State</Label>
                  <input
                    value={stateName}
                    onChange={(e) => setStateName(e.target.value)}
                    placeholder="Goa"
                    className="field text-[12px]"
                  />
                </div>
                <div>
                  <Label className="mb-1">District</Label>
                  <input
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    placeholder="North Goa"
                    className="field text-[12px]"
                  />
                </div>
                <div>
                  <Label className="mb-1">Court Seat</Label>
                  <input
                    value={courtSeat}
                    onChange={(e) => setCourtSeat(e.target.value)}
                    placeholder="Mapusa"
                    className="field text-[12px]"
                  />
                </div>
              </div>

              <div>
                <Label className="mb-1">Brief Dispute Summary (Optional)</Label>
                <textarea
                  rows={2}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Concise legal posture for precedent retrieval and outcome weighting…"
                  className="field text-[12px]"
                />
              </div>

              <div>
                <Label className="mb-2">Client Statement Language ({meta.languages.length} Supported)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {meta.languages.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => {
                        sfx.tick()
                        setLang(l.code)
                      }}
                      className={cn(
                        'rounded-[5px] border px-2.5 py-1 text-[11.5px] transition-colors',
                        lang === l.code
                          ? 'border-navy bg-navy text-night font-semibold'
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
          <Section title="2 · Client Documents & Voice Statements">
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
                  accept=".pdf,.docx,.doc,.txt,.json,audio/*,.wav,.webm,.mp3,.m4a"
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
                      className="rounded-[5px] bg-navy px-3 py-1 text-[12px] font-semibold text-night disabled:opacity-50"
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
                    No files staged yet. Attach a file, record a voice note, or load a demo intake preset above.
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
                  Processed inside {me.org.name && me.org.name !== 'No chamber' ? me.org.name : 'your chamber'} with paragraph-level source tracking.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void launchPipeline()}
                  className="inline-flex items-center gap-1.5 rounded-[5px] bg-navy px-4 py-2 text-[12px] font-semibold text-night hover:bg-navy-600 disabled:opacity-50"
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
