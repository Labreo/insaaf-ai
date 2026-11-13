# Frontend — Insaaf mobile-first web app

**Owners**: @Shua-03, @sanidhyaLajurkar
**Stack**: Vite + React 19 + TypeScript · Tailwind CSS v4 · `motion` (Framer Motion) · React Router · lucide-react.
Mobile-first PWA (installable from the browser; `manifest.webmanifest` + `icon.svg`). It also renders as a centred phone column on desktop.

## Run

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173 — open in a phone-sized viewport or scan the Network URL on your phone
npm run build      # production bundle in dist/
```

Data comes from [`mocks/`](mocks/) by default. To hit the real backend:

```bash
VITE_USE_MOCKS=false VITE_API_BASE=http://localhost:8000/v1 npm run dev
```

## What's built

| Area | File | Status |
|---|---|---|
| Cinematic intro (rays → outline trace → statue reveal → wordmark → push-in) | `src/intro/Intro.tsx` | ✅ plays once per session; tap to skip; honours reduced motion |
| Design tokens (statue greys + velvet + single brass action colour) | `src/index.css` | ✅ |
| App shell, bottom nav, page transitions | `src/components/Shell.tsx` | ✅ |
| UI primitives: Button, Chip, Ring, Bar, Row, SourceChip, SourceSheet, skeletons | `src/components/ui.tsx` | ✅ |
| Home: greeting, Nyaya Queue (deadline × merit), all matters | `src/screens/Home.tsx` | ✅ |
| Matter workspace with 10 tabs | `src/screens/Matter.tsx` + `screens/matter/*` | ✅ |
| ⭐ Pipeline rail with live stage events + 8-second search ring | `matter/Pipeline.tsx` | ✅ |
| Fact cards with Konkani original + translation confidence | `matter/Facts.tsx` | ✅ |
| Proof Ledger (present / weak / missing, sources) | `matter/Proof.tsx` | ✅ |
| Statute Clock ring, forum, ADR routes, excluded periods | `matter/Clock.tsx` | ✅ |
| Precedents: budget, for/against, similarity | `matter/Precedents.tsx` | ✅ |
| ⭐ Draft with citation chips + **Authority Lock** (paste a fake citation → refused) | `matter/DraftTab.tsx` | ✅ |
| ⭐ Citation Health badges (green / amber / **red overruled**) | `matter/Citations.tsx` | ✅ |
| ⭐ Insaaf B score band, factor bars, court-aware, **Bias Firewall** 6-identity flip test | `matter/ScoreTab.tsx` | ✅ |
| Settle-or-Fight | `matter/AdviceTab.tsx` | ✅ |
| Reviewer Ledger (hash chain, anchored root) | `matter/LedgerTab.tsx`, `screens/LedgerScreen.tsx` | ✅ |
| New matter (type, title, upload tiles) | `screens/NewMatter.tsx` | ✅ UI only, no real upload yet |
| Me / org / replay intro | `screens/Me.tsx` | ✅ |

The API layer is one file, [`src/lib/api.ts`](src/lib/api.ts). Every call matches [`../docs/API_CONTRACT.md`](../docs/API_CONTRACT.md); the backend returns the same shapes and the switch flips.

## Design language

Sampled from the intro images: a pewter statue on black velvet with one soft grey ray.

- **Surfaces**: `void #050506` canvas, `velvet #0b0b0d` cards, `graphite #141418` wells. No borders except a 1px `seam` hairline.
- **Text**: `marble` (primary), `pewter` (secondary), `smoke` (labels). Weight 300 body; headings weight 400 at large sizes with negative tracking. Hierarchy from scale, not weight.
- **Serif accent** (`Instrument Serif`) only for legal text: quotes, draft paragraphs, the word *limitation*.
- **Brass `#c9a868`** is the only coloured action. One brass button per screen, maximum.
- **Legal states**: `followed` green, `distinguished` amber, `overruled` red, `steel` for information.
- Film grain overlay at 4.5% on the whole app.

Inspiration: Dala's "constellation on black velvet" (single accent, weightless type), Linear/Vercel void aesthetic. The brief is in [`../docs/WORK_PLAN.md`](../docs/WORK_PLAN.md) §9.

## Next for the frontend pair

1. **Real upload flow** in `NewMatter.tsx`: `POST /matters`, then `POST /matters/{id}/documents` (multipart), then navigate to the pipeline tab.
2. **Review / override sheet**: on Proof, Citations and Score, let a senior override with a reason code → `POST /matters/{id}/reviews` → new ledger row.
3. **Retrain button** on the ledger (F13) → `POST /ml/retrain` → show version + metric delta.
4. **Law Change Radar tab** (F14, if time) using `law_changes.json`.
5. **Offline / demo mode banner** when `cached: true` comes back.
6. **Desktop layout**: at ≥1024px, the matter workspace could become three panes (documents · pipeline · draft). Phone column is fine for the demo.
7. Polish: haptics are already wired via `navigator.vibrate`; add sound to the Authority Lock reject if you want (Web Audio, no mp3).

## Rules
- The app never holds API keys. It only calls our backend.
- Every legal conclusion shows its source snippet. If `sources` is empty, render **"No verified authority found."** (`<NoAuthority />`).
- Devanagari text uses the `devanagari` utility class (Noto Sans Devanagari).
- Mocks are shared with the backend. Changing a shape needs a backend review (see CODEOWNERS).
