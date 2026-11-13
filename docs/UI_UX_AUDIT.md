# Insaaf AI — UI/UX Craft & Workbench Audit (Phase 5)

**Audit Date:** 2026-11-13  
**Design Benchmark:** [`Intro.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/intro/Intro.tsx) and [`Landing.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/Landing.tsx) — editorial authority, restrained Paper & Ink palette (`#f5f4ef` canvas, `#17191e` ink, `#1f3a5c` judicial navy, `#9a7a3c` brass accents), bond-paper typography, zero generic AI SaaS clutter.  
**Constraint:** Inspection only — no redesign implemented yet.

---

## 1. Quality Benchmark Comparison: Landing / Intro vs. Workbench

[`Intro.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/intro/Intro.tsx) (6.7s velvet + SVG sword-tip trace + scale push-in) and [`Landing.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/Landing.tsx) establish an unmistakably legal, restrained editorial standard. Inside the Workbench (`Shell.tsx` + `Matter.tsx` + 11 tabs), that Paper & Ink visual grammar carries through cleanly:
- Custom tokens in [`index.css:14-120`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/index.css#L14-L120) (`--font-display: Instrument Serif`, `--font-serif: Newsreader`, `--font-mono: JetBrains Mono`, `--font-devanagari: Noto Sans Devanagari`, `.tbl` sticky dense tables, `.page-doc` pleading sheet).
- Quiet legal status colors (`ok: #2e7350`, `warn: #a86514`, `bad: #b03a2e`, `info: #2c5a8a`) used sparingly rather than neon gradients.

---

## 2. Evaluation Across All 10 Required Dimensions

| Dimension | Rating | Observed Evidence & Specific Findings |
|---|---|---|
| **1. Information Hierarchy** | **Strong** | 3-tier clarity works well: top utility header → compact 264px docket sidebar (`Shell.tsx`) → `PageHeader` + 4-card KPI strip (`Home.tsx:125-145`) → 12-column split panes inside Matter workspace. Minor noise: `Matter.tsx` repeats `Pipeline` CTA button right next to `01 Pipeline` tab (`Matter.tsx:210-215`). |
| **2. Navigation** | **Needs Polish (P1)** | Persistent sidebar shows Chambers nav + scrollable Active Matters + Role/Login card. However, inside [`Matter.tsx:296-313`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/Matter.tsx#L296-L313), the 11-tab bar uses `overflow-x-auto no-scrollbar` with **no fade cue or scroll arrow** on `< 1280px` laptops, hiding tabs `09 Pleading Draft`–`11 Audit Ledger`, and tabs show no diagnostic count/warning dots (e.g., `2 missing` on `03 Proof Ledger`, `overruled` alert on `06 Citations`). |
| **3. Visual Consistency** | **Strong** | Unified token usage across `Landing`, `Shell`, `AuthModal`, `ReviewDrawer`, and all 11 tabs. One minor mismatch: `DraftTab.tsx` Verification clause hardcodes `"Verified at Mapusa, Goa"` ([`DraftTab.tsx:221`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/DraftTab.tsx#L221)) even for Panaji Commercial or other user-entered forums. |
| **4. Density & Readability** | **Strong** | Dense tabular numeric alignment (`.tabular`), generous measure (`Newsreader` `16.5px / 1.75` line-height in `.page-doc`), clean Devanagari rendering (`devanagari` font class in [`Facts.tsx:85`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/Facts.tsx#L85)), and high contrast `#17191e` ink on `#f5f4ef` canvas. |
| **5. Table Quality** | **Good** | `.tbl` in `Home.tsx`, `Pipeline.tsx`, `Proof.tsx`, `Me.tsx`, `LedgerTab.tsx` uses sticky headers, hairline `#e5e2d9` dividers, `min-w-[720px]` horizontal safety on `LedgerTab`. `Home.tsx` tables lack column sort toggles (currently fixed by server priority). |
| **6. Matter Workspace Usability** | **Needs Polish (P1)** | **Defect:** Case Record document chips in [`Matter.tsx:237-246`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/Matter.tsx#L237-L246) are static `<span>` tags—users cannot click to preview extracted text or remove an uploaded file even though `api.removeDocument` is already implemented in [`api.ts:194`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/lib/api.ts#L194). Uploading a doc on an existing matter also gives no prompt to re-run stale stages (`Pipeline.tsx:81-86` still marks all 11 rows `done / cached`). |
| **7. Responsive Behavior** | **Good** | `Shell.tsx` collapses sidebar into a mobile drawer on `< lg`; split 12-col grids (`ScoreTab`, `Clock`, `DraftTab`, `Radar`, `NewMatter`) stack cleanly at mobile/tablet breakpoints. Tab bar overflow remains an issue on narrow viewports. |
| **8. Loading, Empty & Error States** | **Good** | Consistent `Skeleton`, `Empty`, and `ErrorBanner` (with `Retry` callback) primitives across all 11 tabs. `Matter.tsx:148` hardcodes `"was not found in Chamber A"` even when signed into Chamber B! |
| **9. Accessibility** | **Needs Polish (P2)** | Positives: `:focus-visible` ring (`index.css:104`), `Escape` key closes drawers (`ReviewDrawer.tsx:73-77`), `aria-label` on icon buttons, `role="switch"` + `aria-checked` in `Alerts.tsx:77-78`. Gaps: `Intro.tsx` lacks a visible `"Skip Intro"` text button hint for keyboard-only users until focus; `<AuthModal />` does not trap keyboard focus or bind `Escape` to `onClose()` ([`AuthModal.tsx:75-100`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/components/AuthModal.tsx#L75-L100)); inline SVG charts (`ScoreTab.tsx`) lack screen-reader summary text. |
| **10. Animation Quality** | **Strong** | Purposeful transitions: `0.26s` expo slide-over drawer (`ReviewDrawer.tsx:124`), smooth horizontal attribution bars (`ScoreTab.tsx:113-121`), subtle Web Audio paper/seal SFX (`lib/sound.ts`), respecting reduced motion cleanly without gratuitous bounce or floating widgets. |

---

## 3. All 11 Workbench Tabs + Shared Screens Inspection

| Screen / Tab | File Reference | Verdict | Key Observations & Issues |
|---|---|---|---|
| **01 Pipeline** | [`Pipeline.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/Pipeline.tsx) | **Good** | Clean 11-row stage table + `Ring` gauge + clickable rows jumping to target tab. **P2:** `prewarmed` (`matter.status !== 'draft'`) marks all rows `done` even after a new document is uploaded; should show `"stale"` badge when docs changed after last run. |
| **02 Facts** | [`Facts.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/Facts.tsx) | **Strong** | 2-column bilingual cards showing English statement, Devanagari source well, confidence dot, source span, and inline `Edit / Verify` drawer trigger. *(Exposed by P0-1 backend crash on live matters).* |
| **03 Proof Ledger** | [`Proof.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/Proof.tsx) | **Strong** | High-clarity critical/weak/present status icons, highlighted missing critical rows (`bg-bad-50/40`), clickable `SourceChip` authorities, and one-click `Mark obtained` senior override. |
| **04 Statute Clock** | [`Clock.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/Clock.tsx) | **Strong** | Dominant `days left` SVG ring, Limitation Act article, live date recalculation + 3 quick presets showing COVID `2020-03-15 -> 2022-02-28` tolling window breakdown. |
| **05 Precedents** | [`Precedents.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/Precedents.tsx) | **Strong** | Clearly displays `8s` budget elapsed time, `Kanoon Cache` vs `Live Kanoon` badge, live query bar + quick queries, and left-border color-coded `Supports Claimant` vs `Adverse Authority` cards. |
| **06 Citations** | [`Citations.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/Citations.tsx) | **Strong** | Clean red overruled cards showing citing judgment well and `"Blocks final draft sealing"` warning + live citation health checker. |
| **07 B-Score & Bias** | [`ScoreTab.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/ScoreTab.tsx) | **Needs Polish (P1/P2)** | Great centered-axis attribution bars, interactive 6-identity Bias Firewall polyline/cards. **P1:** Two of 4 court buttons (`Civil Judge Senior Division, Mapusa`, `Supreme Court of India`) silently revert to `District Court, North Goa` on click! **P2:** `CalibrationPlot` SVG (line 330) has no axis labels (`Predicted` / `Observed`), tick marks, or dashed-diagonal legend. |
| **08 Settle / Fight** | [`AdviceTab.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/AdviceTab.tsx) | **Strong** | Prominent statutory recommendation banner, Senior Override button, 2x2 eligibility route grid (`Lok Adalat`, `s.12A`, `Plea Bargain`, `Contested Trial`) with source chips. |
| **09 Pleading Draft** | [`DraftTab.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/DraftTab.tsx) | **Strong** *(with auth/copy defects)* | Showcase `.page-doc` bond-paper typography, quarantined red `"No verified authority found"` strike-through box, live Authority Lock verification sidebar, `Counsel Sealed` state. **P1:** `exportDocx()` lacks `Authorization` header (line 83). **P2:** Hardcodes `"Mapusa, Goa"` in Order VI Rule 15 footer. |
| **10 Law Radar** | [`Radar.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/Radar.tsx) | **Strong** | Two-column split showing matter detections alongside live offence-date crosswalk scanner (`2025 FIR` vs `2023 Complaint` quick presets). |
| **11 Audit Ledger** | [`LedgerTab.tsx`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/LedgerTab.tsx) | **Strong** | Intact vs Broken chain banner, Solana Devnet root hash badge, chronological hash-link table (`prev_hash -> hash`). |
| **Docket / Intake / Alerts / Chamber** | `Home.tsx`, `NewMatter.tsx`, `Alerts.tsx`, `Me.tsx`, `AuthModal.tsx` | **Good** | Clean multi-chamber switchers, live Telegram test trigger (`Alerts.tsx:61-68`), demo reset (`Me.tsx:180-187`). **P2:** `<AuthModal />` lacks Escape key handler; `Matter.tsx:148` hardcodes `"Chamber A"` in 404 fallback message. |

---

## 4. Recommended Non-Destructive UI/UX Improvements (Ranked)

1. **(P1)** Align `FORUMS` buttons in [`ScoreTab.tsx:28-33`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/ScoreTab.tsx#L28-L33) with trained backend court hierarchy (or expand `COURT_HIERARCHY` in `train_b_score.py` so every button updates shrinkage live).
2. **(P1)** Add remove (`×`) action on attached Case Record chips in [`Matter.tsx:237-246`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/Matter.tsx#L237-L246) wired to `api.removeDocument`, plus a visual scroll fade and alert dots on the 11-tab bar (`Matter.tsx:296`).
3. **(P1)** Replace raw `<a href={api.exportDraftUrl(id)}>` in [`Matter.tsx:216`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/Matter.tsx#L216) and unauthenticated `fetch` in [`DraftTab.tsx:83`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/DraftTab.tsx#L83) with an authenticated blob download helper.
4. **(P2)** Add `0–100%` axis labels & dashed reference legend to `CalibrationPlot` ([`ScoreTab.tsx:330`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/matter/ScoreTab.tsx#L330)), bind `Escape` to close `<AuthModal />`, and dynamically show `me.org.name` instead of hardcoded `"Chamber A"` in [`Matter.tsx:148`](file:///Users/sanjaywaradkar/learning/hackathons/insaaf/frontend/src/screens/Matter.tsx#L148).

