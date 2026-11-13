"""Pydantic schemas matching docs/API_CONTRACT.md and frontend/src/lib/types.ts."""
from __future__ import annotations

from typing import Any, Literal, Optional
from pydantic import BaseModel, Field

Confidence = Literal["high", "medium", "low"]
CaseType = Literal["property", "civil_recovery", "criminal"]
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
IdentityType = Literal[
    "baseline",
    "muslim",
    "dalit",
    "tribal",
    "female",
    "non_english_speaking",
]


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
    documents: list[MatterDocument] = Field(default_factory=list)


class CreateMatterRequest(BaseModel):
    title: str
    case_type: CaseType
    forum_hint: Optional[str] = None
    client_language: Optional[str] = None


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
    limitation_expires: str
    days_left: int
    article: str
    excluded_periods: list[dict[str, str]]
    forum: ForumInfo
    commercial_court: bool
    adr_routes: list[str]
    sources: list[SourceRef] = Field(default_factory=list)


class PrecedentResult(BaseModel):
    rank: int
    stance: Literal["for", "against"]
    similarity: float
    why_similar: str
    sources: list[SourceRef] = Field(default_factory=list)


class Precedents(BaseModel):
    budget_ms: int
    elapsed_ms: int
    searched: int
    total_matches: int
    cached: bool
    results: list[PrecedentResult]


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
    n_judgments: int
    pooled_from: str
    shrinkage_k: int


class EvalSummary(BaseModel):
    heldout_correct: int
    heldout_total: int
    note: str
    brier: Optional[float] = None


class Score(BaseModel):
    band: Literal["strong", "uncertain", "weak"]
    model_version: str
    factors: list[ScoreFactor]
    court_aware: CourtAwareInfo
    eval: EvalSummary
    bias_firewall_passed: bool


class BiasFirewallRow(BaseModel):
    identity: IdentityType
    score: float
    delta: float


class BiasFirewall(BaseModel):
    epsilon: float
    passed: bool
    rows: list[BiasFirewallRow]


class FlipRequest(BaseModel):
    identity: IdentityType


class AdviceOption(BaseModel):
    route: str
    eligible: bool
    why: str
    sources: list[SourceRef] = Field(default_factory=list)


class Advice(BaseModel):
    recommendation: Literal["fight", "mediate", "settle", "plea_bargain"]
    options: list[AdviceOption]
    confidence: Confidence


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


class VerifyCitationRequest(BaseModel):
    text: str


class VerifyCitationResponse(BaseModel):
    verified: bool
    source: Optional[SourceRef] = None
    message: str


class ReviewRequest(BaseModel):
    action: Literal["approve", "edit", "override"]
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
    actor: str
    role: str
    matter_id: str
    action: Literal["approve", "edit", "override"]
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
    tx: str


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
    kanoon: Literal["ok", "degraded", "down"]
    llm: Literal["ok", "degraded", "down"]
    bhashini: Literal["ok", "degraded", "down"]
    db: Literal["ok", "degraded", "down"]
    model_version: str
    cache_hit_rate: float

