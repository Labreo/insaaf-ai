import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Download,
  Edit3,
  FileText,
  Lock,
  LockOpen,
  RefreshCw,
  ShieldCheck,
  Stamp,
  Trash2,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { download } from '@/lib/docx'
import { confirmAction, errorMessage, toast } from '@/lib/feedback'
import { areaOf, instrumentKind, instrumentLabel, useMeta } from '@/lib/meta'
import { formatReadableDate, todayIST } from '@/lib/statuteDate'
import { can, useDB } from '@/lib/store'
import type { Draft, DraftParagraph, Matter, Meta, RenderedDraft, SourceRef } from '@/lib/types'
import {
  Badge,
  Card,
  ConfidenceDot,
  ErrorBanner,
  Label,
  Skeleton,
  SourceChip,
  Well,
  useAsync,
} from '@/components/primitives'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'
import type { TabProps } from '../Matter'

const INSTRUMENT_COPY: Record<
  string,
  { title: string; subtitle?: string; parties: [string, string]; opening: string; prayer: string; verification: string }
> = {
  legal_notice: {
    title: 'LEGAL NOTICE',
    subtitle: 'By Registered Post A.D. / Speed Post / Email',
    parties: ['Sender (through counsel)', 'Noticee'],
    opening: 'Under instructions from and on behalf of our client, {client}, we hereby serve you with the following notice:',
    prayer:
      'You are hereby called upon to comply with the above within 15 days of receipt of this notice, failing which our client shall initiate appropriate legal proceedings against you at your risk as to costs.',
    verification: '',
  },
  s138_notice: {
    title: 'STATUTORY DEMAND NOTICE UNDER SECTION 138(b) OF THE NEGOTIABLE INSTRUMENTS ACT, 1881',
    subtitle: 'By Registered Post A.D. and Speed Post',
    parties: ['Payee (through counsel)', 'Drawer'],
    opening: 'Under instructions from our client, {client}, we serve this statutory demand notice upon you:',
    prayer:
      'You are hereby called upon to pay the dishonoured cheque amount within 15 days of receipt of this notice, failing which our client shall file a complaint under Section 138 read with Section 142 of the Negotiable Instruments Act, 1881.',
    verification: '',
  },
  plaint: {
    title: 'SUIT UNDER ORDER VII RULE 1 OF THE CODE OF CIVIL PROCEDURE, 1908',
    parties: ['Plaintiff', 'Defendant'],
    opening: 'The Plaintiff above named most respectfully submits as under:',
    prayer:
      "The Plaintiff therefore prays that this Hon'ble Court be pleased to (a) decree the suit as prayed; (b) award costs of the suit; and (c) grant such further relief as this Hon'ble Court deems fit in the interest of justice.",
    verification:
      'VERIFICATION (Order VI Rule 15 CPC): I, the Plaintiff above named, do hereby verify that the contents of paragraphs 1 to {last} are true to my knowledge and belief. Verified at {place} on {date}.',
  },
  written_statement: {
    title: 'WRITTEN STATEMENT ON BEHALF OF THE DEFENDANT UNDER ORDER VIII CPC',
    parties: ['Plaintiff', 'Defendant'],
    opening:
      'The Defendant above named most respectfully submits as under, denying every allegation in the plaint save what is specifically admitted:',
    prayer: 'The Defendant therefore prays that the suit be dismissed with costs.',
    verification:
      'VERIFICATION: Verified at {place} on {date} that the contents of paragraphs 1 to {last} are true to the Defendant’s knowledge and belief.',
  },
  commercial_plaint: {
    title: 'COMMERCIAL SUIT UNDER THE COMMERCIAL COURTS ACT, 2015',
    parties: ['Plaintiff', 'Defendant'],
    opening:
      'The Plaintiff states that pre-institution mediation under Section 12A of the Commercial Courts Act, 2015 has been exhausted or urgent interim relief is sought, and submits as under:',
    prayer:
      "The Plaintiff prays for a decree for the sum claimed with pendente lite and future interest, costs, and such further relief as this Hon'ble Court deems fit.",
    verification:
      'STATEMENT OF TRUTH (Order VI Rule 15A CPC): I verify that the contents of paragraphs 1 to {last} are true. Verified at {place} on {date}.',
  },
  plea_application: {
    title: 'APPLICATION FOR PLEA BARGAINING UNDER SECTION 290 OF THE BHARATIYA NAGARIK SURAKSHA SANHITA, 2023',
    parties: ['Applicant / Accused', 'State'],
    opening: 'The Applicant voluntarily files this application, supported by affidavit, and submits as under:',
    prayer:
      "The Applicant prays that this Hon'ble Court examine the Applicant in camera, permit a mutually satisfactory disposition under Section 292 BNSS, and dispose of the case accordingly.",
    verification:
      'AFFIDAVIT: The Applicant affirms that this application is filed voluntarily after understanding the punishment provided. Affirmed at {place} on {date}.',
  },
  bail_application: {
    title: 'APPLICATION FOR REGULAR BAIL UNDER SECTION 480 / 483 OF THE BHARATIYA NAGARIK SURAKSHA SANHITA, 2023',
    parties: ['Applicant / Accused', 'State'],
    opening: 'The Applicant most respectfully submits as under:',
    prayer:
      "The Applicant prays to be released on bail on such terms as this Hon'ble Court deems fit, and undertakes to abide by all conditions imposed.",
    verification: 'AFFIDAVIT: Affirmed at {place} on {date}.',
  },
}

