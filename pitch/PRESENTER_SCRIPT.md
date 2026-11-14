# Insaaf AI — Presenter Script (PS 29)

**Total:** ~6 min of slides plus a ~2.5 min live demo (between slides 4 and 5), about 9 minutes in all. Each slide opens with a 3–4 s 3D camera move around the Scales of Justice monument. Start speaking as the move ends.

| # | Slide | Time | Camera move |
|---|---|---|---|
| 1 | Justice is waiting | 0:50 | Pushes in through a paper storm; scales tipped |
| 2 | The legal research gap | 0:50 | Swings to the scales: files in one pan, red warning in the other |
| 3 | Meet Insaaf AI | 0:40 | Circles behind the monument; the paper storm lifts |
| 4 | From case file to legal clarity | 0:30 | Four **real app screens** swing into orbit around the scales |
| — | **Live demo** | 2:30 | See [`LIVE_DEMO_RUNBOOK.md`](LIVE_DEMO_RUNBOOK.md) |
| 5 | It doesn't just answer. It proves. | 1:00 | Faces the monument head-on |
| 6 | Predict. Evaluate. Decide. | 1:00 | Rises over the scales, now almost level |
| 7 | Making justice more accessible | 0:45 | Pulls back: papers gone, scales balanced, warm light |
| A/B | Appendix | backup | Sources; method, calibration and limits |

---

## 1 · Justice is waiting
> India has more than **five crore** cases pending in district and subordinate courts: **5,23,99,027** on the NJDG live dashboard this morning.
> Closer to home, **62,103** of those cases are in Goa's district courts, and more than half are over a year old. **10,471** civil cases in Goa were filed by senior citizens: families waiting on a plot, a house, an inheritance.
> Behind every number is one question: *has a court decided a case like mine, and how did it end?* PS 29 asks us to answer that question, and that is what Insaaf does.

## 2 · The legal research gap
> There are three gaps.
> **One:** research is keyword search, but cases are decided on situations.
> **Two:** unverified research is dangerous. In *Mata v. Avianca*, New York lawyers were fined $5,000 for citing six AI-invented cases. Citing overruled law is just as fatal.
> **Three:** "Will we win?" is answered from memory.
> Now meet the matter we'll follow. It's fictional, but it's a very Goan problem. Mrs. Fernandes has lived on her Mapusa plot since 2009, on an agreement and a power of attorney, never a registered sale deed. Now the seller's family wants the plot back.

## 3 · Meet Insaaf AI
> Insaaf does a junior lawyer's first research pass in minutes, and it **refuses to write a single legal claim it can't prove**.
> It works in six stages: documents and Konkani voice notes, a fact card, precedent search, a Proof Ledger, outcome and citation checks, and a draft that only a senior can seal. The two gold stages are what PS 29 asks for: precedent search and outcome prediction, in one domain, civil property.

## 4 · From case file to legal clarity → LIVE DEMO
> These four panels are screenshots of the running product, not mock-ups:
> - the search returns 20 of 1,463 public judgments in about a tenth of a second;
> - Mrs. Fernandes's outcome band is Weak, 38%, and every factor is shown;
> - her Konkani statement sits next to its English translation;
> - the draft locks out any citation it can't verify.
> Let me show you live.

**Switch to the browser** (click the *Live demo* chip, or Cmd-Tab). Run the demo, then come back to slide 5.

## 5 · It doesn't just answer. It proves.
> These are real responses from the app.
> - **Authority Lock:** a case that doesn't exist is refused with "No verified authority found." A real case with a twisted holding is refused too: "Claim contradicts the stored holding." The genuine *Suraj Lamp* citation verifies against its stored paragraph.
> - **Citation Health:** *Koushal* is flagged as overruled by *Navtej Johar*, so the draft can't be sealed until a senior records a reasoned override in the hash-chained ledger.
> - **Bias Firewall:** we inject ten protected identities. Our masked score stays at 0.38 for every one of them. A deliberately biased comparison model drifts by up to seven points. If our score ever moved more than 0.02, it would be withheld.
> To be honest about the limits: this shows masking and invariance of our score. It is not a claim that any language model is unbiased.

## 6 · Predict. Evaluate. Decide.
> This is PS 29's prediction requirement on Mrs. Fernandes's matter: **Weak, 38%**, and every point is explained. The 38% blends three things:
> - **50%** from an evidence model;
> - **30%** from what actually happened in the 12 most similar judgments, where only 3 granted relief;
> - **20%** from a court-level prior for Mapusa civil courts, pooled toward all property judgments so a small local sample can't swing it.
> The biggest factor is the missing registered sale deed, at −0.37. The Proof Ledger flags the same gap, and the advice is deterministic: **mediate**. Lok Adalat is eligible, its award is final and the court fee is refunded.
> Our numbers, honestly: the prior is court-level only, never named judges. On held-out data the model got 38 of 50 right, with a Brier score of 0.152. That is demo scale, and we say so.

## 7 · Making justice more accessible
> Our customers are independent advocates, small chambers, corporate legal teams, law schools and legal-aid clinics, which is exactly the PS 29 customer list.
> Pricing is a hypothesis we'll test: ₹199 a month for students, ₹999 for a solo advocate, ₹2,499 per seat for chambers, plus per-case briefs and institutional licences.
> We start at home with chambers around the Mapusa, Margao and Panaji courts, then cover the rest of the Bombay High Court's jurisdiction, then India.
> **Justice deserves intelligence. We don't replace lawyers. We empower them.** Thank you.

---

## Judge Q&A, short answers

| Question | Answer |
|---|---|
| "Is this semantic search?" | "It searches by the facts of the case. It expands legal aliases, matches word and character patterns over labelled issue and holding summaries, and ranks binding courts first. Neural embeddings are on the roadmap." |
| "Can you really predict outcomes?" | "We give a band for one domain, with its reasons, held-out accuracy (38 of 50) and a calibration plot (Appendix B). We never show a fake-precise number." |
| "Is the corpus Goa-only?" | "No. It's 1,463 public judgments across 15 practice areas, including 80 from the Bombay High Court at Goa. The ranking boosts binding Goa-bench authority for Goa matters." |
| "Judge analytics?" | "Court-level priors only. We don't profile individual judges." |
| "Is this legal advice?" | "No. Every draft is watermarked and needs a senior advocate's approval, and that approval is logged." |
| "Are the visuals AI-generated?" | "No. The 3D monument is our own scene, built and rendered in code, and every product screen is a real screenshot." |
