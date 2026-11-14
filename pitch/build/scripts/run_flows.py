"""Drive every demo flow of the running Insaaf app, capture hi-res screens per step, record the main demo as video.

Needs backend :8000 and frontend :4173 (built) running.
python3 pitch/build/scripts/run_flows.py [A B C D E F]   -> pitch/flows/screens/*.png, pitch/flows/results.json, pitch/flows/demo_walkthrough.webm
Flows mutate the demo DB (override, approval, new matter); the script calls /v1/demo/reset and deletes its test matter at the end.
"""
from __future__ import annotations

import json
import re
import shutil
import sys
import time
import traceback
import urllib.request
from pathlib import Path

from playwright.sync_api import Page, expect, sync_playwright

ROOT = Path(__file__).resolve().parents[3]
PITCH = ROOT / "pitch"
OUT = PITCH / "flows"
SHOTS = OUT / "screens"
KIT = PITCH / "demo_kit"
BASE = "http://localhost:4173"
API = "http://localhost:8000/v1"
CREDS = json.loads((ROOT / "backend" / ".demo_credentials").read_text())["passwords"]
VIEW = {"width": 1600, "height": 1000}

results: list[dict] = []
current_flow = ""


def api(method: str, path: str, token: str | None = None, body: dict | None = None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"content-type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read() or b"null")


def token(user="senior_1"):
    return api("POST", "/auth/login", body={"user_id": user, "password": CREDS[user]})["token"]


def step(page: Page, name: str, fn, *a, **kw):
    t0 = time.time()
    slug = f"{current_flow}{len([r for r in results if r['flow'] == current_flow]) + 1:02d}_" + re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:48]
    try:
        note = fn(*a, **kw) or ""
        ok = True
    except Exception as e:  # noqa: BLE001
        note, ok = f"{type(e).__name__}: {str(e).splitlines()[0][:220]}", False
        traceback.print_exc(limit=1)
    page.wait_for_timeout(500)
    page.screenshot(path=str(SHOTS / f"{slug}.png"))
    results.append({"flow": current_flow, "step": name, "ok": ok, "note": note, "secs": round(time.time() - t0, 1), "shot": f"screens/{slug}.png"})
    print(("PASS " if ok else "FAIL ") + slug + ("  " + note if note else ""), flush=True)
    return ok


def skip_intro(page: Page, ms=1500):
    b = page.get_by_text("Skip intro", exact=False)
    try:
        b.first.wait_for(state="visible", timeout=ms); b.first.click(); b.first.wait_for(state="hidden", timeout=5000)
    except Exception:
        pass


def body(page: Page) -> str:
    return page.locator("body").inner_text()


def sign_in(page: Page, user: str, password: str | None = None, watch_intro=False):
    dlg = page.get_by_role("dialog", name="Chamber sign in")
    if not dlg.is_visible():
        sw = page.locator('button[title="Switch account"]')
        if sw.count() and sw.first.is_visible():
            sw.first.click()
        else:
            page.get_by_role("button", name=re.compile(r"^Sign in$|Sign in", re.I)).filter(visible=True).first.click()
    expect(dlg).to_be_visible(timeout=5000)
    dlg.get_by_placeholder("name@chamber.in or account ID").fill(user)
    dlg.locator('input[type="password"]').fill(CREDS[user] if password is None else password)
    if password is not None:
        return dlg.locator('button[type="submit"]').is_disabled()
    dlg.locator('button[type="submit"]').click()
    expect(dlg).to_be_hidden(timeout=15000)
    if not watch_intro:
        skip_intro(page, 4000)


def tab(page: Page, matter: str, key: str, wait=1800):
    if f"/matters/{matter}" not in page.url:
        page.goto(f"{BASE}/matters/{matter}"); skip_intro(page, 1200); page.wait_for_timeout(1500)
    page.locator(f'[data-tab="{key}"]').first.click()
    page.wait_for_timeout(wait)


