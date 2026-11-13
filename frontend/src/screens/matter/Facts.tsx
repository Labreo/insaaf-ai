import { FileText, Mic, Pencil, Plus } from 'lucide-react'
import { api } from '@/lib/api'
import type { Fact } from '@/lib/types'
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
import type { TabProps } from '../Matter'

const tone: Record<Fact['status'], Tone> = {
  alleged: 'neutral',
  documented: 'ok',
  disputed: 'warn',
  unknown: 'bad',
}

/** F4: bilingual fact cards. Allegations never silently become documented facts. */
export default function Facts({ id, onReview, onJump }: TabProps) {
  const f = useAsync(() => api.facts(id), [id])
  if (f.loading && !f.data) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    )
  }
  if (f.error) return <ErrorBanner error={f.error} onRetry={f.reload} />
  if (!f.data?.length)
    return (
      <Empty
        text="No facts extracted yet. Attach the client's documents or voice note in the Case record, then run the pipeline."
        action={
          <button
            type="button"
            onClick={() => onJump('pipeline')}
            className="rounded-[5px] bg-navy px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-navy-600"
          >
            Open pipeline
          </button>
        }
      />
    )

  const counts = f.data.reduce(
    (a, x) => ({ ...a, [x.status]: (a[x.status] ?? 0) + 1 }),
    {} as Record<string, number>,
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Label>Bilingual Fact Register ({f.data.length})</Label>
          {(['documented', 'alleged', 'disputed', 'unknown'] as const).map((s) =>
            counts[s] ? (
              <Badge key={s} tone={tone[s]}>
                {counts[s]} {s}
              </Badge>
            ) : null,
          )}
        </div>
        <button
          type="button"
          onClick={() =>
            onReview({ target: 'fact', target_id: 'new', title: 'Add verified fact', action: 'edit' })
          }
          className="inline-flex items-center gap-1.5 rounded-[5px] bg-navy px-3 py-1.5 text-[12px] font-medium text-white hover:bg-navy-600"
        >
          <Plus size={13} /> Add Verified Fact
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {f.data.map((fact) => (
          <Card key={fact.id} className="flex h-full flex-col justify-between gap-3">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] leading-snug text-ink">{fact.statement}</p>
                <Badge tone={tone[fact.status]}>{fact.status}</Badge>
              </div>

              {fact.original && (
                <Well className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>
                      {fact.original.language === 'kok' ? 'Konkani' : fact.original.language} · Original Statement
                    </Label>
                    <ConfidenceDot c={fact.original.translation_confidence} />
                  </div>
                  <p className="devanagari text-[14px] leading-relaxed text-ink">{fact.original.text}</p>
                  <p className="text-[11px] text-ink-3">
                    Original vernacular text preserved beside English translation for advocate verification.
                  </p>
                </Well>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-line pt-2.5">
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
              <button
                type="button"
                onClick={() =>
                  onReview({
                    target: 'fact',
                    target_id: fact.id,
                    title: fact.statement,
                    action: 'edit',
                  })
                }
                className="inline-flex items-center gap-1 text-[11px] font-medium text-navy hover:underline"
              >
                <Pencil size={11} /> Edit / Verify
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
