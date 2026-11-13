import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Calendar, CheckCircle2, Info, Radar as RadarIcon, RefreshCw, Wand2 } from 'lucide-react'
import { api } from '@/lib/api'
import { formatReadableDate, parseStrictISODate } from '@/lib/statuteDate'
import type { LawChange, SourceRef } from '@/lib/types'
import {
  Badge,
  Card,
  Empty,
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

const CUTOFF_DATE = '2024-07-01'

interface RadarExample {
  id: string
  label: string
  badge: string
  offenceDate: string
  description: string
  prompt: string
}

const RADAR_EXAMPLES: RadarExample[] = [
  {
    id: '2025_economic',
    label: '2025 Economic Offence FIR',
    badge: 'BNS & BNSS Apply',
    offenceDate: '2025-02-14',
    description: 'Post-1 July 2024 cheating, criminal breach of trust & anticipatory bail',
    prompt:
      'FIR registered on 14 Feb 2025 alleging offences u/s 406, 420 of the IPC read with IPC 34. Accused seeks anticipatory bail under Section 438 Cr.P.C. and challenges arrest notice under s.41A CrPC.',
  },
  {
    id: '2024_homicide_evidence',
    label: '2024 Trial & s.65B Electronic Record',
    badge: 'BNS & BSA Apply',
    offenceDate: '2024-09-18',
    description: 'Post-cutoff charge sheet combining IPC 302 with Evidence Act s.65B',
    prompt:
      'Chargesheet filed for offence committed on 18 Sep 2024 under IPC 302 and Section 120B IPC. Prosecution relies on CCTV footage with certificate under s.65B Evidence Act and statement recorded under Section 161 Cr.P.C.',
  },
  {
    id: '2023_legacy',
    label: '2023 Legacy Complaint (Saved)',
    badge: 'IPC / CrPC Retained',
    offenceDate: '2023-11-10',
    description: 'Offence prior to 1 July 2024 saved by BNSS s.531(2) savings clause',
    prompt:
      'Private complaint for offence committed on 10 Nov 2023 under IPC 420, IPC 467 and IPC 506, with directions sought under Section 156(3) Cr.P.C. and remand under s.167 CrPC.',
  },
  {
    id: '2025_matrimonial',
    label: '2025 Matrimonial & Maintenance',
    badge: 'BNS & BNSS Apply',
    offenceDate: '2025-01-20',
    description: 'Post-cutoff cruelty complaint and interim maintenance claim',
    prompt:
      'Complaint regarding incident of 20 Jan 2025 alleging offence under Section 498A IPC and s.323 IPC alongside an application for interim maintenance under Section 125 Cr.P.C.',
  },
]

function isNotInCrosswalk(c: LawChange): boolean {
  return c.replaced_by.trim().toLowerCase() === 'not in crosswalk'
}

/** F14: BNS / BNSS / BSA transition radar (deterministic table lookup + offence date cutoff). */
export default function Radar({ id, onOpen }: TabProps) {
  const r = useAsync(() => api.lawChanges(id), [id])
  const [selectedId, setSelectedId] = useState<string | null>(RADAR_EXAMPLES[0].id)
  const [text, setText] = useState(RADAR_EXAMPLES[0].prompt)
  const [date, setDate] = useState(RADAR_EXAMPLES[0].offenceDate)
  const [scan, setScan] = useState<LawChange[] | null>(null)
  const [scannedMeta, setScannedMeta] = useState<{ date: string; prompt: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const seqRef = useRef(0)
  const initializedRef = useRef(false)

  const doScan = async (overrideText?: string, overrideDate?: string, exampleId?: string | null) => {
    const t = (overrideText ?? text).trim()
    const d = (overrideDate ?? date).trim()
    if (!t) {
      setErr('Paste an FIR extract, complaint paragraph, or click an example first.')
      return
    }
    if (d && !parseStrictISODate(d)) {
      setErr('Enter a valid Offence Date in YYYY-MM-DD format before scanning.')
      return
    }
    if (exampleId !== undefined) setSelectedId(exampleId)

    const seq = ++seqRef.current
    setBusy(true)
    setErr(null)
    sfx.tick()
    try {
      const results = await api.scanLaw(t, d || undefined)
      if (seq !== seqRef.current) return
      setScan(results)
      setScannedMeta({ date: d, prompt: t })
    } catch (e) {
      if (seq !== seqRef.current) return
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      if (seq === seqRef.current) setBusy(false)
    }
  }

  // Auto-populate and run the first working demo example so the user immediately sees an actionable analysis.
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    void doScan(RADAR_EXAMPLES[0].prompt, RADAR_EXAMPLES[0].offenceDate, RADAR_EXAMPLES[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectExample = (ex: RadarExample) => {
    setSelectedId(ex.id)
    setText(ex.prompt)
    setDate(ex.offenceDate)
    void doScan(ex.prompt, ex.offenceDate, ex.id)
  }

  const applyReplacement = (item: LawChange) => {
    if (!item.applies || isNotInCrosswalk(item)) return
    const nextText = text.replace(item.found, item.replaced_by)
    if (nextText === text) return
    setSelectedId(null)
    setText(nextText)
    sfx.accept()
    void doScan(nextText, date, null)
  }

  const activeScanSummary = useMemo(() => {
    if (!scan || !scannedMeta) return null
    const dateValid = parseStrictISODate(scannedMeta.date)
    const isPostCutoff = dateValid ? scannedMeta.date >= CUTOFF_DATE : true
    const mustReplace = scan.filter((x) => x.applies && !isNotInCrosswalk(x)).length
    const legacySaved = scan.filter((x) => !x.applies && !isNotInCrosswalk(x)).length
    const unmapped = scan.filter(isNotInCrosswalk).length
    return { isPostCutoff, mustReplace, legacySaved, unmapped }
  }, [scan, scannedMeta])

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left 5 Cols: Matter Document Radar */}
      <div className="lg:col-span-5">
        <Card className="h-full space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <Label>Law Change Radar · Matter Record</Label>
              <p className="mt-1 text-[12.5px] text-ink-2">
                Deterministic IPC / CrPC / IEA to BNS / BNSS / BSA crosswalk evaluated against this matter&rsquo;s documents.
              </p>
            </div>
            <button
              type="button"
              onClick={r.reload}
              aria-label="Refresh matter law scan"
              className="rounded-[5px] border border-line bg-sunken p-1.5 text-ink-3 hover:bg-hover hover:text-ink"
            >
              <RefreshCw size={12} />
            </button>
          </div>

          {r.loading && !r.data && <Skeleton className="h-24" />}
          {r.error && <ErrorBanner error={r.error} onRetry={r.reload} />}
          {r.data?.length === 0 && (
            <Well className="flex items-center gap-2 text-[12.5px] font-medium text-ok">
              <CheckCircle2 size={14} className="shrink-0" />
              <span>No repealed sections detected in the current matter documents.</span>
            </Well>
          )}
          <div className="space-y-2.5">
            {r.data?.map((c, i) => (
              <Hit key={`${c.found}-${i}`} c={c} onOpen={onOpen} />
            ))}
          </div>

          <div className="space-y-1.5 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-3">
            <p className="font-medium text-ink-2">How the 1 July 2024 cutoff works:</p>
            <p>
              Offences committed on or after <span className="font-mono text-ink">2024-07-01</span> must cite the Bharatiya Nyaya Sanhita (BNS), BNSS, and BSA. Offences prior to that date continue under the IPC / CrPC / IEA per Section 531(2) BNSS.
            </p>
          </div>
        </Card>
      </div>

      {/* Right 7 Cols: Interactive Demo & Live Text Crosswalk Scanner */}
      <div className="lg:col-span-7">
        <Card className="h-full space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-3">
            <div>
              <Label>Interactive Statutory Crosswalk Demo &amp; Scanner</Label>
              <p className="mt-0.5 text-[12px] text-ink-2">
                Click any scenario below to load the prompt and offence date automatically, or edit the text and submit.
              </p>
            </div>
            <Badge tone="navy">Cutoff: 01 Jul 2024</Badge>
          </div>

          {/* Clickable demo example cards */}
          <div className="grid gap-2 sm:grid-cols-2">
            {RADAR_EXAMPLES.map((ex) => {
              const active = selectedId === ex.id
              return (
                <button
                  key={ex.id}
                  type="button"
                  disabled={busy}
                  onClick={() => selectExample(ex)}
                  className={cn(
                    'flex flex-col justify-between rounded-[6px] border p-3 text-left transition-colors',
                    active
                      ? 'border-navy bg-navy-50'
                      : 'border-line bg-sunken hover:border-line-strong hover:bg-hover',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={cn('text-[12.5px] font-semibold', active ? 'text-navy' : 'text-ink')}>
                      {ex.label}
                    </span>
                    <Badge tone={ex.offenceDate >= CUTOFF_DATE ? 'warn' : 'info'}>{ex.badge}</Badge>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-ink-3">{ex.description}</p>
                  <p className="mt-2 font-mono text-[10px] text-ink-3">Offence date: {ex.offenceDate}</p>
                </button>
              )
            })}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void doScan()
            }}
            className="space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="radar-prompt" className="eyebrow text-ink-2">
                Clause / FIR / Pleading Extract
              </label>
              <label className="flex items-center gap-2 text-[11px] text-ink-3">
                <Calendar size={12} />
                <span>Offence Date</span>
                <input
                  type="date"
                  value={date}
                  min="1960-01-01"
                  max="2035-12-31"
                  onChange={(e) => {
                    setDate(e.target.value)
                    setSelectedId(null)
                    setErr(null)
                  }}
                  className="field h-8 w-38 font-mono text-[12px]"
                  aria-label="Offence date"
                />
              </label>
            </div>

            <textarea
              id="radar-prompt"
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setSelectedId(null)
                setErr(null)
              }}
              rows={4}
              placeholder='Paste an FIR extract or pleading clause: e.g. "…offence under IPC 420 and IPC 406, anticipatory bail under CrPC 438…"'
              className="field"
            />

            {err && <ErrorBanner error={err} />}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-ink-3">
                Detects IPC, Cr.P.C. &amp; Evidence Act citations (e.g. <code className="font-mono text-ink-2">s.420 IPC</code>,{' '}
                <code className="font-mono text-ink-2">Section 438 CrPC</code>, <code className="font-mono text-ink-2">s.65B IEA</code>).
              </span>
              <div className="flex items-center gap-2">
                {text && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setText('')
                      setScan(null)
                      setScannedMeta(null)
                      setSelectedId(null)
                      setErr(null)
                    }}
                    className="rounded-[5px] border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 hover:bg-hover"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="submit"
                  disabled={busy || !text.trim()}
                  className="inline-flex items-center gap-1.5 rounded-[5px] bg-navy px-4 py-1.5 text-[12px] font-semibold text-night hover:bg-navy-600 disabled:opacity-50"
                >
                  <RadarIcon size={13} /> {busy ? 'Scanning Sections…' : 'Run Crosswalk Scan'}
                </button>
              </div>
            </div>
          </form>

          {/* Analysis Results */}
          {busy && !scan && <Skeleton className="h-32" />}

          {scan && scannedMeta && activeScanSummary && (
            <div className="space-y-3 border-t border-line pt-4">
              <Well
                className={cn(
                  'space-y-1.5 border',
                  activeScanSummary.isPostCutoff ? 'border-brass-200 bg-brass-50/70' : 'border-info-200 bg-info-50/70',
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
                    <Info size={14} className="text-navy" />
                    {activeScanSummary.isPostCutoff
                      ? 'Post-1 July 2024 Offence — New Sanhitas (BNS / BNSS / BSA) Govern'
                      : 'Pre-1 July 2024 Offence — Legacy Codes Retained (BNSS s.531 Savings)'}
                  </span>
                  <span className="font-mono text-[11px] text-ink-2">
                    Evaluated for {scannedMeta.date ? formatReadableDate(scannedMeta.date) : 'No date (default post-cutoff)'}
                  </span>
                </div>
                <p className="text-[11.5px] text-ink-2">
                  {scan.length} reference{scan.length === 1 ? '' : 's'} detected:{' '}
                  <strong className="text-ink">{activeScanSummary.mustReplace}</strong> require updating to Sanhita equivalents
                  {activeScanSummary.legacySaved > 0 ? (
                    <>
                      {' · '}
                      <strong className="text-ink">{activeScanSummary.legacySaved}</strong> retained under legacy codes
                    </>
                  ) : null}
                  {activeScanSummary.unmapped > 0 ? (
                    <>
                      {' · '}
                      <strong className="text-ink">{activeScanSummary.unmapped}</strong> outside crosswalk table
                    </>
                  ) : null}
                  .
                </p>
              </Well>

              {scan.length ? (
                <div className="space-y-2.5">
                  {scan.map((c, i) => (
                    <Hit
                      key={`${c.found}-${i}`}
                      c={c}
                      onOpen={onOpen}
                      onApplyReplacement={c.applies && !isNotInCrosswalk(c) ? () => applyReplacement(c) : undefined}
                    />
                  ))}
                </div>
              ) : (
                <Empty text="No legacy IPC, CrPC, or Evidence Act sections detected in this prompt." />
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function Hit({
  c,
  onOpen,
  onApplyReplacement,
}: {
  c: LawChange
  onOpen: (s: SourceRef) => void
  onApplyReplacement?: () => void
}) {
  const unmapped = isNotInCrosswalk(c)
  return (
    <Well className={cn('space-y-2', !unmapped && c.applies && 'border-warn-200/70')}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={unmapped ? 'neutral' : c.applies ? 'bad' : 'info'}>{c.found}</Badge>
        <ArrowRight size={13} className="shrink-0 text-ink-3" />
        <Badge tone={unmapped ? 'neutral' : c.applies ? 'ok' : 'neutral'}>{c.replaced_by}</Badge>
        <span className="ml-auto font-mono text-[11px] font-medium text-ink-2">
          {unmapped ? 'Outside crosswalk' : c.applies ? 'New Sanhita Applies' : 'Legacy Code Retained'}
        </span>
      </div>

      <p className="text-[12px] leading-relaxed text-ink-2">{c.reason}</p>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <div className="flex flex-wrap gap-1.5">
          {c.sources?.map((s) => (
            <SourceChip key={s.source_id} s={s} onOpen={onOpen} />
          ))}
        </div>
        {onApplyReplacement && (
          <button
            type="button"
            onClick={onApplyReplacement}
            className="inline-flex items-center gap-1 rounded-[4px] border border-navy-100 bg-navy-50 px-2 py-0.5 text-[11px] font-medium text-navy transition-colors hover:bg-navy hover:text-night"
          >
            <Wand2 size={10} /> Apply in prompt
          </button>
        )}
      </div>
    </Well>
  )
}
