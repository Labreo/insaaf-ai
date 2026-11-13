# Legal rule packs (YAML)

**Author**: Dhanshri (legal lead) · **Reviewer**: @Labreo

These rules are deterministic. The LLM only helps *find* evidence in documents; it never decides whether a rule applies.

| Folder | Feature | Example rule |
|---|---|---|
| `proof_ledger/` | F5 | registered sale deed required for title (Registration Act s.17; *Suraj Lamp*) |
| `statute_clock/` | Statute Clock | limitation article per case type, plus the COVID exclusion window |
| `settle_or_fight/` | F6 | Lok Adalat eligibility, s.12A mediation, plea-bargaining eligibility |
| `law_change/` | F14 | IPC → BNS, CrPC → BNSS, Evidence Act → BSA mapping by offence date |

Suggested rule shape:
```yaml
id: property.registered_sale_deed
requirement: Registered sale deed
severity: critical            # critical | high | medium | low
why: An agreement or power of attorney does not transfer title.
sources:
  - kind: statute
    ref: Registration Act, 1908, s.17
  - kind: judgment
    ref: Suraj Lamp & Industries v. State of Haryana (2011)
detect:
  any_fact_mentions: ["sale deed", "registered", "sub-registrar"]
```

Every rule must cite a real source. Fact-check it against WORK_PLAN §14 before the demo.
