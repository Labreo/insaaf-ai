import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  ArrowRight,
  BookCheck,
  Clock,
  FileCheck2,
  Gavel,
  Lock,
  Play,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import Rays from '@/intro/Rays'
import { openAuth, useDB } from '@/lib/store'
import { cn } from '@/lib/utils'
import { sfx } from '@/lib/sound'

const ease = [0.16, 1, 0.3, 1] as const

const GUARANTEES = [
  {
    id: 'authority',
    kicker: 'Authority Lock',
    title: 'Zero fabricated citations. Ever.',
    summary:
      'Every legal proposition in a generated pleading must bind to an indexed paragraph in Insaaf Precedent Index or a statutory rule on record. Any unsupported assertion is quarantined and replaced with "No verified authority found."',
    evidence: 'Prevents Mata v. Avianca (S.D.N.Y. 2023) style LLM hallucinations by architectural refusal, not prompt disclaimers.',
    previewTitle: 'Pleading Paragraph Gate',
    previewRows: [
      { label: 'Suraj Lamp & Industries v. State of Haryana · ¶15', status: 'LOCKED IN', ok: true },
      { label: 'Registration Act, 1908 · s.17 & s.49', status: 'VERIFIED', ok: true },
      { label: 'Unverified GPA confers absolute title claim', status: 'REFUSED · NO AUTHORITY', ok: false },
    ],
    ctaLabel: 'Test Authority Lock Live',
    to: '/matters/mat_001?tab=draft',
  },
  {
    id: 'bias',
    kicker: 'Counterfactual Bias Firewall',
    title: 'Identity can never move the score.',
    summary:
      'Before scoring a matter, NER masks names, caste-coded surnames, religion, gender, tribe, and language markers. The model then re-runs across 10 protected counterfactual identities. If |S − S_swap| exceeds ε = 0.02, the score is withheld.',
    evidence: 'Addresses IndoCentric AI Bias Benchmark findings where reasoning models flipped legal outcomes up to 41.67% on marginalised groups.',
    previewTitle: '10-Identity Invariance Matrix (ε = 0.02)',
    previewRows: [
      { label: 'Baseline / Muslim / Dalit', status: '0.32 · Δ 0.00', ok: true },
      { label: 'Tribal / Female', status: '0.32 · Δ 0.00', ok: true },
      { label: 'Non-English Speaking (Konkani)', status: '0.32 · PASSED', ok: true },
    ],
    ctaLabel: 'Run Live Counterfactual Flip',
    to: '/matters/mat_001?tab=score',
  },
  {
    id: 'rules',
    kicker: 'Deterministic Rules & Ledger',
    title: 'Rules calculate law. Ledgers seal every override.',
    summary:
      'Limitation deadlines (including Supreme Court COVID-19 suo motu exclusions), evidentiary proof checklists, and IPC → BNS / BNSS statutory crosswalks execute deterministically from YAML rule packs. Every advocate edit is SHA-256 hash-chained.',
    evidence: 'Daily Merkle root hashes anchor to Solana Devnet while client documents stay strictly inside chamber custody.',
    previewTitle: 'Deterministic Rule & Audit Trail',
    previewRows: [
      { label: 'Limitation Act Art. 65 + COVID exclusion (2020–2022)', status: 'DETERMINISTIC', ok: true },
      { label: 'Proof Ledger: Registered Sale Deed (s.17)', status: 'MISSING · CRITICAL', ok: false },
      { label: 'Reviewer Chain · SHA-256 + Solana Devnet', status: 'CHAIN INTACT', ok: true },
    ],
    ctaLabel: 'Inspect Audit Ledger',
    to: '/ledger',
  },
] as const

