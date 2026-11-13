import { useState } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, Radar as RadarIcon } from 'lucide-react'
import { api } from '@/lib/api'
import type { LawChange } from '@/lib/types'
import { Chip, Empty, Glass, Label, Skeleton, Well, stagger, useAsync } from '@/components/primitives'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { sfx } from '@/lib/sound'
import type { TabProps } from '../Matter'

/** F10: BNS / BNSS / BSA transition radar. Table lookup + offence date, not a model. */
export default function Radar({ id }: TabProps) {
  const r = useAsync(() => api.lawChanges(id), [id])
  const [text, setText] = useState('')
  const [date, setDate] = useState('2026-01-01')
  const [scan, setScan] = useState<LawChange[] | null>(null)
  const [busy, setBusy] = useState(false)

  const doScan = async () => {
    setBusy(true)
    sfx.tick()
    setScan(await api.scanLaw(text, date))
    setBusy(false)
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <div className="lg:col-span-6">
        <Glass spotlight className="h-full space-y-3">
          <Label>Law change radar · in this draft</Label>
          <p className="text-[12px] text-pewter">
            Deterministic IPC/CrPC/IEA to BNS/BNSS/BSA statutory crosswalk based on offence date.
          </p>
          {r.loading && <Skeleton className="mt-2 h-24" />}
          {r.data?.length === 0 && (
            <Well className="text-[13px] text-followed">No repealed sections found in the current draft or fact register.</Well>
          )}
          <div className="space-y-2">
            {r.data?.map((c, i) => (
              <Hit key={i} c={c} i={i} />
            ))}
          </div>
          <p className="border-t border-seam pt-3 text-[11px] text-smoke">
            Effective 1 July 2024, the IPC, CrPC, and Indian Evidence Act were replaced by the BNS, BNSS, and BSA. Mapping is strictly rule-based from the statutory table and offence date.
          </p>
        </Glass>
      </div>

      <div className="lg:col-span-6">
        <Glass className="h-full space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Scan any text · BNS / BNSS / BSA Crosswalk</Label>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-smoke">Offence date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="glass-well px-2.5 py-1 text-[12px] text-pewter"
                aria-label="Offence date"
              />
            </div>
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder="Paste a pleading, FIR extract, or draft clause: e.g. “…an offence under IPC 420 and IPC 406, bail under CrPC 438…”"
            className="glass-well resize-none border border-seam text-[13px] text-marble placeholder:text-smoke"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-smoke">Offence date determines whether legacy or Sanhita code governs.</p>
            <Button
              disabled={busy || !text.trim()}
              onClick={doScan}
              className="h-9 rounded-md bg-brass px-4 text-[12px] font-medium uppercase tracking-[0.08em] text-void hover:bg-[#d6b676]"
            >
              <RadarIcon size={14} /> Scan
            </Button>
          </div>
          {scan && (
            <div className="space-y-2 border-t border-seam pt-3">
              {scan.length ? scan.map((c, i) => <Hit key={i} c={c} i={i} />) : <Empty text="Nothing outdated found." />}
            </div>
          )}
        </Glass>
      </div>
    </div>
  )
}

function Hit({ c, i }: { c: LawChange; i: number }) {
  return (
    <motion.div {...stagger(i)}>
      <Well className="flex flex-wrap items-center gap-2.5">
        <Chip tone={c.applies ? 'overruled' : 'smoke'}>{c.found}</Chip>
        <ArrowRight size={13} className="text-smoke" />
        <Chip tone={c.applies ? 'followed' : 'smoke'}>{c.replaced_by}</Chip>
        <span className="ml-auto font-mono text-[11px] text-smoke">{c.applies ? 'applies' : 'old code'}</span>
      </Well>
      {c.location && <p className="mt-1 px-1 text-[11px] text-smoke">…{c.location}…</p>}
    </motion.div>
  )
}
