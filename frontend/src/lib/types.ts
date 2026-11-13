// Mirrors docs/API_CONTRACT.md. Keep these in sync with the backend's pydantic models.

export type Confidence = 'high' | 'medium' | 'low'

export interface SourceRef {
  source_id: string
  kind: 'judgment' | 'statute' | 'rule' | 'notification' | 'amendment'
  title: string
  court: string
  date: string
  paragraph: string
  snippet: string
  url: string
}

export type CaseType = 'property' | 'civil_recovery' | 'criminal'
export type MatterStatus = 'draft' | 'running' | 'ready' | 'in_review' | 'approved'

export interface Matter {
  id: string
  title: string
  case_type: CaseType
  status: MatterStatus
  priority: number
  next_deadline: string | null
  days_left: number | null
  created_by: string
  updated_at: string
}

export type Stage =
  | 'intake' | 'facts' | 'proof_ledger' | 'statute_clock' | 'search' | 'rag'
  | 'citation_health' | 'bias_firewall' | 'score' | 'advice' | 'draft'

export interface PipelineEvent {
  stage: Stage
  status: 'queued' | 'running' | 'done' | 'failed' | 'skipped'
  progress: number
  message: string
  elapsed_ms: number
}

export interface Fact {
  id: string
  statement: string
  status: 'alleged' | 'documented' | 'disputed' | 'unknown'
  source: { document_id: string; location: string } | null
  original: { language: string; text: string; translation_confidence: Confidence } | null
}

export interface ProofItem {
  requirement: string
  state: 'present' | 'weak' | 'missing'
  severity: 'critical' | 'high' | 'medium' | 'low'
  why: string
  sources: SourceRef[]
}

export interface StatuteClock {
  limitation_expires: string
  days_left: number
  article: string
  excluded_periods: { from: string; to: string; reason: string }[]
  forum: { court: string; basis: string }
  commercial_court: boolean
  adr_routes: string[]
  sources: SourceRef[]
}

export interface Precedents {
  budget_ms: number
  elapsed_ms: number
  searched: number
  total_matches: number
  cached: boolean
  results: { rank: number; stance: 'for' | 'against'; similarity: number; why_similar: string; sources: SourceRef[] }[]
}

export interface CitationHealth {
  cited: SourceRef
  badge: 'green' | 'amber' | 'red'
  treatment: 'followed' | 'distinguished' | 'limited' | 'overruled'
  by: SourceRef | null
  blocks_draft: boolean
}

export interface Score {
  band: 'strong' | 'uncertain' | 'weak'
  model_version: string
  factors: { name: string; effect: number }[]
  court_aware: { court: string; n_judgments: number; pooled_from: string; shrinkage_k: number }
  eval: { heldout_correct: number; heldout_total: number; note: string; brier: number | null }
  bias_firewall_passed: boolean
}

export type Identity = 'baseline' | 'muslim' | 'dalit' | 'tribal' | 'female' | 'non_english_speaking'

export interface BiasFirewall {
  epsilon: number
  passed: boolean
  rows: { identity: Identity; score: number; delta: number }[]
}

export interface Advice {
  recommendation: 'fight' | 'mediate' | 'settle' | 'plea_bargain'
  options: { route: string; eligible: boolean; why: string; sources: SourceRef[] }[]
  confidence: Confidence
}

export interface Draft {
  type: string
  model_version: string
  watermark: string
  paragraphs: { id: string; text: string; confidence: Confidence; sources: SourceRef[]; locked_out_claim?: string }[]
}

export interface LedgerEntry {
  id: string
  actor: string
  role: string
  matter_id: string
  action: 'approve' | 'edit' | 'override'
  target: string
  target_id: string
  reason_code: string
  note: string
  at: string
  hash: string
  prev_hash: string
}

export interface Ledger {
  entries: LedgerEntry[]
  verify: { valid: boolean; entries: number; broken_at: string | null; anchored_root: { hash: string; chain: string; tx: string } | null }
}

export interface QueueItem {
  matter_id: string
  title: string
  priority: number
  days_left: number | null
  flags: string[]
}
