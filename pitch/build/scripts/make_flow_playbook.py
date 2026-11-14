"""Build the demo-flow playbook for the team: pitch/DEMO_FLOWS.md and pitch/Insaaf_AI_Demo_Flows.pdf.
Screens come from run_flows.py (pitch/flows/screens). python3 pitch/build/scripts/make_flow_playbook.py"""
import json
from pathlib import Path

from PIL import Image
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Image as RLImage, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

PITCH = Path(__file__).resolve().parents[2]
FLOWS = PITCH / "flows"
RES = {r["shot"].split("/")[-1].split("_", 1)[0]: r for r in json.loads((FLOWS / "results.json").read_text())}

# (id, action, say, expect) per step; ids match flows/screens/<id>_*.png
FLOWS_SPEC = [
    ("A", "Sign in and the cinematic intro (LIVE DEMO, part 1)", "On the final slide, click “▶ Live demo · sign in” (it opens http://localhost:4173/). This is where the live demo starts.", [
        ("A01", "Landing page is on screen. Don’t scroll.", "“This is Insaaf AI: a chamber workbench for advocates.”", "Landing page with Sign in / Enter Workbench."),
        ("A02", "Click **Sign in** (top right).", "", "“Chamber sign in” dialog opens."),
        ("A03", "Account ID `senior_1`, password from `backend/.demo_credentials`.", "“I’m signing in as Adv. Dhanshri, the senior advocate.”", "Fields filled; Sign in button enabled."),
        ("A04", "Click **Sign in**. Don’t touch anything while the intro plays (~4–7 s).", "Let the intro play: no talking over the reveal.", "Lady Justice line-art reveal, then the Insaaf AI title."),
        ("A05", "(intro hands over by itself)", "", "Chamber Docket appears behind the fading intro."),
        ("A07", "Intro ends by itself on Overview.", "“The Nyaya Queue ranks every matter by limitation urgency, proof gaps and review state.”", "Queue shows Fernandes v. Naik with 40d / title missing / overruled citation."),
    ]),
    ("B", "Precedent search by facts (MVP 1) on the real Socorro case", "Sidebar → Precedent Discovery.", [
        ("B01", "Paste: *Plot sold by a power-of-attorney holder after a forged heirship claim; buyer's title; fraud vitiates the sale*. State boost: `Goa`. Click **Search Precedents**.",
         "“This is the Socorro land-grab case from the news. Plain-language facts in, binding authority first, and how courts actually ruled.”", "Results in well under a second, outcome tiles, binding Supreme Court / Bombay HC cards; a power of attorney does not transfer title."),
        ("B02", "Click **Read Paragraphs** on a card.", "“Every hit opens to the paragraph. Nothing is paraphrased away.”", "Slide-over with Ratio/Holding, headnote, numbered paragraphs, Open full judgment."),
        ("B03", "(Only if a judge asks.) Search something non-legal, e.g. *pizza recipe with cheese*.", "“A bad query gives no results, not noise.”", "0 matched, clean empty state."),
    ]),
    ("C", "The real Socorro case end to end (MVP 2 + trust)", "Press Esc, open Overview → **Plot 7 purchaser v. Legal heir … Socorro** (mat_025). Built from Northeast News, 24 Sep 2026; our client is a hypothetical, unnamed buyer.", [
        ("C01", "Tab **Facts** → click **Load Audio Player** and play the Konkani voice note.", "“She told us in Konkani. We keep the original beside the English, and an allegation never becomes a fact.”", "Audio plays; Konkani transcript + English translation; facts from the news report and her deed."),
        ("C02", "Click **Retry Transcription**.", "", "The reviewed transcript stays; no error."),
        ("C03", "Tab **Proof Ledger**.", "“Paper isn't enough: Form I & XIV isn't in her name, no possession evidence, cash with no receipt.”", "Deed + stamp duty present; Form I & XIV weak; possession + payment trail missing."),
        ("C04", "Tab **Precedents**.", "“Matter-specific search: power of attorney, inventory, heir, title.”", "Supporting and adverse authorities with outcomes, binding court first."),
        ("C05", "Tab **Score & Bias Firewall** (forum Civil Judge Senior Division, Mapusa).", "“Uncertain, 61%, and every factor is shown.”", "Uncertain 61%; blend 50/30/20; registered deed +0.37, possession missing −0.10."),
        ("C06", "In the firewall grid click **Religion: Muslim**.", "“Identity can't move our score. If it moved more than 0.02 we'd withhold it.”", "Firewalled Δ 0.00; unprotected model drifts."),
        ("C07", "Click **Caste: Scheduled Caste (Dalit)**.", "", "Firewalled Δ 0.00 again."),
        ("C08", "Tab **Advice**.", "“Deterministic rules turn the evidence into a strategy: settle.”", "Settle; Lok Adalat and s.89 CPC mediation eligible."),
        ("C09", "Tab **Draft** → Authority Lock: `Held in Imaginary Case (2099) 1 SCC 1` → **Verify & Insert**.", "“A case that doesn't exist cannot enter the draft.”", "“No verified authority found.”"),
        ("C10", "`Suraj Lamp held that a registered sale deed is not required` → **Verify & Insert**.", "“A real case with a twisted holding is refused too.”", "“Claim contradicts the stored holding of this authority.”"),
        ("C11", "`Suraj Lamp & Industries v. State of Haryana` → **Verify & Insert**.", "“The real one goes in, tied to its source paragraph.”", "“Verified against stored paragraph (… para 1).”"),
    ]),
    ("D", "Live intake: the judges’ “new matter” moment (optional, ~2 min)", "Uses `pitch/demo_kit/` (all fictional). Runs the real pipeline: needs network + LLM quota, ~40–60 s.", [
        ("D01", "Click **New matter**. Practice area **Civil — Property & Title**; title *Pereira v. Kamat Heirs — plot possession, Navelim (FICTIONAL)*; client *Smt. Maria Pereira*; opposite *Legal heirs of Anil Kamat*; state Goa, district South Goa, seat Margao; paste `04_case_brief_paste_FICTIONAL.txt` into the summary; client language **Hindi**.",
         "“Let’s take a matter the system has never seen.”", "Form filled."),
        ("D02", "Click **Upload PDF / DOCX** and select `01_…agreement…pdf`, `02_…electricity_bill…pdf`, `03_…notice…pdf`, `05_client_voice_note_hindi_FICTIONAL.wav`.", "", "4 files staged."),
        ("D03", "Click **Create & Run Pipeline**. Talk over the progress ring.", "“Eleven stages: intake, facts, proof, clock, search, RAG, citations, score, advice, draft.”", "Pipeline Complete 11/11."),
        ("D04", "Tab **Facts**.", "“The Hindi voice note is transcribed and translated, kept beside the original.”", "Hindi transcript + English translation; facts from the agreement."),
        ("D05", "Tab **Proof Ledger**.", "", "Registered sale deed MISSING; possession and Form I & XIV present."),
        ("D06", "Tab **Precedents**.", "", "Authorities for the new matter."),
        ("D07", "Tab **Score & Bias Firewall**.", "", "Weak band (~41%) with factors; firewall passed."),
        ("D08", "Tab **Statute Clock**.", "“Limitation is computed by rules, with the date it assumed shown.”", "Art. 65 (possession based on title), cause date from the documents."),
        ("D09", "Tab **Draft**.", "", "AI-assisted legal notice, watermarked for review."),
    ]),
    ("E", "Judge challenges: roles and tenancy (only if asked)", "Use **Switch account** (sidebar).", [
        ("E01", "Open sign in, enter `junior_1` with an empty password.", "“No password, no entry.”", "Sign in button stays disabled."),
        ("E02", "Sign in as `junior_1`, open Fernandes v. Naik → Draft.", "“A junior can’t approve.”", "No Approve & Seal; only Send to Senior."),
        ("E03", "Sign in as `student_1`.", "“Law students get read-only access.”", "Docket visible, destructive controls disabled."),
        ("E04", "Sign in as `senior_b` (Chamber B).", "“Another chamber can’t see this chamber’s matters.”", "Only Chamber B’s matter; no Fernandes."),
    ]),
    ("F", "Tamper-evident ledger drill (only if asked)", "Sidebar → Audit ledger (senior only).", [
        ("F01", "Click **Integrity Drill: Simulate Insider DB Edit** → confirm **Simulate Insider DB Edit**.", "“Someone edits the database directly…”", "Chain verification breaks, the altered entry is flagged."),
        ("F02", "Click **Restore Intact Chain**.", "“…and the chain catches it.”", "Integrity Drill · Chain Restored & Verified."),
    ]),
    ("G", "Approval gate on the fictional Mapusa matter (only if asked)", "Open **Fernandes v. Naik** (mat_001): it carries an overruled citation by design.", [
        ("G01", "Tab **Citations**.", "“The citator reads later judgments: Koushal was overruled by Navtej Johar.”", "Red Overruled badge; “Blocks final draft sealing”."),
        ("G02", "Tab **Draft** → **Approve & Seal** → **Approve & Seal to Ledger**.", "“Overruled law blocks sealing.”", "Refused: “1 overruled authority blocks this draft…”."),
        ("G03", "Tab **Citations** → **Senior Override →**; pick a reason, one line, **Record Override**.", "“Only a senior can override, with a reason, and it's ledgered.”", "Override recorded."),
        ("G04", "**Draft** → **Approve & Seal** → **Approve & Seal to Ledger**.", "", "“APPROVED BY senior_1 (SENIOR)”."),
        ("G05", "Tab **Ledger**.", "“Change a past entry and verification breaks.”", "Override + approval; Hash Chain Intact."),
    ]),
    ("H", "Automated click-everything check (run before going on stage)", "`python3 pitch/build/scripts/run_flows.py H`: opens every matter, every tab, every voice-note button.", [
        ("H01", "(automated)", "", "No HTTP errors, no “Could not load audio”/“not found” anywhere."),
    ]),
]

