// Mirrors docs/API_CONTRACT.md and backend/app/models/schemas.py.

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
export type Role = 'senior' | 'junior' | 'clerk' | 'student'

export interface MatterDocument {
  id: string
  name: string
  kind: 'pdf' | 'docx' | 'voice' | 'audio' | 'other'
  size: number
  added_at: string
  document_id?: string
  pages?: number
}

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
  client_language?: 'en' | 'kok' | 'mr' | 'hi'
  documents?: MatterDocument[]
  forum_hint?: string | null
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
  band: 'strong' | 'uncertain' | 'moderate' | 'weak'
  model_version: string
  factors: { name: string; effect: number }[]
  court_aware: {
    court: string
    n_judgments: number
    pooled_from: string
    shrinkage_k: number
    local_rate?: number | null
    parent_rate?: number | null
    pooled_rate?: number | null
  }
  eval: {
    heldout_correct: number
    heldout_total: number
    note: string
    brier: number | null
    calibration?: { prob_pred: number[]; prob_true: number[] } | null
  }
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
  paragraphs: { id: string; text: string; confidence: Confidence; sources: SourceRef[]; locked_out_claim?: string | null }[]
}

export type ReasonCode = 'wrong_fact' | 'wrong_law' | 'wrong_citation_treatment' | 'score_disagree' | 'bias_concern' | 'other'

export interface ReviewInput {
  action: 'approve' | 'edit' | 'override'
  target: 'fact' | 'proof' | 'citation' | 'score' | 'draft' | 'advice'
  target_id: string
  reason_code: ReasonCode
  note?: string
  diff?: string | Record<string, unknown>
}

export interface AccessLogEntry {
  id: number
  actor: string
  role: string
  matter_id: string
  endpoint: string
  at: string
}

export interface LedgerEntry {
  id: string
  actor: string
  role: Role
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

export interface LawChange {
  found: string
  replaced_by: string
  effective: string
  applies: boolean
  reason: string
  sources: SourceRef[]
  location?: string | null
}

export interface ModelInfo {
  version: string
  trained_at: string
  labels: number
  metrics: { accuracy: number | null; brier: number | null }
  history: { version: string; labels_added: number; accuracy: number | null; brier: number | null; at: string }[]
}

export interface RetrainResult {
  old_version: string
  new_version: string
  metrics_before: { accuracy: number | null; brier: number | null }
  metrics_after: { accuracy: number | null; brier: number | null }
  labels_added: number
}

export interface Alert {
  id: string
  matter_id: string
  title: string
  kind: 'limitation' | 'mediation_window' | 'review_pending'
  due: string
  days_left: number
  level: 'info' | 'warn' | 'urgent'
}

export interface Me {
  user_id: string
  name: string
  role: Role
  org: { id: string; name: string; plan: string; members: { name: string; role: Role; last_seen: string }[] }
}

export interface DeepHealth {
  kanoon: string
  llm: string
  bhashini: string
  db: string
  model_version: string
  cache_hit_rate: number
}
