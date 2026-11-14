"""Insaaf Precedent Index: TF-IDF retrieval over the harvested judgment corpus with
statute-alias query expansion and jurisdiction (locality) aware re-ranking."""
from __future__ import annotations

import re
import threading
from datetime import date
from typing import Any

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

from app.services.precedents import corpus

# Query expansion: how practitioners write a provision vs how judgments write it.
ALIASES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(s\.?|sec\.?|section)\s*138\b", re.I), "section 138 negotiable instruments act cheque dishonour"),
    (re.compile(r"\bcheque bounce\b", re.I), "dishonour of cheque section 138 negotiable instruments"),
    (re.compile(r"\b12a\b", re.I), "section 12A commercial courts act pre-institution mediation"),
    (re.compile(r"\bgpa\b", re.I), "general power of attorney"),
    (re.compile(r"\bmact\b", re.I), "motor accident claims tribunal compensation"),
    (re.compile(r"\b(s\.?|section)\s*125\b", re.I), "section 125 crpc maintenance"),
    (re.compile(r"\b(s\.?|section)\s*144\s*bnss\b", re.I), "maintenance section 125 crpc"),
    (re.compile(r"\b13b\b", re.I), "mutual consent divorce section 13B"),
    (re.compile(r"\b25f\b", re.I), "retrenchment section 25F industrial disputes act"),
    (re.compile(r"\bbns\b", re.I), "bharatiya nyaya sanhita ipc"),
    (re.compile(r"\bbnss\b", re.I), "bharatiya nagarik suraksha sanhita crpc"),
    (re.compile(r"\bipc\s*420\b|\b420\s*ipc\b", re.I), "cheating section 420 ipc 318 bns"),
    (re.compile(r"\bbail\b", re.I), "bail custody parity"),
]

# Matter state -> the High Court whose rulings bind its subordinate courts.
STATE_HC = {
    "goa": ("Bombay High Court", "Goa"),
    "maharashtra": ("Bombay High Court", ""),
    "karnataka": ("Karnataka High Court", ""),
    "delhi": ("Delhi High Court", ""),
    "tamil nadu": ("Madras High Court", ""),
    "kerala": ("Kerala High Court", ""),
    "gujarat": ("Gujarat High Court", ""),
    "west bengal": ("Calcutta High Court", ""),
    "telangana": ("Telangana High Court", ""),
    "uttar pradesh": ("Allahabad High Court", ""),
}


# A result must share real vocabulary with the query; char n-grams alone match anything ("pizza" ~ "prize").
MIN_SIMILARITY = 0.06

LEGAL_TERMS = set("""
act acts section sec article clause rule order code court courts tribunal bench judge judgment judgement decree appeal
appellant respondent petition petitioner plaintiff defendant accused complainant suit plaint writ revision review bail
fir chargesheet ipc bns crpc bnss cpc bsa evidence witness prosecution conviction acquittal sentence offence offense
cheating fraud theft murder assault cruelty dowry harassment rape kidnapping defamation forgery criminal civil
contract agreement breach damages compensation injunction specific performance arbitration arbitrator award mediation
lok adalat settlement limitation property land plot title deed sale registered unregistered registration stamp duty
possession eviction tenant tenancy landlord lease rent licence license mortgage partition inheritance succession will
probate heir heirs ancestral comunidade mundkar bhatkar encroachment easement boundary mutation survey
cheque dishonour negotiable instruments recovery debt loan bank invoice payment insolvency ibc creditor
divorce maintenance alimony custody guardianship marriage matrimonial adoption domestic violence
accident motor mact insurance insurer claim claimant negligence injury death dependency multiplier
consumer deficiency service defective warranty refund builder flat allotment rera
employer employee workman termination retrenchment dismissal wages gratuity labour industrial service seniority
promotion pension transfer disciplinary trademark patent copyright infringement passing design
tax gst customs excise company director shareholder partnership firm constitution fundamental rights
statute statutory legal law lawyer advocate litigation precedent ratio holding overruled liability
attorney gpa forged forgery impersonation heirship inventory subdivided purchaser purchasers buyer buyers vendor vendors
bona fide void voidable cancellation attachment pmla broker consideration conveyance gift ostensible owner fraudulent
nominee vehicle gearbox repair workshop dealer flat apartment allotment interest delay arrears premises shop
""".split())


def query_signal(q: str) -> tuple[int, int]:
    """(legal-term hits, word tokens) for a raw query."""
    toks = re.findall(r"[a-z0-9]+", expand_query(q).lower())
    return sum(1 for t in toks if t in LEGAL_TERMS or re.fullmatch(r"\d{2,4}[a-z]?", t)), len(toks)


def is_legal_query(q: str) -> bool:
    hits, _ = query_signal(q)
    return hits >= 1


