import { api } from '@/lib/api'
import {
  Badge,
  Card,
  ConfidenceDot,
  ErrorBanner,
  Label,
  Skeleton,
  SourceChip,
  useAsync,
} from '@/components/primitives'
import { cn } from '@/lib/utils'
import type { TabProps } from '../Matter'

const routeLabel: Record<string, string> = {
  lok_adalat: 'Lok Adalat (Legal Services Authorities Act)',
  pre_institution_mediation_12A: 'Pre-Institution Mediation (s.12A Commercial Courts Act)',
  fight: 'Proceed to Contested Suit / Trial',
  plea_bargain: 'Plea Bargaining (BNSS Ch. XXIII)',
  mediate: 'Court-Annexed Mediation (s.89 CPC)',
  settle: 'Structured Settlement',
}

/** F6: deterministic settle-or-fight strategic eligibility advisor. */
export default function AdviceTab({ id, onOpen, onReview }: TabProps) {
  const a = useAsync(() => api.advice(id), [id])
  if (a.loading && !a.data) return <Skeleton className="h-72" />
  if (a.error && !a.data) return <ErrorBanner error={a.error} onRetry={a.reload} />
  if (!a.data) return null

  const d = a.data
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Label>Settle or Fight Advisor (Deterministic Rules)</Label>
          <p className="mt-1 text-[24px] font-semibold capitalize text-ink">
            {d.recommendation.replace('_', ' ')}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <ConfidenceDot c={d.confidence} />
            <span className="text-[12px] text-ink-3">
              Computed from statutory eligibility rules, score band, and limitation posture
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            onReview({
              target: 'advice',
              target_id: d.recommendation,
              title: `Disagree with "${d.recommendation.replace('_', ' ')}"`,
            })
          }
          className="rounded-[5px] border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-navy hover:bg-navy-50"
        >
          Disagree / Override →
        </button>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {d.options.map((o) => (
          <Card
            key={o.route}
            className={cn('flex h-full flex-col justify-between gap-3', !o.eligible && 'bg-sunken opacity-80')}
          >
            <div>
              <div className="flex items-center justify-between gap-2 border-b border-line pb-2.5">
                <p className="text-[14px] font-semibold text-ink">{routeLabel[o.route] ?? o.route}</p>
                <Badge tone={o.eligible ? 'ok' : 'neutral'}>
                  {o.eligible ? 'Eligible' : 'Not Eligible'}
                </Badge>
              </div>
              <p className="mt-2.5 text-[13px] leading-relaxed text-ink-2">{o.why}</p>
            </div>
            {o.sources.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-t border-line pt-2.5">
                {o.sources.map((s) => (
                  <SourceChip key={s.source_id} s={s} onOpen={onOpen} />
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>

      <p className="text-[11px] text-ink-3">
        Strategic decision support for advocates only. Plea bargaining applies solely to criminal matters punishable under 7 years, excluding socio-economic and women/child offences.
      </p>
    </div>
  )
}
