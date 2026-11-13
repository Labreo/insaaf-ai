"""Black-box judge acceptance run against a LIVE Insaaf backend.

    python3 backend/scripts/judge_acceptance.py [BASE_URL] [--json out.json]

Run it against a throw-away copy/DB: it creates matters, writes reviews and mutates
flags. It never uses a fixture that the app itself would not accept from a user.
Exit code is the number of FAIL results (0 = nothing failed).
"""
from __future__ import annotations

import io
import json
import os
import re
import sqlite3
import sys
import time
from pathlib import Path

import httpx

BASE = (sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].startswith("http") else "http://127.0.0.1:8100").rstrip("/")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.demo_accounts import demo_passwords  # noqa: E402

PASSWORDS = demo_passwords()
PASSWORD = PASSWORDS["senior_1"]
DEMO_DIR = Path(__file__).resolve().parents[2] / "demo" / "matters"
DB_PATH = Path(os.environ.get("INSAAF_DB", Path(__file__).resolve().parents[1] / "insaaf.db"))
RESULTS: list[dict] = []
V1 = f"{BASE}/v1"
http = httpx.Client(timeout=90)


def rec(tid: str, area: str, probe: str, expected: str, actual: str, ok: bool | None, sev: str = "-") -> bool:
    verdict = "PASS" if ok else ("N/A" if ok is None else "FAIL")
    RESULTS.append({"id": tid, "area": area, "probe": probe, "expected": expected, "actual": actual, "verdict": verdict, "sev": sev if verdict == "FAIL" else "-"})
    print(f"[{verdict:4}] {tid:6} {area}: {probe} -> {actual[:140]}")
    return bool(ok)


def login(user: str, password: str | None = None) -> dict[str, str] | None:
    password = password or PASSWORDS.get(user, PASSWORD)
    r = http.post(f"{V1}/auth/login", json={"user_id": user, "password": password})
    return {"Authorization": f"Bearer {r.json()['token']}"} if r.status_code == 200 else None


def call(method: str, path: str, h: dict | None = None, **kw) -> httpx.Response:
    return http.request(method, f"{V1}{path}", headers=h or {}, **kw)


def sse(matter: str, h: dict) -> tuple[list[dict], float]:
    t0 = time.time()
    events: list[dict] = []
    with http.stream("GET", f"{V1}/matters/{matter}/events", headers=h, timeout=180) as r:
        for line in r.iter_lines():
            if line.startswith("data: "):
                events.append(json.loads(line[6:]))
    return events, time.time() - t0


