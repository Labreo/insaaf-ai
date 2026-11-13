import { useState } from 'react'
import { motion } from 'motion/react'
import { Check, ShieldAlert } from 'lucide-react'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { useDB } from '@/lib/store'
import type { ReasonCode, ReviewInput } from '@/lib/types'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'
import { Label } from './primitives'

const reasons: { k: ReasonCode; label: string }[] = [
  { k: 'wrong_fact', label: 'Wrong fact' }, { k: 'wrong_law', label: 'Wrong law' }, { k: 'wrong_citation_treatment', label: 'Citation treatment' },
  { k: 'score_disagree', label: 'Score disagree' }, { k: 'bias_concern', label: 'Bias concern' }, { k: 'other', label: 'Other' },
]

export interface ReviewRequest { target: ReviewInput['target']; target_id: string; title: string; action?: ReviewInput['action'] }

/**
 * F11 + F13: every override or approval goes through here, lands in the hash-chained ledger,
 * and becomes a label for retraining. Only a senior can approve or override.
 */
export default function ReviewDrawer({ matterId, req, onClose, onDone }: { matterId: string; req: ReviewRequest | null; onClose: () => void; onDone?: () => void }) {
  const role = useDB((d) => d.me.role)
  const [reason, setReason] = useState<ReasonCode>('score_disagree')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const canDecide = role === 'senior'
  const action = req?.action ?? 'override'

  const submit = async () => {
    if (!req) return
    setBusy(true)
    await api.review(matterId, { action, target: req.target, target_id: req.target_id, reason_code: action === 'approve' ? 'other' : reason, note })
    setBusy(false); sfx.seal(); setNote(''); onDone?.(); onClose()
  }

  return (
    <Drawer open={!!req} onOpenChange={(o) => !o && onClose()} showSwipeHandle>
      <DrawerContent className="mx-auto max-w-xl rounded-t-sheet border-marble/8 bg-velvet/95 p-5 backdrop-blur-xl safe-b">
        {req && (
          <div className="space-y-4">
            <div>
              <Label className="mb-1">{action} · {req.target}</Label>
              <DrawerTitle className="text-title font-normal text-marble">{req.title}</DrawerTitle>
              <DrawerDescription className="mt-1 text-[12px] text-smoke">Recorded in the reviewer ledger with your identity, the time, and your reason. Becomes a training label.</DrawerDescription>
            </div>

            {!canDecide && (
              <div className="flex items-start gap-2 rounded-xl border border-distinguished/25 bg-distinguished/10 p-3 text-[13px] text-distinguished">
                <ShieldAlert size={16} className="mt-0.5 shrink-0" />
                <p>Only a <span className="font-medium">senior</span> can {action}. You are signed in as <span className="capitalize">{role}</span>. Switch role on the Me screen for the demo.</p>
              </div>
            )}

            {action !== 'approve' && (
              <div>
                <Label className="mb-2">Reason</Label>
                <div className="grid grid-cols-3 gap-2">
                  {reasons.map((r) => (
                    <button key={r.k} onClick={() => { sfx.tick(); setReason(r.k) }} className={cn('relative rounded-xl px-2.5 py-2.5 text-left text-[12px] transition-colors', reason === r.k ? 'text-marble' : 'text-smoke hover:text-pewter')}>
                      {reason === r.k && <motion.span layoutId="reason-pill" className="absolute inset-0 rounded-xl border border-brass/30 bg-brass/10" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
                      <span className="relative">{r.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label className="mb-2">Note</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={action === 'approve' ? 'Optional: what you checked before approving' : 'Why Insaaf got it wrong'} className="glass-well resize-none border-0 text-[14px] text-marble placeholder:text-smoke" />
            </div>

            <div className="flex gap-2">
              <Button variant="ghost" className="h-11 flex-1 rounded-full" onClick={onClose}>Cancel</Button>
              <Button disabled={!canDecide || busy} onClick={submit} className="h-11 flex-1 rounded-full bg-brass text-void uppercase tracking-[0.1em] hover:bg-[#d6b676]">
                <Check size={14} /> {busy ? 'Sealing…' : action === 'approve' ? 'Approve & seal' : 'Override & seal'}
              </Button>
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}