SETUP = [
    "Backend: `backend/scripts/start_demo.sh` (starts :8000, checks health, resets the demo matters).",
    "Frontend: `cd frontend && npm run build && npm run preview -- --port 4173`.",
    "Check: `curl -s localhost:8000/v1/health/deep` → db, llm, precedent_index all `ok`.",
    "Passwords: `backend/.demo_credentials` (senior_1 = Adv. Dhanshri, junior_1, clerk_1, student_1, senior_b).",
    "Browser at 1440–1600 px wide, signed **out**, on http://localhost:4173/ so the demo starts from sign-in and the intro plays.",
    "After any rehearsal: `curl -X POST localhost:8000/v1/demo/reset -H \"Authorization: Bearer <senior token>\"` (or re-run start_demo.sh). Rehearsals change mat_001 (override + approval).",
    "Automated check of every flow: `python3 pitch/build/scripts/run_flows.py` (A–H, ~10 min, resets afterwards). `run_flows.py H` alone checks every button in ~2 min.",
]

LIVE_ORDER = "A (sign in + intro) → B01–B02 (search the real Socorro case) → C01–C11 (voice note, proof, precedents, score, firewall, advice, Authority Lock). D (live intake), E (roles), F (ledger drill) and G (approval gate) are extras for judge questions. Run H before going on stage."


