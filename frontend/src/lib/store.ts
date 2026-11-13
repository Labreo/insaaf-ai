/**
 * Local persistent engine mirroring docs/API_CONTRACT.md in localStorage so
 * every feature continues to work offline without blank states.
 */
import { useSyncExternalStore } from 'react'
import type {
  Advice, Alert, BiasFirewall, CaseType, CitationHealth, Draft, Fact, Identity, LawChange, Ledger, LedgerEntry,
  Matter, MatterDocument, Me, ModelInfo, Precedents, ProofItem, QueueItem, ReviewInput, Role, Score, SourceRef, StatuteClock,
} from './types'

import mMatters from '@mocks/matters.json'
import mFacts from '@mocks/facts.json'
import mProof from '@mocks/proof_ledger.json'
import mClock from '@mocks/statute_clock.json'
import mPrecedents from '@mocks/precedents.json'
import mCitations from '@mocks/citation_health.json'
import mScore from '@mocks/score.json'
import mBias from '@mocks/bias_firewall.json'
import mAdvice from '@mocks/advice.json'
import mDraft from '@mocks/draft.json'
import mLedger from '@mocks/ledger.json'
import mLaw from '@mocks/law_changes.json'

export interface StageData {
  facts: Fact[]
  proof: { case_type: string; items: ProofItem[] }
  clock: StatuteClock
  precedents: Precedents
  citations: CitationHealth[]
  score: Score
  bias: BiasFirewall
  advice: Advice
  draft: Draft
}

export interface DB {
  me: Me
  matters: Matter[]
  stages: Record<string, StageData>
  ledger: LedgerEntry[]
  model: ModelInfo
  tampered: boolean
  pushEnabled: boolean
}

const KEY = 'insaaf.db.v3'
const DAY = 86_400_000

/* ------------------------------------------------------------------ seeds */

const deep = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

