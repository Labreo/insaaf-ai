# API Contract (v0.1)

This is the single interface between `frontend/` and `backend/`.
- Every response shape here has a matching mock in [`frontend/mocks/`](../frontend/mocks/).
- Frontend builds against the mocks; backend must return exactly these shapes.
- Change this file only through a PR approved by one person from each side.

**Base URL**: `https://<backend>/v1` · **Auth**: `Authorization: Bearer <session token>` · All bodies are JSON unless noted.

---

## Conventions

| Thing | Rule |
|---|---|
| IDs | strings (`mat_…`, `doc_…`, `fact_…`, `src_…`) |
| Times | ISO 8601 UTC (`2026-11-20T09:30:00Z`) |
| Confidence | `"high" \| "medium" \| "low"`. Never a raw LLM percentage. |
| Every legal conclusion | carries `sources: SourceRef[]`. An empty list means the UI must show **"No verified authority found."** |
| Errors | `{ "error": { "code": "string", "message": "string" } }` |
| Cached / demo data | the response includes `"cached": true` so the UI can show a small "cached" chip |

### `SourceRef`
```json
{
  "source_id": "src_kanoon_1234567",
  "kind": "judgment | statute | rule | notification | amendment",
  "title": "Suraj Lamp & Industries v. State of Haryana",
  "court": "Supreme Court of India",
  "date": "2011-10-11",
  "paragraph": "16",
  "snippet": "exact text of the paragraph relied on",
  "url": "https://indiankanoon.org/doc/1234567/"
}
```

---

## Endpoints

### Org & roles (F11)
| Method | Path | Returns |
|---|---|---|
| GET | `/me` | `{ user_id, name, role: "senior"\|"junior"\|"clerk"\|"student", org: { id, name, plan } }` |

### Matters
| Method | Path | Body / Returns | Mock |
|---|---|---|---|
| GET | `/matters` | `Matter[]` | `matters.json` |
| POST | `/matters` | body `{ title, case_type: "property"\|"civil_recovery"\|"criminal", forum_hint?, client_language? }` → `Matter` | — |
| GET | `/matters/{id}` | `Matter` | `matters.json[0]` |
| POST | `/matters/{id}/documents` | multipart `file` (pdf/docx/m4a/wav) → `{ document_id, kind, pages? }` | — |

`Matter`:
```json
{ "id": "mat_001", "title": "...", "case_type": "property", "status": "draft|running|ready|in_review|approved",
  "priority": 0.82, "next_deadline": "2026-12-24", "days_left": 41, "created_by": "...", "updated_at": "..." }
```

### Pipeline (F1)
| Method | Path | Returns | Mock |
|---|---|---|---|
| POST | `/matters/{id}/run` | `{ job_id }` | — |
| GET | `/matters/{id}/events` | **Server-Sent Events**, one `PipelineEvent` per message | `pipeline_events.json` |

`PipelineEvent`:
```json
{ "stage": "intake|facts|proof_ledger|statute_clock|search|rag|citation_health|bias_firewall|score|advice|draft",
  "status": "queued|running|done|failed|skipped",
  "progress": 0.6, "message": "Searched 14 of 20 judgments", "elapsed_ms": 5200 }
```

### Stage results
| Method | Path | Feature | Mock |
|---|---|---|---|
| GET | `/matters/{id}/facts` | F4 Fact Cards | `facts.json` |
| GET | `/matters/{id}/proof-ledger` | F5 | `proof_ledger.json` |
| GET | `/matters/{id}/statute-clock` | Statute Clock | `statute_clock.json` |
| GET | `/matters/{id}/precedents` | F3 (+ budget info) | `precedents.json` |
| GET | `/matters/{id}/citations/health` | F7 | `citation_health.json` |
| GET | `/matters/{id}/score` | F9 + F10 | `score.json` |
| GET | `/matters/{id}/bias-firewall` | F2 (6-identity table) | `bias_firewall.json` |
| POST | `/matters/{id}/bias-firewall/flip` | F2 live: body `{ identity }` → one row | `bias_firewall.json.rows[0]` |
| GET | `/matters/{id}/advice` | F6 Settle-or-Fight | `advice.json` |
| GET | `/matters/{id}/draft` | F8 draft with locked citations | `draft.json` |
| POST | `/matters/{id}/draft/verify-citation` | F8 Authority Lock: body `{ text }` → `{ verified: bool, source?: SourceRef, message }` | `verify_citation.json` |
| GET | `/matters/{id}/draft/export?format=docx` | file download | — |

### Review, ledger, retraining (F11, F13)
| Method | Path | Body / Returns | Mock |
|---|---|---|---|
| POST | `/matters/{id}/reviews` | `{ action: "approve"\|"edit"\|"override", target: "fact"\|"proof"\|"citation"\|"score"\|"draft", target_id, reason_code: "wrong_fact"\|"wrong_law"\|"wrong_citation_treatment"\|"score_disagree"\|"bias_concern"\|"other", note?, diff? }` → `LedgerEntry` | — |
| GET | `/ledger?matter_id=` | `LedgerEntry[]` | `ledger.json` |
| GET | `/ledger/verify` | `{ valid: bool, entries: n, broken_at?: entry_id, anchored_root?: { hash, chain: "solana-devnet", tx } }` | `ledger.json.verify` |
| POST | `/ml/retrain` | `{ old_version, new_version, metrics_before, metrics_after }` | `retrain.json` |

### Queue (F12)
| Method | Path | Returns | Mock |
|---|---|---|---|
| GET | `/queue` | `QueueItem[]` sorted by priority, highest first | `queue.json` |

### Law Change Radar (F14, if time)
| Method | Path | Returns | Mock |
|---|---|---|---|
| GET | `/matters/{id}/law-changes` | `[{ found: "IPC 302", replaced_by: "BNS 103", effective: "2024-07-01", applies: true, reason, sources }]` | `law_changes.json` |

### Ops
| Method | Path | Returns |
|---|---|---|
| GET | `/health/deep` | `{ kanoon, llm, bhashini, db, model_version, cache_hit_rate }`, each `"ok"\|"degraded"\|"down"` |
