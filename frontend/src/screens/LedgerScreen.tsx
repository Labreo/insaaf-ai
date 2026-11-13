import { Logo } from '@/components/Shell'
import LedgerTab from './matter/LedgerTab'

export default function LedgerScreen() {
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between"><Logo /><span className="label">chamber-wide</span></header>
      <h1 className="text-heading font-normal text-marble">Nothing reviewed is <span className="serif italic text-brass">hidden</span>.</h1>
      <LedgerTab id="all" />
    </div>
  )
}