def expand_query(q: str) -> str:
    extra = [exp for rx, exp in ALIASES if rx.search(q)]
    return q + (" " + " ".join(extra) if extra else "")


def _doc_text(r: dict[str, Any]) -> str:
    from app.services.precedents.harvest import is_boilerplate

    paras = " ".join(p.get("text", "") for p in r.get("paras", [])[:16] if not is_boilerplate(p.get("text", "")))
    head = r.get("headnote", "") if not is_boilerplate(r.get("headnote", "")) else ""
    return " ".join([r.get("title", ""), r.get("title", ""), r.get("issue", ""), r.get("issue", ""), r.get("holding_summary", ""), r.get("holding_summary", ""), head, r.get("holding", ""), paras,
                     " ".join(r.get("statutes", [])) * 2, " ".join(a.replace("_", " ") for a in r.get("practice_areas", []))])


class PrecedentIndex:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._n = -1
        self._records: list[dict[str, Any]] = []
        self._word: TfidfVectorizer | None = None
        self._char: TfidfVectorizer | None = None
        self._Xw = None
        self._Xc = None

    def _ensure(self) -> None:
        # Judgments only: statutes are cited through the rule packs, not returned as precedents.
        from app.services.precedents.harvest import is_statute_title

        records = [r for r in corpus.load_records() if r.get("kind", "judgment") == "judgment" and not is_statute_title(r.get("title", ""))]
        if len(records) == self._n and self._word is not None:
            return
        with self._lock:
            texts = [_doc_text(r) for r in records] or ["empty"]
            self._word = TfidfVectorizer(ngram_range=(1, 2), min_df=1, max_df=0.85, sublinear_tf=True, stop_words="english")
            self._char = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=2, sublinear_tf=True, max_features=60000)
            self._Xw = self._word.fit_transform(texts)
            self._Xc = self._char.fit_transform(texts)
            self._records = records
            self._n = len(records)

    def size(self) -> int:
        self._ensure()
        return self._n

    @staticmethod
    def locality(r: dict[str, Any], state: str = "", district: str = "", seat: str = "") -> tuple[float, str]:
        """(boost, human-readable reason) for how binding / local a judgment is for the matter's forum."""
        court = r.get("court", "")
        if court.startswith("Supreme Court"):
            return 0.20, "Supreme Court: binding on all courts (Art. 141)"
        hc, hc_seat = STATE_HC.get((state or "").lower(), ("", ""))
        if hc and court == hc:
            text = (r.get("headnote", "") + " " + r.get("title", "") + " " + r.get("holding", "")).lower()
            local = (district and district.lower() in text) or (seat and seat.lower() in text)
            same_bench = hc_seat and r.get("seat") == hc_seat
            if same_bench and local:
                return 0.35, f"{hc} at {hc_seat}: same bench, arises from {district or seat}"
            if same_bench:
                return 0.30, f"{hc} at {hc_seat}: same bench as your forum"
            return 0.20, f"{hc}: binding High Court for {state}"
        if r.get("state") and state and r["state"].lower() == state.lower():
            return 0.10, f"Same state ({state})"
        return 0.0, f"{court or 'Other court'}: persuasive only"

    def search(self, query: str, k: int = 10, area: str | None = None, state: str = "", district: str = "", seat: str = "") -> list[dict[str, Any]]:
        self._ensure()
        if not self._records or not query.strip():
            return []
        q = expand_query(query)
        qw = self._word.transform([q])
        if qw.nnz == 0 or not is_legal_query(query):
            return []  # nothing in the query is legal vocabulary the index knows: no results, not noise
        qc = self._char.transform([q])
        sim = (self._Xw @ qw.T).toarray().ravel() * 0.75 + (self._Xc @ qc.T).toarray().ravel() * 0.25
        this_year = date.today().year
        scored: list[tuple[float, int, float, str]] = []
        for i in np.argsort(-sim)[: max(k * 6, 40)]:
            base = float(sim[i])
            if base < MIN_SIMILARITY:
                continue
            r = self._records[i]
            boost, why = self.locality(r, state, district, seat)
            area_bonus = 0.12 if area and area in r.get("practice_areas", []) else 0.0
            try:
                yr = int((r.get("date") or "0")[:4])
            except ValueError:
                yr = 0
            recency = 0.05 if yr and this_year - yr <= 5 else (0.02 if yr and this_year - yr <= 12 else 0.0)
            final = base * (1 + boost + area_bonus + recency)
            if not r.get("court") and not r.get("landmark"):
                final *= 0.6  # reports, notifications and unlabelled orders rank below judgments
            scored.append((final, int(i), base, why))
        scored.sort(reverse=True)
        out = []
        for final, i, base, why in scored[:k]:
            r = self._records[i]
            out.append({**r, "score": round(final, 4), "similarity_raw": round(base, 4), "locality_reason": why})
        return out


precedent_index = PrecedentIndex()
