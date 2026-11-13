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

/** F14: outdated law in the draft (IPC → BNS, CrPC → BNSS, Evidence Act → BSA) plus a paste-to-scan box. */
export default function Radar({ id }: TabProps) {
  const r = useAsync(() => api.lawChanges(id), [id])
  const [text, setText] = useState('')
  const [date, setDate] = useState('2026-01-01')
  const [scan, setScan] = useState<LawChange[] | null>(null)
  const [busy, setBusy] = useState(false)

  const doScan = async () => { setBusy(true); sfx.tick(); setScan(await api.scanLaw(text, date)); setBusy(false) }

  return (
    <div className="space-y-4">
      <Glass spotlight>
        <Label>Law change radar · in this draft</Label>
        {r.loading && <Skeleton className="mt-3 h-10" />}
        {r.data?.length === 0 && <p className="mt-2 text-[14px] text-followed">No repealed sections found in the draft or facts.</p>}
        {r.data?.map((c, i) => <Hit key={i} c={c} i={i} />)}
        <p className="mt-3 text-[11px] text-smoke">From 1 July 2024 the IPC, CrPC and Evidence Act were replaced by the BNS, BNSS and BSA. Mapping is a table plus the offence date, not a model.</p>
      </Glass>

      <Glass className="space-y-3">
        <div className="flex items-center justify-between"><Label>Scan any text</Label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="glass-well px-2 py-1 text-[11px] text-pewter" aria-label="Offence date" /></div>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Paste a draft: e.g. “…an offence under IPC 420 and IPC 406, bail under CrPC 438…”" className="glass-well resize-none border-0 text-[14px] text-marble placeholder:text-smoke" />
        <div className="flex items-center justify-between"><p className="text-[11px] text-smoke">Offence date decides which code applies.</p><Button disabled={busy || !text.trim()} onClick={doScan} className="h-9 rounded-full bg-brass px-4 text-void uppercase tracking-[0.1em] hover:bg-[#d6b676]"><RadarIcon size={14} /> Scan</Button></div>
        {scan && (scan.length ? scan.map((c, i) => <Hit key={i} c={c} i={i} />) : <Empty text="Nothing outdated found." />)}
      </Glass>
    </div>
  )
}

function Hit({ c, i }: { c: LawChange; i: number }) {
  return (
    <motion.div {...stagger(i)}>
      <Well className="mt-2 flex items-center gap-3">
        <Chip tone={c.applies ? 'overruled' : 'smoke'}>{c.found}</Chip>
        <ArrowRight size={14} className="text-smoke" />
        <Chip tone={c.applies ? 'followed' : 'smoke'}>{c.replaced_by}</Chip>
        <span className="ml-auto text-[11px] text-smoke">{c.applies ? 'applies' : 'old code'}</span>
      </Well>
      {c.location && <p className="mt-1 px-1 text-[11px] text-smoke">…{c.location}…</p>}
    </motion.div>
  )
}
