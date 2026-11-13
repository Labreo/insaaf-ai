import { useState } from 'react'
import { ArrowRight, Radar as RadarIcon } from 'lucide-react'
import { api } from '@/lib/api'
import type { LawChange } from '@/lib/types'
import {
  Badge,
  Card,
  Empty,
  ErrorBanner,
  Label,
  Skeleton,
  Well,
  useAsync,
} from '@/components/primitives'
import { sfx } from '@/lib/sound'
import type { TabProps } from '../Matter'

/** F14: BNS / BNSS / BSA transition radar (table lookup + offence date). */
export default function Radar({ id }: TabProps) {
  const r = useAsync(() => api.lawChanges(id), [id])
  const [text, setText] = useState('')
  const [date, setDate] = useState('2026-01-01')
  const [scan, setScan] = useState<LawChange[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const doScan = async () => {
    setBusy(true)
    setErr(null)
    sfx.tick()
    try {
      setScan(await api.scanLaw(text, date))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="lg:col-span-6">
        <Card className="h-full space-y-3">
          <Label>F14 · Law Change Radar (Detected in Matter)</Label>
          <p className="text-[12.5px] text-ink-2">
            Deterministic IPC / CrPC / IEA to BNS / BNSS / BSA statutory crosswalk evaluated against offence date.
          </p>

          {r.loading && !r.data && <Skeleton className="h-24" />}
          {r.error && <ErrorBanner error={r.error} onRetry={r.reload} />}
          {r.data?.length === 0 && (
            <Well className="text-[13px] text-ok font-medium">
              No repealed sections detected in the current matter documents.
            </Well>
          )}
          <div className="space-y-2">
            {r.data?.map((c, i) => (
              <Hit key={`${c.found}-${i}`} c={c} />
            ))}
          </div>

          <p className="border-t border-line pt-3 text-[11px] text-ink-3">
            Effective 1 July 2024, the IPC, CrPC, and Indian Evidence Act were replaced by the BNS, BNSS, and BSA. Crosswalks are strictly rule-table driven.
          </p>
        </Card>
      </div>

      <div className="lg:col-span-6">
        <Card className="h-full space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Live Text Crosswalk Scanner</Label>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-ink-3">Offence Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="field h-8 w-36 font-mono text-[12px]"
                aria-label="Offence date"
              />
            </div>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder='Paste an FIR extract or pleading clause: e.g. "…offence under IPC 420 and IPC 406, anticipatory bail under CrPC 438…"'
            className="field"
          />

          {err && <ErrorBanner error={err} />}

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() =>
                setText('FIR registered for cheating under IPC 420, criminal breach of trust IPC 406, and bail sought under CrPC 438.')
              }
              className="text-[11px] font-medium text-navy hover:underline"
            >
              Insert sample IPC/CrPC clause
            </button>
            <button
              type="button"
              disabled={busy || !text.trim()}
              onClick={doScan}
              className="inline-flex items-center gap-1.5 rounded-[5px] bg-navy px-4 py-1.5 text-[12px] font-medium text-white hover:bg-navy-600 disabled:opacity-50"
            >
              <RadarIcon size={13} /> {busy ? 'Scanning…' : 'Scan Sections'}
            </button>
          </div>

          {scan && (
            <div className="space-y-2 border-t border-line pt-3">
              {scan.length ? scan.map((c, i) => <Hit key={`${c.found}-${i}`} c={c} />) : <Empty text="No outdated sections detected." />}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function Hit({ c }: { c: LawChange }) {
  return (
    <div className="space-y-1">
      <Well className="flex flex-wrap items-center gap-2">
        <Badge tone={c.applies ? 'bad' : 'neutral'}>{c.found}</Badge>
        <ArrowRight size={13} className="text-ink-3" />
        <Badge tone={c.applies ? 'ok' : 'neutral'}>{c.replaced_by}</Badge>
        <span className="ml-auto font-mono text-[11px] text-ink-3">
          {c.applies ? 'New Sanhita Applies' : 'Legacy Code'}
        </span>
      </Well>
      <p className="px-1 text-[11px] text-ink-3">{c.reason}</p>
    </div>
  )
}