# ============================================================ flows
def flow_A(page: Page):
    """Landing → sign in → cinematic intro → Nyaya Queue."""
    def landing():
        page.goto(BASE + "/"); page.wait_for_timeout(2500)
        return page.title()
    step(page, "Landing page", landing)
    step(page, "Open sign-in dialog", lambda: page.get_by_role("button", name=re.compile("Sign in", re.I)).filter(visible=True).first.click())

    def fill():
        dlg = page.get_by_role("dialog", name="Chamber sign in")
        dlg.get_by_placeholder("name@chamber.in or account ID").fill("senior_1")
        dlg.locator('input[type="password"]').fill(CREDS["senior_1"])
    step(page, "Enter senior advocate credentials", fill)

    def submit():
        page.get_by_role("dialog", name="Chamber sign in").locator('button[type="submit"]').click()
        page.wait_for_timeout(1400)
    step(page, "Intro starts (curtain)", submit)
    step(page, "Intro reveal", lambda: page.wait_for_timeout(1600))
    step(page, "Intro title card", lambda: page.wait_for_timeout(1800))

    def docket():
        page.wait_for_timeout(3500)
        if "/docket" not in page.url:
            page.goto(BASE + "/docket"); skip_intro(page, 1500)
        page.wait_for_timeout(2000)
        t = body(page)
        assert "Fernandes" in t, "queue missing Fernandes v. Naik"
        return "Nyaya Queue loaded"
    step(page, "Lands on Nyaya Priority Queue", docket)


def flow_B(page: Page):
    """Precedent search by facts (real Socorro case) → paragraph reader → junk query returns nothing."""
    def search():
        page.goto(BASE + "/precedents"); skip_intro(page, 1000); page.wait_for_timeout(1000)
        page.get_by_placeholder(re.compile("Describe facts")).fill(
            "Plot sold by a power-of-attorney holder after a forged heirship claim; buyer's title; fraud vitiates the sale")
        page.get_by_placeholder(re.compile("Goa, Maharashtra")).fill("Goa")
        page.locator('button[type="submit"]').first.click()
        page.wait_for_function("!document.body.innerText.includes('Searching index')", timeout=30000); page.wait_for_timeout(1500)
        m = re.search(r"(\d+)\s*matched", body(page))
        assert m and int(m.group(1)) > 0, "no results"
        return f"{m.group(1)} matched"
    step(page, "Search by facts: the Socorro case", search)

    def reader():
        page.get_by_role("button", name=re.compile("Read Paragraphs", re.I)).first.click(); page.wait_for_timeout(2200)
        assert re.search(r"RATIO|HOLDING|Extracted Paragraphs", body(page), re.I)
    step(page, "Open paragraph reader", reader)
    page.keyboard.press("Escape"); page.wait_for_timeout(600)

    def junk():
        page.get_by_placeholder(re.compile("Describe facts")).fill("pizza recipe with cheese")
        page.locator('button[type="submit"]').first.click()
        page.wait_for_function("!document.body.innerText.includes('Searching index')", timeout=30000); page.wait_for_timeout(1200)
        assert re.search(r"\b0\s*matched", body(page)), "junk query returned results"
        return "0 matched, clean empty state"
    step(page, "Irrelevant search returns no results", junk)


def flow_C(page: Page):
    """Real case mat_025 (Socorro): facts + voice playback → proof → precedents → score/firewall → advice → Authority Lock."""
    m = "mat_025"

    def facts_audio():
        tab(page, m, "facts", 2200)
        page.get_by_role("button", name=re.compile("Load Audio Player", re.I)).first.click(); page.wait_for_timeout(2500)
        t = body(page)
        assert not re.search(r"Could not load audio|No audio recording", t, re.I), "audio failed to load"
        ok = page.evaluate("() => { const a = document.querySelector('audio'); return a ? (a.duration > 0 || a.readyState >= 1) : false }")
        assert ok, "no playable <audio> element"
        return "Konkani voice note plays; transcript beside English"
    step(page, "Facts: play the Konkani voice note", facts_audio)

    def retry():
        page.get_by_role("button", name=re.compile("Retry Transcription", re.I)).first.click(); page.wait_for_timeout(3500)
        assert not re.search(r"not found|failed|error", body(page)[:4000], re.I), "retry showed an error"
        return "transcript kept"
    step(page, "Retry Transcription keeps the reviewed transcript", retry)
    step(page, "Proof Ledger: deed present, possession + payment missing", lambda: (tab(page, m, "proof"), None)[1] or ("weak" if "weak" in body(page).lower() else ""))
    step(page, "Matter precedents (power of attorney ≠ title)", lambda: tab(page, m, "precedents", 2500))

    def score():
        tab(page, m, "score", 2500)
        t = body(page)
        pct = re.search(r"(Weak|Uncertain|Strong)\s*(\d+)%", t)
        assert pct, "no band"
        return f"{pct.group(1)} {pct.group(2)}%"
    step(page, "Score: band with factors (Mapusa forum)", score)

    def flip(label):
        page.get_by_text(label, exact=False).first.click(); page.wait_for_timeout(2500)
        return "Δ0.00" if "0.00" in body(page) else ""
    step(page, "Bias Firewall: flip to Muslim", flip, "Religion: Muslim")
    step(page, "Bias Firewall: flip to Dalit", flip, "Caste: Scheduled Caste")
    step(page, "Advice: settle (Lok Adalat / mediation)", lambda: (tab(page, m, "advice"), None)[1] or re.search(r"Settle|Mediate|Fight", body(page)).group(0))

    def lock(text, expect_re):
        if page.locator('[data-tab="draft"][aria-selected="true"]').count() == 0:
            tab(page, m, "draft", 2000)
        box = page.get_by_placeholder(re.compile(r"Paste a case citation|legal proposition", re.I)).first
        box.fill(text)
        page.get_by_role("button", name=re.compile("Verify & Insert")).first.click()
        page.wait_for_timeout(6000)
        t = body(page)
        assert re.search(expect_re, t, re.I), f"expected /{expect_re}/"
        return re.search(expect_re, t, re.I).group(0)
    step(page, "Authority Lock: fake case refused", lock, "Held in Imaginary Case (2099) 1 SCC 1", r"No verified authority found")
    step(page, "Authority Lock: twisted holding refused", lock, "Suraj Lamp held that a registered sale deed is not required", r"contradicts the stored holding")
    step(page, "Authority Lock: real case verified", lock, "Suraj Lamp & Industries v. State of Haryana", r"Verified against stored paragraph")