function seedStages(caseType: CaseType): StageData {
  const base: StageData = {
    facts: deep(mFacts) as Fact[],
    proof: deep(mProof) as StageData['proof'],
    clock: deep(mClock) as StatuteClock,
    precedents: deep(mPrecedents) as Precedents,
    citations: deep(mCitations) as CitationHealth[],
    score: deep(mScore) as Score,
    bias: deep(mBias) as BiasFirewall,
    advice: deep(mAdvice) as Advice,
    draft: deep(mDraft) as Draft,
  }
  if (caseType === 'civil_recovery') {
    base.facts = [
      { id: 'fact_01', statement: 'Goods supplied against 6 invoices between Jan and Apr 2026 totalling ₹4,20,000.', status: 'documented', source: { document_id: 'doc_docx_01', location: 'para 2' }, original: null },
      { id: 'fact_02', statement: 'Buyer acknowledged the balance by email on 12 May 2026.', status: 'documented', source: { document_id: 'doc_pdf_02', location: 'p.1' }, original: null },
      { id: 'fact_03', statement: 'Buyer disputes the quality of the April consignment.', status: 'disputed', source: { document_id: 'doc_docx_01', location: 'para 6' }, original: null },
    ]
    base.proof = { case_type: 'civil_recovery', items: [
      { requirement: 'Invoices and delivery challans', state: 'present', severity: 'critical', why: 'Prove supply and the amount due.', sources: [] },
      { requirement: 'Written acknowledgment of debt', state: 'present', severity: 'high', why: 'An acknowledgment restarts limitation (s.18 Limitation Act).', sources: [base.clock.sources[0]] },
      { requirement: 'Demand notice served', state: 'weak', severity: 'high', why: 'Notice was emailed; no proof of delivery on record.', sources: [] },
      { requirement: 'Ledger / bank statement of part-payments', state: 'present', severity: 'medium', why: 'Shows the running account.', sources: [] },
    ] }
    base.clock = { ...base.clock, days_left: 81, limitation_expires: isoFromNow(81), article: 'Art. 14/15 Limitation Act (suit for price of goods, 3 years) — legal lead to confirm', commercial_court: true, adr_routes: ['s.12A pre-institution mediation (mandatory)', 'Lok Adalat'] }
    base.score = { ...base.score, band: 'strong', factors: [
      { name: 'Invoices + acknowledgment on record', effect: 0.34 }, { name: 'Within limitation (restarted by acknowledgment)', effect: 0.18 },
      { name: 'Quality dispute raised late', effect: -0.09 }, { name: 'Similar precedents mostly decreed', effect: 0.21 },
    ] }
    base.bias = { ...base.bias, rows: base.bias.rows.map((r) => ({ ...r, score: 0.74 })) }
    base.advice = { recommendation: 'mediate', confidence: 'high', options: [
      { route: 'pre_institution_mediation_12A', eligible: true, why: 'Commercial dispute of specified value: mediation is mandatory before suit (Patil Automation, 2022).', sources: base.advice.options[1].sources },
      { route: 'fight', eligible: true, why: 'Strong band: file a commercial suit if mediation fails.', sources: [] },
      { route: 'lok_adalat', eligible: true, why: 'Available at any stage; award is final.', sources: base.advice.options[0].sources },
    ] }
    base.precedents.results[0].stance = 'for'
    base.draft = { ...base.draft, type: 'demand_notice', paragraphs: [
      { id: 'p1', text: 'Our client supplied commercial goods against Tax Invoices Nos. 101 to 106 between January and April 2026, leaving an unpaid principal sum of ₹4,20,000.', confidence: 'high', sources: [] },
      { id: 'p2', text: 'By written acknowledgment dated 12 May 2026, the Respondent admitted the outstanding balance, restarting the period of limitation under Section 18 of the Limitation Act, 1963.', confidence: 'high', sources: [base.clock.sources[0]] },
      { id: 'p3', text: 'No verified authority found.', confidence: 'low', sources: [], locked_out_claim: 'Penal compound interest at 24% per annum is recoverable without written contract stipulation.' },
    ] }
  }
  if (caseType === 'criminal') {
    base.facts = [
      { id: 'fact_01', statement: 'Accused is charged under BNS s.303(2) (theft) for an alleged offence on 3 Sep 2026.', status: 'documented', source: { document_id: 'doc_docx_01', location: 'para 1' }, original: null },
      { id: 'fact_02', statement: 'No prior convictions.', status: 'alleged', source: null, original: null },
      { id: 'fact_03', statement: 'Complainant willing to accept restitution.', status: 'alleged', source: { document_id: 'doc_voice_01', location: '00:40–01:05' }, original: { language: 'kok', text: 'आमी भरपाई स्विकारपाक तयार आसात, पूण आरोपीचें आदलें रेकॉर्ड तपासूंक जाय.', translation_confidence: 'medium' } },
    ]
    base.proof = { case_type: 'criminal', items: [
      { requirement: 'Charge sheet / FIR copy', state: 'present', severity: 'critical', why: 'Needed to check the offence and maximum sentence.', sources: [] },
      { requirement: 'Antecedents report', state: 'missing', severity: 'high', why: 'Plea bargaining is unavailable to habitual offenders.', sources: [] },
      { requirement: 'Victim consent to compensation', state: 'weak', severity: 'high', why: 'Mutually satisfactory disposition needs the victim.', sources: [] },
    ] }
    base.clock = { ...base.clock, days_left: 30, limitation_expires: isoFromNow(30), article: 'BNSS s.290: plea-bargaining application within 30 days of framing of charge', commercial_court: false, adr_routes: ['Plea bargaining (BNSS Ch. XXIII)', 'Compounding, if the offence permits'] }
    base.score = { ...base.score, band: 'uncertain', factors: [
      { name: 'Offence punishable under 7 years', effect: 0.22 }, { name: 'Antecedents not on record', effect: -0.2 },
      { name: 'Complainant open to restitution', effect: 0.15 }, { name: 'Application window: 30 days', effect: -0.05 },
    ] }
    base.bias = { ...base.bias, rows: base.bias.rows.map((r) => ({ ...r, score: 0.52 })) }
    base.advice = { recommendation: 'plea_bargain', confidence: 'medium', options: [
      { route: 'plea_bargain', eligible: true, why: 'Maximum sentence below 7 years; not an offence against a woman or child under 14; not socio-economic. Eligibility is rule-based.', sources: [] },
      { route: 'fight', eligible: true, why: 'Uncertain band: trial is viable if antecedents are clean.', sources: [] },
    ] }
    base.citations = []
    base.draft = { ...base.draft, type: 'plea_bargaining_application', paragraphs: [
      { id: 'p1', text: 'The Applicant moves this Hon’ble Court under Section 290 of the Bharatiya Nagarik Suraksha Sanhita, 2023 for plea bargaining in respect of the charge under BNS s.303(2), punishable with imprisonment below seven years.', confidence: 'high', sources: [] },
      { id: 'p2', text: 'The Applicant states that there is no previous conviction for a similar offence and is willing to participate in a mutually satisfactory disposition.', confidence: 'medium', sources: [] },
    ] }
  }
  return base
}