function splitParties(matter: Matter | undefined): { left: string; right: string } {
  const cleanTitle = (matter?.title ?? '').replace(' (FICTIONAL)', '')
  const head = cleanTitle.split(':')[0].split(' — ')[0]
  const vsMatch = head.split(/\s+v(?:s)?\.?\s+/i)
  const left = matter?.client_name?.trim() || vsMatch[0]?.trim() || 'Client / Claimant'
  const right = matter?.opposite_party?.trim() || vsMatch[1]?.trim() || 'Opposite Party'
  return { left, right }
}

/** Synthesize RenderedDraft locally only if an older backend omits `draft.rendered`. */
function buildFallbackRendered(matter: Matter | undefined, draft: Draft, meta: Meta): RenderedDraft {
  const kind = instrumentKind(meta, draft.type)
  const area = areaOf(meta, matter?.case_type)
  const place =
    [matter?.district, matter?.court_seat, matter?.state].filter((v): v is string => Boolean(v && v.trim())).join(', ') ||
    'Jurisdictional Seat'
  const dateStr = formatReadableDate(todayIST())
  const { left, right } = splitParties(matter)
  const spec = INSTRUMENT_COPY[draft.type]
  const label = instrumentLabel(meta, draft.type)
  const [leftLabel, rightLabel] = spec?.parties ?? (kind === 'notice' ? ['Sender', 'Noticee'] : ['Petitioner', 'Respondent'])

  const body = draft.paragraphs.filter((p) => p.id !== 'p0')
  const withheld: string[] = []
  const numbered: RenderedDraft['paragraphs'] = []

  for (const p of body) {
    if (p.locked_out_claim && p.text.trim().toLowerCase().startsWith('no verified authority')) {
      withheld.push(p.locked_out_claim)
      continue
    }
    numbered.push({
      n: numbered.length + 1,
      id: p.id,
      text: p.text,
      confidence: p.confidence,
      sources: p.sources.map((s) => ({
        title: s.title,
        court: s.court,
        date: s.date,
        paragraph: s.paragraph,
        url: s.url,
      })),
    })
  }

  const fill = (t: string) =>
    t
      .replace(/\{client\}/g, left)
      .replace(/\{opposite\}/g, right)
      .replace(/\{place\}/g, place)
      .replace(/\{date\}/g, dateStr)
      .replace(/\{last\}/g, String(Math.max(1, numbered.length)))

  const forum = (matter?.forum_hint || area?.forum || 'Competent Court').toUpperCase()
  const court = kind === 'notice' ? '' : `IN THE COURT OF THE ${forum}, AT ${place.toUpperCase()}`
  const title = (spec?.title ?? label).toUpperCase()
  const subtitle = spec?.subtitle ?? ''
  const causeTitle = (matter?.title ?? '').replace(' (FICTIONAL)', '') || `${left} v. ${right}`
  const opening = fill(
    spec?.opening ??
      (kind === 'notice'
        ? 'Under instructions from our client, {client}, we serve upon you the following notice:'
        : `The ${leftLabel} above named most respectfully submits as under:`),
  )
  const prayer = fill(
    spec?.prayer ??
      (kind === 'notice'
        ? 'You are hereby called upon to comply with the above within 15 days of receipt of this notice.'
        : `The ${leftLabel} prays for relief as pleaded above together with costs and such further orders as justice demands.`),
  )
  const verification =
    kind === 'notice'
      ? ''
      : fill(
          spec?.verification ||
            `VERIFICATION: Verified at {place} on {date} that the contents of paragraphs 1 to {last} are true to knowledge and record.`,
        )

  return {
    instrument: draft.type,
    label,
    kind,
    court,
    title,
    subtitle,
    cause_title: causeTitle,
    parties: { left_label: leftLabel, left, right_label: rightLabel, right },
    opening,
    paragraphs: numbered,
    prayer,
    verification,
    place_date: `Place: ${place}    Date: ${dateStr}`,
    signature: `Advocate for the ${leftLabel.split(' (')[0].split(' /')[0]}`,
    withheld,
    watermark: draft.watermark || 'AI-assisted draft. Advocate review required.',
  }
}

