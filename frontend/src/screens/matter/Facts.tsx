import { useEffect, useRef, useState } from 'react'
import { FileText, Languages, Mic, Pencil, Plus, RotateCcw, Trash2, Volume2 } from 'lucide-react'
import { api } from '@/lib/api'
import { errorMessage, toast } from '@/lib/feedback'
import { languageLabel, useMeta } from '@/lib/meta'
import { can, useDB } from '@/lib/store'
import { sfx } from '@/lib/sound'
import type { Fact, MatterDocument } from '@/lib/types'
import { Recorder } from '@/components/Recorder'
import {
  Badge,
  Card,
  ConfidenceDot,
  Empty,
  ErrorBanner,
  Label,
  Skeleton,
  Well,
  type Tone,
  useAsync,
} from '@/components/primitives'
import { cn } from '@/lib/utils'
import type { TabProps } from '../Matter'

const tone: Record<Fact['status'], Tone> = {
  alleged: 'neutral',
  documented: 'ok',
  disputed: 'warn',
  unknown: 'bad',
}

type CardView = 'both' | 'english' | 'original'

/** F4: bilingual fact cards, voice-note playback/transcription, and inline Insaaf Translate. */
export default function Facts({ id, onReview, onJump }: TabProps) {
  const rev = useDB((s) => s.rev)
  const me = useDB((s) => s.me)
  const matter = useDB((s) => s.matters.find((m) => m.id === id))
  const meta = useMeta()
  const canEdit = can('review.edit') || can('matter.edit')

  const f = useAsync(() => api.facts(id), [id, rev])

  const [viewMode, setViewMode] = useState<Record<string, CardView>>({})
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({})
  const audioUrlsRef = useRef<Record<string, string>>({})
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null)
  const [retranscribingId, setRetranscribingId] = useState<string | null>(null)
  const [uploadingVoice, setUploadingVoice] = useState(false)

  const [translateOpen, setTranslateOpen] = useState(false)
  const [srcLang, setSrcLang] = useState(matter?.client_language || 'kok')
  const [tgtLang, setTgtLang] = useState('en')
  const [trInput, setTrInput] = useState('')
  const [trResult, setTrResult] = useState<{ text: string; engine: string; confidence: string } | null>(null)
  const [translating, setTranslating] = useState(false)

  useEffect(() => {
    audioUrlsRef.current = audioUrls
  }, [audioUrls])

  useEffect(() => {
    return () => {
      Object.values(audioUrlsRef.current).forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  const attachVoiceNote = async (file: File) => {
    if (!canEdit || uploadingVoice) return
    setUploadingVoice(true)
    try {
      await api.addDocument(id, file)
      sfx.accept()
      toast('ok', 'Voice note attached', `${file.name} uploaded for transcription`)
      f.reload()
    } catch (e) {
      sfx.reject()
      toast('bad', 'Voice note upload failed', errorMessage(e))
    } finally {
      setUploadingVoice(false)
    }
  }

  const loadAudio = async (doc: MatterDocument) => {
    if (loadingAudioId || audioUrls[doc.id]) return
    setLoadingAudioId(doc.id)
    try {
      const url = await api.audioUrl(id, doc.id)
      setAudioUrls((prev) => ({ ...prev, [doc.id]: url }))
      sfx.tick()
    } catch (e) {
      sfx.reject()
      toast('bad', 'Could not load audio', errorMessage(e))
    } finally {
      setLoadingAudioId(null)
    }
  }

  const retryTranscribe = async (doc: MatterDocument) => {
    if (!canEdit || retranscribingId) return
    setRetranscribingId(doc.id)
    sfx.tick()
    try {
      const out = await api.retranscribe(id, doc.id)
      sfx.accept()
      toast('ok', 'Transcription updated', `Status: ${out.status}`)
      f.reload()
    } catch (e) {
      sfx.reject()
      toast('bad', 'Transcription failed', errorMessage(e))
    } finally {
      setRetranscribingId(null)
    }
  }

  const runTranslate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!trInput.trim() || translating) return
    setTranslating(true)
    sfx.tick()
    try {
      const res = await api.translate(trInput.trim(), srcLang, tgtLang)
      setTrResult(res)
      sfx.accept()
    } catch (errTr) {
      sfx.reject()
      toast('bad', 'Translation failed', errorMessage(errTr))
    } finally {
      setTranslating(false)
    }
  }

  if (f.loading && !f.data) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    )
  }
  if (f.error) return <ErrorBanner error={f.error} onRetry={f.reload} />

  const facts = f.data ?? []
  const voiceDocs: MatterDocument[] = (matter?.documents ?? []).filter(
    (d) => d.kind === 'voice' || d.kind === 'audio' || Boolean(d.transcript),
  )

  const counts = facts.reduce(
    (a, x) => ({ ...a, [x.status]: (a[x.status] ?? 0) + 1 }),
    {} as Record<string, number>,
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Label>Bilingual Fact Register ({facts.length})</Label>
          {(['documented', 'alleged', 'disputed', 'unknown'] as const).map((s) =>
            counts[s] ? (
              <Badge key={s} tone={tone[s]}>
                {counts[s]} {s}
              </Badge>
            ) : null,
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Recorder
            compact
            disabled={!canEdit || uploadingVoice}
            disabledReason={`The ${me.role} role cannot attach voice notes`}
            onDone={(file) => void attachVoiceNote(file)}
          />
          <button
            type="button"
            onClick={() => {
              sfx.tick()
              setTranslateOpen((v) => !v)
            }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-[5px] border px-3 py-1.5 text-[11px] font-medium transition-colors',
              translateOpen
                ? 'border-navy bg-navy-50 text-navy'
                : 'border-line bg-surface text-ink-2 hover:bg-hover hover:text-ink',
            )}
          >
            <Languages size={12} /> Insaaf Translate
          </button>
          <button
            type="button"
            disabled={!canEdit}
            title={canEdit ? undefined : `The ${me.role} role cannot add verified facts`}
            onClick={() =>
              onReview({ target: 'fact', target_id: 'new', title: 'Add verified fact', action: 'edit' })
            }
            className="inline-flex items-center gap-1.5 rounded-[5px] bg-navy px-3 py-1.5 text-[12px] font-semibold text-night hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Plus size={13} /> Add Verified Fact
          </button>
        </div>
      </div>

      {translateOpen && (
        <Card className="space-y-3 border-navy/35 bg-sunken">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <Label>Insaaf Translate · Vernacular Statement Verifier</Label>
              <p className="mt-0.5 text-[11px] text-ink-3">
                Verify client statements across all 12 supported Indian &amp; regional languages before recording a fact.
              </p>
            </div>
          </div>
          <form onSubmit={(e) => void runTranslate(e)} className="space-y-2.5">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block space-y-1 text-[11px] font-medium text-ink-2">
                <span>Source Language</span>
                <select
                  value={srcLang}
                  onChange={(e) => setSrcLang(e.target.value)}
                  className="field"
                >
                  {meta.languages.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-[11px] font-medium text-ink-2">
                <span>Target Language</span>
                <select
                  value={tgtLang}
                  onChange={(e) => setTgtLang(e.target.value)}
                  className="field"
                >
                  {meta.languages.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <textarea
              rows={2}
              value={trInput}
              onChange={(e) => setTrInput(e.target.value)}
              placeholder="Paste vernacular client statement (Konkani, Marathi, Hindi, Urdu, Tamil…)"
              className="field"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-ink-3">Uses live backend Insaaf Translate endpoint</span>
              <button
                type="submit"
                disabled={translating || !trInput.trim()}
                className="inline-flex items-center gap-1.5 rounded-[5px] bg-navy px-3 py-1.5 text-[12px] font-semibold text-night hover:bg-navy-600 disabled:opacity-45"
              >
                <Languages size={12} /> {translating ? 'Translating…' : 'Translate'}
              </button>
            </div>
          </form>
          {trResult && (
            <Well className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-navy">{trResult.engine}</span>
                <Badge tone={trResult.confidence === 'high' ? 'ok' : 'warn'}>
                  {trResult.confidence} confidence
                </Badge>
              </div>
              <p className="text-[13px] leading-relaxed text-ink">{trResult.text}</p>
            </Well>
          )}
        </Card>
      )}

      {voiceDocs.length > 0 && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Label>Voice Notes &amp; Audio Statements ({voiceDocs.length})</Label>
            <span className="text-[11px] text-ink-3">Stored strictly in chamber custody · playable with Bearer auth</span>
          </div>
          <div className="divide-y divide-line">
            {voiceDocs.map((doc) => {
              const hasAudio = Boolean(doc.transcript?.has_audio || doc.kind === 'voice' || doc.kind === 'audio')
              const tr = doc.transcript
              return (
                <div key={doc.id} className="space-y-2 py-3 first:pt-1 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Mic size={13} className="text-navy" />
                      <span className="font-mono text-[12px] font-medium text-ink">{doc.name}</span>
                      {tr?.language && <Badge tone="neutral">{languageLabel(meta, tr.language)}</Badge>}
                      <Badge tone={tr?.status === 'transcribed' ? 'ok' : 'warn'}>
                        {tr?.status ?? 'audio attached'}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {hasAudio && !audioUrls[doc.id] && (
                        <button
                          type="button"
                          disabled={loadingAudioId === doc.id}
                          onClick={() => void loadAudio(doc)}
                          className="inline-flex items-center gap-1 rounded-[4px] border border-line-strong bg-sunken px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-hover disabled:opacity-45"
                        >
                          <Volume2 size={11} /> {loadingAudioId === doc.id ? 'Loading…' : 'Load Audio Player'}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={!canEdit || retranscribingId === doc.id}
                        title={canEdit ? undefined : `The ${me.role} role cannot trigger transcription`}
                        onClick={() => void retryTranscribe(doc)}
                        className="inline-flex items-center gap-1 rounded-[4px] border border-brass-200 bg-brass-50 px-2.5 py-1 text-[11px] font-medium text-brass hover:bg-brass-50/80 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <RotateCcw size={11} className={retranscribingId === doc.id ? 'animate-spin' : ''} />
                        {retranscribingId === doc.id ? 'Transcribing…' : 'Retry Transcription'}
                      </button>
                    </div>
                  </div>
                  {audioUrls[doc.id] && (
                    <audio controls src={audioUrls[doc.id]} className="h-8 w-full max-w-sm" />
                  )}
                  {(tr?.original_text || tr?.english_translation) && (
                    <div className="grid gap-2 text-[12px] sm:grid-cols-2">
                      {tr?.original_text && (
                        <Well>
                          <Label className="mb-1">Original Transcript</Label>
                          <p className="devanagari text-ink">{tr.original_text}</p>
                        </Well>
                      )}
                      {tr?.english_translation && (
                        <Well>
                          <Label className="mb-1">English Translation</Label>
                          <p className="text-ink-2">{tr.english_translation}</p>
                        </Well>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {facts.length === 0 ? (
        <Empty
          text="No facts extracted yet. Attach the client's documents or voice note in the Case record, then run the pipeline."
          action={
            <button
              type="button"
              onClick={() => onJump('pipeline')}
              className="rounded-[5px] bg-navy px-3.5 py-1.5 text-[12px] font-semibold text-night hover:bg-navy-600"
            >
              Open pipeline
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {facts.map((fact) => {
            const mode: CardView = viewMode[fact.id] ?? 'both'
            return (
              <Card key={fact.id} className="flex h-full flex-col justify-between gap-3">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={tone[fact.status]}>{fact.status}</Badge>
                      {fact.original && (
                        <div className="inline-flex rounded-[4px] border border-line bg-sunken p-0.5 text-[10px]">
                          {(['both', 'english', 'original'] as const).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setViewMode((v) => ({ ...v, [fact.id]: m }))}
                              className={cn(
                                'rounded-[3px] px-1.5 py-0.5 font-medium capitalize transition-colors',
                                mode === m ? 'bg-navy text-night' : 'text-ink-3 hover:text-ink',
                              )}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {(mode === 'both' || mode === 'english' || !fact.original) && (
                    <p className="text-[13.5px] leading-snug text-ink">{fact.statement}</p>
                  )}

                  {fact.original && (mode === 'both' || mode === 'original') && (
                    <Well className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label>{languageLabel(meta, fact.original.language)} · Original Statement</Label>
                        <ConfidenceDot c={fact.original.translation_confidence} />
                      </div>
                      <p className="devanagari text-[14px] leading-relaxed text-ink">{fact.original.text}</p>
                      <p className="text-[11px] text-ink-3">
                        Original vernacular text preserved beside English translation for advocate verification.
                      </p>
                    </Well>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
                  <p className="flex items-center gap-1.5 font-mono text-[11px] text-ink-3">
                    {fact.source ? (
                      <>
                        {fact.source.document_id.includes('voice') ? <Mic size={12} /> : <FileText size={12} />}
                        {fact.source.document_id} · {fact.source.location}
                      </>
                    ) : (
                      'No document span · requires client verification'
                    )}
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={!canEdit}
                      title={canEdit ? undefined : `The ${me.role} role cannot edit or verify facts`}
                      onClick={() =>
                        onReview({
                          target: 'fact',
                          target_id: fact.id,
                          title: fact.statement,
                          action: 'edit',
                        })
                      }
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-navy hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
                    >
                      <Pencil size={11} /> Edit / Verify
                    </button>
                    <button
                      type="button"
                      disabled={!canEdit}
                      title={canEdit ? undefined : `The ${me.role} role cannot delete facts`}
                      onClick={() =>
                        onReview({
                          target: 'fact',
                          target_id: fact.id,
                          title: fact.statement,
                          action: 'delete',
                        })
                      }
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-bad hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
                    >
                      <Trash2 size={11} /> Delete
                    </button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