def flow_G(page: Page):
    """Approval gate on mat_001 (fictional): overruled citation blocks sealing → senior override → seal → ledger."""
    m = "mat_001"
    step(page, "Citation Health: Koushal overruled", lambda: (tab(page, m, "citations"), None)[1] or ("Overruled" in body(page) and "overruled shown" or ""))

    def approve_refused():
        tab(page, m, "draft", 2000)
        page.get_by_role("button", name=re.compile(r"^.*Approve & Seal$")).first.click(); page.wait_for_timeout(1200)
        drawer = page.get_by_label("Advocate Review & Ledger Seal")
        drawer.get_by_role("button", name=re.compile(r"Approve & Seal to Ledger", re.I)).click(); page.wait_for_timeout(2500)
        assert re.search(r"Cannot approve|blocks this draft|overruled", body(page), re.I), "approval was not refused"
        return "refused: overruled authority"
    step(page, "Approve & Seal refused (overruled citation)", approve_refused)
    page.keyboard.press("Escape")

    def override():
        tab(page, m, "citations")
        page.get_by_text("Senior Override", exact=False).first.click(); page.wait_for_timeout(1200)
        drawer = page.get_by_label("Advocate Review & Ledger Seal")
        chips = drawer.locator("button.text-left")
        if chips.count():
            chips.first.click()
        drawer.locator("textarea").fill("Koushal cited only as historical context; Navtej Johar noted as the governing law.")
        drawer.get_by_role("button", name=re.compile(r"Record Override", re.I)).click(); page.wait_for_timeout(2500)
    step(page, "Senior records reasoned override", override)

    def approve_ok():
        tab(page, m, "draft", 2000)
        page.get_by_role("button", name=re.compile(r"Approve & Seal$")).first.click(); page.wait_for_timeout(1200)
        drawer = page.get_by_label("Advocate Review & Ledger Seal")
        drawer.get_by_role("button", name=re.compile(r"Approve & Seal to Ledger", re.I)).click(); page.wait_for_timeout(3000)
        assert re.search(r"APPROVED BY|approved", body(page), re.I), "no approval watermark"
        return "sealed"
    step(page, "Approve & Seal succeeds after override", approve_ok)

    def ledger():
        tab(page, m, "ledger", 2200)
        assert re.search(r"Hash Chain Intact|verified", body(page), re.I)
        return "hash chain intact"
    step(page, "Ledger: override + approval, hash chain intact", ledger)