# ----------------------------------------------------------------------------------------
def part1() -> None:
    S = login("senior_1")
    rec("P1.1", "Login", "senior_1 + seeded password", "200 + token", "token issued" if S else "login failed", bool(S))
    if not S:
        return
    me = call("GET", "/me", S).json()
    rec("P1.1b", "Login", "GET /me", "role senior, Chamber A", f"{me.get('role')} / {me.get('org', {}).get('name')}", me.get("role") == "senior")

    q = call("GET", "/queue", S).json()
    pri = [x["priority"] for x in q]
    rec("P1.2", "Nyaya Queue", "GET /queue", "ranked high->low, mat_001 first", f"{[x['matter_id'] for x in q]} priorities {pri}", bool(q) and pri == sorted(pri, reverse=True) and q[0]["matter_id"] == "mat_001")

    m = call("GET", "/matters/mat_001", S).json()
    docs = m.get("documents") or []
    rec("P1.3", "Matter", "GET /matters/mat_001", "title, court, >=1 doc", f"{m.get('title')} | {m.get('forum_hint')} | {len(docs)} docs", bool(m.get("title")) and len(docs) >= 1)

    facts = call("GET", "/matters/mat_001/facts", S).json()
    st = {f["status"] for f in facts}
    konkani = [f for f in facts if f.get("original") and f["original"].get("language") == "kok"]
    rec("P1.4", "Facts", "GET /facts", "cards with status + source; Konkani original kept, voice = alleged",
        f"{len(facts)} cards, statuses {sorted(st)}, konkani cards {len(konkani)} ({[f['status'] for f in konkani]})",
        len(facts) >= 4 and bool(konkani) and all(f["status"] == "alleged" for f in konkani))

    proof = call("GET", "/matters/mat_001/proof-ledger", S).json()
    items = proof["items"]
    miss = [i["requirement"] for i in items if i["state"] == "missing"]
    rec("P1.5", "Proof Ledger", "GET /proof-ledger", "deterministic items, critical gap flagged", f"{len(items)} items; missing={miss}", any(i["state"] == "missing" and i["severity"] == "critical" for i in items))

    events, secs = sse("mat_001", S)
    stages = [e["stage"] for e in events if e["status"] == "done"]
    rec("P1.6", "Pipeline", "GET /events (SSE) on seeded mat_001", "11 stages reach done, no failed", f"{len(events)} events, done={len(stages)} in {secs:.1f}s, failed={[e['stage'] for e in events if e['status']=='failed']}", len(set(stages)) == 11 and not any(e["status"] == "failed" for e in events))

    pr = call("GET", "/matters/mat_001/precedents", S).json()
    rec("P1.7a", "Precedents", "GET /precedents", "results with SourceRef, budget 8000", f"{len(pr['results'])} results; elapsed {pr['elapsed_ms']}ms budget {pr['budget_ms']}", bool(pr["results"]) and pr["elapsed_ms"] <= pr["budget_ms"])
    t0 = time.time()
    ps = call("POST", "/matters/mat_001/precedents/search", S, json={"query": "part performance possession unregistered agreement"})
    body = ps.json() if ps.status_code == 200 else {}
    rec("P1.7b", "Precedents", "POST /precedents/search custom query", "<= budget, results with sources", f"{ps.status_code}, {len(body.get('results', []))} results in {time.time()-t0:.1f}s, cached={body.get('cached')}", ps.status_code == 200 and bool(body.get("results")))

    src = pr["results"][0]["sources"][0] if pr["results"] else {}
    did = src.get("source_id", "").replace("src_kanoon_", "")
    rec("P1.8", "Source", "open top precedent source", "title, court, paragraph text, indiankanoon URL containing doc id", f"{src.get('title')} | {src.get('court')} | url={src.get('url')} | snippet {len(src.get('snippet',''))} chars",
        bool(src.get("snippet")) and "indiankanoon.org/doc/" in src.get("url", "") and (not did or did in src["url"]))
    snippet = src.get("snippet", "")
    rec("P1.8b", "Source", "snippet free of page chrome", "no nav/menu text", snippet[:100], bool(snippet) and not re.search(r"(?i)\b(login|sign in|cookie|menu|home page)\b", snippet))

    ch = call("GET", "/matters/mat_001/citations/health", S).json()
    rec("P1.9a", "Citations", "GET /citations/health", "overruled authority present and blocks draft", f"{[(c['cited']['title'][:30], c['treatment'], c['blocks_draft']) for c in ch]}", any(c["treatment"] == "overruled" and c["blocks_draft"] for c in ch))
    ck = call("POST", "/matters/mat_001/citations/check", S, json={"citation": "ADM Jabalpur v. Shivkant Shukla"})
    top = ck.json()[0] if ck.status_code == 200 and ck.json() else {}
    rec("P1.9b", "Citations", "check ADM Jabalpur", "red/overruled, overruling case is a DIFFERENT case", f"{top.get('badge')}/{top.get('treatment')} by={(top.get('by') or {}).get('title')}", top.get("treatment") == "overruled" and (top.get("by") or {}).get("title") != top.get("cited", {}).get("title"))

    sc = call("GET", "/matters/mat_001/score", S).json()
    rec("P1.10a", "AI-B score", "GET /score", "band, factors, held-out eval, court-aware block", f"band={sc['band']} eval={sc['eval'].get('heldout_correct')}/{sc['eval'].get('heldout_total')} court={sc['court_aware']['court']}", sc["eval"].get("heldout_total", 0) > 0 and bool(sc["factors"]))
    rates = {}
    for court in ["Civil Judge Senior Division, Mapusa", "District Court, North Goa", "Bombay High Court (Goa bench)", "Supreme Court of India"]:
        r = call("POST", "/matters/mat_001/court", S, json={"court": court})
        ca = r.json().get("court_aware", {}) if r.status_code == 200 else {}
        rates[court] = (ca.get("court"), ca.get("pooled_rate"))
    rec("P1.10b", "Court pooling", "4 UI courts each resolve to themselves, distinct pooled rate", "4 distinct", str(rates), all(k == v[0] for k, v in rates.items()) and len({v[1] for v in rates.values()}) == 4)
    call("POST", "/matters/mat_001/court", S, json={"court": "Bombay High Court (Goa bench)"})  # restore seeded forum

    bf = call("GET", "/matters/mat_001/bias-firewall", S).json()
    flips = {i: call("POST", "/matters/mat_001/bias-firewall/flip", S, json={"identity": i}).json() for i in ["muslim", "dalit", "tribal", "female", "non_english_speaking"]}
    rec("P1.11", "Bias Firewall", "GET + 5 live flips", "6 rows, all |delta|<=eps, passed", f"eps={bf['epsilon']} passed={bf['passed']} deltas={ {k: v.get('delta') for k, v in flips.items()} }", bf["passed"] and all(abs(v.get("delta", 9)) <= bf["epsilon"] for v in flips.values()))
    rec("P1.11b", "Bias Firewall", "limitation (honesty)", "classifier uses only structured features, not text", "scores ignore party text by construction; the firewall proves masking + feature invariance, not fairness of a text model", None)

    dr = call("GET", "/matters/mat_001/draft", S).json()
    paras = dr["paragraphs"]
    locked = [p for p in paras if p.get("locked_out_claim")]
    rec("P1.12a", "Draft", "GET /draft", "paragraphs bound to sources; unsupported claim quarantined", f"{len(paras)} paras, {len(locked)} quarantined, watermark={dr['watermark']!r}", bool(paras) and bool(locked))
    fake = call("POST", "/matters/mat_001/draft/verify-citation", S, json={"text": "Held in Imaginary Case (2099) 1 SCC 1"}).json()
    real = call("POST", "/matters/mat_001/draft/verify-citation", S, json={"text": "Suraj Lamp & Industries v. State of Haryana"}).json()
    wrong = call("POST", "/matters/mat_001/draft/verify-citation", S, json={"text": "Suraj Lamp held that a registered sale deed is not required to transfer immovable property"}).json()
    rec("P1.12b", "Authority Lock", "fake / real / misattributed holding", "False / True / False", f"{fake['verified']} / {real['verified']} / {wrong['verified']}", (fake["verified"], real["verified"], wrong["verified"]) == (False, True, False))

    adv = call("GET", "/matters/mat_001/advice", S).json()
    clk = call("GET", "/matters/mat_001/statute-clock", S).json()
    rec("P1.13a", "Advice", "GET /advice", "recommendation + reasons + sources", f"{adv['recommendation']} conf={adv.get('confidence')}", bool(adv.get("recommendation")))
    rc = call("POST", "/matters/mat_001/statute-clock/recalculate", S, json={"cause_date": "2020-02-01"}).json()
    rec("P1.13b", "Statute Clock", "recalc cause 2020-02-01", "COVID tolling 2020-03-15..2022-02-28 (+716d) -> expiry 2034-01-17", f"expires {rc.get('limitation_expires')} excluded={[ (p['from'], p['to']) for p in rc.get('excluded_periods', [])]}", rc.get("limitation_expires") == "2034-01-17")
    call("POST", "/matters/mat_001/statute-clock/recalculate", S, json={"cause_date": "2023-12-24"})  # restore-ish

    J = login("junior_1")
    rj = call("POST", "/matters/mat_001/reviews", J, json={"action": "submit", "target": "draft", "target_id": "draft", "reason_code": "other", "note": "Ready for senior"})
    blocked_first = call("POST", "/matters/mat_001/reviews", S, json={"action": "approve", "target": "draft", "target_id": "draft", "reason_code": "other", "note": "should be blocked"})
    rs_codes = []
    for c in call("GET", "/matters/mat_001/citations/health", S).json():
        if c["blocks_draft"]:  # a senior reviews every overruled authority, one reasoned override each
            rs_codes.append(call("POST", "/matters/mat_001/reviews", S, json={"action": "override", "target": "citation", "target_id": c["cited"]["source_id"], "reason_code": "wrong_citation_treatment", "note": "Judge acceptance: reviewed, not relied upon"}).status_code)
    ra = call("POST", "/matters/mat_001/reviews", S, json={"action": "approve", "target": "draft", "target_id": "draft", "reason_code": "other", "note": "Judge acceptance approval"})
    rs = type("R", (), {"status_code": 200 if rs_codes and all(c == 200 for c in rs_codes) else 500})
    rec("P1.14", "Review", "junior submits; approve blocked (409) while overruled citations stand; senior overrides each with reason; approve succeeds", "200 / 409 / overrides 200 / 200", f"{rj.status_code} / {blocked_first.status_code} / {rs_codes} / {ra.status_code}", (rj.status_code, blocked_first.status_code, ra.status_code) == (200, 409, 200) and rs.status_code == 200)
    led = call("GET", "/ledger?matter_id=mat_001", S).json()
    ver = led["verify"]
    last = led["entries"][-1] if led["entries"] else {}
    linked = all(led["entries"][i]["prev_hash"] == led["entries"][i - 1]["hash"] for i in range(1, len(led["entries"])))
    rec("P1.15", "Audit ledger", "GET /ledger + verify", "valid chain, new entries present with actor/role", f"valid={ver['valid']} entries={ver['entries']} last={last.get('actor')}/{last.get('role')}/{last.get('action')} linked={linked}", ver["valid"] and last.get("action") == "approve" and linked)

    # Persistence: compare API output with what is actually stored.
    if DB_PATH.exists():
        con = sqlite3.connect(DB_PATH)
        row = con.execute("SELECT payload_json FROM stage_results WHERE matter_id='mat_001' AND stage='facts'").fetchone()
        stored = json.loads(row[0]) if row else None
        n_led = con.execute("SELECT COUNT(*) FROM ledger_entries WHERE matter_id='mat_001'").fetchone()[0]
        con.close()
        facts_now = call("GET", "/matters/mat_001/facts", S).json()
        rec("P1.16", "Persistence", "API vs SQLite (facts, ledger rows)", "identical to stored rows", f"facts match={stored == facts_now if stored else 'no row'} ledger rows={n_led} api entries={len(led['entries'])}", stored is not None and [f['id'] for f in stored] == [f['id'] for f in facts_now] and n_led == len(led["entries"]))
    else:
        rec("P1.16", "Persistence", "API vs SQLite", "-", f"db not found at {DB_PATH}", None)