const PIPELINE_STEPS = [
  { n: '01', name: 'Intake & OCR', engine: 'PyMuPDF · Insaaf Translate', tab: 'facts', desc: 'PDF, DOCX, 12-language voice' },
  { n: '02', name: 'Bilingual Facts', engine: 'Source-Span Lock', tab: 'facts', desc: 'Separates allegation from record' },
  { n: '03', name: 'Proof Ledger', engine: 'Deterministic YAML', tab: 'proof', desc: 'Flags missing statutory instruments' },
  { n: '04', name: 'Statute Clock', engine: 'Deterministic Rules', tab: 'clock', desc: 'Limitation + COVID tolling + forum' },
  { n: '05', name: 'Precedent Search', engine: '8s Time-Boxed', tab: 'precedents', desc: 'Verified corpus → top 20 judgments' },
  { n: '06', name: 'Authority Lock', engine: 'Corpus Binding', tab: 'draft', desc: 'No stored paragraph, no legal claim' },
  { n: '07', name: 'Citation Health', engine: 'Downstream Check', tab: 'citations', desc: 'Blocks overruled precedents' },
  { n: '08', name: 'Bias Firewall', engine: '10-Identity Flip', tab: 'score', desc: 'ε = 0.02 counterfactual gate' },
  { n: '09', name: 'Insaaf B-Score', engine: 'Court-Pooled ML', tab: 'score', desc: 'Calibrated band + shrinkage' },
  { n: '10', name: 'Settle / Fight', engine: 'Statutory Rules', tab: 'advice', desc: 's.12A, Lok Adalat, BNSS s.290' },
  { n: '11', name: 'Verified Draft', engine: 'DOCX + Ledger', tab: 'draft', desc: 'Senior sign-off & SHA-256 seal' },
]

const BENCHMARKS = [
  {
    caseName: 'Mata v. Avianca',
    court: 'S.D.N.Y. (2023)',
    failure: 'LLM brief cited six non-existent judicial opinions; counsel sanctioned $5,000.',
    defence: 'Authority Lock refuses to emit any legal proposition lacking a stored Insaaf Precedent Index SourceRef.',
  },
  {
    caseName: 'Suraj Lamp & Industries v. State of Haryana',
    court: 'Supreme Court of India (2011)',
    failure: 'Litigants file suits claiming ownership via unregistered GPA / Agreement of Sale.',
    defence: 'Deterministic Proof Ledger flags missing s.17 Registration Act deed on day one.',
  },
  {
    caseName: 'IndoCentric AI Bias Benchmark',
    court: 'Empirical Legal Eval',
    failure: 'Standard reasoning models flipped outcomes on marginalised identities up to 41.67% of the time.',
    defence: '10-Identity Bias Firewall masks markers and withholds scores if Δ > 0.02.',
  },
  {
    caseName: 'BNS / BNSS / BSA Transition',
    court: 'Effective 1 July 2024',
    failure: 'Drafts cite repealed IPC / CrPC / IEA sections after the statutory cut-over date.',
    defence: 'Law Change Radar maps offence dates deterministically against statutory crosswalk tables.',
  },
]

