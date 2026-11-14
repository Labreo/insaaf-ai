# Insaaf AI — PS 29 Pitch

A 7-slide cinematic pitch with 2 appendix slides. The camera orbits an original 3D Scales-of-Justice monument: the scales start **tipped under a storm of case files** and end **balanced** on the final slide, where real app screens orbit the monument and the live demo starts from the sign-in page.

Slide order: 1 crisis · 2 research gap · 3 meet Insaaf · 4 opportunity · 5 trust · 6 prediction · 7 the product (→ live demo).

## Deliverables

| File | Use it for |
|---|---|
| [`Insaaf_AI_PS29_Pitch.pptx`](Insaaf_AI_PS29_Pitch.pptx) | **Presenting.** Each slide auto-plays a 3–4 s 3D camera move, then holds on its final frame. Slides use fade transitions. All text, shapes and charts are editable. |
| [`Insaaf_AI_PS29_Pitch_static.pptx`](Insaaf_AI_PS29_Pitch_static.pptx) | Backup with the same slides as stills (no video). Use it in Keynote or Google Slides, or if video playback misbehaves. |
| [`Insaaf_AI_PS29_Pitch.pdf`](Insaaf_AI_PS29_Pitch.pdf) | Submission / hand-out. |
| [`Insaaf_AI_3D_showreel.mp4`](Insaaf_AI_3D_showreel.mp4) | All seven camera moves (25 s). Demo fallback or an intro loop. |
| [`DEMO_FLOWS.md`](DEMO_FLOWS.md) / [`Insaaf_AI_Demo_Flows.pdf`](Insaaf_AI_Demo_Flows.pdf) | Every website flow (sign-in + intro, search, matter, live intake, roles, ledger drill): do / say / expect, with real screenshots. 39/39 steps tested. |
| [`demo_kit/`](demo_kit/) | Fictional inputs for the live-intake demo: 3 PDFs, a case brief, a Hindi voice note (+ transcript), backup D'Souza files. |
| [`flows/`](flows/) | Screenshots per step, `results.json`, and `demo_walkthrough.webm` (recording of the full run, demo fallback). |
| [`PRESENTER_SCRIPT.md`](PRESENTER_SCRIPT.md) | Slide-by-slide talk track, timings and judge Q&A. |
| [`LIVE_DEMO_RUNBOOK.md`](LIVE_DEMO_RUNBOOK.md) | 3-minute live demo starting from sign-in, with fallbacks. |
| [`SOURCES.md`](SOURCES.md) | Where every number and image comes from. |

> [!IMPORTANT]
> - **Fonts:** Georgia (headings), Arial (body) and Courier New (labels). All three ship with macOS and Windows.
> - **Size:** the motion deck is ~41 MB because the 7 clips are embedded.
> - **Autoplay:** written as standard PowerPoint "start automatically" timing.
>   - Keynote may import the clips as click-to-play. If so, click the slide once, or present the static deck.
>   - Autoplay hasn't been tested in PowerPoint itself: this Mac has no Office. Rehearse once on the presenting machine.

## Regenerate

From `pitch/build/`, after a one-time `npm install` (pptxgenjs 3.12.0, three 0.169.0; Python needs Playwright with Chromium and ffmpeg).

**1. App screenshots (optional).** The backend must be on :8000 and the frontend on :4173. Run the Playwright capture used for `screenshots/`, then crop the four panel textures into `img/panel_src_*.png`.

**2. 3D stills and camera moves** (needs WebGL in headless Chromium; about 2 minutes on an M3):

```bash
python3 render3d/render.py stills
```

```bash
python3 render3d/render.py clips
```

Then rebuild the posters (the first frame of each clip):

```bash
for i in 1 2 3 4 5 6 7; do ffmpeg -v error -y -i media/move_s$i.mp4 -frames:v 1 -q:v 2 img/poster_s$i.jpg; done
```

**3. Decks.** Build both, then add the autoplay timing and fade transitions:

```bash
node build_deck.js && STATIC=1 node build_deck.js
```

```bash
python3 scripts/postprocess.py ../Insaaf_AI_PS29_Pitch.pptx
```

```bash
python3 scripts/postprocess.py ../Insaaf_AI_PS29_Pitch_static.pptx --no-video
```

**4. PDF.** Export from the static deck with LibreOffice:

```bash
soffice --headless --convert-to pdf --outdir .. ../Insaaf_AI_PS29_Pitch_static.pptx && mv ../Insaaf_AI_PS29_Pitch_static.pdf ../Insaaf_AI_PS29_Pitch.pdf
```

**Flows & kit:** `python3 scripts/make_demo_kit.py` (inputs), `python3 scripts/run_flows.py` (drives every flow against :4173/:8000, screenshots + recording, resets after), `python3 scripts/make_flow_playbook.py` (MD + PDF).

**Tweaking the 3D scene:** keyframes `K[1..7]` in `render3d/scene.js` set, per slide:
- camera position, target and field of view;
- beam tilt;
- paper amount;
- lighting;
- screen visibility.

`render.py` serves the page from memory, so no HTML file is written (workspace rule).

## Layout

```text
pitch/
├── Insaaf_AI_PS29_Pitch.pptx / _static.pptx / .pdf / Insaaf_AI_3D_showreel.mp4
├── PRESENTER_SCRIPT.md, LIVE_DEMO_RUNBOOK.md, SOURCES.md
├── screenshots/            # real app captures (2x, 3200x1800)
├── sources/                # NJDG Goa evidence screenshot
├── source_assets/photos/   # CC-licensed Goa photos + credits.json
└── build/
    ├── build_deck.js       # deck generator (7 slides + appendix)
    ├── render3d/           # scene.js (Three.js monument) + render.py (headless renderer)
    ├── scripts/            # postprocess.py (autoplay + transitions), apply_theme.js
    ├── img/                # 3D stills, posters, overlays, panel textures
    └── media/              # move_s1..7.mp4 camera moves
```