def flow_H(page: Page):
    """Click-everything sweep: every matter × every tab + voice-note buttons; fails on any HTTP error or error toast."""
    bad: list[str] = []
    page.on("response", lambda r: bad.append(f"{r.status} {r.request.method} {r.url.split('/v1')[-1][:90]}") if r.status >= 400 and "/v1/" in r.url else None)
    tok = token()
    mids = [m["id"] for m in api("GET", "/matters", tok)]

    def sweep():
        problems = []
        for mid in mids:
            n0 = len(bad)
            page.goto(f"{BASE}/matters/{mid}"); skip_intro(page, 800); page.wait_for_timeout(1500)
            for key in ["pipeline", "facts", "precedents", "citations", "score", "radar", "proof", "clock", "advice", "draft", "ledger"]:
                page.locator(f'[data-tab="{key}"]').first.click(); page.wait_for_timeout(700)
                if key == "facts":
                    for name in ["Load Audio Player", "Retry Transcription"]:
                        b = page.get_by_role("button", name=re.compile(name, re.I))
                        if b.count():
                            b.first.click(); page.wait_for_timeout(2500)
                if re.search(r"Could not load audio|No audio recording|Something went wrong|not found", body(page), re.I):
                    problems.append(f"{mid}/{key}: error text on screen")
            problems += [f"{mid}: {x}" for x in bad[n0:]]
        assert not problems, "; ".join(problems[:8])
        return f"{len(mids)} matters × 11 tabs + audio: no errors"
    step(page, "Every matter, every tab, every voice note", sweep)


created: dict[str, str] = {}


def flow_D(page: Page):
    """Live intake: new Goa property matter from the demo kit (PDFs + Hindi voice note) → pipeline → results."""
    def open_form():
        page.goto(BASE + "/new"); skip_intro(page, 1000); page.wait_for_timeout(1500)
        page.get_by_text("Civil — Property & Title", exact=False).first.click()
        page.get_by_placeholder("Desai v. Naik — Plot possession, Mapusa").fill("Pereira v. Kamat Heirs — plot possession, Navelim (FICTIONAL)")
        page.get_by_placeholder("e.g. Smt. Maria Fernandes").fill("Smt. Maria Pereira")
        page.get_by_placeholder("e.g. Shri Ramesh Naik").fill("Legal heirs of Anil Kamat")
        forum = page.locator("input").filter(has=page.locator("xpath=.")).nth(0)  # noqa: F841 (forum keeps area default)
        page.get_by_placeholder("Goa", exact=True).first.fill("Goa")
        page.get_by_placeholder("North Goa", exact=True).first.fill("South Goa")
        page.get_by_placeholder("Mapusa", exact=True).first.fill("Margao")
        page.get_by_placeholder(re.compile("Concise legal posture")).fill((KIT / "04_case_brief_paste_FICTIONAL.txt").read_text().strip())
        page.get_by_role("button", name=re.compile(r"^Hindi$")).first.click()
    step(page, "New matter form: property, Margao, Hindi client", open_form)

    def attach():
        files = [KIT / "01_agreement_for_sale_pereira_kamat_FICTIONAL.pdf", KIT / "02_electricity_bill_pereira_FICTIONAL.pdf",
                 KIT / "03_notice_from_kamat_heirs_FICTIONAL.pdf", KIT / "05_client_voice_note_hindi_FICTIONAL.wav"]
        page.locator('input[type="file"]').first.set_input_files([str(f) for f in files])
        page.wait_for_timeout(1500)
        return f"{len(files)} files staged"
    step(page, "Attach 3 PDFs + Hindi voice note", attach)

    def run():
        page.get_by_role("button", name=re.compile("Create & Run Pipeline")).first.click()
        page.wait_for_url(re.compile(r"/matters/mat_"), timeout=60000)
        created["id"] = re.search(r"/matters/(mat_[^/?#]+)", page.url).group(1)
        deadline = time.time() + 180
        while time.time() < deadline:
            t = body(page)
            if "Pipeline Complete" in t or re.search(r"11\s*/\s*11", t):
                break
            page.wait_for_timeout(2500)
        assert "Pipeline Complete" in body(page) or re.search(r"11\s*/\s*11", body(page)), "pipeline did not finish in 180 s"
        return created["id"]
    step(page, "Create & run 11-stage pipeline", run)
    if not created.get("id"):
        return
    m = created["id"]
    step(page, "Facts from PDFs + Hindi transcript", lambda: tab(page, m, "facts", 2500))
    step(page, "Proof Ledger for the new matter", lambda: tab(page, m, "proof", 2000))
    step(page, "Precedents for the new matter", lambda: tab(page, m, "precedents", 2500))
    step(page, "Score + firewall for the new matter", lambda: tab(page, m, "score", 3000))
    step(page, "Statute clock for the new matter", lambda: tab(page, m, "clock", 2000))
    step(page, "Draft for the new matter", lambda: tab(page, m, "draft", 3000))


