"""Pydantic schemas matching docs/API_CONTRACT.md and frontend/src/lib/types.ts."""
from __future__ import annotations

from typing import Any, Literal, Optional
from pydantic import BaseModel, Field

Confidence = Literal["high", "medium", "low"]
# Validated against rules/practice_areas.yaml (app.registry) at the API boundary.
CaseType = str
MatterStatus = Literal["draft", "running", "ready", "in_review", "approved"]
StageName = Literal[
    "intake",
    "facts",
    "proof_ledger",
    "statute_clock",
    "search",
    "rag",
    "citation_health",
    "bias_firewall",
    "score",
    "advice",
    "draft",
]
IdentityType = str  # see app.ml.service.IDENTITIES


class SourceRef(BaseModel):
    source_id: str
    kind: Literal["judgment", "statute", "rule", "notification", "amendment"]
    title: str
    court: str = ""
    date: str = ""
    paragraph: str = "—"
    snippet: str
    url: str


class OrgMember(BaseModel):
    name: str
    role: Literal["senior", "junior", "clerk", "student"]
    last_seen: str
    user_id: Optional[str] = None
    email: Optional[str] = None


class OrgInfo(BaseModel):
    id: str
    name: str
    plan: str
    members: list[OrgMember] = Field(default_factory=list)


class MeResponse(BaseModel):
    user_id: str
    name: str
    role: Literal["senior", "junior", "clerk", "student"]
    org: OrgInfo
    email: Optional[str] = None
    key_fingerprint: Optional[str] = None
    rls_policy: Optional[str] = None
    permissions: list[str] = Field(default_factory=list)
    session_fingerprint: Optional[str] = None
    session_expires_at: Optional[int] = None


class AuthAccount(BaseModel):
    user_id: str
    email: str
    name: str
    role: Literal["senior", "junior", "clerk", "student"]
    org_id: str
    org_name: str
    org_plan: str
    visibility_note: str


class LoginRequest(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    user_id: Optional[str] = None


class LoginResponse(BaseModel):
    token: str
    expires_at: int
    me: MeResponse


class SignupRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=10, max_length=200)
    chamber_name: str = Field(min_length=2, max_length=100)
    city: Optional[str] = Field(default=None, max_length=60)


class AddMemberRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(min_length=5, max_length=120)
    role: Literal["junior", "clerk", "student"]


class AddMemberResponse(BaseModel):
    user_id: str
    email: str
    name: str
    role: str
    temporary_password: str


class SetRoleRequest(BaseModel):
    role: Literal["senior", "junior", "clerk", "student"]


class MatterDocument(BaseModel):
    id: str
    name: str
    kind: Literal["pdf", "docx", "voice", "other"]
    size: int
    added_at: str
    document_id: Optional[str] = None
    pages: Optional[int] = None
    transcript: Optional[dict[str, Any]] = None


class Matter(BaseModel):
    id: str
    title: str
    case_type: CaseType
    status: MatterStatus
    priority: float
    next_deadline: Optional[str] = None
    days_left: Optional[int] = None
    created_by: str
    updated_at: str
    client_language: Optional[str] = "kok"
    forum_hint: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    court_seat: Optional[str] = None
    cause_date: Optional[str] = None
    client_name: Optional[str] = None
    opposite_party: Optional[str] = None
    summary: Optional[str] = None
    moot: bool = False
    documents: list[MatterDocument] = Field(default_factory=list)


class CreateMatterRequest(BaseModel):
    title: str
    case_type: CaseType
    forum_hint: Optional[str] = None
    client_language: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    court_seat: Optional[str] = None
    cause_date: Optional[str] = None
    client_name: Optional[str] = None
    opposite_party: Optional[str] = None
    summary: Optional[str] = None


class UpdateMatterRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=3, max_length=200)
    case_type: Optional[str] = None
    forum_hint: Optional[str] = None
    client_language: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    court_seat: Optional[str] = None
    cause_date: Optional[str] = None
    client_name: Optional[str] = None
    opposite_party: Optional[str] = None
    summary: Optional[str] = None
    priority: Optional[float] = Field(default=None, ge=0, le=1)


class DocumentUploadResponse(BaseModel):
    document_id: str
    kind: str
    pages: Optional[int] = None


class PipelineRunResponse(BaseModel):
    job_id: str


class PipelineEvent(BaseModel):
    stage: StageName
    status: Literal["queued", "running", "done", "failed", "skipped"]
    progress: float
    message: str
    elapsed_ms: int


class FactSource(BaseModel):
    document_id: str
    location: str


class FactOriginal(BaseModel):
    language: str
    text: str
    translation_confidence: Confidence