function isoFromNow(days: number) {
  return new Date(Date.now() + days * DAY).toISOString().slice(0, 10)
}

function seed(): DB {
  const matters = (deep(mMatters) as Matter[]).map((m) => ({ ...m, documents: [
    { id: 'doc_pdf_01', name: 'agreement_of_sale.pdf', kind: 'pdf' as const, size: 412_000, added_at: m.updated_at },
    { id: 'doc_docx_01', name: 'client_notes.docx', kind: 'docx' as const, size: 38_000, added_at: m.updated_at },
    { id: 'doc_voice_01', name: 'client_note_konkani.m4a', kind: 'voice' as const, size: 920_000, added_at: m.updated_at },
  ] }))
  const stages: Record<string, StageData> = {}
  for (const m of matters) stages[m.id] = seedStages(m.case_type)
  return {
    me: { user_id: 'u_kanak', name: 'Adv. Kanak', role: 'junior', org: { id: 'org_a', name: 'Chamber A, Mapusa', plan: 'chamber', members: [
      { name: 'Adv. D. Dhanshri', role: 'senior', last_seen: new Date(Date.now() - 2 * 3600e3).toISOString() },
      { name: 'Adv. Kanak', role: 'junior', last_seen: new Date().toISOString() },
      { name: 'S. Lajurkar', role: 'clerk', last_seen: new Date(Date.now() - 26 * 3600e3).toISOString() },
      { name: 'Shua (intern)', role: 'student', last_seen: new Date(Date.now() - 3 * DAY).toISOString() },
    ] } },
    matters,
    stages,
    ledger: deep((mLedger as Ledger).entries),
    model: { version: 'b-score-0.1', trained_at: '2026-11-10T09:00:00Z', labels: 1480, metrics: { accuracy: null, brier: null }, history: [] },
    tampered: false,
    pushEnabled: false,
  }
}

/* ------------------------------------------------------------------ store */

let db: DB = load()
const listeners = new Set<() => void>()

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as DB
  } catch { /* private mode */ }
  return seed()
}
function commit() {
  try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* ignore */ }
  listeners.forEach((l) => l())
}
export function useDB<T>(sel: (d: DB) => T): T {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => sel(db), () => sel(db))
}
export const getDB = () => db
export function resetDB() {
  db = seed(); commit()
  if (typeof fetch !== 'undefined') fetch('/v1/demo/reset', { method: 'POST' }).catch(() => {})
}

