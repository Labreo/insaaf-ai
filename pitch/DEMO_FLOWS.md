# Insaaf AI — Demo Flows Playbook

Every flow below was run end to end against the live app with `pitch/build/scripts/run_flows.py`; each step has its real screenshot in [`flows/screens/`](flows/screens/). A full screen recording of the run is [`flows/demo_walkthrough.webm`](flows/demo_walkthrough.webm) (fallback if the live demo fails).

## Setup (30 minutes before)

1. Backend: `backend/scripts/start_demo.sh` (starts :8000, checks health, resets the demo matters).
2. Frontend: `cd frontend && npm run build && npm run preview -- --port 4173`.
3. Check: `curl -s localhost:8000/v1/health/deep` → db, llm, precedent_index all `ok`.
4. Passwords: `backend/.demo_credentials` (senior_1 = Adv. Dhanshri, junior_1, clerk_1, student_1, senior_b).
5. Browser at 1440–1600 px wide, signed **out**, on http://localhost:4173/ so the demo starts from sign-in and the intro plays.
6. After any rehearsal: `curl -X POST localhost:8000/v1/demo/reset -H "Authorization: Bearer <senior token>"` (or re-run start_demo.sh). Rehearsals change mat_001 (override + approval).
7. Automated check of every flow: `python3 pitch/build/scripts/run_flows.py` (A–H, ~10 min, resets afterwards). `run_flows.py H` alone checks every button in ~2 min.

## What we demo live

A (sign in + intro) → B01–B02 (search the real Socorro case) → C01–C11 (voice note, proof, precedents, score, firewall, advice, Authority Lock). D (live intake), E (roles), F (ledger drill) and G (approval gate) are extras for judge questions. Run H before going on stage.

## Inputs to keep ready ([`demo_kit/`](demo_kit/))

| File | Use |
|---|---|
| `01_agreement_for_sale_pereira_kamat_FICTIONAL.pdf` | Flow D: agreement for sale + GPA, no registered deed |
| `02_electricity_bill_pereira_FICTIONAL.pdf` | Flow D: possession evidence |
| `03_notice_from_kamat_heirs_FICTIONAL.pdf` | Flow D: the heirs’ legal notice (cause of action) |
| `04_case_brief_paste_FICTIONAL.txt` | Flow D: paste into the matter summary |
| `05_client_voice_note_hindi_FICTIONAL.wav` / `.m4a` | Flow D: client statement in Hindi (macOS synthetic voice) + transcript `.txt` |
| `B1_dsouza_invoice_fictional.pdf`, `B2_…intake_note…docx`, `B3_…acknowledgment…docx` | Backup live intake (civil recovery), see `demo/matters/live_upload_demo/README.md` |
| Seeded `mat_001` docs (`demo/matters/mat_001/`) | Already loaded: agreement, intake notes, Konkani voice note |

## Flow A · Sign in and the cinematic intro (LIVE DEMO, part 1)

