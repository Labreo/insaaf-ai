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

/** Practice-area id from GET /v1/meta (rules/practice_areas.yaml). */
export type CaseType = string
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
  transcript?: {
    language?: string | null
    original_text: string
    english_translation: string
    status: 'transcribed' | 'pending' | 'no_speech' | string
    has_audio?: boolean
  } | null
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
  client_language?: string
  documents?: MatterDocument[]
  forum_hint?: string | null
  state?: string | null
  district?: string | null
  court_seat?: string | null
  cause_date?: string | null
  client_name?: string | null
  opposite_party?: string | null
  summary?: string | null
  moot?: boolean
}

export interface OrgMemberRow {
  user_id?: string
  email?: string
  name: string
  role: Role
  last_seen: string
}

export interface PracticeArea {
  id: string
  label: string
  tag: string
  group: string
  forum: string
  limitation: { article?: string; years?: number | null; note?: string }
  commercial_court: boolean
  adr_routes: string[]
  instruments: string[]
  statutes: string[]
}

export interface Meta {
  areas: PracticeArea[]
  languages: { code: string; label: string }[]
  instruments: { id: string; label: string; kind: string }[]
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
  limitation_expires: string | null
  cause_date?: string | null
  /** document = found in the record, user = entered, missing = not known yet */
  cause_date_source?: 'document' | 'user' | 'missing' | null
  days_left: number | null
  /** false when the practice area has no fixed limitation clock (see note) */
  applicable?: boolean
  note?: string
  total_days?: number | null
  limitation_years?: number | null
  today?: string | null
  preview?: boolean
  article: string
  excluded_periods: { from: string; to: string; reason: string; days?: string }[]
  forum: { court: string; basis: string }
  commercial_court: boolean
  adr_routes: string[]
  sources: SourceRef[]
}

export interface PrecedentOutcomeStats {
  allowed: number
  dismissed: number
  partly_allowed: number
  unknown: number
}

export interface Precedents {
  budget_ms: number
  elapsed_ms: number
  searched: number
  total_matches: number
  cached: boolean
  index_size?: number
  web_swept?: number
  query?: string | null
  outcome_stats?: PrecedentOutcomeStats | null
  results: {
    rank: number
    stance: 'for' | 'against'
    similarity: number
    why_similar: string
    outcome?: string | null
    locality?: string | null
    origin?: string | null
    sources: SourceRef[]
  }[]
}

export interface PrecedentHit {
  doc_id: string
  title: string
  court: string
  seat: string
  date: string
  outcome: string
  statutes: string[]
  headnote: string
  locality: string
  score: number
  url: string
  practice_areas: string[]
  origin?: string
}

export interface PrecedentExploreResult {
  results: PrecedentHit[]
  index_size: number
  web_swept: number
  outcome_stats: PrecedentOutcomeStats
  elapsed_ms: number
}

export interface PrecedentDetail {
  doc_id: string
  title: string
  court: string
  seat: string
  state: string
  bench: string
  date: string
  outcome: string
  statutes: string[]
  headnote: string
  holding: string
  paras: { n: number; text: string }[]
  url: string
  practice_areas: string[]
  paragraph_count: number
}

export interface TamperResult {
  tampered: boolean
  broken_at: string | null
  entry_id?: string
  field?: string
  before?: string
  after?: string
  stored_hash?: string
  recomputed_hash?: string
  merkle_root_before?: string
  merkle_root_after?: string
  chain_valid?: boolean
  explanation?: string
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
  probability?: number | null
  prediction_basis?: {
    evidence_model_weight: number
    similar_judgments_weight: number
    court_prior_weight: number
    similar_judgments_used: number
    similar_judgments_allowed: number
    similar_judgments_rate: number
  } | null
  model_band?: string | null
  override?: { band: string; model_band: string; by: string; note: string; reason_code?: string; at: string } | null
}

export type Identity = string

export interface BiasFirewallRow {
  identity: Identity
  label?: string
  score: number
  delta: number
  masked?: boolean
  unprotected_score?: number
  unprotected_delta?: number
  blocked?: boolean
}

export interface BiasFirewall {
  epsilon: number
  passed: boolean
  rows: BiasFirewallRow[]
  max_unprotected_gap?: number
  comparison_model?: string
  masked_tokens_example?: string
}

export type AdviceRoute = 'fight' | 'mediate' | 'settle' | 'plea_bargain'

export interface Advice {
  recommendation: AdviceRoute
  options: { route: string; eligible: boolean; why: string; sources: SourceRef[] }[]
  confidence: Confidence
  model_recommendation?: string | null
  override?: { recommendation: string; model_recommendation: string; by: string; note: string; at: string } | null
  based_on_band?: string | null
}

export interface DraftParagraph {
  id: string
  text: string
  confidence: Confidence
  sources: SourceRef[]
  locked_out_claim?: string | null
  edited_by?: string | null
}

export interface RenderedDraft {
  instrument: string
  label: string
  kind: 'notice' | 'pleading' | 'application'
  court: string
  title: string
  subtitle: string
  cause_title: string
  parties: { left_label: string; left: string; right_label: string; right: string }
  opening: string
  paragraphs: { n: number; id: string; text: string; confidence: Confidence; sources: { title: string; court: string; date: string; paragraph: string; url: string }[] }[]
  prayer: string
  verification: string
  place_date: string
  signature: string
  withheld: string[]
  watermark: string
}

export interface Draft {
  type: string
  model_version: string
  watermark: string
  paragraphs: DraftParagraph[]
  generated_at?: string | null
  inputs_hash?: string | null
  stale?: boolean
  instructions?: string | null
  rendered?: RenderedDraft | null
}

export type ReasonCode = 'wrong_fact' | 'wrong_law' | 'wrong_citation_treatment' | 'score_disagree' | 'bias_concern' | 'other'

export interface ReviewInput {
  action: 'approve' | 'edit' | 'override' | 'submit' | 'delete'
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
  action: 'approve' | 'edit' | 'override' | 'submit' | 'delete'
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
  email?: string
  key_fingerprint?: string
  rls_policy?: string
  permissions?: string[]
  session_fingerprint?: string
  session_expires_at?: number
  org: { id: string; name: string; plan: string; members: OrgMemberRow[] }
}

export interface AuthAccount {
  user_id: string
  email: string
  name: string
  role: Role
  org_id: string
  org_name: string
  org_plan: string
  visibility_note: string
}

export interface DeepHealth {
  precedent_index: string
  web_sweep: string
  llm: string
  translation: string
  db: string
  model_version: string
  index_size: number
  llm_provider?: string | null
}