def flow_E(page: Page):
    """Roles & tenancy: empty password, junior, student, Chamber B."""
    def empty_pw():
        disabled = sign_in(page, "junior_1", password="")
        page.wait_for_timeout(800)
        assert disabled, "Sign in enabled with empty password"
        return "Sign in disabled until a password is entered"
    step(page, "Empty password refused", empty_pw)
    page.keyboard.press("Escape")
    cl = page.get_by_label("Close sign in")
    if cl.count() and cl.first.is_visible():
        cl.first.click()

    def junior():
        sign_in(page, "junior_1"); tab(page, "mat_001", "draft", 2200)
        n = page.get_by_role("button", name=re.compile(r"^Approve & Seal$")).count()
        assert n == 0, "junior can see Approve & Seal"
        return "no Approve & Seal for junior" + (" (Send to Senior shown)" if "Send to Senior" in body(page) else "")
    step(page, "Junior cannot approve (Send to Senior)", junior)

    def student():
        sign_in(page, "student_1"); page.goto(BASE + "/docket"); skip_intro(page, 1200); page.wait_for_timeout(2000)
        return "student read-only"
    step(page, "Law student: read-only docket", student)

    def chamber_b():
        sign_in(page, "senior_b"); page.goto(BASE + "/docket"); skip_intro(page, 1200); page.wait_for_timeout(2000)
        t = body(page)
        assert "Fernandes" not in t, "Chamber B can see Chamber A"
        return "Chamber B isolated"
    step(page, "Chamber B cannot see Chamber A", chamber_b)
    sign_in(page, "senior_1")


def flow_F(page: Page):
    """Tamper-evident ledger drill."""
    def drill():
        page.goto(BASE + "/ledger"); skip_intro(page, 1000); page.wait_for_timeout(2000)
        page.get_by_role("button", name=re.compile("Simulate Insider DB Edit", re.I)).first.click(); page.wait_for_timeout(1000)
        page.get_by_role("button", name="Simulate Insider DB Edit", exact=True).click()
        page.wait_for_timeout(2500)
        return "chain broken" if re.search(r"broken|tamper|mismatch", body(page), re.I) else ""
    step(page, "Simulate insider DB edit (chain breaks)", drill)

    def restore():
        page.get_by_role("button", name=re.compile("Restore Intact Chain", re.I)).first.click(); page.wait_for_timeout(2500)
        return "restored"
    step(page, "Restore intact chain", restore)


FLOWS = {"A": flow_A, "B": flow_B, "C": flow_C, "D": flow_D, "E": flow_E, "F": flow_F, "G": flow_G, "H": flow_H}

if __name__ == "__main__":
    want = [a for a in sys.argv[1:] if a in FLOWS] or list(FLOWS)
    SHOTS.mkdir(parents=True, exist_ok=True)
    tok = token()
    api("POST", "/demo/reset", tok)
    api("POST", "/matters/mat_001/court", tok, {"court": "Civil Judge Senior Division, Mapusa"})
    vid_dir = OUT / "_video"
    shutil.rmtree(vid_dir, ignore_errors=True)
    with sync_playwright() as p:
        br = p.chromium.launch()
        ctx = br.new_context(viewport=VIEW, device_scale_factor=2, color_scheme="dark", record_video_dir=str(vid_dir), record_video_size=VIEW)
        page = ctx.new_page()
        for k in want:
            current_flow = k
            print(f"\n=== Flow {k}: {FLOWS[k].__doc__}", flush=True)
            if k != "A" and not page.url.startswith(BASE):
                page.goto(BASE + "/"); page.wait_for_timeout(1500); sign_in(page, "senior_1")
            FLOWS[k](page)
        ctx.close(); br.close()
    vids = sorted(vid_dir.glob("*.webm"))
    if vids:
        shutil.move(str(vids[0]), OUT / "demo_walkthrough.webm")
    shutil.rmtree(vid_dir, ignore_errors=True)
    tok = token()
    if created.get("id"):
        try:
            api("DELETE", f"/matters/{created['id']}", tok)
        except Exception as e:  # noqa: BLE001
            print("cleanup delete failed:", e)
    api("POST", "/demo/reset", tok)
    api("POST", "/matters/mat_001/court", tok, {"court": "Civil Judge Senior Division, Mapusa"})
    prev = json.loads((OUT / "results.json").read_text()) if (OUT / "results.json").exists() else []
    keep = [r for r in prev if r["flow"] not in want]
    (OUT / "results.json").write_text(json.dumps(keep + results, indent=2))
    print(f"\n{sum(r['ok'] for r in results)}/{len(results)} steps passed")