def shot(sid):
    r = RES.get(sid)
    return (FLOWS / r["shot"]) if r else None


def status(sid):
    r = RES.get(sid)
    return "✅ passed" if r and r["ok"] else ("❌ failed" if r else "—")


def write_md():
    L = ["# Insaaf AI — Demo Flows Playbook", "",
         "Every flow below was run end to end against the live app with `pitch/build/scripts/run_flows.py`; each step has its real screenshot in [`flows/screens/`](flows/screens/). A full screen recording of the run is [`flows/demo_walkthrough.webm`](flows/demo_walkthrough.webm) (fallback if the live demo fails).", "",
         "## Setup (30 minutes before)", ""]
    L += [f"{i}. {s}" for i, s in enumerate(SETUP, 1)]
    L += ["", "## What we demo live", "", LIVE_ORDER, "",
          "## Inputs to keep ready ([`demo_kit/`](demo_kit/))", "",
          "| File | Use |", "|---|---|",
          "| `01_agreement_for_sale_pereira_kamat_FICTIONAL.pdf` | Flow D: agreement for sale + GPA, no registered deed |",
          "| `02_electricity_bill_pereira_FICTIONAL.pdf` | Flow D: possession evidence |",
          "| `03_notice_from_kamat_heirs_FICTIONAL.pdf` | Flow D: the heirs’ legal notice (cause of action) |",
          "| `04_case_brief_paste_FICTIONAL.txt` | Flow D: paste into the matter summary |",
          "| `05_client_voice_note_hindi_FICTIONAL.wav` / `.m4a` | Flow D: client statement in Hindi (macOS synthetic voice) + transcript `.txt` |",
          "| `B1_dsouza_invoice_fictional.pdf`, `B2_…intake_note…docx`, `B3_…acknowledgment…docx` | Backup live intake (civil recovery), see `demo/matters/live_upload_demo/README.md` |",
          "| Seeded `mat_001` docs (`demo/matters/mat_001/`) | Already loaded: agreement, intake notes, Konkani voice note |", ""]
    for fid, title, intro, steps in FLOWS_SPEC:
        L += [f"## Flow {fid} · {title}", "", intro, "", "| # | Do | Say | Expect | Tested |", "|---|---|---|---|---|"]
        for sid, do, say, exp in steps:
            sp = shot(sid)
            link = f"[{sid}](flows/{RES[sid]['shot']})" if sp else sid
            L.append(f"| {link} | {do} | {say or '—'} | {exp} | {status(sid)} |")
        L.append("")
    L += ["## Known limits to keep in mind", "",
          "- Payment trail reads *missing* when part of the price was paid in cash without a receipt (the rule treats “no receipt” as missing). Legal lead to confirm whether that should be *weak*.",
          "- Live intake (flow D) depends on the LLM (Groq) and takes ~40–60 s; seeded matters are instant.",
          "- Don’t re-run the pipeline on mat_001 live; the band can change.",
          "- Don’t reload mid-demo (the intro replays on full reload, which is fine only at the start)."]
    (PITCH / "DEMO_FLOWS.md").write_text("\n".join(L) + "\n", encoding="utf-8")