class Fact(BaseModel):
    id: str
    statement: str
    status: Literal["alleged", "documented", "disputed", "unknown"]
    source: Optional[FactSource] = None
    original: Optional[FactOriginal] = None


class ProofItem(BaseModel):
    requirement: str
    state: Literal["present", "weak", "missing"]
    severity: Literal["critical", "high", "medium", "low"]
    why: str
    sources: list[SourceRef] = Field(default_factory=list)


class ProofLedgerResponse(BaseModel):
    case_type: str
    items: list[ProofItem]


class ExcludedPeriod(BaseModel):
    from_: str = Field(alias="from")
    to: str
    reason: str

    model_config = {"populate_by_name": True}


class ForumInfo(BaseModel):
    court: str
    basis: str


class StatuteClock(BaseModel):
    limitation_expires: Optional[str] = None
    days_left: Optional[int] = None
    # False when the practice area has no fixed limitation clock (see note); True otherwise.
    applicable: bool = True
    note: str = ""
    total_days: Optional[int] = None
    limitation_years: Optional[int] = None
    today: Optional[str] = None
    article: str
    excluded_periods: list[dict[str, str]]
    forum: ForumInfo
    commercial_court: bool
    adr_routes: list[str]
    sources: list[SourceRef] = Field(default_factory=list)
    # How the cause date was obtained: "document" (found in the record), "user" (entered), "matter_deadline" (pinned), "default" (ASSUMED).
    cause_date: Optional[str] = None
    cause_date_source: Optional[str] = None


class PrecedentResult(BaseModel):
    rank: int
    stance: Literal["for", "against"]
    similarity: float
    why_similar: str
    outcome: Optional[str] = None
    issue: Optional[str] = None
    holding: Optional[str] = None
    locality: Optional[str] = None
    origin: Optional[str] = None
    sources: list[SourceRef] = Field(default_factory=list)


class Precedents(BaseModel):
    budget_ms: int
    elapsed_ms: int
    searched: int
    total_matches: int
    cached: bool
    results: list[PrecedentResult]
    index_size: int = 0
    web_swept: int = 0
    query: Optional[str] = None
    # Outcome split among the similar judgments retrieved ("how have courts ruled on facts like these").
    outcome_stats: Optional[dict[str, int]] = None


class CitationHealth(BaseModel):
    cited: SourceRef
    badge: Literal["green", "amber", "red"]
    treatment: Literal["followed", "distinguished", "limited", "overruled"]
    by: Optional[SourceRef] = None
    blocks_draft: bool


class ScoreFactor(BaseModel):
    name: str
    effect: float


class CourtAwareInfo(BaseModel):
    court: str
    prior_bucket: Optional[str] = None
    tier: Optional[str] = None
    n_judgments: int
    pooled_from: str
    shrinkage_k: int
    local_rate: Optional[float] = None
    parent_rate: Optional[float] = None
    pooled_rate: Optional[float] = None


class EvalSummary(BaseModel):
    heldout_correct: int
    heldout_total: int
    note: str
    brier: Optional[float] = None
    calibration: Optional[dict[str, list[float]]] = None


class Score(BaseModel):
    band: Literal["strong", "uncertain", "moderate", "weak"]
    model_version: str
    factors: list[ScoreFactor]
    court_aware: CourtAwareInfo
    eval: EvalSummary
    bias_firewall_passed: bool
    probability: Optional[float] = None
    prediction_basis: Optional[dict[str, Any]] = None
    model_band: Optional[str] = None
    override: Optional[dict[str, Any]] = None


class BiasFirewallRow(BaseModel):
    identity: IdentityType
    score: float
    delta: float
    masked: bool = True  # False => identity marker leaked past the masker; firewall fails closed
    label: Optional[str] = None
    unprotected_score: Optional[float] = None
    unprotected_delta: Optional[float] = None
    blocked: Optional[bool] = None


class BiasFirewall(BaseModel):
    epsilon: float
    passed: bool
    rows: list[BiasFirewallRow]
    max_unprotected_gap: Optional[float] = None
    comparison_model: Optional[str] = None
    masked_tokens_example: Optional[str] = None


class FlipRequest(BaseModel):
    identity: IdentityType


class PrecedentSearchRequest(BaseModel):
    query: str


class ClockRecalculateRequest(BaseModel):
    cause_date: str
    # preview=True computes without changing the matter's stored deadline.
    preview: bool = False


class SetCourtRequest(BaseModel):
    court: str


class SetDraftTypeRequest(BaseModel):
    draft_type: str = ""  # empty = keep the current instrument (regenerate)
    instructions: Optional[str] = Field(default=None, max_length=600)


