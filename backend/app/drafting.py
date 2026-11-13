"""Instrument rendering: one structured layout feeds the on-screen preview, the DOCX and the PDF.

Also holds the deterministic paragraph templates used when no LLM is available, so a draft can
always be (re)generated during a demo.
"""
from __future__ import annotations

import html
import io
import re
from typing import Any

from app import registry
from app.config import today as app_today
from app.services.precedents.index import STATE_HC

WATERMARK = "AI-assisted draft. Advocate review required."

# Assertions an LLM might plausibly hallucinate for each area; the Authority Lock withholds them
# because no stored source supports them. Shown in the draft as a "withheld" line.
LOCKED_CLAIMS = {
    "property": "Continuous possession since 2009 under an unregistered GPA automatically confers absolute ownership title.",
    "civil_recovery": "Penal compound interest at 24% p.a. is automatically recoverable without a written stipulation.",
    "commercial": "A commercial suit can be filed without Section 12A pre-institution mediation even when no urgent relief is sought.",
    "cheque_bounce": "A cheque issued as security can never attract Section 138 liability.",
    "consumer": "Every consumer complaint carries automatic punitive damages of ten times the price paid.",
    "rent_tenancy": "A landlord may evict a protected tenant without proving any statutory ground.",
    "family_matrimonial": "The six-month cooling-off period under Section 13B can never be waived.",
    "maintenance": "A working wife is never entitled to maintenance under Section 125 CrPC.",
    "motor_accident": "The insurer is never liable when the driver's licence had expired by one day.",
    "labour": "A workman with 200 days of service is entitled to retrenchment compensation under Section 25F.",
    "writ_service": "A writ lies against a private employer for any service dispute.",
    "criminal": "The accused is entitled to automatic discharge under BNSS s.290 without victim consent.",
    "arbitration": "A Section 34 court may re-appreciate evidence and substitute its own view on merits.",
    "succession_probate": "An unattested Will is valid if the testator's signature is admitted.",
    "intellectual_property": "Registration of a mark always defeats a prior user's passing-off action.",
}


def high_court_for(matter: dict[str, Any]) -> str:
    hc, seat = STATE_HC.get((matter.get("state") or "").lower(), ("", ""))
    if not hc:
        return "HIGH COURT OF JUDICATURE (jurisdictional bench)"
    return f"{hc.upper()}" + (f" AT {seat.upper()}" if seat else "")


def _fill(template: str, ctx: dict[str, str]) -> str:
    return re.sub(r"\{(\w+)\}", lambda m: ctx.get(m.group(1), m.group(0)), template or "")


def _context(matter: dict[str, Any], last: int) -> dict[str, str]:
    title = (matter.get("title") or "").replace(" (FICTIONAL)", "")
    parts = re.split(r"\s+v(?:s)?\.?\s+", title.split(":")[0].split(" — ")[0], maxsplit=1)
    client = matter.get("client_name") or (parts[0].strip() if parts else "our client")
    opposite = matter.get("opposite_party") or (parts[1].strip() if len(parts) > 1 else "the opposite party")
    return {
        "forum": (matter.get("forum_hint") or registry.area(matter.get("case_type", "")).get("forum", "Competent Court")).upper(),
        "district": (matter.get("district") or matter.get("court_seat") or matter.get("state") or "").strip() or "____",
        "state": matter.get("state") or "",
        "title": title,
        "client": client,
        "opposite": opposite,
        "date": app_today().strftime("%d %B %Y"),
        "last": str(last),
        "high_court": high_court_for(matter),
    }


def render(matter: dict[str, Any], draft: dict[str, Any]) -> dict[str, Any]:
    """Structured layout of an instrument, ready for any output format."""
    inst_id = draft.get("type") or "legal_notice"
    inst = registry.instrument(inst_id) or registry.instrument("legal_notice") or {}
    body = [p for p in draft.get("paragraphs", []) if p.get("id") != "p0"]
    numbered: list[dict[str, Any]] = []
    withheld: list[str] = []
    for p in body:
        if p.get("locked_out_claim") and (p.get("text") or "").strip().lower().startswith("no verified authority"):
            withheld.append(p["locked_out_claim"])
            continue
        numbered.append({
            "n": len(numbered) + 1,
            "id": p.get("id"),
            "text": p.get("text", ""),
            "sources": [
                {"title": s.get("title", ""), "court": s.get("court", ""), "date": s.get("date", ""), "paragraph": s.get("paragraph", ""), "url": s.get("url", "")}
                for s in p.get("sources", [])
            ],
            "confidence": p.get("confidence", "medium"),
        })
    ctx = _context(matter, len(numbered))
    left, right = (inst.get("parties") or ["Claimant", "Respondent"])[:2]
    verification = inst.get("verification")
    return {
        "instrument": inst_id,
        "label": inst.get("label", inst_id.replace("_", " ").title()),
        "kind": inst.get("kind", "pleading"),
        "court": _fill(inst.get("court", ""), ctx) if inst.get("kind") != "notice" else "",
        "title": _fill(inst.get("title", ""), ctx),
        "subtitle": _fill(inst.get("subtitle", ""), ctx),
        "cause_title": ctx["title"],
        "parties": {"left_label": left, "left": ctx["client"], "right_label": right, "right": ctx["opposite"]},
        "opening": _fill(inst.get("opening", ""), ctx),
        "paragraphs": numbered,
        "prayer": _fill(inst.get("prayer", ""), ctx),
        "verification": _fill(verification, ctx) if isinstance(verification, str) else "",
        "place_date": f"Place: {ctx['district']}    Date: {ctx['date']}",
        "signature": "Advocate for the " + left.split(" (")[0].split(" /")[0],
        "withheld": withheld,
        "watermark": draft.get("watermark") or WATERMARK,
    }