function toSourceRef(
  s: RenderedDraft['paragraphs'][number]['sources'][number],
  rawPara: DraftParagraph | undefined,
  idx: number,
): SourceRef {
  const matched = rawPara?.sources.find((rs) => rs.title === s.title && rs.paragraph === s.paragraph) ?? rawPara?.sources[idx]
  if (matched) return matched
  return {
    source_id: `draft-src-${idx}-${s.title.slice(0, 18)}`,
    kind: s.court ? 'judgment' : 'statute',
    title: s.title,
    court: s.court,
    date: s.date,
    paragraph: s.paragraph,
    snippet: `${s.title} (${s.court || 'Authority'}, ${s.date || '—'}) para ${s.paragraph || '—'}.`,
    url: s.url,
  }
}

/** F8 + Authority Lock: full structured instrument preview, inline editing, and validated DOCX/PDF export. */
export default function DraftTab({ id, onOpen, onReview, onJump }: TabProps) {
  const meta = useMeta()
  const matter = useDB((d) => d.matters.find((m) => m.id === id))
  const role = useDB((d) => d.me.role)
  const d = useAsync(() => api.draft(id), [id])
  const [liveDraft, setLiveDraft] = useState<Draft | null>(null)
  const [switching, setSwitching] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [exportingFormat, setExportingFormat] = useState<'docx' | 'pdf' | null>(null)
  const [exportError, setExportError] = useState<{ code: string; message: string } | null>(null)
  const [instructions, setInstructions] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [savingPara, setSavingPara] = useState(false)

  useEffect(() => {
    setLiveDraft(null)
    setExportError(null)
    setEditingId(null)
    setInstructions('')
  }, [id])

  useEffect(() => {
    if (d.data) {
      setLiveDraft(d.data)
      if (d.data.instructions && !instructions) {
        setInstructions(d.data.instructions)
      }
    }
  }, [d.data])

  const draft = liveDraft ?? d.data
  if (d.loading && !draft) return <Skeleton className="h-96" />
  if (d.error && !draft) return <ErrorBanner error={d.error} onRetry={d.reload} />
  if (!draft) return null

  const approved = matter?.status === 'approved'
  const area = areaOf(meta, matter?.case_type)
  const recommendedIds = Array.from(
    new Set([...(area?.instruments ?? ['legal_notice', 'plaint', 'written_statement']), draft.type]),
  )
  const allInstruments = meta.instruments.length
    ? meta.instruments
    : recommendedIds.map((k) => ({ id: k, label: instrumentLabel(meta, k), kind: instrumentKind(meta, k) }))

  const canSwitchOrRegenerate = can('analysis.run') || can('matter.edit')
  const canEditParagraphs = can('analysis.run') || can('matter.edit') || can('review.edit')
  const canExport = can('draft.export')

  const rendered = draft.rendered ?? buildFallbackRendered(matter, draft, meta)
  const rawById = new Map(draft.paragraphs.map((p) => [p.id, p]))
  const withheldParagraphs = draft.paragraphs.filter((p) => Boolean(p.locked_out_claim) && p.id !== 'p0')

  const switchInstrument = async (nextType: string) => {
    if (!nextType || nextType === draft.type || switching || !canSwitchOrRegenerate) return
    const label = instrumentLabel(meta, nextType)
    const ok = await confirmAction({
      title: `Switch instrument to ${label}?`,
      body: 'The instrument will be regenerated from stored facts and verified authorities. The current draft text and any prior approval seal are replaced.',
      confirmLabel: 'Regenerate instrument',
      tone: 'primary',
    })
    if (!ok) return
    setSwitching(true)
    setExportError(null)
    sfx.tick()
    try {
      const next = await api.setDraftType(id, nextType, instructions.trim() || undefined)
      setLiveDraft(next)
      setEditingId(null)
      sfx.accept()
      toast('ok', `${label} drafted`, 'Authority Lock applied: unsupported claims remain withheld.')
    } catch (e) {
      sfx.reject()
      toast('bad', 'Instrument switch failed', errorMessage(e))
    } finally {
      setSwitching(false)
    }
  }

  const regenerateWithInstructions = async () => {
    if (regenerating || !canSwitchOrRegenerate) return
    setRegenerating(true)
    setExportError(null)
    sfx.tick()
    try {
      const next = await api.regenerateDraft(id, instructions.trim() || undefined)
      setLiveDraft(next)
      setEditingId(null)
      sfx.accept()
      toast('ok', 'Draft regenerated', 'Updated from current facts, sources and instructions.')
    } catch (e) {
      sfx.reject()
      toast('bad', 'Regeneration failed', errorMessage(e))
    } finally {
      setRegenerating(false)
    }
  }

  const startEdit = (paraId: string, currentText: string) => {
    setEditingId(paraId)
    setEditingText(currentText)
  }

  const saveEdit = async () => {
    if (!editingId || savingPara) return
    const cleaned = editingText.trim()
    if (!cleaned) {
      toast('bad', 'Paragraph cannot be blank', 'Use Delete if you want to remove this paragraph from the instrument.')
      return
    }
    setSavingPara(true)
    sfx.tick()
    try {
      const updated = await api.editDraftParagraph(id, editingId, cleaned)
      setLiveDraft(updated)
      setEditingId(null)
      sfx.accept()
      toast('ok', 'Paragraph saved', 'Edit recorded in the draft history and audit ledger.')
    } catch (e) {
      sfx.reject()
      toast('bad', 'Could not save paragraph', errorMessage(e))
    } finally {
      setSavingPara(false)
    }
  }

  const deleteParagraph = async (paraId: string, num: number) => {
    if (savingPara) return
    const ok = await confirmAction({
      title: `Remove paragraph ${num}?`,
      body: 'Subsequent paragraphs will renumber automatically and the deletion will be logged to the chamber audit trail.',
      confirmLabel: 'Remove paragraph',
      tone: 'danger',
    })
    if (!ok) return
    setSavingPara(true)
    sfx.tick()
    try {
      const updated = await api.editDraftParagraph(id, paraId, null)
      setLiveDraft(updated)
      if (editingId === paraId) setEditingId(null)
      sfx.accept()
      toast('ok', `Paragraph ${num} removed`)
    } catch (e) {
      sfx.reject()
      toast('bad', 'Could not remove paragraph', errorMessage(e))
    } finally {
      setSavingPara(false)
    }
  }

  const exportDocument = async (format: 'docx' | 'pdf') => {
    if (!matter || exportingFormat || !canExport) return
    setExportingFormat(format)
    setExportError(null)
    sfx.tick()
    try {
      const file = await api.exportDraft(id, format)
      download(file.blob, file.filename)
      sfx.accept()
      toast('ok', `${format.toUpperCase()} downloaded`, file.filename)
    } catch (e) {
      sfx.reject()
      const msg = errorMessage(e)
      const code = e instanceof ApiError ? e.code : 'export_error'
      setExportError({ code, message: msg })
      toast('bad', `${format.toUpperCase()} export failed`, msg)
    } finally {
      setExportingFormat(null)
    }
  }

  const firstSource = draft.paragraphs.flatMap((p) => p.sources)[0]
  const verifiedSample = firstSource
    ? `${firstSource.title} governs the relief claimed on record.`
    : 'Suraj Lamp & Industries v. State of Haryana held that an unregistered agreement or power of attorney does not convey title.'

  const bodyBlocks = (text: string) =>
    text
      .split(/\n{2,}/)
      .map((chunk) => chunk.trim())
      .filter(Boolean)

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left 7 Cols: Instrument Controls + Structured Bond-Paper Legal Document */}
      <div className="min-w-0 space-y-4 lg:col-span-7">
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Label>{rendered.label || draft.type.replace(/_/g, ' ')}</Label>
                <Badge tone={approved ? 'ok' : 'brass'}>{approved ? 'Counsel Sealed' : 'Chamber Draft'}</Badge>
                {matter?.moot && <Badge tone="warn">Demo / Moot Instrument</Badge>}
                {draft.stale && <Badge tone="warn">Inputs changed — regenerate</Badge>}
              </div>
              <p className={cn('mt-1 flex items-center gap-1.5 text-[12px] font-medium', approved ? 'text-ok' : 'text-brass')}>
                <ShieldCheck size={14} />
                <span className="truncate">{rendered.watermark}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={exportingFormat !== null || !canExport}
                title={canExport ? 'Download Microsoft Word (.docx) instrument' : 'Your role cannot export drafts'}
                onClick={() => void exportDocument('docx')}
                className="inline-flex items-center gap-1.5 rounded-[5px] border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download size={13} /> {exportingFormat === 'docx' ? 'Exporting DOCX…' : 'Export DOCX'}
              </button>
              <button
                type="button"
                disabled={exportingFormat !== null || !canExport}
                title={canExport ? 'Download formatted PDF instrument' : 'Your role cannot export drafts'}
                onClick={() => void exportDocument('pdf')}
                className="inline-flex items-center gap-1.5 rounded-[5px] border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download size={13} /> {exportingFormat === 'pdf' ? 'Exporting PDF…' : 'Export PDF'}
              </button>
              {!approved && (
                <button
                  type="button"
                  onClick={() =>
                    onReview({
                      target: 'draft',
                      target_id: draft.type,
                      title: `${role === 'senior' ? 'Approve' : 'Submit for senior review:'} ${rendered.label}`,
                      action: role === 'senior' ? 'approve' : 'submit',
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-[5px] bg-navy px-3.5 py-1.5 text-[12px] font-semibold text-night hover:bg-navy-600"
                >
                  <Stamp size={13} /> {role === 'senior' ? 'Approve & Seal' : 'Send to Senior'}
                </button>
              )}
            </div>
          </div>

          {/* Export error banner (including 409 citation gate with jump button) */}
          {exportError && (
            <div
              role="alert"
              className="rounded-[6px] border border-bad-200 bg-bad-50 px-3.5 py-2.5 text-[12.5px] text-bad"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">
                      {exportError.code === 'citation_blocks_draft'
                        ? 'Export blocked by Citation Health Gate'
                        : 'Document export failed'}
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink-2">{exportError.message}</p>
                  </div>
                </div>
                {exportError.code === 'citation_blocks_draft' && (
                  <button
                    type="button"
                    onClick={() => onJump('citations')}
                    className="rounded-[5px] border border-bad-200 bg-surface px-2.5 py-1 text-[11.5px] font-medium text-bad hover:bg-hover"
                  >
                    Inspect Citation Health &rarr;
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Instrument switcher (practice-area defaults + full 19-instrument selector) */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-medium text-ink-3">
                <FileText size={11} /> Instrument:
              </span>
              {recommendedIds.map((instId) => {
                const active = draft.type === instId
                return (
                  <button
                    key={instId}
                    type="button"
                    disabled={switching || !canSwitchOrRegenerate}
                    title={canSwitchOrRegenerate ? undefined : 'Your role cannot change the instrument'}
                    onClick={() => void switchInstrument(instId)}
                    className={cn(
                      'rounded-[4px] border px-2.5 py-1 text-[11px] font-medium transition-colors',
                      active
                        ? 'border-navy bg-navy font-semibold text-night'
                        : 'border-line bg-sunken text-ink-2 hover:bg-hover hover:text-ink',
                    )}
                  >
                    {instrumentLabel(meta, instId)}
                  </button>
                )
              })}
            </div>

            <label className="flex items-center gap-1.5 text-[11px] text-ink-3">
              <span>All templates</span>
              <select
                aria-label="Select any legal instrument template"
                disabled={switching || !canSwitchOrRegenerate}
                value={draft.type}
                onChange={(e) => void switchInstrument(e.target.value)}
                className="rounded-[4px] border border-line bg-sunken px-2 py-1 text-[11.5px] text-ink focus:border-navy focus:outline-none disabled:opacity-50"
              >
                {allInstruments.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Counsel instructions & regeneration */}
          {canSwitchOrRegenerate && (
            <div className="flex flex-col gap-2 border-t border-line pt-2.5 sm:flex-row">
              <input
                type="text"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Optional counsel drafting instructions (e.g. emphasize s.17 Registration Act bar and annex chronology)…"
                className="field flex-1 text-[12.5px]"
              />
              <button
                type="button"
                disabled={regenerating || switching}
                onClick={() => void regenerateWithInstructions()}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[5px] border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-hover disabled:opacity-50"
              >
                <RefreshCw size={12} className={regenerating ? 'animate-spin' : undefined} />
                {regenerating ? 'Regenerating…' : 'Regenerate draft'}
              </button>
            </div>
          )}
        </Card>

        {/* Formal structured instrument document (mirrors backend DOCX/PDF layout) */}
        <article className="page-doc rounded-[4px] px-6 py-7 sm:px-10 sm:py-9">
          {/* Watermark + status header */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 font-sans text-[10.5px] italic text-ink-3">
            <span>[{rendered.watermark}]</span>
            <span>
              {matter?.moot ? 'MOOT / DEMO DRAFT' : 'CHAMBER RECORD'} · Model {draft.model_version}
            </span>
          </div>

          {/* Notice vs Court Pleading / Application Header */}
          {rendered.kind === 'notice' ? (
            <header className="space-y-4 border-b border-line pb-5">
              <div className="text-center">
                <h2 className="font-serif text-[20px] font-semibold tracking-wide text-ink sm:text-[22px]">
                  {rendered.title}
                </h2>
                {rendered.subtitle && (
                  <p className="mt-1 font-sans text-[11px] font-medium uppercase tracking-[0.1em] text-ink-3">
                    {rendered.subtitle}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-ink-3">
                <span>{rendered.place_date}</span>
              </div>

              <div className="grid gap-3 rounded-[5px] border border-line bg-sunken/70 p-3.5 font-sans text-[12.5px] sm:grid-cols-2">
                <div>
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                    To ({rendered.parties.right_label})
                  </p>
                  <p className="mt-0.5 font-medium text-ink">{rendered.parties.right}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                    From ({rendered.parties.left_label})
                  </p>
                  <p className="mt-0.5 font-medium text-ink">{rendered.parties.left}</p>
                </div>
              </div>

              <div className="font-sans text-[13px] leading-relaxed text-ink">
                <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-brass">
                  Subject / Re:{' '}
                </span>
                <span className="font-semibold">{rendered.cause_title}</span>
              </div>

              <div className="space-y-2 pt-1 text-[15.5px] leading-[1.7] text-ink">
                <p className="font-medium">Sir / Madam,</p>
                <p>{rendered.opening}</p>
              </div>
            </header>
          ) : (
            <header className="space-y-4 border-b border-line pb-5">
              {rendered.court && (
                <p className="text-center font-sans text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink">
                  {rendered.court}
                </p>
              )}

              <div className="rounded-[5px] border border-line bg-sunken/70 px-4 py-3 text-[14px]">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-ink">{rendered.parties.left}</span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                    &hellip; {rendered.parties.left_label}
                  </span>
                </div>
                <p className="my-1.5 text-center font-serif text-[13px] italic text-ink-3">VERSUS</p>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-ink">{rendered.parties.right}</span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
                    &hellip; {rendered.parties.right_label}
                  </span>
                </div>
              </div>

              <div className="text-center">
                <h2 className="font-serif text-[18px] font-semibold tracking-wide text-ink sm:text-[20px]">
                  {rendered.title}
                </h2>
                {rendered.subtitle && (
                  <p className="mt-1 font-sans text-[11.5px] text-ink-3">{rendered.subtitle}</p>
                )}
                {rendered.cause_title && (
                  <p className="mt-1 font-sans text-[12px] text-ink-2">Matter: {rendered.cause_title}</p>
                )}
              </div>

              <p className="pt-1 text-[15.5px] font-medium leading-[1.7] text-ink">{rendered.opening}</p>
            </header>
          )}

          {/* Numbered Multi-Paragraph Body */}
          <section aria-label="Numbered pleading paragraphs" className="mt-6 space-y-5">
            {rendered.paragraphs.map((rp) => {
              const raw = rawById.get(rp.id)
              const isEditing = editingId === rp.id
              const blocks = bodyBlocks(rp.text)

              return (
                <div key={rp.id} className="border-b border-line/70 pb-5 last:border-b-0 last:pb-0">
                  <div className="flex items-start gap-3.5">
                    <span className="mt-1 w-7 shrink-0 font-mono text-[12px] font-semibold text-brass">{rp.n}.</span>
                    <div className="min-w-0 flex-1 space-y-2.5">
                      {isEditing ? (
                        <div className="space-y-2 font-sans">
                          <textarea
                            rows={5}
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            className="field text-[14px] leading-relaxed"
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={savingPara}
                              onClick={() => void saveEdit()}
                              className="rounded-[5px] bg-navy px-3 py-1 text-[11.5px] font-semibold text-night hover:bg-navy-600 disabled:opacity-50"
                            >
                              {savingPara ? 'Saving…' : 'Save paragraph'}
                            </button>
                            <button
                              type="button"
                              disabled={savingPara}
                              onClick={() => setEditingId(null)}
                              className="rounded-[5px] border border-line bg-sunken px-3 py-1 text-[11.5px] text-ink-2 hover:text-ink"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {blocks.map((block, bIdx) => (
                            <p
                              key={`${rp.id}-b-${bIdx}`}
                              className="whitespace-pre-line text-[16px] leading-[1.8] text-ink"
                            >
                              {block}
                            </p>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 font-sans">
                        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
                          <ConfidenceDot c={rp.confidence} />
                          {raw?.edited_by && (
                            <span className="rounded-[4px] border border-brass-200 bg-brass-50 px-1.5 py-0.5 font-mono text-[10px] text-brass">
                              Edited by {raw.edited_by}
                            </span>
                          )}
                          {rp.sources.map((s, sIdx) => {
                            const ref = toSourceRef(s, raw, sIdx)
                            return <SourceChip key={`${rp.id}-src-${sIdx}-${ref.source_id}`} s={ref} onOpen={onOpen} />
                          })}
                        </div>

                        {canEditParagraphs && !isEditing && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => startEdit(rp.id, rp.text)}
                              className="inline-flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-[11px] text-ink-3 hover:bg-hover hover:text-ink"
                            >
                              <Edit3 size={11} /> Edit
                            </button>
                            <button
                              type="button"
                              disabled={savingPara || rendered.paragraphs.length <= 1}
                              title={
                                rendered.paragraphs.length <= 1
                                  ? 'At least one paragraph is required in the instrument'
                                  : 'Remove paragraph'
                              }
                              onClick={() => void deleteParagraph(rp.id, rp.n)}
                              className="inline-flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-[11px] text-ink-3 hover:bg-bad-50 hover:text-bad disabled:opacity-40"
                            >
                              <Trash2 size={11} /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </section>

          {/* Prayer / Demand */}
          {rendered.prayer && (
            <section className="mt-6 border-t border-line pt-5">
              <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-brass">
                {rendered.kind === 'notice' ? 'Demand' : 'Prayer'}
              </p>
              <p className="mt-1.5 whitespace-pre-line text-[15.5px] leading-[1.75] text-ink">{rendered.prayer}</p>
            </section>
          )}

          {/* Verification / Affidavit */}
          {rendered.verification && (
            <section className="mt-6 border-t border-line pt-5 font-sans text-[13px] leading-relaxed text-ink-2">
              <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
                Verification / Statement of Truth
              </p>
              <p className="mt-1.5 whitespace-pre-line">{rendered.verification}</p>
            </section>
          )}

          {/* Place, Date & Counsel Signature */}
          <footer className="mt-7 flex flex-wrap items-end justify-between gap-4 border-t border-line pt-4 font-sans text-[12.5px] text-ink-2">
            <p className="font-mono text-[11.5px] text-ink-3">{rendered.place_date}</p>
            <div className="text-right">
              <p className="font-medium text-ink">Sd/-</p>
              <p className="font-semibold text-brass">{rendered.signature}</p>
            </div>
          </footer>

          {/* Authority Lock Quarantine Box (unsupported assertions stripped before export) */}
          {(rendered.withheld.length > 0 || withheldParagraphs.length > 0) && (
            <aside className="mt-6 rounded-[6px] border border-bad-200 bg-bad-50/70 p-3.5 font-sans">
              <p className="flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bad">
                <Lock size={12} /> Withheld by Authority Lock (excluded from DOCX &amp; PDF)
              </p>
              <ul className="mt-2 space-y-1.5 text-[12px] text-ink-2">
                {(rendered.withheld.length > 0
                  ? rendered.withheld
                  : withheldParagraphs.map((w) => w.locked_out_claim ?? '')
                )
                  .filter(Boolean)
                  .map((claim, idx) => (
                    <li key={idx} className="leading-snug">
                      <span className="line-through text-bad/90">{claim}</span>
                    </li>
                  ))}
              </ul>
            </aside>
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
      <div className="min-w-0 lg:col-span-5">
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
            Only claims grounded in stored Insaaf Precedent Index paragraphs can enter this instrument.
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
          onClick={() => void check()}
          disabled={busy || !text.trim()}
          className="rounded-[5px] bg-navy px-4 py-1.5 text-[12px] font-semibold text-night hover:bg-navy-600 disabled:opacity-50"
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
            <p className="mt-1 text-[11px]">Refused to insert into instrument. Authority Lock blocked unverified case law.</p>
          )}
        </div>
      )}
    </Card>
  )
}