# ----------------------------------------------------------------------------------------
def part2() -> None:
    S, J, ST, C, B = login("senior_1"), login("junior_1"), login("student_1"), login("clerk_1"), login("senior_b")
    r = call("POST", "/auth/login", json={"user_id": "senior_1", "password": ""})
    rec("N1", "Auth", "empty password", "401", str(r.status_code), r.status_code == 401, "P0")
    r = call("POST", "/auth/login", json={"user_id": "senior_1"})
    rec("N1b", "Auth", "missing password field", "401/422", str(r.status_code), r.status_code in (401, 422), "P0")
    r = call("POST", "/auth/login", json={"user_id": "senior_1", "password": "x" * 5000})
    rec("N1c", "Auth", "5000-char password", "401/422 no crash", str(r.status_code), r.status_code in (401, 422), "P1")
    r = call("GET", "/matters/mat_001/facts")
    rec("N2", "Auth", "GET facts, no token", "401", str(r.status_code), r.status_code == 401, "P0")
    r = call("GET", "/matters", {"Authorization": "Bearer v1.forged.token"})
    rec("N2b", "Auth", "forged bearer token", "401", str(r.status_code), r.status_code == 401, "P0")

    leaks = {}
    for path, method, body in [("", "GET", None), ("/facts", "GET", None), ("/proof-ledger", "GET", None), ("/statute-clock", "GET", None), ("/precedents", "GET", None), ("/citations/health", "GET", None),
                               ("/score", "GET", None), ("/bias-firewall", "GET", None), ("/advice", "GET", None), ("/draft", "GET", None), ("/law-changes", "GET", None),
                               ("/draft/export?format=docx", "GET", None), ("/court", "POST", {"court": "Supreme Court of India"}), ("/run", "POST", None),
                               ("/reviews", "POST", {"action": "approve", "target": "draft", "target_id": "draft", "reason_code": "other"}), ("/flags", "POST", {"flag": "senior_citizen"}),
                               ("/documents", "POST", None)]:
        kw = {"json": body} if body else {}
        if path == "/documents":
            kw = {"files": {"file": ("x.txt", b"hello", "text/plain")}}
        rr = call(method, f"/matters/mat_001{path}", B, **kw)
        if rr.status_code not in (403, 404):
            leaks[path or "/"] = rr.status_code
    rec("N3", "Tenant", "Chamber B token vs 17 Chamber A mat_001 routes", "all 403/404", f"leaks={leaks or 'none'}", not leaks, "P0")
    rr = call("DELETE", "/matters/mat_001", B)
    rec("N3b", "Tenant", "Chamber B deletes Chamber A matter", "403/404", str(rr.status_code), rr.status_code in (403, 404), "P0")
    ql = call("GET", "/queue", B).json()
    rec("N3c", "Tenant", "Chamber B queue / matters list", "no Chamber A ids", str([x['matter_id'] for x in ql]), all(not x["matter_id"] in ("mat_001", "mat_002", "mat_003") for x in ql), "P0")

    docs = (call("GET", "/matters/mat_001", S).json().get("documents") or [])
    did = docs[0]["id"] if docs else "doc_pdf_01"
    rr = call("DELETE", f"/matters/mat_001/documents/{did}", B)
    rec("N4", "Tenant", "Chamber B deletes Chamber A document", "403/404", str(rr.status_code), rr.status_code in (403, 404), "P0")
    codes = {p: http.get(f"{BASE}{p}").status_code for p in ["/uploads/doc_pdf_01_agreement_of_sale_fictional.pdf", "/static/uploads/x", "/backend/uploads/x", "/insaaf.db", "/.env"]}
    rec("N4b", "Documents", "guess static URLs for stored uploads/db/.env", "none served (404/405)", str(codes), all(c in (404, 405) for c in codes.values()), "P0")
    rr = call("GET", f"/matters/mat_001/documents/{did}", B)
    rec("N4c", "Documents", "download endpoint", "no public download route exists", f"GET /documents/{{id}} -> {rr.status_code} (the app has no document-download endpoint; only draft DOCX export)", rr.status_code in (404, 405))

    rr = call("DELETE", "/matters/mat_001", ST)
    rec("N5", "RBAC", "student deletes matter", "403", str(rr.status_code), rr.status_code == 403, "P0")
    rr = call("POST", "/ledger/tamper", ST)
    rec("N5b", "RBAC", "student tamper ledger", "403", str(rr.status_code), rr.status_code == 403, "P0")
    rr = call("POST", "/ml/retrain", J)
    rec("N5c", "RBAC", "junior retrain model", "403", str(rr.status_code), rr.status_code == 403, "P0")
    rr = call("POST", "/demo/reset", J)
    rec("N5d", "RBAC", "junior demo reset", "403", str(rr.status_code), rr.status_code == 403, "P0")
    rr = call("POST", "/matters/mat_001/reviews", J, json={"action": "approve", "target": "draft", "target_id": "draft", "reason_code": "other"})
    rec("N6", "RBAC", "junior senior-only approve", "403", str(rr.status_code), rr.status_code == 403, "P0")
    rr = call("POST", "/matters/mat_001/reviews", J, json={"action": "override", "target": "score", "target_id": "score", "reason_code": "score_disagree"})
    rec("N6b", "RBAC", "junior override", "403", str(rr.status_code), rr.status_code == 403, "P0")
    rr = call("POST", "/matters/mat_001/reviews", C, json={"action": "edit", "target": "fact", "target_id": "fact_01", "reason_code": "wrong_fact", "note": "x"})
    rec("N6c", "RBAC", "clerk edit fact", "403", str(rr.status_code), rr.status_code == 403, "P0")
    rr = call("POST", "/matters", ST, json={"title": "student matter", "case_type": "property"})
    rec("N6d", "RBAC", "student create matter", "403", str(rr.status_code), rr.status_code == 403, "P0")
    rr = call("POST", "/me/role", S, json={"role": "student"})
    rec("N6e", "RBAC", "in-session role switch", "403", str(rr.status_code), rr.status_code == 403, "P0")

    # Draft export while a citation blocks the draft. Use a fresh state: mat_002 stays as seeded.
    for mid in ("mat_001", "mat_002", "mat_003"):
        chh = call("GET", f"/matters/{mid}/citations/health", S).json()
        blocking = [c for c in chh if c["blocks_draft"]]
        if blocking:
            ex = call("GET", f"/matters/{mid}/draft/export?format=docx", S)
            ap = call("POST", f"/matters/{mid}/reviews", S, json={"action": "approve", "target": "draft", "target_id": "draft", "reason_code": "other", "note": "probe"})
            rec("N7", "Citation gate", f"{mid}: {len(blocking)} blocking citation(s) un-overridden -> export / approve", "export 4xx and approve 4xx until overridden", f"export={ex.status_code} approve={ap.status_code}", ex.status_code >= 400 and ap.status_code >= 400, "P1")
            break
    else:
        rec("N7", "Citation gate", "no seeded matter has a blocking citation left (earlier override recorded)", "-", "n/a", None)

    # Malformed uploads
    mk = call("POST", "/matters", J, json={"title": "Negative upload probe (FICTIONAL)", "case_type": "property"}).json()["id"]
    cases = {
        "corrupt pdf": ("a.pdf", b"not a real pdf", "application/pdf"),
        "corrupt docx": ("a.docx", b"PK-not-a-docx", "application/octet-stream"),
        "traversal name": ("../../evil.txt", b"hello", "text/plain"),
        "empty file": ("empty.pdf", b"", "application/pdf"),
        "exe binary": ("virus.exe", b"MZ\x90\x00" + os.urandom(64), "application/octet-stream"),
        "invalid json audio": ("note.json", b"{not json", "application/json"),
    }
    bad = {}
    for name, (fn, data, ct) in cases.items():
        rr = call("POST", f"/matters/{mk}/documents", J, files={"file": (fn, data, ct)})
        bad[name] = rr.status_code
    rec("N8", "Upload", "malformed / hostile uploads", "clean 4xx (never 500, never path escape)", str(bad), all(c < 500 for c in bad.values()), "P1")
    evil = Path(__file__).resolve().parents[1] / "evil.txt"
    rec("N8b", "Upload", "traversal wrote outside uploads/", "no file at backend/evil.txt or repo root", "escaped" if evil.exists() or (evil.parent.parent / "evil.txt").exists() else "contained", not (evil.exists() or (evil.parent.parent / "evil.txt").exists()), "P0")
    call("DELETE", f"/matters/{mk}", S)

    big = call("POST", "/matters/NOPE/run", J)
    rec("N9", "Robustness", "run pipeline on nonexistent matter", "404", str(big.status_code), big.status_code == 404, "P1")
    rr = call("POST", "/matters/mat_001/bias-firewall/flip", S, json={"identity": "alien"})
    rec("N9b", "Robustness", "invalid identity", "422", str(rr.status_code), rr.status_code == 422, "P2")
    rr = call("POST", "/matters/mat_001/statute-clock/recalculate", S, json={"cause_date": "not-a-date"})
    rec("N9c", "Robustness", "malformed cause date", "4xx not 500", str(rr.status_code), 400 <= rr.status_code < 500, "P1")
    rr = call("POST", "/matters/mat_001/precedents/search", S, json={"query": ""})
    rec("N9d", "Robustness", "empty precedent query", "4xx or empty result, not 500", str(rr.status_code), rr.status_code < 500, "P2")