On the final slide, click “▶ Live demo · sign in” (it opens http://localhost:4173/). This is where the live demo starts.

| # | Do | Say | Expect | Tested |
|---|---|---|---|---|
| [A01](flows/screens/A01_landing_page.png) | Landing page is on screen. Don’t scroll. | “This is Insaaf AI: a chamber workbench for advocates.” | Landing page with Sign in / Enter Workbench. | ✅ passed |
| [A02](flows/screens/A02_open_sign_in_dialog.png) | Click **Sign in** (top right). | — | “Chamber sign in” dialog opens. | ✅ passed |
| [A03](flows/screens/A03_enter_senior_advocate_credentials.png) | Account ID `senior_1`, password from `backend/.demo_credentials`. | “I’m signing in as Adv. Dhanshri, the senior advocate.” | Fields filled; Sign in button enabled. | ✅ passed |
| [A04](flows/screens/A04_intro_starts_curtain.png) | Click **Sign in**. Don’t touch anything while the intro plays (~4–7 s). | Let the intro play: no talking over the reveal. | Lady Justice line-art reveal, then the Insaaf AI title. | ✅ passed |
| [A05](flows/screens/A05_intro_reveal.png) | (intro hands over by itself) | — | Chamber Docket appears behind the fading intro. | ✅ passed |
| [A07](flows/screens/A07_lands_on_nyaya_priority_queue.png) | Intro ends by itself on Overview. | “The Nyaya Queue ranks every matter by limitation urgency, proof gaps and review state.” | Queue shows Fernandes v. Naik with 40d / title missing / overruled citation. | ✅ passed |

## Flow B · Precedent search by facts (MVP 1) on the real Socorro case

Sidebar → Precedent Discovery.

| # | Do | Say | Expect | Tested |
|---|---|---|---|---|
| [B01](flows/screens/B01_search_by_facts_the_socorro_case.png) | Paste: *Plot sold by a power-of-attorney holder after a forged heirship claim; buyer's title; fraud vitiates the sale*. State boost: `Goa`. Click **Search Precedents**. | “This is the Socorro land-grab case from the news. Plain-language facts in, binding authority first, and how courts actually ruled.” | Results in well under a second, outcome tiles, binding Supreme Court / Bombay HC cards; a power of attorney does not transfer title. | ✅ passed |
| [B02](flows/screens/B02_open_paragraph_reader.png) | Click **Read Paragraphs** on a card. | “Every hit opens to the paragraph. Nothing is paraphrased away.” | Slide-over with Ratio/Holding, headnote, numbered paragraphs, Open full judgment. | ✅ passed |
| [B03](flows/screens/B03_irrelevant_search_returns_no_results.png) | (Only if a judge asks.) Search something non-legal, e.g. *pizza recipe with cheese*. | “A bad query gives no results, not noise.” | 0 matched, clean empty state. | ✅ passed |

## Flow C · The real Socorro case end to end (MVP 2 + trust)

Press Esc, open Overview → **Plot 7 purchaser v. Legal heir … Socorro** (mat_025). Built from Northeast News, 24 Sep 2026; our client is a hypothetical, unnamed buyer.

| # | Do | Say | Expect | Tested |
|---|---|---|---|---|
| [C01](flows/screens/C01_facts_play_the_konkani_voice_note.png) | Tab **Facts** → click **Load Audio Player** and play the Konkani voice note. | “She told us in Konkani. We keep the original beside the English, and an allegation never becomes a fact.” | Audio plays; Konkani transcript + English translation; facts from the news report and her deed. | ✅ passed |
| [C02](flows/screens/C02_retry_transcription_keeps_the_reviewed_transcrip.png) | Click **Retry Transcription**. | — | The reviewed transcript stays; no error. | ✅ passed |
| [C03](flows/screens/C03_proof_ledger_deed_present_possession_payment_mis.png) | Tab **Proof Ledger**. | “Paper isn't enough: Form I & XIV isn't in her name, no possession evidence, cash with no receipt.” | Deed + stamp duty present; Form I & XIV weak; possession + payment trail missing. | ✅ passed |
| [C04](flows/screens/C04_matter_precedents_power_of_attorney_title.png) | Tab **Precedents**. | “Matter-specific search: power of attorney, inventory, heir, title.” | Supporting and adverse authorities with outcomes, binding court first. | ✅ passed |
| [C05](flows/screens/C05_score_band_with_factors_mapusa_forum.png) | Tab **Score & Bias Firewall** (forum Civil Judge Senior Division, Mapusa). | “Uncertain, 61%, and every factor is shown.” | Uncertain 61%; blend 50/30/20; registered deed +0.37, possession missing −0.10. | ✅ passed |
| [C06](flows/screens/C06_bias_firewall_flip_to_muslim.png) | In the firewall grid click **Religion: Muslim**. | “Identity can't move our score. If it moved more than 0.02 we'd withhold it.” | Firewalled Δ 0.00; unprotected model drifts. | ✅ passed |
| [C07](flows/screens/C07_bias_firewall_flip_to_dalit.png) | Click **Caste: Scheduled Caste (Dalit)**. | — | Firewalled Δ 0.00 again. | ✅ passed |
| [C08](flows/screens/C08_advice_settle_lok_adalat_mediation.png) | Tab **Advice**. | “Deterministic rules turn the evidence into a strategy: settle.” | Settle; Lok Adalat and s.89 CPC mediation eligible. | ✅ passed |
| [C09](flows/screens/C09_authority_lock_fake_case_refused.png) | Tab **Draft** → Authority Lock: `Held in Imaginary Case (2099) 1 SCC 1` → **Verify & Insert**. | “A case that doesn't exist cannot enter the draft.” | “No verified authority found.” | ✅ passed |
| [C10](flows/screens/C10_authority_lock_twisted_holding_refused.png) | `Suraj Lamp held that a registered sale deed is not required` → **Verify & Insert**. | “A real case with a twisted holding is refused too.” | “Claim contradicts the stored holding of this authority.” | ✅ passed |
| [C11](flows/screens/C11_authority_lock_real_case_verified.png) | `Suraj Lamp & Industries v. State of Haryana` → **Verify & Insert**. | “The real one goes in, tied to its source paragraph.” | “Verified against stored paragraph (… para 1).” | ✅ passed |

## Flow D · Live intake: the judges’ “new matter” moment (optional, ~2 min)

Uses `pitch/demo_kit/` (all fictional). Runs the real pipeline: needs network + LLM quota, ~40–60 s.

| # | Do | Say | Expect | Tested |
|---|---|---|---|---|
| [D01](flows/screens/D01_new_matter_form_property_margao_hindi_client.png) | Click **New matter**. Practice area **Civil — Property & Title**; title *Pereira v. Kamat Heirs — plot possession, Navelim (FICTIONAL)*; client *Smt. Maria Pereira*; opposite *Legal heirs of Anil Kamat*; state Goa, district South Goa, seat Margao; paste `04_case_brief_paste_FICTIONAL.txt` into the summary; client language **Hindi**. | “Let’s take a matter the system has never seen.” | Form filled. | ✅ passed |
| [D02](flows/screens/D02_attach_3_pdfs_hindi_voice_note.png) | Click **Upload PDF / DOCX** and select `01_…agreement…pdf`, `02_…electricity_bill…pdf`, `03_…notice…pdf`, `05_client_voice_note_hindi_FICTIONAL.wav`. | — | 4 files staged. | ✅ passed |
| [D03](flows/screens/D03_create_run_11_stage_pipeline.png) | Click **Create & Run Pipeline**. Talk over the progress ring. | “Eleven stages: intake, facts, proof, clock, search, RAG, citations, score, advice, draft.” | Pipeline Complete 11/11. | ✅ passed |
| [D04](flows/screens/D04_facts_from_pdfs_hindi_transcript.png) | Tab **Facts**. | “The Hindi voice note is transcribed and translated, kept beside the original.” | Hindi transcript + English translation; facts from the agreement. | ✅ passed |
| [D05](flows/screens/D05_proof_ledger_for_the_new_matter.png) | Tab **Proof Ledger**. | — | Registered sale deed MISSING; possession and Form I & XIV present. | ✅ passed |
| [D06](flows/screens/D06_precedents_for_the_new_matter.png) | Tab **Precedents**. | — | Authorities for the new matter. | ✅ passed |
| [D07](flows/screens/D07_score_firewall_for_the_new_matter.png) | Tab **Score & Bias Firewall**. | — | Weak band (~41%) with factors; firewall passed. | ✅ passed |
| [D08](flows/screens/D08_statute_clock_for_the_new_matter.png) | Tab **Statute Clock**. | “Limitation is computed by rules, with the date it assumed shown.” | Art. 65 (possession based on title), cause date from the documents. | ✅ passed |
| [D09](flows/screens/D09_draft_for_the_new_matter.png) | Tab **Draft**. | — | AI-assisted legal notice, watermarked for review. | ✅ passed |

## Flow E · Judge challenges: roles and tenancy (only if asked)

Use **Switch account** (sidebar).

| # | Do | Say | Expect | Tested |
|---|---|---|---|---|
| [E01](flows/screens/E01_empty_password_refused.png) | Open sign in, enter `junior_1` with an empty password. | “No password, no entry.” | Sign in button stays disabled. | ✅ passed |
| [E02](flows/screens/E02_junior_cannot_approve_send_to_senior.png) | Sign in as `junior_1`, open Fernandes v. Naik → Draft. | “A junior can’t approve.” | No Approve & Seal; only Send to Senior. | ✅ passed |
| [E03](flows/screens/E03_law_student_read_only_docket.png) | Sign in as `student_1`. | “Law students get read-only access.” | Docket visible, destructive controls disabled. | ✅ passed |
| [E04](flows/screens/E04_chamber_b_cannot_see_chamber_a.png) | Sign in as `senior_b` (Chamber B). | “Another chamber can’t see this chamber’s matters.” | Only Chamber B’s matter; no Fernandes. | ✅ passed |

## Flow F · Tamper-evident ledger drill (only if asked)

Sidebar → Audit ledger (senior only).

| # | Do | Say | Expect | Tested |
|---|---|---|---|---|
| [F01](flows/screens/F01_simulate_insider_db_edit_chain_breaks.png) | Click **Integrity Drill: Simulate Insider DB Edit** → confirm **Simulate Insider DB Edit**. | “Someone edits the database directly…” | Chain verification breaks, the altered entry is flagged. | ✅ passed |
| [F02](flows/screens/F02_restore_intact_chain.png) | Click **Restore Intact Chain**. | “…and the chain catches it.” | Integrity Drill · Chain Restored & Verified. | ✅ passed |

## Flow G · Approval gate on the fictional Mapusa matter (only if asked)

Open **Fernandes v. Naik** (mat_001): it carries an overruled citation by design.

| # | Do | Say | Expect | Tested |
|---|---|---|---|---|
| [G01](flows/screens/G01_citation_health_koushal_overruled.png) | Tab **Citations**. | “The citator reads later judgments: Koushal was overruled by Navtej Johar.” | Red Overruled badge; “Blocks final draft sealing”. | ✅ passed |
| [G02](flows/screens/G02_approve_seal_refused_overruled_citation.png) | Tab **Draft** → **Approve & Seal** → **Approve & Seal to Ledger**. | “Overruled law blocks sealing.” | Refused: “1 overruled authority blocks this draft…”. | ✅ passed |
| [G03](flows/screens/G03_senior_records_reasoned_override.png) | Tab **Citations** → **Senior Override →**; pick a reason, one line, **Record Override**. | “Only a senior can override, with a reason, and it's ledgered.” | Override recorded. | ✅ passed |
| [G04](flows/screens/G04_approve_seal_succeeds_after_override.png) | **Draft** → **Approve & Seal** → **Approve & Seal to Ledger**. | — | “APPROVED BY senior_1 (SENIOR)”. | ✅ passed |
| [G05](flows/screens/G05_ledger_override_approval_hash_chain_intact.png) | Tab **Ledger**. | “Change a past entry and verification breaks.” | Override + approval; Hash Chain Intact. | ✅ passed |

## Flow H · Automated click-everything check (run before going on stage)

`python3 pitch/build/scripts/run_flows.py H`: opens every matter, every tab, every voice-note button.

| # | Do | Say | Expect | Tested |
|---|---|---|---|---|
| [H01](flows/screens/H01_every_matter_every_tab_every_voice_note.png) | (automated) | — | No HTTP errors, no “Could not load audio”/“not found” anywhere. | ✅ passed |

## Known limits to keep in mind

- Payment trail reads *missing* when part of the price was paid in cash without a receipt (the rule treats “no receipt” as missing). Legal lead to confirm whether that should be *weak*.
- Live intake (flow D) depends on the LLM (Groq) and takes ~40–60 s; seeded matters are instant.
- Don’t re-run the pipeline on mat_001 live; the band can change.
- Don’t reload mid-demo (the intro replays on full reload, which is fine only at the start).