def md_inline(t):
    import re
    t = t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"`(.+?)`", r"<font face='Courier'>\1</font>", t)
    t = re.sub(r"\*(.+?)\*", r"<i>\1</i>", t)
    return t.replace("“", '"').replace("”", '"').replace("’", "'").replace("…", "...").replace("→", "->").replace("·", "-").replace("—", "-").replace("–", "-").replace("Δ", "delta ").replace("✅", "").replace("❌", "")


def write_pdf():
    out = PITCH / "Insaaf_AI_Demo_Flows.pdf"
    doc = SimpleDocTemplate(str(out), pagesize=landscape(A4), leftMargin=14 * mm, rightMargin=14 * mm, topMargin=12 * mm, bottomMargin=12 * mm,
                            title="Insaaf AI - Demo Flows Playbook", author="Team Insaaf AI")
    H1 = ParagraphStyle("h1", fontName="Times-Bold", fontSize=22, leading=26, spaceAfter=6, textColor=colors.HexColor("#8C6A3A"))
    H2 = ParagraphStyle("h2", fontName="Times-Bold", fontSize=15, leading=19, spaceBefore=4, spaceAfter=4, textColor=colors.HexColor("#8C6A3A"))
    B = ParagraphStyle("b", fontName="Helvetica", fontSize=9.5, leading=12.5, alignment=TA_LEFT)
    S = ParagraphStyle("s", parent=B, fontSize=8.5, leading=11)
    W = landscape(A4)[0] - 28 * mm
    story = [Paragraph("Insaaf AI - Demo Flows Playbook", H1),
             Paragraph("Every step was run against the live app (pitch/build/scripts/run_flows.py, 14 Nov 2026). Screenshots are the real results. All matters and people are fictional.", B), Spacer(1, 6),
             Paragraph("Setup (30 minutes before)", H2)]
    story += [Paragraph(f"{i}. {md_inline(s)}", B) for i, s in enumerate(SETUP, 1)]
    story += [Spacer(1, 6), Paragraph("What we demo live", H2), Paragraph(md_inline(LIVE_ORDER), B), Spacer(1, 6),
              Paragraph("Inputs (pitch/demo_kit/)", H2),
              Paragraph("Flow D: 01 agreement for sale (PDF), 02 electricity bill (PDF), 03 heirs' legal notice (PDF), 04 case brief to paste (TXT), 05 Hindi client voice note (WAV/M4A + transcript). Backup intake: B1-B3 D'Souza civil-recovery files.", B),
              PageBreak()]
    for fid, title, intro, steps in FLOWS_SPEC:
        story += [Paragraph(f"Flow {fid} - {md_inline(title)}", H2), Paragraph(md_inline(intro), B), Spacer(1, 4)]
        for sid, do, say, exp in steps:
            sp = shot(sid)
            img = None
            if sp and sp.exists():
                im = Image.open(sp)
                iw = 128 * mm
                jp = Path("/private/tmp/claude-501/-Users-sanjaywaradkar-learning-hackathons-insaaf/848611d6-3b40-44c3-9a83-2f99d61ec1c9/scratchpad") / (sid + ".jpg")
                im.convert("RGB").resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS).save(jp, quality=82)
                img = RLImage(str(jp), width=iw, height=iw * im.height / im.width)
            txt = [Paragraph(f"<b>{sid}</b>  {md_inline(status(sid))}", B), Spacer(1, 3),
                   Paragraph("<b>Do:</b> " + md_inline(do), B), Spacer(1, 3)]
            if say:
                txt += [Paragraph("<b>Say:</b> " + md_inline(say), B), Spacer(1, 3)]
            txt += [Paragraph("<b>Expect:</b> " + md_inline(exp), S)]
            t = Table([[txt, img or ""]], colWidths=[W - 132 * mm, 132 * mm])
            t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.HexColor("#CCCCCC")),
                                   ("BOTTOMPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 6)]))
            story.append(KeepTogether([t]))
        story.append(PageBreak())
    doc.build(story)
    return out


if __name__ == "__main__":
    write_md()
    print("pdf ->", write_pdf())