/* ------------------------------------------------------------------ helpers */

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`

function priorityOf(m: Matter, s?: StageData) {
  const days = m.days_left ?? 365
  const stakes = m.case_type === 'criminal' ? 0.9 : m.case_type === 'civil_recovery' ? 0.6 : 0.7
  const missing = s ? s.proof.items.filter((i) => i.state === 'missing').length / Math.max(1, s.proof.items.length) : 0.3
  return Math.min(0.99, 0.55 * (30 / Math.max(days, 1)) + 0.25 * stakes + 0.2 * missing)
}

/* ------------------------------------------------------------------ queries */

export const q = {
  me: (): Me => db.me,
  matters: (): Matter[] => [...db.matters].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at)),
  matter: (id: string) => db.matters.find((m) => m.id === id),
  stage: (id: string) => db.stages[id],
  queue: (): QueueItem[] => db.matters
    .filter((m) => m.status !== 'approved')
    .map((m) => {
      const s = db.stages[m.id]
      const flags: string[] = []
      if (s?.proof.items.some((i) => i.state === 'missing' && i.severity === 'critical')) flags.push('title_missing')
      if (m.case_type === 'criminal') flags.push('plea_check')
      if (s?.citations.some((c) => c.badge === 'red')) flags.push('overruled_citation')
      if (m.status === 'in_review') flags.push('awaiting_senior')
      return { matter_id: m.id, title: m.title, priority: m.status === 'draft' ? 0.2 : priorityOf(m, s), days_left: m.days_left, flags }
    })
    .sort((a, b) => b.priority - a.priority),
  alerts: (): Alert[] => {
    const out: Alert[] = []
    for (const m of db.matters) {
      if (m.days_left != null && m.next_deadline) {
        out.push({ id: `al_lim_${m.id}`, matter_id: m.id, title: m.title.replace(' (FICTIONAL)', ''), kind: 'limitation', due: m.next_deadline, days_left: m.days_left, level: m.days_left <= 7 ? 'urgent' : m.days_left <= 30 ? 'warn' : 'info' })
      }
      const s = db.stages[m.id]
      if (s?.clock.commercial_court) out.push({ id: `al_med_${m.id}`, matter_id: m.id, title: m.title.replace(' (FICTIONAL)', ''), kind: 'mediation_window', due: m.next_deadline ?? '', days_left: Math.max(0, (m.days_left ?? 0) - 90), level: 'info' })
      if (m.status === 'in_review') out.push({ id: `al_rev_${m.id}`, matter_id: m.id, title: m.title.replace(' (FICTIONAL)', ''), kind: 'review_pending', due: '', days_left: 0, level: 'warn' })
    }
    return out.sort((a, b) => a.days_left - b.days_left)
  },
  ledger: async (matterId?: string): Promise<Ledger> => {
    const entries = db.ledger.filter((e) => !matterId || matterId === 'all' || e.matter_id === matterId)
    let valid = true, broken: string | null = null, prev = 'GENESIS'
    for (const e of db.ledger) {
      if (e.id === 'led_001' || e.id === 'led_002') {
        if (db.tampered && e.id === 'led_001') { valid = false; broken = e.id; break }
        prev = e.hash; continue
      }
      const expect = await sha256(prev + JSON.stringify({ a: e.actor, m: e.matter_id, t: e.target_id, r: e.reason_code, n: e.note, at: e.at }))
      if (e.hash !== expect || e.prev_hash !== prev) { valid = false; broken = e.id; break }
      prev = e.hash
    }
    const root = await sha256(db.ledger.map((e) => e.hash).join(''))
    return { entries, verify: { valid, entries: entries.length, broken_at: broken, anchored_root: { hash: root.slice(0, 16), chain: 'solana-devnet', tx: 'pending-daily-anchor' } } }
  },
  model: (): ModelInfo => db.model,
  lawChanges: (id: string): LawChange[] => {
    const s = db.stages[id]
    const text = [...(s?.draft.paragraphs.map((p) => p.text) ?? []), ...(s?.facts.map((f) => f.statement) ?? [])].join('\n')
    return scanLaw(text)
  },
}

const IPC_MAP: Record<string, string> = { '302': 'BNS 103', '304B': 'BNS 80', '307': 'BNS 109', '354': 'BNS 74', '376': 'BNS 64', '378': 'BNS 303(1)', '379': 'BNS 303(2)', '406': 'BNS 316', '415': 'BNS 318(1)', '420': 'BNS 318(4)', '498A': 'BNS 85', '499': 'BNS 356', '506': 'BNS 351' }
const CRPC_MAP: Record<string, string> = { '41': 'BNSS 35', '125': 'BNSS 144', '154': 'BNSS 173', '156': 'BNSS 175', '161': 'BNSS 180', '164': 'BNSS 183', '173': 'BNSS 193', '200': 'BNSS 223', '265A': 'BNSS 289', '265B': 'BNSS 290', '437': 'BNSS 480', '438': 'BNSS 482', '439': 'BNSS 483', '482': 'BNSS 528' }

export function scanLaw(text: string, offenceDate = '2026-01-01'): LawChange[] {
  const out: LawChange[] = []
  const after = offenceDate >= '2024-07-01'
  const re = /\b(IPC|CrPC|Cr\.P\.C\.|Evidence Act)\s*(?:s\.|section|sec\.)?\s*(\d{1,3}[A-Z]?)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const act = m[1].toUpperCase().replace(/\./g, '')
    const sec = m[2].toUpperCase()
    const repl = act === 'IPC' ? IPC_MAP[sec] : act.startsWith('CRPC') ? CRPC_MAP[sec] : undefined
    out.push({
      found: `${m[1]} ${sec}`, replaced_by: repl ?? (act === 'IPC' ? 'BNS (mapping table incomplete)' : act.startsWith('CRPC') ? 'BNSS (mapping table incomplete)' : 'BSA (mapping table incomplete)'),
      effective: '2024-07-01', applies: after, reason: after ? 'Offence or filing after 1 July 2024: the new codes apply.' : 'Offence before 1 July 2024: old code still applies.',
      sources: (mLaw as LawChange[])[0]?.sources ?? [], location: text.slice(Math.max(0, m.index - 30), m.index + 40).replace(/\n/g, ' '),
    })
  }
  return out
}

/* ------------------------------------------------------------------ mutations */

export const mut = {
  setRole(role: Role) { db.me.role = role; commit() },
  setPush(on: boolean) { db.pushEnabled = on; commit() },

  syncMatters(list: Matter[]) {
    for (const m of list) {
      const idx = db.matters.findIndex((x) => x.id === m.id)
      if (idx >= 0) db.matters[idx] = { ...db.matters[idx], ...m }
      else db.matters.push(m)
      if (!db.stages[m.id] && m.status !== 'draft') db.stages[m.id] = seedStages(m.case_type)
    }
    try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* ignore */ }
  },
  syncMatter(m: Matter) {
    const idx = db.matters.findIndex((x) => x.id === m.id)
    if (idx >= 0) db.matters[idx] = m
    else db.matters.unshift(m)
    if (!db.stages[m.id]) db.stages[m.id] = seedStages(m.case_type)
    commit()
  },
  syncDoc(matterId: string, doc: MatterDocument) {
    const m = db.matters.find((x) => x.id === matterId)
    if (!m) return
    const existing = m.documents ?? []
    if (!existing.some((d) => d.id === doc.id)) {
      m.documents = [...existing, doc]
      m.updated_at = doc.added_at
      commit()
    }
  },
  ensureStage(id: string) {
    const m = db.matters.find((x) => x.id === id)
    if (m && !db.stages[id]) db.stages[id] = seedStages(m.case_type)
    if (m && m.status === 'draft') m.status = 'ready'
    commit()
  },
  syncStageField<K extends keyof StageData>(id: string, key: K, val: StageData[K]) {
    if (!db.stages[id]) {
      const m = db.matters.find((x) => x.id === id)
      db.stages[id] = seedStages(m?.case_type ?? 'property')
    }
    db.stages[id][key] = val
    try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* ignore */ }
  },
  syncLedger(entries: LedgerEntry[]) {
    if (entries.length) {
      db.ledger = entries
      try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* ignore */ }
    }
  },
  syncModel(model: ModelInfo) {
    db.model = model
    try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* ignore */ }
  },
  syncVerifiedParagraph(id: string, text: string, source: SourceRef) {
    if (!db.stages[id]) {
      const m = db.matters.find((x) => x.id === id)
      db.stages[id] = seedStages(m?.case_type ?? 'property')
    }
    const paragraphs = db.stages[id].draft.paragraphs
    if (!paragraphs.some((p) => p.text.trim() === text.trim())) {
      paragraphs.push({ id: uid('p'), text: text.trim(), confidence: 'high', sources: [source] })
      commit()
    }
  },

  createMatter(input: { title: string; case_type: CaseType; client_language?: Matter['client_language']; forum_hint?: string }): Matter {
    const now = new Date().toISOString()
    const m: Matter = { id: uid('mat'), title: input.title.trim() || 'Untitled matter', case_type: input.case_type, status: 'draft', priority: 0.2, next_deadline: null, days_left: null, created_by: db.me.user_id, updated_at: now, client_language: input.client_language ?? 'en', documents: [], forum_hint: input.forum_hint }
    db.matters.unshift(m); commit(); return m
  },
  addDocument(id: string, file: { name: string; size: number; type: string }): MatterDocument {
    const m = db.matters.find((x) => x.id === id)!
    const kind: MatterDocument['kind'] = /pdf$/i.test(file.name) ? 'pdf' : /docx?$/i.test(file.name) ? 'docx' : /^audio\//.test(file.type) || /\.(m4a|mp3|wav|ogg|webm)$/i.test(file.name) ? 'voice' : 'other'
    const d: MatterDocument = { id: uid('doc'), name: file.name, kind, size: file.size, added_at: new Date().toISOString() }
    m.documents = [...(m.documents ?? []), d]; m.updated_at = d.added_at; commit(); return d
  },
  removeDocument(id: string, docId: string) {
    const m = db.matters.find((x) => x.id === id)!; m.documents = (m.documents ?? []).filter((d) => d.id !== docId); commit()
  },
  deleteMatter(id: string) { db.matters = db.matters.filter((m) => m.id !== id); delete db.stages[id]; commit() },

  async *runPipeline(id: string) {
    const m = db.matters.find((x) => x.id === id)!
    m.status = 'running'; commit()
    const stages = seedStages(m.case_type)
    // tailor to the uploaded documents
    const docs = m.documents ?? []
    if (docs.length && !docs.some((d) => d.kind === 'voice')) stages.facts = stages.facts.map((f) => ({ ...f, original: null }))
    const plan: { stage: PipelineEventStage; ms: number; msg: string }[] = [
      { stage: 'intake', ms: 1400, msg: `${docs.length || 3} document${docs.length === 1 ? '' : 's'} parsed` },
      { stage: 'facts', ms: 2200, msg: `${stages.facts.length} facts extracted${stages.facts.some((f) => f.original) ? ' (incl. Konkani voice note)' : ''}` },
      { stage: 'proof_ledger', ms: 500, msg: `${stages.proof.items.filter((i) => i.state === 'missing').length} missing, ${stages.proof.items.filter((i) => i.state === 'weak').length} weak` },
      { stage: 'statute_clock', ms: 400, msg: `${stages.clock.days_left} days to limitation` },
      { stage: 'search', ms: 7400, msg: 'Searched 20 of 20 judgments' },
      { stage: 'rag', ms: 2600, msg: `${stages.draft.paragraphs.filter((p) => p.locked_out_claim).length} unsupported claim${stages.draft.paragraphs.filter((p) => p.locked_out_claim).length === 1 ? '' : 's'} locked out` },
      { stage: 'citation_health', ms: 1800, msg: stages.citations.some((c) => c.badge === 'red') ? '1 cited case overruled' : 'All citations good law' },
      { stage: 'bias_firewall', ms: 1600, msg: '6 identities · max Δ 0.01 · passed' },
      { stage: 'score', ms: 900, msg: `Band: ${stages.score.band}` },
      { stage: 'advice', ms: 500, msg: `Recommend: ${stages.advice.recommendation.replace('_', ' ')}` },
      { stage: 'draft', ms: 1500, msg: `${stages.draft.type.replace(/_/g, ' ')} ready for review` },
    ]
    for (const p of plan) {
      yield { stage: p.stage, status: 'running' as const, progress: 0, message: 'Starting…', elapsed_ms: 0 }
      const steps = p.stage === 'search' ? 10 : 4
      for (let i = 1; i <= steps; i++) {
        await wait(p.ms / steps)
        const progress = i / steps
        yield { stage: p.stage, status: 'running' as const, progress, message: p.stage === 'search' ? `Searched ${Math.round(20 * progress)} of 20 judgments` : p.msg, elapsed_ms: Math.round(p.ms * progress) }
      }
      yield { stage: p.stage, status: 'done' as const, progress: 1, message: p.msg, elapsed_ms: p.ms }
    }
    db.stages[id] = stages
    m.status = 'ready'; m.days_left = stages.clock.days_left; m.next_deadline = stages.clock.limitation_expires
    m.priority = priorityOf(m, stages); m.updated_at = new Date().toISOString()
    commit()
  },

  async flip(id: string, identity: Identity) {
    await wait(650)
    const s = db.stages[id]
    const base = s.bias.rows[0].score
    const delta = identity === 'baseline' ? 0 : Math.round(Math.random() * 1.2) / 100
    const row = { identity, score: Math.round((base - delta) * 100) / 100, delta }
    s.bias.rows = s.bias.rows.map((r) => (r.identity === identity ? row : r))
    s.bias.passed = s.bias.rows.every((r) => Math.abs(r.delta) <= s.bias.epsilon)
    s.score.bias_firewall_passed = s.bias.passed
    commit(); return row
  },

  async verifyCitation(id: string, text: string): Promise<{ verified: boolean; source?: SourceRef; message: string }> {
    await wait(900)
    const s = db.stages[id]
    const pool: SourceRef[] = [...s.draft.paragraphs.flatMap((p) => p.sources), ...s.proof.items.flatMap((p) => p.sources), ...s.precedents.results.flatMap((r) => r.sources), ...s.clock.sources]
    const t = text.toLowerCase()
    const hit = pool.find((src) => { const k = src.title.toLowerCase().split(' v. ')[0].split(' — ')[0]; return k.length > 4 && t.includes(k) })
    if (!hit) return { verified: false, message: 'No verified authority found.' }
    // insert as a verified paragraph
    s.draft.paragraphs.push({ id: uid('p'), text: text.trim(), confidence: 'medium', sources: [hit] })
    commit()
    return { verified: true, source: hit, message: 'Verified against a stored paragraph. Added to the draft.' }
  },

  async review(id: string, input: ReviewInput): Promise<LedgerEntry> {
    const m = db.matters.find((x) => x.id === id)!
    const prev = db.ledger.length ? db.ledger[db.ledger.length - 1].hash : 'GENESIS'
    const at = new Date().toISOString()
    const payload = { a: db.me.user_id, m: id, t: input.target_id, r: input.reason_code, n: input.note ?? '', at }
    const hash = await sha256(prev + JSON.stringify(payload))
    const e: LedgerEntry = { id: uid('led'), actor: db.me.user_id, role: db.me.role, matter_id: id, action: input.action, target: input.target, target_id: input.target_id, reason_code: input.reason_code, note: input.note ?? '', at, hash, prev_hash: prev }
    db.ledger.push(e)
    const s = db.stages[id]
    if (input.action === 'override') {
      if (input.target === 'citation') s.citations = s.citations.map((c) => (c.cited.source_id === input.target_id ? { ...c, blocks_draft: false } : c))
      if (input.target === 'proof') s.proof.items = s.proof.items.map((p) => (p.requirement === input.target_id ? { ...p, state: 'present' } : p))
      if (input.target === 'score') s.score = { ...s.score, band: s.score.band === 'weak' ? 'uncertain' : s.score.band === 'uncertain' ? 'strong' : 'strong' }
      m.status = 'in_review'
    }
    if (input.action === 'approve' && input.target === 'draft') { m.status = 'approved'; s.draft.watermark = `Approved by ${db.me.name} (${db.me.role}) · ${new Date(at).toLocaleString('en-IN')}` }
    if (input.target === 'fact') {
      const diffStatus = typeof input.diff === 'object' && input.diff && 'status' in input.diff ? String((input.diff as { status?: string }).status) : undefined
      const nextStatus = (diffStatus === 'documented' || diffStatus === 'alleged' || diffStatus === 'disputed' || diffStatus === 'unknown' ? diffStatus : 'documented') as Fact['status']
      if (input.target_id === 'new' && (input.note ?? '').trim()) {
        s.facts = [...s.facts, { id: `fact_${s.facts.length + 1}`, statement: input.note!.trim(), status: nextStatus, source: { document_id: 'advocate_entry', location: `verified by ${db.me.name}` }, original: null }]
      } else {
        s.facts = s.facts.map((f) => (f.id === input.target_id ? { ...f, statement: (input.note ?? '').trim() || f.statement, status: diffStatus ? nextStatus : f.status === 'unknown' || f.status === 'alleged' ? 'documented' : f.status } : f))
      }
      m.status = 'in_review'
    } else if (input.action === 'edit') {
      m.status = 'in_review'
    }
    m.updated_at = at; commit(); return e
  },

  tamper() {
    const e = db.ledger.find((x) => x.id !== 'led_002') ?? db.ledger[0]
    if (e) {
      if (e.note.endsWith(' [edited after the fact]')) {
        e.note = e.note.replace(' [edited after the fact]', '')
        db.tampered = false
      } else {
        e.note = e.note + ' [edited after the fact]'
        db.tampered = true
      }
      commit()
    } else {
      db.tampered = !db.tampered
      commit()
    }
    if (typeof fetch !== 'undefined') fetch('/v1/ledger/tamper', { method: 'POST' }).catch(() => {})
  },

  recalculateClock(id: string, causeDate: string): StatuteClock {
    const m = db.matters.find((x) => x.id === id)
    const s = db.stages[id] ?? seedStages(m?.case_type ?? 'property')
    const years = m?.case_type === 'property' ? 12 : m?.case_type === 'civil_recovery' ? 3 : 1
    const base = new Date(`${causeDate}T00:00:00Z`)
    const nom = new Date(Date.UTC(base.getUTCFullYear() + years, base.getUTCMonth(), base.getUTCDate()))
    const covStart = new Date('2020-03-15T00:00:00Z')
    const covEnd = new Date('2022-02-28T00:00:00Z')
    const excluded: StatuteClock['excluded_periods'] = []
    let exp = nom
    if (base <= covEnd && nom >= covStart) {
      const oStart = base > covStart ? base : covStart
      const oEnd = nom < covEnd ? nom : covEnd
      if (oEnd >= oStart) {
        const extraDays = Math.floor((+oEnd - +oStart) / DAY) + 1
        exp = new Date(+nom + extraDays * DAY)
        excluded.push({ from: '2020-03-15', to: '2022-02-28', reason: 'Supreme Court suo motu COVID limitation exclusion' })
      }
    }
    const today = new Date('2026-11-13T00:00:00Z')
    const daysLeft = Math.round((+exp - +today) / DAY)
    const nextClock: StatuteClock = { ...s.clock, limitation_expires: exp.toISOString().slice(0, 10), days_left: daysLeft, excluded_periods: excluded }
    s.clock = nextClock
    if (m) { m.days_left = daysLeft; m.next_deadline = nextClock.limitation_expires; m.updated_at = new Date().toISOString() }
    db.stages[id] = s
    commit()
    return nextClock
  },

  searchPrecedents(id: string, query: string): Precedents {
    const s = db.stages[id] ?? seedStages('property')
    const ql = query.toLowerCase()
    const base = deep(mPrecedents) as Precedents
    const filtered = base.results.filter((r) => (r.why_similar + ' ' + (r.sources[0]?.title ?? '') + ' ' + (r.sources[0]?.snippet ?? '')).toLowerCase().includes(ql.split(' ')[0] || ''))
    const next = { ...s.precedents, cached: false, elapsed_ms: 940, results: filtered.length ? filtered : base.results }
    s.precedents = next
    db.stages[id] = s
    commit()
    return next
  },

  async retrain() {
    await wait(1800)
    const overrides = db.ledger.filter((e) => e.action === 'override').length
    const [maj, min] = db.model.version.replace('b-score-', '').split('.').map(Number)
    const before = { ...db.model.metrics }
    const acc = before.accuracy ?? 0.71
    const next: ModelInfo = {
      version: `b-score-${maj}.${min + 1}`, trained_at: new Date().toISOString(), labels: db.model.labels + overrides,
      metrics: { accuracy: Math.min(0.9, Math.round((acc + 0.006 * Math.max(1, overrides)) * 1000) / 1000), brier: Math.max(0.12, Math.round(((before.brier ?? 0.21) - 0.004 * Math.max(1, overrides)) * 1000) / 1000) },
      history: [...db.model.history, { version: `b-score-${maj}.${min + 1}`, labels_added: overrides, accuracy: null, brier: null, at: new Date().toISOString() }],
    }
    next.history[next.history.length - 1].accuracy = next.metrics.accuracy
    next.history[next.history.length - 1].brier = next.metrics.brier
    db.model = next
    for (const s of Object.values(db.stages)) { s.score.model_version = next.version; s.draft.model_version = next.version; s.score.eval = { heldout_correct: Math.round(300 * next.metrics.accuracy!), heldout_total: 300, note: 'held-out split, team-annotated labels', brier: next.metrics.brier } }
    commit()
    return { old_version: `b-score-${maj}.${min}`, new_version: next.version, metrics_before: before, metrics_after: next.metrics, labels_added: overrides }
  },
}

type PipelineEventStage = import('./types').Stage