# ----------------------------------------------------------------------------------------
def make_pdf(text: str) -> bytes:
    import fitz

    d = fitz.open()
    p = d.new_page()
    p.insert_textbox(fitz.Rect(50, 50, 550, 780), text, fontsize=10)
    out = d.tobytes()
    d.close()
    return out


def make_docx(text: str) -> bytes:
    from docx import Document

    d = Document()
    for para in text.split("\n"):
        d.add_paragraph(para)
    b = io.BytesIO()
    d.save(b)
    return b.getvalue()


def part3() -> None:
    S = login("senior_1")
    title = "D'Souza Boat Repairs v. Nair Fisheries — unpaid engine overhaul ₹2,75,000, Vasco (FICTIONAL)"
    m = call("POST", "/matters", S, json={"title": title, "case_type": "civil_recovery", "forum_hint": "Commercial Court, Panaji", "client_language": "en"})
    rec("U0", "Fresh matter", "create unfamiliar matter", "200 + id", f"{m.status_code}", m.status_code == 200)
    mid = m.json()["id"]

    invoice = make_pdf(
        "FICTIONAL TAX INVOICE No. DSBR/24-25/0173 dated 14 March 2024\n"
        "D'Souza Boat Repairs, Baina Beach Road, Vasco da Gama, Goa\n"
        "Customer: Nair Fisheries, Mormugao Harbour\n"
        "Work: Complete overhaul of 120 HP Cummins marine diesel engine of trawler MFV Sagar-Rani, replacement of turbocharger and fuel injectors.\n"
        "Amount: Rs. 2,75,000 (Rupees two lakh seventy-five thousand only). Payment terms: 30 days from invoice.\n"
        "Delivery of repaired trawler engine acknowledged by skipper on 20 March 2024 (signature on file)."
    )
    r = call("POST", f"/matters/{mid}/documents", S, files={"file": ("dsouza_invoice_fictional.pdf", invoice, "application/pdf")})
    rec("U1", "Upload", "fresh PDF invoice", "200, pages parsed", f"{r.status_code} {r.json() if r.status_code==200 else r.text[:100]}", r.status_code == 200)
    note = make_docx(
        "FICTIONAL CHAMBER INTAKE NOTE\n"
        "The client Mr. Joaquim D'Souza states that Nair Fisheries has paid nothing despite repeated phone calls.\n"
        "The opposite party's owner disputes the quality of the turbocharger work and claims the engine overheated in April 2024.\n"
        "No written contract or work order exists; the job was agreed orally at the harbour.\n"
        "Date of the oral promise to pay after the fishing season is unknown."
    )
    r2 = call("POST", f"/matters/{mid}/documents", S, files={"file": ("intake_note_fictional.docx", note, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")})
    rec("U1b", "Upload", "fresh DOCX intake note", "200", str(r2.status_code), r2.status_code == 200)

    events, secs = sse(mid, S)
    done = {e["stage"] for e in events if e["status"] == "done"}
    failed = [e for e in events if e["status"] == "failed"]
    rec("U2", "Pipeline", "11-stage run on unfamiliar matter", "all 11 stages done, no failure", f"{len(done)} done in {secs:.1f}s, failed={failed}", len(done) == 11 and not failed)

    fr = call("GET", f"/matters/{mid}/facts", S)
    facts = fr.json() if fr.status_code == 200 else []
    blob = " ".join(f["statement"] for f in facts).lower()
    hits = [k for k in ["turbocharger", "engine", "2,75,000", "275000", "trawler", "nair", "invoice", "oral", "dispute", "overheat"] if k in blob]
    rec("U3a", "Facts", "facts reflect the new documents (not a preset)", "mentions engine/trawler/amount/dispute", f"{fr.status_code}; {len(facts)} cards; keyword hits {hits}", fr.status_code == 200 and len(hits) >= 3)
    stat = {f["id"]: f["status"] for f in facts}
    disputed_or_alleged = [f["statement"][:70] for f in facts if f["status"] in ("disputed", "alleged", "unknown")]
    rec("U3b", "Facts", "uncertain claims not promoted to documented", "dispute / unknown payment date marked disputed|alleged|unknown", f"statuses={sorted(set(stat.values()))}; non-documented={disputed_or_alleged[:3]}", bool(disputed_or_alleged))
    seeded_leak = [k for k in ["fernandes", "mapusa", "mundkar", "sale deed"] if k in blob]
    rec("U3c", "Facts", "no leakage of seeded-matter content", "none", str(seeded_leak or "none"), not seeded_leak)

    pr = call("GET", f"/matters/{mid}/precedents", S).json()
    titles = [r_["sources"][0]["title"] for r_ in pr["results"]]
    texts = [(r_["sources"][0]["title"] + " " + r_["sources"][0].get("snippet", "")) for r_ in pr["results"]]
    rec("U4a", "Precedents", "results returned for a new civil-recovery matter", ">=1, within budget", f"{len(titles)} results {titles}", bool(titles) and pr["elapsed_ms"] <= pr["budget_ms"])
    generic = any("suraj lamp" in t.lower() for t in titles)
    rec("U4b", "Precedents", "not property-title canned results for a recovery dispute", "no Suraj Lamp (title-deed case) for an invoice dispute", str(titles), not generic)
    relevant = [t[:60] for t in texts if re.search(r"(?i)limitation|12a|mediation|recovery|invoice|contract|sale of goods|commercial|payment|acknowledg|goods|price", t)]
    rec("U4c", "Precedents", "results topically relevant to unpaid-invoice recovery (title+snippet keyword check; crude)", ">=3 of 5 plausible", f"{len(relevant)}/{len(texts)} match; titles={titles}", len(relevant) >= 3, "P2")

    pf = call("GET", f"/matters/{mid}/proof-ledger", S).json()
    state = {i["requirement"]: i["state"] for i in pf["items"]}
    rec("U5a", "Proof Ledger", "distinguishes present vs missing evidence", "invoice present; 'no written contract' note must NOT count as a contract", str(state), state.get("Written contract or purchase order") != "present" and state.get("Tax invoices and delivery challans") == "present")
    ack = call("POST", f"/matters/{mid}/documents", S, files={"file": ("ack_letter_fictional.docx", make_docx("FICTIONAL LETTER dated 12 June 2024 from Nair Fisheries to D'Souza Boat Repairs: We acknowledge the outstanding balance of Rs. 2,75,000 for the engine overhaul and undertake to pay after the season. Signed, Nair Fisheries."), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")})
    sse(mid, S)
    pf2 = {i["requirement"]: i["state"] for i in call("GET", f"/matters/{mid}/proof-ledger", S).json()["items"]}
    changed = {k: (state.get(k), v) for k, v in pf2.items() if state.get(k) != v}
    rec("U5b", "Proof Ledger", "attach acknowledgment letter -> ledger and clock update", "an item changes state; limitation extends from 12 Jun 2024", f"upload={ack.status_code}; changed={changed}", ack.status_code == 200 and bool(changed))
    clk = call("GET", f"/matters/{mid}/statute-clock", S).json()
    rec("U5c", "Statute Clock", "clock reflects the new acknowledgment", "expiry derived from document dates, not preset", f"expires={clk['limitation_expires']} source={clk.get('cause_date_source')} article={clk['article']} days_left={clk['days_left']}", clk["limitation_expires"] == "2027-06-12" and clk.get("cause_date_source") == "document", "P1")

    dr = call("GET", f"/matters/{mid}/draft", S).json()
    known = {s["title"].lower() for p in dr["paragraphs"] for s in p["sources"]}
    pool = {r_["sources"][0]["title"].lower() for r_ in call("GET", f"/matters/{mid}/precedents", S).json()["results"]}
    cited_in_text = set()
    for p in dr["paragraphs"]:
        if p.get("locked_out_claim"):
            continue
        for mm in re.finditer(r"([A-Z][\w.&' ]{2,40}?)\s+v(?:s)?\.\s+([A-Z][\w.&' ]{2,40})", p["text"]):
            cited_in_text.add((mm.group(1) + " v. " + mm.group(2)).lower().strip())
    invented = [c for c in cited_in_text if not any(c.split(" v. ")[0].split()[-1] in k for k in known | pool)]
    rec("U6a", "Draft", "case names in unquarantined text all trace to a stored source", "no invented case", f"cited={sorted(cited_in_text)} invented={invented}", not invented, "P0")
    fk = call("POST", f"/matters/{mid}/draft/verify-citation", S, json={"text": "Held in Marine Engines Pvt Ltd v. Trawler Owners Association (2031) 9 SCC 404"}).json()
    rec("U6b", "Draft", "invented citation rejected on new matter", "verified false", str(fk["verified"]), fk["verified"] is False, "P0")
    nd = [p for p in dr["paragraphs"] if p.get("locked_out_claim") or p["text"] == "No verified authority found."]
    rec("U7", "Honesty", "draft carries watermark and quarantines unsupported claim", "watermark 'AI-assisted…' and >=1 quarantine", f"watermark={dr['watermark']!r} quarantined={len(nd)}", "AI" in dr["watermark"] and bool(nd))
    adv = call("GET", f"/matters/{mid}/advice", S).json()
    rec("U8", "Advice", "advice states confidence and reasons for new matter", "recommendation + confidence", f"{adv.get('recommendation')} conf={adv.get('confidence')}", bool(adv.get("recommendation")))
    sc = call("GET", f"/matters/{mid}/score", S).json()
    rec("U9", "Score", "score for new matter uses court override", "court-aware block for Commercial Court, Panaji", sc["court_aware"]["court"], sc["court_aware"]["court"] == "Commercial Court, Panaji")
    rec("U10", "Fixture dependence", "features that rely on seeded fixtures", "documented", "Citation presets (ADM Jabalpur, Koushal, Suraj Lamp, Patil) use hard-wired doc ids; other citations go through live search + citator. Proof Ledger rules are per case_type (3 rule packs). LANDMARK_DOCS back-fill precedents offline.", None)
    call("DELETE", f"/matters/{mid}", S)


# ----------------------------------------------------------------------------------------
def part4() -> None:
    ok = {}
    for u in ["senior_1", "junior_1", "clerk_1", "student_1", "senior_b"]:
        ok[u] = bool(login(u))
    rec("D1", "Accounts", "5 seeded role accounts log in", "all True", str(ok), all(ok.values()))
    S = login("senior_1")
    ms = [m["id"] for m in call("GET", "/matters", S).json()]
    rec("D2", "Matters", "3 fictional Chamber A matters seeded", "mat_001..003", str(ms), {"mat_001", "mat_002", "mat_003"} <= set(ms))
    fx = {str(p.relative_to(DEMO_DIR)): p.stat().st_size for p in DEMO_DIR.rglob("*") if p.is_file()}
    rec("D3", "Fixtures", "demo document fixtures on disk", ">=4 files", str(fx), len(fx) >= 4)
    h = call("GET", "/health/deep").json()
    rec("D4", "Health", "GET /health/deep", "db/llm/kanoon ok", str(h), h.get("db") == "ok" and h.get("llm") == "ok")
    t0 = time.time()
    g = httpx.post("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", params={"key": os.environ.get("GEMINI_API_KEY", "")}, json={"contents": [{"parts": [{"text": "ping"}]}]}, timeout=15) if os.environ.get("GEMINI_API_KEY") else None
    rec("D5", "Integrations", "live Gemini ping (direct)", "200", "skipped: GEMINI_API_KEY not exported to this shell; health/deep reports llm ok (shallow)" if g is None else f"{g.status_code} in {time.time()-t0:.1f}s", None if g is None else g.status_code == 200)
    try:
        k = httpx.get("https://indiankanoon.org/doc/1565619/", timeout=10, headers={"User-Agent": "Mozilla/5.0"})
        rec("D6", "Integrations", "indiankanoon.org reachable (direct HTML)", "200", str(k.status_code), k.status_code == 200)
    except Exception as e:  # noqa: BLE001
        rec("D6", "Integrations", "indiankanoon.org reachable", "200", f"unreachable: {e}", False, "P2")
    rec("D7", "Integrations", "Telegram dispatch", "not exercised: would send a real message", "configured in .env; NOT sent during acceptance run", None)


if __name__ == "__main__":
    for fn in (part2, part1, part3, part4):  # negative tests first: they probe the un-overridden seeded state
        try:
            fn()
        except Exception as e:  # noqa: BLE001
            import traceback

            traceback.print_exc()
            rec(fn.__name__.upper(), "HARNESS", f"{fn.__name__} crashed", "completes", f"{type(e).__name__}: {e}", False, "P1")
    fails = [r for r in RESULTS if r["verdict"] == "FAIL"]
    print(f"\nPASS={sum(r['verdict']=='PASS' for r in RESULTS)} FAIL={len(fails)} N/A={sum(r['verdict']=='N/A' for r in RESULTS)}")
    if "--json" in sys.argv:
        Path(sys.argv[sys.argv.index("--json") + 1]).write_text(json.dumps(RESULTS, indent=2, ensure_ascii=False))
    sys.exit(len(fails))
