import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { FileUp, Mic } from 'lucide-react'
import { Button, Label, Row, cx } from '@/components/ui'
import { Logo } from '@/components/Shell'

const types = [
  { k: 'property', label: 'Property', hint: 'title, possession, injunction' },
  { k: 'civil_recovery', label: 'Civil recovery', hint: 'money suits, contracts' },
  { k: 'criminal', label: 'Criminal', hint: 'bail, plea eligibility' },
]

export default function NewMatter() {
  const nav = useNavigate()
  const [type, setType] = useState('property')
  const [title, setTitle] = useState('')
  const [files, setFiles] = useState<string[]>([])
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between"><Logo /><span className="label">new matter</span></header>
      <h1 className="text-heading font-normal text-marble">What did the client bring?</h1>

      <div>
        <Label className="mb-2">Case type</Label>
        <div className="grid grid-cols-3 gap-2">
          {types.map((t) => (
            <button key={t.k} onClick={() => setType(t.k)} className={cx('rounded-card p-3 text-left transition-colors hairline', type === t.k ? 'bg-graphite text-marble' : 'bg-velvet text-pewter')}>
              <p className="text-[14px]">{t.label}</p><p className="text-[10px] text-smoke">{t.hint}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="mb-2">Title</Label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fernandes v. Naik — possession, Mapusa" className="w-full rounded-xl bg-graphite p-3.5 text-[15px] text-marble placeholder:text-smoke focus:outline-none focus:ring-1 focus:ring-brass/60" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Drop icon={FileUp} label="PDF / DOCX" hint="agreements, notices, replies" onPick={() => setFiles((f) => [...f, 'agreement.pdf'])} />
        <Drop icon={Mic} label="Voice note" hint="Konkani · Marathi · Hindi" onPick={() => setFiles((f) => [...f, 'client_note.m4a'])} />
      </div>
      {files.length > 0 && <Row><Label>Attached</Label>{files.map((f, i) => <p key={i} className="mt-1 text-[13px] text-pewter">{f}</p>)}</Row>}

      <Button className="w-full" onClick={() => nav('/matters/mat_001?tab=pipeline')}>Create and run pipeline</Button>
      <p className="text-center text-[11px] text-smoke">Demo: opens the fictional property matter.</p>
    </div>
  )
}

function Drop({ icon: Icon, label, hint, onPick }: { icon: typeof FileUp; label: string; hint: string; onPick: () => void }) {
  return (
    <motion.button whileTap={{ scale: 0.98 }} onClick={onPick} className="flex flex-col items-start gap-2 rounded-card border border-dashed border-seam bg-velvet p-4 text-left hover:border-brass/50">
      <Icon size={18} className="text-brass" strokeWidth={1.6} />
      <p className="text-[14px] text-marble">{label}</p>
      <p className="text-[11px] text-smoke">{hint}</p>
    </motion.button>
  )
}
