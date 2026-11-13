import { Button, Chip, Label, Row } from '@/components/ui'
import { Logo } from '@/components/Shell'
import { USE_MOCKS } from '@/lib/api'

export default function Me({ onReplayIntro }: { onReplayIntro: () => void }) {
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between"><Logo /><Chip tone={USE_MOCKS ? 'distinguished' : 'followed'}>{USE_MOCKS ? 'mock data' : 'live API'}</Chip></header>
      <div>
        <p className="text-heading font-normal text-marble">Adv. Kanak</p>
        <p className="text-[13px] text-pewter">Junior · Chamber A · Goa</p>
      </div>
      <Row>
        <Label>Chamber</Label>
        <p className="mt-1 text-[14px] text-marble">Roles: senior, junior, clerk, student</p>
        <p className="text-[12px] text-smoke">Data encrypted per organisation. Access is visible to every member, never hidden.</p>
      </Row>
      <Row>
        <Label>Demo</Label>
        <div className="mt-2"><Button variant="ghost" className="px-0" onClick={onReplayIntro}>Replay intro</Button></div>
      </Row>
      <p className="text-[11px] text-smoke">Insaaf is a drafting and research assistant for advocates. Every draft needs an advocate&rsquo;s approval, which is logged.</p>
    </div>
  )
}