export default function Landing({ onReplayIntro }: { onReplayIntro: () => void }) {
  const nav = useNavigate()
  const me = useDB((s) => s.me)
  const authed = useDB((s) => s.authed)
  const matters = useDB((s) => s.matters)
  const health = useDB((s) => s.health)
  const conn = useDB((s) => s.conn)
  const [activeGuarantee, setActiveGuarantee] = useState<(typeof GUARANTEES)[number]['id']>('authority')

  const currentG = GUARANTEES.find((g) => g.id === activeGuarantee) ?? GUARANTEES[0]
  const leadMatterId = matters[0]?.id ?? 'mat_001'

  return (
    <div className="night relative min-h-dvh overflow-x-clip bg-night text-bone">
      <div className="grain" aria-hidden>
        <div />
      </div>

      {/* Top Public Website Navbar */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-night/85 backdrop-blur-md">
        <div className="mx-auto flex h-15 max-w-[1280px] items-center justify-between gap-4 px-5 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-[5px] border border-gold/40 bg-gold/10 text-gold">
              <Scale size={16} strokeWidth={1.75} />
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-[15px] font-semibold tracking-[-0.02em] text-bone">Insaaf AI</span>
              <span className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-smoke">
                Authority-Locked Legal Workbench
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-6 text-[13px] text-fog md:flex">
            <a href="#guarantees" className="transition-colors hover:text-bone">
              Three Guarantees
            </a>
            <a href="#pipeline" className="transition-colors hover:text-bone">
              11-Stage Pipeline
            </a>
            <a href="#benchmarks" className="transition-colors hover:text-bone">
              Legal Defences
            </a>
            <a href="#cases" className="transition-colors hover:text-bone">
              Live Chamber Docket
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                sfx.tap()
                openAuth()
              }}
              className="hidden items-center gap-1.5 rounded-[5px] border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] font-medium text-fog transition-colors hover:border-gold/50 hover:text-bone sm:inline-flex"
            >
              <Lock size={12} className="text-gold" /> {authed ? `${me.name} · Account` : 'Sign in'}
            </button>
            <button
              type="button"
              onClick={() => {
                sfx.tap()
                onReplayIntro()
              }}
              className="hidden items-center gap-1.5 rounded-[5px] border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] font-medium text-fog transition-colors hover:border-gold/50 hover:text-bone md:inline-flex"
            >
              <Sparkles size={13} className="text-gold" /> Replay Intro
            </button>
            <button
              type="button"
              onClick={() => {
                sfx.tap()
                nav('/docket')
              }}
              className="inline-flex items-center gap-1.5 rounded-[5px] bg-gold px-3.5 py-1.5 text-[12px] font-semibold text-night transition-colors hover:bg-[#d8b878]"
            >
              Enter Workbench <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section with Lady Justice + Live Telemetry */}
      <section className="relative border-b border-white/10">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <img src="/intro/velvet.jpg" alt="" className="h-full w-full object-cover opacity-55" />
          <Rays strength={0.55} motes={10} />
          <div className="absolute inset-0 bg-[radial-gradient(80%_70%_at_70%_35%,transparent_0%,#0a0b0e_85%)]" />
        </div>

        <div className="relative mx-auto grid max-w-[1280px] items-center gap-10 px-5 py-14 lg:grid-cols-12 lg:px-8 lg:py-20">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease }}
            className="space-y-6 lg:col-span-7"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-gold">
              <span>PS 29 · Semantic Precedent Search & Outcome Prediction</span>
            </div>

            <h1 className="display text-[44px] leading-[1.03] tracking-[-0.02em] text-bone sm:text-[58px]">
              Writes the junior lawyer&rsquo;s first draft.{' '}
              <span className="gold-text italic">Refuses to write a single claim it cannot prove.</span>
            </h1>

            <p className="max-w-2xl text-[15px] leading-[1.65] text-fog">
              Insaaf AI turns raw client PDFs, DOCX briefs, and Indian-language voice notes into an
              authority-locked pleading. Every paragraph binds to a verified Insaaf Precedent Index judgment or statute,
              passes a 10-identity counterfactual bias firewall, and logs every senior advocate decision onto
              a SHA-256 hash-chained ledger.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  sfx.tap()
                  nav('/docket')
                }}
                className="inline-flex items-center gap-2 rounded-[6px] bg-gold px-5 py-2.5 text-[13px] font-semibold text-night transition-colors hover:bg-[#d8b878]"
              >
                Open Chamber Docket <ArrowRight size={15} />
              </button>
              <button
                type="button"
                onClick={() => {
                  sfx.tap()
                  nav('/precedents')
                }}
                className="inline-flex items-center gap-2 rounded-[6px] border border-gold/40 bg-gold/10 px-4 py-2.5 text-[13px] font-medium text-gold transition-colors hover:bg-gold/20"
              >
                <Search size={14} /> Search Precedents
              </button>
              <button
                type="button"
                onClick={() => {
                  sfx.tap()
                  nav(`/matters/${leadMatterId}?tab=draft`)
                }}
                className="inline-flex items-center gap-2 rounded-[6px] border border-white/15 bg-night-2/90 px-4 py-2.5 text-[13px] font-medium text-bone transition-colors hover:border-gold/50"
              >
                <FileCheck2 size={15} className="text-gold" /> Inspect Live Pleading
              </button>
              <button
                type="button"
                onClick={() => {
                  sfx.tap()
                  onReplayIntro()
                }}
                className="inline-flex items-center gap-1.5 rounded-[6px] border border-white/10 px-3.5 py-2.5 text-[13px] text-fog transition-colors hover:text-bone"
              >
                <Play size={13} /> Watch Justice Intro
              </button>
            </div>

            {/* Live Chamber Custody Strip */}
            <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-6 sm:grid-cols-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.1em] text-smoke">Custody Vault</p>
                <p className="mt-1 flex items-center gap-1.5 font-mono text-[13px] text-bone">
                  <span className={cn('h-2 w-2 rounded-full', conn === 'live' ? 'bg-emerald-400' : 'bg-amber-400')} />
                  {conn === 'live' ? 'DPDP Synced' : 'Connecting…'}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.1em] text-smoke">Precedent Search</p>
                <p className="mt-1 font-mono text-[13px] text-bone">8s Time-Boxed</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.1em] text-smoke">Authority Corpus</p>
                <p className="mt-1 font-mono text-[13px] text-gold">Insaaf Precedent Index</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.1em] text-smoke">Active Matters</p>
                <p className="mt-1 font-mono text-[13px] text-bone">
                  {matters.length} in {me.org.name && me.org.name !== 'No chamber' ? me.org.name : 'Demo Chamber'}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Right: Lady Justice Frame */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.75, ease, delay: 0.1 }}
            className="relative lg:col-span-5"
          >
            <div className="relative mx-auto aspect-[4/5] max-w-[420px] overflow-hidden rounded-[10px] border border-white/15 bg-night-2 shadow-2xl">
              <img src="/intro/velvet.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
              <div className="absolute inset-0 bg-[radial-gradient(65%_55%_at_50%_30%,rgba(201,168,104,0.18)_0%,rgba(10,11,14,0.88)_85%)]" />
              <img
                src="/intro/lady.webp"
                alt="Lady Justice"
                className="relative z-10 mx-auto h-[84%] w-auto object-contain pt-5 drop-shadow-[0_18px_35px_rgba(0,0,0,0.85)]"
              />
              <div className="absolute inset-x-4 bottom-4 z-20 rounded-[6px] border border-white/12 bg-night/90 p-3.5 backdrop-blur-md">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-mono uppercase tracking-[0.08em] text-gold">Authority-Locked Output</span>
                  <span className="font-mono text-smoke">
                    Precedent Index {health ? health.index_size.toLocaleString('en-IN') : '—'}
                  </span>
                </div>
                <p className="mt-1.5 text-[12px] leading-snug text-fog">
                  Daily Paper &amp; Ink Workbench for advocates · High Court &amp; District Court practice.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Interactive 3-Guarantee Showcase */}
      <section id="guarantees" className="mx-auto max-w-[1280px] px-5 py-16 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-gold">Why Insaaf Stands Apart</p>
            <h2 className="display mt-1 text-[34px] leading-tight text-bone">
              Three engineering guarantees judges can test live
            </h2>
          </div>
          <p className="max-w-md text-[13px] text-fog">
            No generic LLM chat wrapper. Every claim, deadline, score, and advocate override is deterministically verified.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-2.5 lg:col-span-5">
            {GUARANTEES.map((g) => {
              const active = g.id === activeGuarantee
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    sfx.tick()
                    setActiveGuarantee(g.id)
                  }}
                  className={cn(
                    'w-full rounded-[8px] border p-4 text-left transition-all',
                    active
                      ? 'border-gold/55 bg-night-2 shadow-[0_0_0_1px_rgba(201,168,104,0.2)]'
                      : 'border-white/10 bg-night-2/40 hover:border-white/20',
                  )}
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-gold">{g.kicker}</p>
                  <p className="mt-1 text-[16px] font-medium text-bone">{g.title}</p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-fog">{g.summary}</p>
                </button>
              )
            })}
          </div>

          <div className="lg:col-span-7">
            <motion.div
              key={currentG.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease }}
              className="flex h-full flex-col justify-between rounded-[8px] border border-white/15 bg-night-2 p-6"
            >
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-gold">{currentG.kicker}</p>
                    <h3 className="mt-1 text-[20px] font-medium text-bone">{currentG.previewTitle}</h3>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] text-emerald-300">
                    <ShieldCheck size={13} /> Verified Mechanism
                  </span>
                </div>

                <div className="divide-y divide-white/10 rounded-[6px] border border-white/10 bg-night/70">
                  {currentG.previewRows.map((row) => (
                    <div key={row.label} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px]">
                      <span className="text-bone">{row.label}</span>
                      <span
                        className={cn(
                          'rounded-[4px] border px-2 py-0.5 font-mono text-[11px]',
                          row.ok
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : 'border-rose-500/30 bg-rose-500/10 text-rose-300',
                        )}
                      >
                        {row.status}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="rounded-[6px] border border-white/10 bg-white/[0.03] px-4 py-3 text-[13px] leading-relaxed text-fog">
                  <span className="font-semibold text-bone">Real-world grounding: </span>
                  {currentG.evidence}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
                <span className="font-mono text-[11px] text-smoke">Verified against Insaaf Precedent Index &amp; Statutory Corpus</span>
                <button
                  type="button"
                  onClick={() => {
                    sfx.tap()
                    nav(currentG.to)
                  }}
                  className="inline-flex items-center gap-1.5 rounded-[5px] bg-gold px-4 py-2 text-[12px] font-semibold text-night hover:bg-[#d8b878]"
                >
                  {currentG.ctaLabel} <ArrowRight size={14} />
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* 11-Stage Deterministic + AI Pipeline Architecture */}
      <section id="pipeline" className="border-y border-white/10 bg-night-2/50 py-16">
        <div className="mx-auto max-w-[1280px] px-5 lg:px-8">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-gold">Orchestrated State Machine</p>
              <h2 className="display mt-1 text-[34px] leading-tight text-bone">
                11 stages from client documents to sealed DOCX
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                sfx.tap()
                nav(`/matters/${leadMatterId}?tab=pipeline`)
              }}
              className="inline-flex items-center gap-1.5 rounded-[5px] border border-white/15 bg-night px-3.5 py-2 text-[12px] font-medium text-bone hover:border-gold/50"
            >
              Inspect Live Pipeline <ArrowRight size={13} />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {PIPELINE_STEPS.map((st) => (
              <button
                key={st.n}
                type="button"
                onClick={() => {
                  sfx.tick()
                  nav(`/matters/${leadMatterId}?tab=${st.tab}`)
                }}
                className="group rounded-[6px] border border-white/10 bg-night/90 p-3.5 text-left transition-colors hover:border-gold/50"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-gold">STAGE {st.n}</span>
                  <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-fog">
                    {st.engine}
                  </span>
                </div>
                <p className="mt-2 text-[14px] font-medium text-bone group-hover:text-gold">{st.name}</p>
                <p className="mt-1 text-[12px] text-smoke">{st.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Real-World Benchmarks */}
      <section id="benchmarks" className="mx-auto max-w-[1280px] px-5 py-16 lg:px-8">
        <div className="mb-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-gold">Legal &amp; Ethical Defences</p>
          <h2 className="display mt-1 text-[34px] leading-tight text-bone">
            Built directly from documented courtroom &amp; ML failures
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {BENCHMARKS.map((b) => (
            <div key={b.caseName} className="rounded-[8px] border border-white/10 bg-night-2 p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="serif text-[20px] text-bone">{b.caseName}</h3>
                <span className="font-mono text-[11px] text-gold">{b.court}</span>
              </div>
              <p className="mt-2 text-[13px] text-rose-300/90">Failure mode: {b.failure}</p>
              <p className="mt-2 border-t border-white/10 pt-2 text-[13px] text-fog">
                <strong className="font-medium text-bone">Insaaf defence:</strong> {b.defence}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Live Chamber Matters Table */}
      <section id="cases" className="border-t border-white/10 bg-night-2/40 py-16">
        <div className="mx-auto max-w-[1280px] px-5 lg:px-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-gold">
                Live {me.org.name && me.org.name !== 'No chamber' ? me.org.name : 'Demo Chamber'} Docket
              </p>
              <h2 className="display mt-1 text-[32px] leading-tight text-bone">
                Open a fictional matter in the Paper &amp; Ink Workbench
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                sfx.tap()
                nav('/docket')
              }}
              className="inline-flex items-center gap-1.5 rounded-[5px] bg-gold px-4 py-2 text-[12px] font-semibold text-night hover:bg-[#d8b878]"
            >
              Open Full Chamber Docket <ArrowRight size={14} />
            </button>
          </div>

          <div className="overflow-x-auto rounded-[8px] border border-white/12 bg-night">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-[11px] uppercase tracking-[0.06em] text-smoke">
                  <th className="px-4 py-3 font-medium">Matter</th>
                  <th className="px-4 py-3 font-medium">Practice</th>
                  <th className="px-4 py-3 font-medium">Forum</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Limitation</th>
                  <th className="px-4 py-3 text-right font-medium">Quick Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {matters.map((mt) => (
                  <tr key={mt.id} className="transition-colors hover:bg-white/[0.03]">
                    <td className="px-4 py-3.5 font-medium text-bone">
                      {mt.title.replace(' (FICTIONAL)', '')}
                    </td>
                    <td className="px-4 py-3.5 capitalize text-fog">{mt.case_type.replace('_', ' ')}</td>
                    <td className="px-4 py-3.5 text-fog">{mt.forum_hint || 'District Court'}</td>
                    <td className="px-4 py-3.5">
                      <span className="rounded-[4px] border border-white/15 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-bone">
                        {mt.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[12px] text-gold">
                      {mt.days_left != null ? `${mt.days_left} days` : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => nav(`/matters/${mt.id}?tab=draft`)}
                          className="rounded-[4px] border border-white/15 px-2.5 py-1 text-[11px] text-fog hover:border-gold/50 hover:text-bone"
                        >
                          <Lock size={11} className="mr-1 inline" />
                          Pleading
                        </button>
                        <button
                          type="button"
                          onClick={() => nav(`/matters/${mt.id}?tab=score`)}
                          className="rounded-[4px] border border-white/15 px-2.5 py-1 text-[11px] text-fog hover:border-gold/50 hover:text-bone"
                        >
                          <Gavel size={11} className="mr-1 inline" />
                          Bias &amp; Score
                        </button>
                        <button
                          type="button"
                          onClick={() => nav(`/matters/${mt.id}`)}
                          className="rounded-[4px] bg-gold px-2.5 py-1 text-[11px] font-semibold text-night hover:bg-[#d8b878]"
                        >
                          Open
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {matters.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-smoke">
                      Loading chamber cause list &amp; docket…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-night py-8">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-5 text-[12px] text-smoke lg:px-8">
          <div className="flex items-center gap-4">
            <span className="font-medium text-fog">Insaaf AI · PS 29</span>
            <span className="inline-flex items-center gap-1"><BookCheck size={13} /> Authority-Locked RAG</span>
            <span className="inline-flex items-center gap-1"><Search size={13} /> 8s Precedent Search</span>
            <span className="inline-flex items-center gap-1"><Clock size={13} /> Deterministic Limitation</span>
          </div>
          <p>Chamber drafting &amp; verification tool for advocates. Fictional demo matters only.</p>
        </div>
      </footer>
    </div>
  )
}