class DraftParagraphEdit(BaseModel):
    paragraph_id: str
    # None deletes the paragraph.
    text: Optional[str] = Field(default=None, max_length=4000)


class CitationCheckRequest(BaseModel):
    citation: str


class ToggleFlagRequest(BaseModel):
    flag: Literal["senior_citizen", "interim_relief", "undertrial_custody"]


class AccessLogEntry(BaseModel):
    id: int
    actor: str
    role: str
    matter_id: str
    endpoint: str
    at: str


class AdviceOption(BaseModel):
    route: str
    eligible: bool
    why: str
    sources: list[SourceRef] = Field(default_factory=list)


class Advice(BaseModel):
    recommendation: Literal["fight", "mediate", "settle", "plea_bargain"]
    options: list[AdviceOption]
    confidence: Confidence
    model_recommendation: Optional[str] = None
    override: Optional[dict[str, Any]] = None
    based_on_band: Optional[str] = None


class DraftParagraph(BaseModel):
    id: str
    text: str
    confidence: Confidence
    sources: list[SourceRef] = Field(default_factory=list)
    locked_out_claim: Optional[str] = None


class Draft(BaseModel):
    type: str
    model_version: str
    watermark: str
    paragraphs: list[DraftParagraph]
    generated_at: Optional[str] = None
    inputs_hash: Optional[str] = None
    # True when facts, precedents or score changed after this draft was generated.
    stale: bool = False
    rendered: Optional[dict[str, Any]] = None


class VerifyCitationRequest(BaseModel):
    text: str


class VerifyCitationResponse(BaseModel):
    verified: bool
    source: Optional[SourceRef] = None
    message: str


class ReviewRequest(BaseModel):
    action: Literal["approve", "edit", "override", "submit", "delete"]
    target: Literal["fact", "proof", "citation", "score", "draft", "advice"]
    target_id: str
    reason_code: Literal[
        "wrong_fact",
        "wrong_law",
        "wrong_citation_treatment",
        "score_disagree",
        "bias_concern",
        "other",
    ]
    note: Optional[str] = ""
    diff: Optional[Any] = None


class LedgerEntry(BaseModel):
    id: str
    org_id: Optional[str] = None
    actor: str
    role: str
    matter_id: str
    action: Literal["approve", "edit", "override", "submit", "delete"]
    target: str
    target_id: str
    reason_code: str
    note: str
    at: str
    hash: str
    prev_hash: str


class AnchoredRoot(BaseModel):
    hash: str
    chain: str
    tx: Optional[str] = None  # null: no on-chain transaction is written (see anchor_kind)
    anchor_kind: str = "blockhash_beacon"
    beacon_blockhash: Optional[str] = None
    note: Optional[str] = None


class LedgerVerify(BaseModel):
    valid: bool
    entries: int
    broken_at: Optional[str] = None
    anchored_root: Optional[AnchoredRoot] = None


class LedgerResponse(BaseModel):
    entries: list[LedgerEntry]
    verify: LedgerVerify


class RetrainMetrics(BaseModel):
    accuracy: Optional[float] = None
    brier: Optional[float] = None


class RetrainResponse(BaseModel):
    old_version: str
    new_version: str
    metrics_before: RetrainMetrics
    metrics_after: RetrainMetrics
    labels_added: int


class QueueItem(BaseModel):
    matter_id: str
    title: str
    priority: float
    days_left: Optional[int] = None
    flags: list[str] = Field(default_factory=list)


class LawChangeItem(BaseModel):
    found: str
    replaced_by: str
    effective: str
    applies: bool
    reason: str
    sources: list[SourceRef] = Field(default_factory=list)
    location: Optional[str] = None


class LawScanRequest(BaseModel):
    text: str
    offence_date: Optional[str] = None


class AlertItem(BaseModel):
    id: str
    matter_id: str
    title: str
    kind: Literal["limitation", "mediation_window", "review_pending"]
    due: str
    days_left: int
    level: Literal["info", "warn", "urgent"]


class ModelHistoryItem(BaseModel):
    version: str
    labels_added: int
    accuracy: Optional[float] = None
    brier: Optional[float] = None
    at: str


class ModelInfoResponse(BaseModel):
    version: str
    trained_at: str
    labels: int
    metrics: RetrainMetrics
    history: list[ModelHistoryItem] = Field(default_factory=list)


class DeepHealthResponse(BaseModel):
    precedent_index: Literal["ok", "degraded", "down"]
    web_sweep: Literal["ok", "degraded", "down"]
    llm: Literal["ok", "degraded", "down"]
    translation: Literal["ok", "degraded", "down"]
    db: Literal["ok", "degraded", "down"]
    model_version: str
    index_size: int = 0
    llm_provider: Optional[str] = None