# ---------------------------------------------------------------- deterministic paragraphs


def template_paragraphs(
    matter: dict[str, Any],
    facts: list[dict[str, Any]],
    corpus_sources: list[dict[str, Any]],
    advice: dict[str, Any],
    instrument_id: str,
    clock: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    case_type = matter.get("case_type", "property")
    area = registry.area(case_type)
    inst = registry.instrument(instrument_id) or {}
    judgments = [s for s in corpus_sources if s.get("kind") == "judgment"]
    statutes = [s for s in corpus_sources if s.get("kind") == "statute"]
    usable = [f for f in facts if f.get("status") in ("documented", "disputed", "alleged") and f.get("statement")]
    documented = [f for f in usable if f["status"] == "documented"] or usable
    paras: list[dict[str, Any]] = []

    def add(text: str, sources: list[dict[str, Any]] | None = None, confidence: str = "high", **extra: Any) -> None:
        paras.append({"id": f"p{len(paras) + 1}", "text": text, "confidence": confidence, "sources": sources or [], **extra})

    for f in documented[:3]:
        stmt = f["statement"].rstrip(".")
        prefix = "It is stated that" if inst.get("kind") == "notice" else "That"
        add(f"{prefix} {stmt[0].lower() + stmt[1:] if len(stmt) > 1 else stmt}.", confidence="high" if f["status"] == "documented" else "medium")
    disputed = [f for f in usable if f["status"] == "disputed"]
    if disputed:
        add(f"That the {('opposite party' if inst.get('kind') == 'notice' else 'other side')} disputes the following, which is denied: {disputed[0]['statement'].rstrip('.')}.", confidence="medium")
    if judgments:
        j = judgments[0]
        add(f"That the law on the point is settled by {j['title']} ({j.get('court') or 'court'}{', ' + j['date'][:4] if j.get('date') else ''}), relied upon for the proposition stated at para {j.get('paragraph', '1')} thereof.", [j])
    if statutes:
        st = statutes[0]
        add(f"That the claim is governed by {st['title']}.", [st])
    if clock and clock.get("applicable") and clock.get("limitation_expires"):
        add(f"That the present proceeding is within limitation under {clock.get('article', 'the Limitation Act, 1963')}; the period expires on {clock['limitation_expires']}.", statutes[:1], confidence="high" if statutes else "medium")
    elif area.get("limitation", {}).get("note"):
        add(f"That {area['limitation']['note'].rstrip('.')}.", confidence="medium")
    rec = (advice or {}).get("recommendation")
    if rec and inst.get("kind") == "notice":
        route = {"mediate": "mediation", "settle": "an amicable settlement", "lok_adalat": "a Lok Adalat settlement", "plea_bargain": "plea bargaining"}.get(rec)
        if route:
            add(f"Without prejudice, our client is open to {route} within the period stated below.", confidence="medium")
    if not paras:
        add(f"That the {area.get('label', 'matter')} arises out of the facts recorded in the client's statement on file.", confidence="low")
    add("No verified authority found.", confidence="low", locked_out_claim=LOCKED_CLAIMS.get(case_type, "The claimant is entitled to automatic relief without proof."))
    return paras


# ---------------------------------------------------------------- exports


def build_docx(rendered: dict[str, Any]) -> bytes:
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Pt

    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Times New Roman"
    style.font.size = Pt(12)

    def centered(text: str, bold: bool = True, size: int = 12) -> None:
        if not text:
            return
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(text)
        r.bold = bold
        r.font.size = Pt(size)

    wm = doc.add_paragraph()
    wr = wm.add_run(f"[{rendered['watermark']}]")
    wr.italic = True
    wr.font.size = Pt(9)
    centered(rendered["court"], size=12)
    centered(rendered["title"], size=13)
    centered(rendered.get("subtitle", ""), bold=False, size=10)
    pt = rendered["parties"]
    if rendered["kind"] == "notice":
        doc.add_paragraph(f"To,\n{pt['right']}  ({pt['right_label']})")
        doc.add_paragraph(f"From: Counsel for {pt['left']}")
        doc.add_paragraph(f"Re: {rendered['cause_title']}")
    else:
        centered(f"{pt['left']}  ...{pt['left_label']}", bold=False)
        centered("Versus", bold=False)
        centered(f"{pt['right']}  ...{pt['right_label']}", bold=False)
    doc.add_paragraph(rendered["opening"])
    for para in rendered["paragraphs"]:
        doc.add_paragraph(f"{para['n']}. {para['text']}")
        for s in para["sources"]:
            sp = doc.add_paragraph()
            sr = sp.add_run(f"     Authority: {s['title']}{', ' + s['court'] if s['court'] else ''}{', ' + s['date'] if s['date'] else ''}, para {s['paragraph']}. {s['url']}")
            sr.font.size = Pt(9)
    if rendered["prayer"]:
        hp = doc.add_paragraph()
        hp.add_run("PRAYER" if rendered["kind"] != "notice" else "DEMAND").bold = True
        doc.add_paragraph(rendered["prayer"])
    if rendered["verification"]:
        doc.add_paragraph(rendered["verification"])
    doc.add_paragraph(rendered["place_date"])
    sig = doc.add_paragraph()
    sig.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    sig.add_run(f"\n\n____________________\n{rendered['signature']}")
    if rendered["withheld"]:
        np_ = doc.add_paragraph()
        nr = np_.add_run("Authority Lock: the following unsupported assertion(s) were withheld from this draft: " + " | ".join(rendered["withheld"]))
        nr.italic = True
        nr.font.size = Pt(8)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def build_pdf(rendered: dict[str, Any]) -> bytes:
    import fitz

    e = html.escape
    pt = rendered["parties"]
    parts = [f"<p class='wm'>[{e(rendered['watermark'])}]</p>"]
    if rendered["court"]:
        parts.append(f"<p class='c b'>{e(rendered['court'])}</p>")
    parts.append(f"<p class='c b big'>{e(rendered['title'])}</p>")
    if rendered.get("subtitle"):
        parts.append(f"<p class='c sm'>{e(rendered['subtitle'])}</p>")
    if rendered["kind"] == "notice":
        parts.append(f"<p>To,<br/>{e(pt['right'])} ({e(pt['right_label'])})</p><p>Re: {e(rendered['cause_title'])}</p>")
    else:
        parts.append(f"<p class='c'>{e(pt['left'])} ...{e(pt['left_label'])}<br/>Versus<br/>{e(pt['right'])} ...{e(pt['right_label'])}</p>")
    parts.append(f"<p>{e(rendered['opening'])}</p>")
    for para in rendered["paragraphs"]:
        parts.append(f"<p>{para['n']}. {e(para['text'])}</p>")
        for s in para["sources"]:
            parts.append(f"<p class='src'>Authority: {e(s['title'])}{', ' + e(s['court']) if s['court'] else ''}{', ' + e(s['date']) if s['date'] else ''}, para {e(str(s['paragraph']))}</p>")
    if rendered["prayer"]:
        parts.append(f"<p class='b'>{'PRAYER' if rendered['kind'] != 'notice' else 'DEMAND'}</p><p>{e(rendered['prayer'])}</p>")
    if rendered["verification"]:
        parts.append(f"<p>{e(rendered['verification'])}</p>")
    parts.append(f"<p>{e(rendered['place_date'])}</p><p class='r'><br/><br/>____________________<br/>{e(rendered['signature'])}</p>")
    if rendered["withheld"]:
        parts.append(f"<p class='wm'>Authority Lock withheld: {e(' | '.join(rendered['withheld']))}</p>")
    css = (
        "body{font-family:serif;font-size:11pt;line-height:1.45} p{margin:0 0 7pt 0;text-align:justify}"
        ".c{text-align:center}.r{text-align:right}.b{font-weight:bold}.big{font-size:12.5pt}.sm{font-size:9pt}"
        ".src{font-size:8.5pt;color:#444;margin-left:18pt}.wm{font-size:8pt;color:#777;font-style:italic}"
    )
    story = fitz.Story(html="<body>" + "".join(parts) + "</body>", user_css=css)
    buf = io.BytesIO()
    writer = fitz.DocumentWriter(buf)
    mediabox = fitz.paper_rect("a4")
    where = mediabox + (64, 64, -64, -64)
    more = True
    while more:
        dev = writer.begin_page(mediabox)
        more, _ = story.place(where)
        story.draw(dev)
        writer.end_page()
    writer.close()
    return buf.getvalue()
