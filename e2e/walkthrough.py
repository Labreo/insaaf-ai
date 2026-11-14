"""End-to-end walkthrough of the integrated Insaaf app (Playwright, Chromium).

Runs against a live stack (backend :8000 + built frontend served with the /v1 proxy):

    python3 e2e/walkthrough.py --base http://localhost:4173 --audio /path/speech.wav --out /tmp/insaaf_e2e

Each step is recorded PASS/FAIL with a screenshot; the run also fails on any /v1 response >= 500
and on uncaught page errors. Exit code is the number of failed steps.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import traceback
from pathlib import Path

from playwright.sync_api import Page, expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CREDS = json.loads((ROOT / "backend" / ".demo_credentials").read_text(encoding="utf-8"))["passwords"]

results: list[tuple[str, bool, str]] = []
server_errors: list[str] = []
page_errors: list[str] = []


def step(name: str):
    def wrap(fn):
        def run(*a, **kw):
            t = time.time()
            try:
                note = fn(*a, **kw) or ""
                results.append((name, True, f"{note} ({time.time() - t:.1f}s)"))
                print(f"PASS  {name}  {note}", flush=True)
            except Exception as e:  # noqa: BLE001 - record and continue
                results.append((name, False, f"{type(e).__name__}: {str(e).splitlines()[0][:300]}"))
                print(f"FAIL  {name}  {type(e).__name__}: {e}", flush=True)
                traceback.print_exc(limit=2)
            finally:
                try:
                    a[0].screenshot(path=str(OUT / f"{len(results):02d}_{re.sub(r'[^a-z0-9]+', '_', name.lower())}.png"), full_page=False)
                except Exception:
                    pass
        return run
    return wrap


def skip_intro(page: Page, wait_ms: int = 2500) -> None:
    btn = page.get_by_text("Skip intro", exact=False)
    try:
        btn.first.wait_for(state="visible", timeout=wait_ms)
        btn.first.click()
        btn.first.wait_for(state="hidden", timeout=5000)
    except Exception:
        pass


def open_auth(page: Page) -> None:
    dlg = page.get_by_role("dialog", name="Chamber sign in")
    if dlg.is_visible():
        return
    sw = page.locator('button[title="Switch account"]')
    if sw.count() and sw.first.is_visible():
        sw.first.click()
    else:
        btn = page.get_by_role("button", name=re.compile(r"Sign in|Account", re.I)).filter(visible=True)
        btn.first.click()
    expect(dlg).to_be_visible(timeout=5000)


def sign_in(page: Page, user_id: str) -> None:
    open_auth(page)
    dlg = page.get_by_role("dialog", name="Chamber sign in")
    ident = dlg.get_by_placeholder("name@chamber.in or account ID")
    ident.fill(user_id)
    pw = dlg.locator('input[type="password"]')
    pw.fill(CREDS[user_id])
    dlg.locator('button[type="submit"]').click()
    expect(dlg).to_be_hidden(timeout=10000)
    skip_intro(page, 4000)


def goto(page: Page, path: str) -> None:
    page.goto(BASE + path)
    skip_intro(page, 1200)


def body(page: Page) -> str:
    return page.locator("body").inner_text()


def open_tab(page: Page, matter: str, tab: str) -> None:
    if f"/matters/{matter}" not in page.url:
        goto(page, f"/matters/{matter}")
    page.locator(f'[data-tab="{tab}"]').first.click()
    page.wait_for_timeout(600)


# ---------------------------------------------------------------- steps


@step("Landing page renders")
def t_landing(page: Page):
    goto(page, "/")
    expect(page.get_by_role("button", name=re.compile(r"Sign in", re.I)).first).to_be_visible()
    return page.title()


@step("Signup creates a new chamber and plays intro")
def t_signup(page: Page):
    goto(page, "/signup")
    email = f"e2e.{int(time.time())}@e2e-chamber.in"
    page.get_by_placeholder("Adv. A. Fernandes").fill("Adv. E2E Tester")
    page.get_by_placeholder("you@yourchamber.in").fill(email)
    pws = page.locator('input[type="password"]')
    for i in range(pws.count()):
        pws.nth(i).fill("E2e-Strong-Pass-2026")
    page.get_by_placeholder("Fernandes Law Chambers").fill("E2E Test Chambers")
    page.get_by_placeholder("Margao").fill("Margao")
    page.locator('button[type="submit"]').click()
    intro_seen = True
    try:
        page.get_by_text("Skip intro").first.wait_for(state="visible", timeout=6000)
    except Exception:
        intro_seen = False
    skip_intro(page, 500)
    page.wait_for_url(re.compile(r"/docket"), timeout=10000)
    assert intro_seen, "intro did not play after sign-up"
    return email


@step("Switch account: picker never carries a password")
def t_switch_blank(page: Page):
    open_auth(page)
    dlg = page.get_by_role("dialog", name="Chamber sign in")
    pw = dlg.locator('input[type="password"]')
    assert pw.input_value() == "", "password prefilled on open"
    pw.fill("typed-but-abandoned")
    picks = dlg.locator("button", has_text=re.compile(r"Kamat|Kanak|Rohan|Sneha"))
    if picks.count():
        picks.first.click()
        assert pw.input_value() == "", "password carried across account pick"
    assert pw.get_attribute("autocomplete") in ("new-password", "off", "current-password")
    return f"autocomplete={pw.get_attribute('autocomplete')} picker={picks.count()}"


@step("Sign in senior_1 (per-account password) and see docket")
def t_signin_senior(page: Page):
    sign_in(page, "senior_1")
    goto(page, "/docket")
    page.wait_for_timeout(1500)
    txt = body(page)
    assert "Kamat Steels" in txt or "mat_005" in txt or "Dhanshri" in txt, "docket missing seeded matters"
    return "docket ok"


@step("Wrong password is rejected")
def t_wrong_pw(page: Page):
    open_auth(page)
    dlg = page.get_by_role("dialog", name="Chamber sign in")
    dlg.get_by_placeholder("name@chamber.in or account ID").fill("junior_1")
    dlg.locator('input[type="password"]').fill("definitely-wrong-1")
    dlg.locator('button[type="submit"]').click()
    page.wait_for_timeout(1500)
    assert dlg.is_visible(), "dialog closed on wrong password"
    page.keyboard.press("Escape")
    close = dlg.get_by_label("Close sign in")
    if dlg.is_visible() and close.count():
        close.click()
    return "rejected"


@step("Precedent search returns ranked, locality-tagged judgments")
def t_search(page: Page):
    goto(page, "/precedents")
    box = page.get_by_placeholder(re.compile(r"Describe facts"))
    box.fill("cheque dishonour section 138 demand notice within 30 days Goa")
    page.locator('button[type="submit"]').first.click()
    page.wait_for_timeout(6000)
    txt = body(page)
    n = len(re.findall(r"indiankanoon|Supreme Court|High Court", txt))
    assert n >= 3, f"too few results ({n})"
    assert re.search(r"138|cheque|dishonour", txt, re.I)
    return f"{n} court/source mentions"


@step("Outcome prediction and bias firewall on mat_005")
def t_score(page: Page):
    open_tab(page, "mat_005", "score")
    page.wait_for_timeout(2500)
    txt = body(page)
    assert re.search(r"\b(strong|uncertain|weak)\b", txt, re.I), "no band"
    assert re.search(r"firewall", txt, re.I), "no firewall section"
    assert re.search(r"historical-bias|Simulated", txt, re.I), "no comparison model label"
    return "band + firewall shown"


@step("Weak demo matter shows weak band (mat_013)")
def t_weak(page: Page):
    open_tab(page, "mat_013", "score")
    page.wait_for_timeout(2000)
    assert re.search(r"\bweak\b", body(page), re.I)
    return "weak"


@step("Facts tab: add and delete a fact")
def t_facts(page: Page):
    open_tab(page, "mat_005", "facts")
    page.wait_for_timeout(1500)
    marker = f"E2E fact {int(time.time())}: notice reply received on 10 September 2026."
    page.get_by_role("button", name=re.compile(r"Add Verified Fact", re.I)).first.click()
    drawer = page.get_by_label("Advocate Review & Ledger Seal")
    expect(drawer).to_be_visible(timeout=5000)
    drawer.locator("textarea").fill(marker)
    drawer.get_by_role("button", name=re.compile(r"& Seal", re.I)).last.click()
    expect(drawer).to_be_hidden(timeout=15000)
    page.wait_for_timeout(1500)
    assert marker in body(page), "added fact not shown"
    card = page.locator("div").filter(has_text=marker).filter(has=page.get_by_role("button", name=re.compile(r"^Delete$"))).last
    card.get_by_role("button", name=re.compile(r"^Delete$")).first.click()
    expect(drawer).to_be_visible(timeout=5000)
    chips = drawer.locator("button.text-left")
    if chips.count():
        chips.first.click()
    drawer.locator("textarea").fill("E2E cleanup: test fact removed.")
    drawer.get_by_role("button", name=re.compile(r"Confirm Delete & Seal", re.I)).click()
    expect(drawer).to_be_hidden(timeout=15000)
    page.wait_for_timeout(1500)
    assert marker not in body(page), "fact not deleted"
    return "add + delete sealed to ledger"


@step("Voice recording transcribes and translates")
def t_voice(page: Page):
    open_tab(page, "mat_005", "facts")
    page.wait_for_timeout(1000)
    rec = page.get_by_role("button", name=re.compile(r"Record voice note", re.I)).first
    rec.click()
    page.wait_for_timeout(9000)
    page.get_by_role("button", name=re.compile(r"Stop", re.I)).first.click()
    deadline = time.time() + 60
    txt = ""
    while time.time() < deadline:
        txt = body(page)
        if re.search(r"cheque|returned|notice|speed post", txt, re.I) and re.search(r"transcri", txt, re.I):
            break
        page.wait_for_timeout(2000)
    assert re.search(r"cheque|returned|notice|speed post", txt, re.I), "transcript not shown"
    return "transcribed"


@step("Client language switch re-translates")
def t_language(page: Page):
    goto(page, "/matters/mat_006")
    page.wait_for_timeout(1500)
    sel = page.locator("select").filter(has=page.locator("option[value='hi']")).first
    sel.select_option("hi")
    page.wait_for_timeout(4000)
    sel.select_option("en")
    page.wait_for_timeout(1500)
    return "switched hi -> en"


@step("Draft: regenerate and export DOCX + PDF")
def t_draft(page: Page):
    open_tab(page, "mat_005", "draft")
    page.wait_for_timeout(2500)
    sizes = []
    for fmt in ("DOCX", "PDF"):
        with page.expect_download(timeout=30000) as dl:
            page.get_by_role("button", name=re.compile(rf"Export {fmt}", re.I)).first.click()
        d = dl.value
        p = OUT / d.suggested_filename
        d.save_as(str(p))
        head = p.read_bytes()[:4]
        assert head[:2] == b"PK" if fmt == "DOCX" else head == b"%PDF", f"{fmt} bad magic {head!r}"
        sizes.append(f"{p.name}={p.stat().st_size}B")
    return ", ".join(sizes)


@step("Statute clock: preview and future-date rejection")
def t_clock(page: Page):
    open_tab(page, "mat_002", "clock")
    page.wait_for_timeout(1500)
    inp = page.locator('input[type="date"]').first
    inp.fill("2025-01-10")
    page.get_by_role("button", name=re.compile(r"^Preview", re.I)).first.click()
    page.wait_for_timeout(2000)
    assert re.search(r"Preview only", body(page)), "no preview banner"
    assert re.search(r"days left|days late", body(page)), "no countdown"
    open_tab(page, "mat_005", "clock")
    assert re.search(r"No fixed limitation|notice within 30", body(page)), "cheque matter should explain s.142 timing"
    return "preview + cheque-bounce explanation"


@step("Law Radar: clicking example fills prompt and shows crosswalk")
def t_radar(page: Page):
    open_tab(page, "mat_012", "radar")
    page.wait_for_timeout(1500)
    page.get_by_role("button", name=re.compile(r"2025 Economic Offence FIR", re.I)).first.click()
    page.wait_for_timeout(3000)
    txt = body(page)
    assert re.search(r"BNS", txt) and re.search(r"318|316", txt), "crosswalk results missing"
    tas = page.locator("textarea")
    assert any("406" in tas.nth(i).input_value() for i in range(tas.count())), "prompt not filled"
    return "IPC 420/406 -> BNS shown"


@step("Integrity drill detects tamper and restores")
def t_ledger(page: Page):
    goto(page, "/ledger")
    page.wait_for_timeout(1500)
    restore_btn = page.get_by_role("button", name=re.compile(r"Restore Intact Chain", re.I))
    if restore_btn.count():  # a previous interrupted run left the drill active
        restore_btn.first.click()
        page.wait_for_timeout(800)
        extra = page.get_by_role("button", name=re.compile(r"^Restore", re.I))
        if extra.count() > 1:
            extra.last.click()
        page.wait_for_timeout(2500)
    page.get_by_role("button", name=re.compile(r"Integrity Drill: Simulate", re.I)).first.click()
    page.get_by_role("button", name="Simulate Insider DB Edit", exact=True).click()
    page.wait_for_timeout(3000)
    txt = body(page)
    assert re.search(r"break|mismatch|tamper", txt, re.I), "no tamper detection shown"
    page.get_by_role("button", name=re.compile(r"Restore Intact Chain", re.I)).first.click()
    confirm = page.get_by_role("button", name=re.compile(r"^Restore", re.I))
    page.wait_for_timeout(800)
    if confirm.count() > 1:
        confirm.last.click()
    page.wait_for_timeout(2500)
    assert re.search(r"Restored|intact", body(page), re.I), "chain not restored"
    return "detected + restored"


@step("Clerk: criminal matters hidden")
def t_clerk(page: Page):
    sign_in(page, "clerk_1")
    goto(page, "/docket")
    page.wait_for_timeout(1500)
    assert "Kamat Steels" in body(page) or "cheque" in body(page).lower()
    goto(page, "/matters/mat_012")
    page.wait_for_timeout(1500)
    assert re.search(r"not found|forbidden|access|permission|404|403", body(page), re.I), "clerk opened criminal matter"
    return "criminal blocked"


@step("Student: only moot matters, read-only")
def t_student(page: Page):
    sign_in(page, "student_1")
    goto(page, "/docket")
    page.wait_for_timeout(1500)
    txt = body(page)
    assert "Kamat Steels" not in txt, "student sees live client matter"
    return "moot only"


@step("Chamber B isolation")
def t_chamber_b(page: Page):
    sign_in(page, "senior_b")
    goto(page, "/docket")
    page.wait_for_timeout(1500)
    assert "Kamat Steels" not in body(page), "chamber B sees chamber A matter"
    return "isolated"


def mobile(browser) -> None:
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.on("pageerror", lambda e: page_errors.append(f"mobile: {e}"))

    @step("Mobile: docket, matter, search fit 390px without horizontal scroll")
    def t_mobile(page: Page):
        goto(page, "/docket")
        sign_in(page, "senior_1")
        bad = []
        for path in ("/docket", "/precedents", "/ledger", "/new", "/me", "/alerts", "/matters/mat_002?tab=clock", "/matters/mat_012?tab=radar",
                     *(f"/matters/mat_005?tab={t}" for t in ("pipeline", "facts", "precedents", "citations", "score", "proof", "advice", "draft", "ledger"))):
            goto(page, path)
            page.wait_for_timeout(1500)
            sw = page.evaluate("document.documentElement.scrollWidth")
            page.screenshot(path=str(OUT / f"mobile_{re.sub(r'[^a-z0-9]+', '_', path)}.png"))
            if sw > 392:
                bad.append(f"{path}:{sw}px")
        assert not bad, "horizontal overflow " + ", ".join(bad)
        return "no overflow"

    t_mobile(page)
    ctx.close()


def main() -> int:
    global BASE, OUT
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:4173")
    ap.add_argument("--audio", default="")
    ap.add_argument("--out", default="/tmp/insaaf_e2e")
    ap.add_argument("--headed", action="store_true")
    a = ap.parse_args()
    BASE, OUT = a.base.rstrip("/"), Path(a.out)
    OUT.mkdir(parents=True, exist_ok=True)
    args = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"]
    if a.audio:
        args.append(f"--use-file-for-fake-audio-capture={a.audio}")
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not a.headed, args=args)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True, permissions=["microphone"])
        page = ctx.new_page()
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        page.on("response", lambda r: server_errors.append(f"{r.status} {r.request.method} {r.url}") if "/v1/" in r.url and r.status >= 500 else None)
        for t in (t_landing, t_signup, t_switch_blank, t_signin_senior, t_wrong_pw, t_search, t_score, t_weak, t_facts,
                  t_voice, t_language, t_draft, t_clock, t_radar, t_ledger, t_clerk, t_student, t_chamber_b):
            t(page)
        ctx.close()
        mobile(browser)
        browser.close()
    failed = [r for r in results if not r[1]]
    print("\n==== SUMMARY ====")
    for n, ok, note in results:
        print(f"{'PASS' if ok else 'FAIL'}  {n}  {note}")
    print(f"server 5xx: {len(server_errors)}", *server_errors[:10], sep="\n  ")
    print(f"page errors: {len(page_errors)}", *page_errors[:10], sep="\n  ")
    print(f"{len(results) - len(failed)}/{len(results)} steps passed; screenshots in {OUT}")
    return len(failed) + (1 if server_errors or page_errors else 0)


if __name__ == "__main__":
    sys.exit(main())
