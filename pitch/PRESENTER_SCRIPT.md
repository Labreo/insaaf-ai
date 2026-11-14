# Insaaf AI — Presenter Script (PS 29)

**Total:** ~6 min of slides, then the live demo (~3 min) from the final slide. Each slide opens with a 3–4 s silent 3D camera move around the Scales of Justice. Start speaking as the move ends.

| # | Slide | Time | Camera move |
|---|---|---|---|
| 1 | Justice is waiting | 0:50 | Pushes in through a paper storm; scales tipped |
| 2 | The legal research gap | 0:50 | Swings to the scales: files in one pan, red warning in the other |
| 3 | Meet Insaaf AI | 0:40 | Circles behind the monument; the paper storm lifts |
| 4 | Making justice more accessible | 0:45 | Wide pull-back; scales almost level |
| 5 | It doesn't just answer. It proves. | 1:00 | Faces the monument head-on |
| 6 | Predict. Evaluate. Decide. | 1:00 | Rises over the scales |
| 7 | From case file to legal clarity | 0:30 | Four **real app screens** fly in around now-balanced scales |
| — | **Live demo** | ~3:00 | Click “▶ Live demo · sign in” → follow [`LIVE_DEMO_RUNBOOK.md`](LIVE_DEMO_RUNBOOK.md) |
| A/B | Appendix | backup | Sources; method, calibration and limits |

---

## 1 · Justice is waiting
> India has more than **five crore** cases pending in district and subordinate courts: **5,23,99,027** on the NJDG live dashboard this morning.
> Closer to home, **62,103** are in Goa's district courts, more than half over a year old, and **10,471** civil cases in Goa were filed by senior citizens: families waiting on a plot, a house, an inheritance.
> Behind every number is one question: *has a court decided a case like mine, and how did it end?* PS 29 asks us to answer it. That's Insaaf.

## 2 · The legal research gap
> Three gaps. **One:** research is keyword search, but cases are decided on situations. **Two:** unverified research is dangerous; in *Mata v. Avianca* lawyers were fined $5,000 for six AI-invented cases, and overruled law is just as fatal. **Three:** advice on whether to file rests on individual experience, without data on how courts ruled on comparable facts.
> Now a real Goan case from this autumn. At **Socorro, Bardez**, a deceased owner's land was mutated to two sisters on an allegedly false heirship claim, split into **11 plots** and sold to **nine buyers** by a power-of-attorney holder. The heir's FIR led to a Crime Branch SIT probe, and on **24 September** the ED attached the plots, worth ₹4.2 crore.
> Every one of those nine buyers now asks a lawyer the same question: *is my title safe, and do I fight or settle?* That's the matter we'll follow.

*(Source: Northeast News, 24 Sep 2026, from the ED's Panaji office. In the app our client is a hypothetical, unnamed buyer of one plot; we never name the accused.)*

## 3 · Meet Insaaf AI
> Insaaf does a junior lawyer's first research pass in minutes, and **refuses to write a single legal claim it can't prove**.
> Six stages: documents and Konkani voice notes, a fact card, precedent search, a Proof Ledger, outcome and citation checks, and a draft only a senior can seal. The two gold **MVP** stages are exactly PS 29: precedent search and outcome prediction, in one domain, civil property.

## 4 · Making justice more accessible
> Who pays: independent advocates, small chambers, corporate legal teams, law schools and legal-aid clinics, the PS 29 customer list.
> Pricing is a hypothesis we'll test: ₹199 a month for students, ₹999 for a solo advocate, ₹2,499 per seat for chambers, plus per-case briefs and institutional licences.
> Why they pay: the first research pass takes minutes instead of an evening, and every claim can be shown to a senior or a judge. We start with chambers around the Mapusa, Margao and Panaji courts, then the Bombay High Court's jurisdiction, then India.
> But a legal tool is worthless if you can't trust it.

## 5 · It doesn't just answer. It proves.
> Real responses from the app. **Authority Lock:** a case that doesn't exist is refused, "No verified authority found." A real case with a twisted holding is refused, "Claim contradicts the stored holding." The genuine *Suraj Lamp* citation verifies against its stored paragraph.
> **Citation Health:** *Koushal* is flagged as overruled by *Navtej Johar*, so the draft can't be sealed until a senior records a reasoned override in the hash-chained ledger.
> **Bias Firewall:** ten protected identities; our masked score stays 0.38 for every one. A deliberately biased comparison model drifts up to seven points. If ours moved more than 0.02, it would be withheld.
> Honest line: this shows masking and invariance of our score, not that any language model is unbiased.

## 6 · Predict. Evaluate. Decide.
> PS 29's prediction requirement on the real Socorro case, for a hypothetical buyer of one plot: **Uncertain, 61%**, every point explained. **50%** evidence model: her deed is registered and stamped, but she has no possession evidence. **30%** what actually happened in the 11 most similar judgments: only 4 granted relief. **20%** a court-level prior for Mapusa civil courts.
> The Proof Ledger shows why paper isn't enough: Form I & XIV isn't in her name, no possession evidence, and cash paid with no receipt. The precedents say a **power of attorney does not transfer title**. The advice is deterministic: **settle**, through Lok Adalat or mediation.
> Honest numbers: court-level only, never named judges; 38 of 50 right on held-out data, Brier 0.152. Demo scale, and we say so.

## 7 · From case file to legal clarity → LIVE DEMO
> These four screens are the running product, not mock-ups: search on the Socorro facts, the Uncertain 61% band, Konkani beside English, and only verified law entering a draft.
> **Justice deserves intelligence. We don't replace lawyers. We empower them.** Let me show you.

**Click “▶ Live demo · sign in”** → http://localhost:4173/ → sign in → let the intro play → run the demo. End on the ledger (or the Authority Lock) and say "Thank you."

---

## Judge Q&A, short answers

| Question | Answer |
|---|---|
| "Is this semantic search?" | "It searches by the facts: legal alias expansion, word and character matching over labelled issue and holding summaries, binding courts first. Neural embeddings are on the roadmap." |
| "Can you really predict outcomes?" | "A band for one domain, with its reasons, held-out accuracy (38 of 50) and a calibration plot (Appendix B). Never a fake-precise number." |
| "Is the corpus Goa-only?" | "No: 1,400+ public judgments across 15 practice areas, including 80 from the Bombay High Court at Goa, ranked first for Goa matters." |
| "Is the Socorro case real?" | "Yes, the facts are from the ED's account reported on 24 Sep 2026. Our client is a hypothetical buyer; we don't name the accused." |
| "Try a new matter." | Flow D in [`DEMO_FLOWS.md`](DEMO_FLOWS.md): upload the Pereira kit (PDFs + Hindi voice note) and run the pipeline (~1 min). |
| "Judge analytics?" | "Court-level priors only. We don't profile individual judges." |
| "Is this legal advice?" | "No. Every draft is watermarked and needs a senior advocate's logged approval." |
| "Are the visuals AI-generated?" | "No. The 3D monument is our own scene built in code, and every product screen is a real screenshot." |
