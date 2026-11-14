// Insaaf AI — PS 29 pitch deck generator (pptxgenjs).
// node build_deck.js            -> ../Insaaf_AI_PS29_Pitch.pptx        (3D camera-move videos on every slide)
// STATIC=1 node build_deck.js   -> ../Insaaf_AI_PS29_Pitch_static.pptx (stills only: PDF export, Keynote, Google Slides)
const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');
const { applyTheme } = require('./scripts/apply_theme.js');

const STATIC = process.env.STATIC === '1';
const IMG = (f) => path.join(__dirname, 'img', f);
const MEDIA = (f) => path.join(__dirname, 'media', f);
const OUT = path.join(__dirname, '..', STATIC ? 'Insaaf_AI_PS29_Pitch_static.pptx' : 'Insaaf_AI_PS29_Pitch.pptx');

const THEME = {
  name: 'Insaaf Obsidian Gold',
  headFontFace: 'Georgia',
  bodyFontFace: 'Arial',
  colors: {
    dk1: 'EDE6D6', lt1: '06070A', dk2: 'A39C8E', lt2: '12141A',
    accent1: 'C9A868', accent2: '5FA8D3', accent3: '4FB477', accent4: 'E0645A', accent5: 'E2C68A', accent6: '2C303A',
    hlink: 'E2C68A', folHlink: 'C9A868',
  },
};
const HEX = THEME.colors;

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 in
pres.author = 'Team Insaaf AI';
pres.title = 'Insaaf AI — PS 29 Pitch';
pres.subject = 'AI Legal Precedent & Case Outcome Prediction Platform';
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };

const S = pres.SchemeColor;
const C = { ink: S.text1, muted: S.text2, bg: S.background1, panel: S.background2, gold: S.accent1, blue: S.accent2, green: S.accent3, red: S.accent4, lgold: S.accent5, line: S.accent6 };
const MONO = 'Courier New';

// ------------------------------------------------------------------ layouts
const footer = [
  { text: { text: 'INSAAF AI  ·  PS 29', options: { x: 0.6, y: 7.08, w: 4, h: 0.25, fontFace: MONO, fontSize: 9, color: C.muted, charSpacing: 2, margin: 0 } } },
];
pres.defineSlideMaster({
  title: 'HERO', background: { color: HEX.lt1 }, objects: footer,
  slideNumber: { x: 12.25, y: 7.05, w: 0.5, h: 0.28, fontFace: MONO, fontSize: 9, color: HEX.dk2, align: 'right' },
});
pres.defineSlideMaster({
  title: 'CONTENT', background: { color: HEX.lt1 }, objects: [
    ...footer,
    { placeholder: { options: { name: 'eyebrow', type: 'body', x: 0.6, y: 0.32, w: 9.8, h: 0.3, fontFace: MONO, fontSize: 11, color: C.gold, charSpacing: 2, margin: 0, valign: 'top', align: 'left' }, text: '' } },
    { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.6, w: 9.8, h: 0.75, fontFace: 'Georgia', fontSize: 34, color: C.ink, margin: 0, valign: 'top', align: 'left' }, text: '' } },
  ],
  slideNumber: { x: 12.25, y: 7.05, w: 0.5, h: 0.28, fontFace: MONO, fontSize: 9, color: HEX.dk2, align: 'right' },
});

// ------------------------------------------------------------------ helpers
const b64 = (f) => 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64');
function stage(slide, i, overlay) {
  // 3D still is the background; the camera-move clip plays over it and ends on the same frame.
  slide.background = { path: IMG(`r3d_s${i}.jpg`) };
  if (!STATIC && fs.existsSync(MEDIA(`move_s${i}.mp4`))) {
    slide.addMedia({ type: 'video', path: MEDIA(`move_s${i}.mp4`), x: 0, y: 0, w: 13.333, h: 7.5,
      cover: b64(IMG(`poster_s${i}.jpg`)), objectName: `3D camera move ${i}` });
  }
  if (overlay) slide.addImage({ path: IMG(overlay), x: 0, y: 0, w: 13.333, h: 7.5, objectName: 'Readability gradient', altText: '' });
}
function text(slide, t, o) { slide.addText(t, { isTextBox: true, margin: 0, valign: 'top', fontFace: 'Arial', color: C.ink, ...o }); }
function panel(slide, x, y, w, h, o = {}) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08,
    fill: { color: o.fill || C.panel, transparency: o.transparency ?? 18 },
    line: { color: o.line || C.line, width: o.lineWidth || 0.75 }, objectName: o.name || 'Panel',
    shadow: o.glow ? { type: 'outer', color: o.glow, opacity: 0.45, blur: 14, offset: 0, angle: 90 } : undefined });
}
function chip(slide, x, y, w, label, o = {}) {
  const h = o.h || 0.3;
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: h / 2,
    fill: { color: o.fill || C.gold, transparency: o.transparency ?? 82 }, line: { color: o.line || o.fill || C.gold, width: 0.75 }, objectName: `Chip: ${label}` });
  text(slide, label, { x, y, w, h, align: 'center', valign: 'middle', fontSize: o.size || 10.5, bold: o.bold ?? true, color: o.color || o.fill || C.gold, fontFace: o.font || 'Arial' });
}
function brand(slide) {
  slide.addImage({ path: IMG('brand_mark.png'), x: 0.6, y: 0.45, w: 0.42, h: 0.42, altText: 'Insaaf AI mark: scales of justice' });
  text(slide, 'INSAAF AI', { x: 1.14, y: 0.47, w: 3, h: 0.24, fontFace: 'Georgia', fontSize: 15, bold: true, charSpacing: 3 });
  text(slide, 'AUTHORITY-LOCKED LEGAL RESEARCH', { x: 1.14, y: 0.71, w: 4, h: 0.18, fontFace: MONO, fontSize: 8, color: C.muted, charSpacing: 1 });
}
const content = (sectionTitle) => pres.addSlide({ masterName: 'CONTENT', sectionTitle });
const hero = (sectionTitle) => pres.addSlide({ masterName: 'HERO', sectionTitle });

// ================================================================== 1 · Justice is waiting
pres.addSection({ title: 'The crisis' });
{
  const s = hero('The crisis');
  stage(s, 1, 'ov_left.png');
  brand(s);
  text(s, 'PS 29 · AI LEGAL PRECEDENT & CASE OUTCOME PREDICTION', { x: 0.6, y: 1.75, w: 7.5, h: 0.3, fontFace: MONO, fontSize: 11, color: C.gold, charSpacing: 2 });
  text(s, '5 crore+ cases are waiting.', { x: 0.6, y: 2.08, w: 7.6, h: 0.9, fontFace: 'Georgia', fontSize: 46 });
  text(s, 'Every one of them is somebody’s story.', { x: 0.6, y: 2.98, w: 7.6, h: 0.6, fontFace: 'Georgia', fontSize: 28, italic: true, color: C.gold });
  text(s, 'Before filing, every litigant asks: has a court decided a case like mine, and how did it end? Today that answer is buried in judgments no junior lawyer has time to read.',
    { x: 0.6, y: 3.75, w: 6.4, h: 0.95, fontSize: 15, color: C.muted, lineSpacingMultiple: 1.1 });
  const stats = [
    ['5,23,99,027', 'pending in India’s district and subordinate courts'],
    ['62,103', 'pending in Goa’s district courts; 55% are over a year old'],
    ['10,471', 'civil cases in Goa filed by senior citizens'],
  ];
  stats.forEach(([n, l], i) => {
    const x = 0.6 + i * 2.45;
    text(s, n, { x, y: 4.95, w: 2.3, h: 0.5, fontFace: 'Georgia', fontSize: 26, color: C.gold });
    text(s, l, { x, y: 5.47, w: 2.2, h: 0.62, fontSize: 11.5, color: C.ink });
  });
  s.addText([
    { text: 'Source: National Judicial Data Grid, live dashboard, accessed 14 Nov 2026 · ', options: {} },
    { text: 'njdg.ecourts.gov.in', options: { hyperlink: { url: 'https://njdg.ecourts.gov.in/njdg_v3/', tooltip: 'NJDG' }, color: C.lgold } },
  ], { isTextBox: true, x: 0.6, y: 6.4, w: 7.4, h: 0.28, margin: 0, fontSize: 10, color: C.muted, fontFace: 'Arial' });
  s.addNotes(`[~50 s] The camera pushes in through a storm of case files. The scales are already tipped.
India has more than five crore cases pending in district and subordinate courts: 5,23,99,027 on the NJDG live dashboard this morning.
Bring it home: 62,103 of those are in Goa's district courts, more than half are over a year old, and 10,471 civil cases in Goa were filed by senior citizens. These are families waiting on a plot, a house, an inheritance.
Behind every number is one question: has a court decided a case like mine, and how did it end? That's the question PS 29 asks us to answer, and that's what Insaaf does.
(Figures: NJDG district-court dashboard, all-India and Goa state view, captured 14 Nov 2026. If asked: High Courts and the Supreme Court are counted separately.)`);
}

// ================================================================== 2 · The legal research gap
{
  const s = content('The crisis');
  stage(s, 2, 'ov_left_strong.png');
  s.addText('THE PROBLEM BEHIND THE PROBLEM', { placeholder: 'eyebrow' });
  s.addText('The legal research gap', { placeholder: 'title' });
  const cards = [
    ['01', 'Information overload', 'Judgments are found by matching words, not situations. The ruling that decides your case may not share a single keyword.'],
    ['02', 'Unverified research', 'Mata v. Avianca (S.D.N.Y., 2023): lawyers fined $5,000 for six AI-invented cases. Citing overruled law is just as fatal.'],
    ['03', 'Uncertain outcomes', 'Advice on whether to file rests on individual experience, without data on how courts ruled on comparable facts.'],
  ];
  cards.forEach(([n, h, b], i) => {
    const y = 1.62 + i * 1.3;
    panel(s, 0.6, y, 6.3, 1.15, { name: `Problem ${n}` });
    text(s, n, { x: 0.85, y: y + 0.17, w: 0.6, h: 0.45, fontFace: 'Georgia', fontSize: 24, color: C.gold });
    text(s, h, { x: 1.55, y: y + 0.13, w: 5.1, h: 0.32, fontSize: 16, bold: true });
    text(s, b, { x: 1.55, y: y + 0.47, w: 5.15, h: 0.62, fontSize: 13.5, color: C.muted });
  });
  panel(s, 0.6, 5.58, 6.3, 1.3, { name: 'Story card', line: C.gold, transparency: 12 });
  s.addImage({ path: IMG('photo_socorro_card.jpg'), x: 0.72, y: 5.7, w: 1.68, h: 1.06, rounding: false,
    altText: 'Socorro plateau, Bardez, Goa (photo: Mike Prince, CC BY 2.0, Wikimedia Commons)' });
  text(s, 'A REAL GOA CASE · REPORTED 24 SEP 2026', { x: 2.55, y: 5.68, w: 4.2, h: 0.22, fontFace: MONO, fontSize: 9.5, color: C.gold, charSpacing: 1 });
  text(s, 'Socorro, Bardez: a dead owner’s land was split into 11 plots and sold to nine buyers via a power of attorney. The heir’s FIR led the ED to attach the plots (₹4.2 crore).',
    { x: 2.55, y: 5.92, w: 4.2, h: 0.72, fontSize: 11.5 });
  text(s, 'Source: Northeast News, 24 Sep 2026 (ED, Panaji)', { x: 2.55, y: 6.6, w: 4.2, h: 0.2, fontSize: 9, italic: true, color: C.muted });
  s.addNotes(`[~50 s] The camera swings to the scales. One pan is buried in case files; the other carries a warning.
Three gaps. One: research is keyword search, but cases are decided on situations. Two: research that isn't verified is dangerous. In Mata v. Avianca, New York lawyers were fined five thousand dollars for six AI-invented cases, and in India an overruled authority can sink an argument just as badly. Three: "will we win?" gets answered from memory.
Now a real Goan case from this autumn. At Socorro in Bardez, a deceased owner's land was mutated to two sisters on an allegedly false heirship claim, split into 11 plots and sold to nine buyers by a power-of-attorney holder. The legal heir's FIR led to a Crime Branch SIT probe, and on 24 September the ED attached the plots, worth 4.2 crore.
Every one of those nine buyers now asks a lawyer the same question: is my title safe, and do I fight or settle? That is the matter we'll follow.
(Source: Northeast News, 24 Sep 2026, from the ED's Panaji office. In the app, our client is a hypothetical, unnamed buyer of one plot; no accused is named. Photo: Socorro plateau, Mike Prince, CC BY 2.0.)`);
}

// ================================================================== 3 · Meet Insaaf AI
pres.addSection({ title: 'The solution' });
{
  const s = content('The solution');
  stage(s, 3, 'ov_bottom.png');
  s.addText('THE SOLUTION', { placeholder: 'eyebrow' });
  s.addText('Meet Insaaf AI', { placeholder: 'title' });
  text(s, 'It does a junior lawyer’s first research pass in minutes, and refuses to write a single legal claim it can’t prove.',
    { x: 0.6, y: 1.45, w: 8.8, h: 0.9, fontFace: 'Georgia', fontSize: 22, italic: true });
  panel(s, 0.5, 2.43, 9.3, 0.55, { transparency: 4, name: 'PS 29 MVP strip' });
  text(s, 'MVP', { x: 0.68, y: 2.55, w: 1.1, h: 0.3, fontFace: MONO, fontSize: 10, color: C.gold, valign: 'middle' });
  chip(s, 1.75, 2.55, 2.75, '✓  Semantic precedent search', { transparency: 70 });
  chip(s, 4.6, 2.55, 2.2, '✓  Outcome prediction', { transparency: 70 });
  chip(s, 6.9, 2.55, 2.75, '✓  One domain: civil property', { transparency: 70 });
  const steps = [
    ['01', 'Client documents', 'PDF, DOCX and Konkani, Hindi or Marathi voice notes'],
    ['02', 'Fact card', 'Each fact marked documented, alleged or disputed, with its source'],
    ['03', 'Precedent search', '1,400+ public judgments ranked by facts and binding court', true],
    ['04', 'Proof Ledger', 'Rule packs mark evidence present, weak or missing'],
    ['05', 'Outcome + citations', 'AI-B band from similar judgments; overruled law flagged', true],
    ['06', 'Verified draft', 'Advocate reviews, approves and seals it to a hash-chained ledger'],
  ];
  const lift = [0.32, 0.1, 0, 0, 0.1, 0.32];
  const W = 1.88, G = 0.17;
  steps.forEach(([n, h, b, core], i) => {
    const x = 0.6 + i * (W + G), y = 4.05 + lift[i];
    if (i < steps.length - 1) {
      const y2 = 4.05 + lift[i + 1];
      s.addShape(pres.shapes.LINE, { x: x + W, y: y + 1.0, w: G, h: y2 - y, flipV: y2 < y, line: { color: C.blue, width: 1.5 }, objectName: 'Flow connector' });
    }
    panel(s, x, y, W, 2.0, { line: core ? C.gold : C.line, lineWidth: core ? 1.5 : 0.75, transparency: 10, name: `Stage ${n}`, glow: core ? HEX.accent1 : undefined });
    if (core) chip(s, x + 0.34, y - 0.38, 1.2, 'MVP', { size: 9, h: 0.26, fill: C.panel, line: C.gold, color: C.gold, transparency: 0 });
    text(s, n, { x: x + 0.18, y: y + 0.16, w: 1.0, h: 0.22, fontFace: MONO, fontSize: 10, color: C.blue });
    text(s, h, { x: x + 0.18, y: y + 0.42, w: W - 0.3, h: 0.55, fontSize: 14, bold: true });
    text(s, b, { x: x + 0.18, y: y + 1.0, w: W - 0.3, h: 0.9, fontSize: 11, color: C.muted });
  });
  s.addNotes(`[~40 s] The camera circles behind the scales; the paper storm starts to lift.
Insaaf AI does a junior lawyer's first research pass in minutes, and it refuses to write a single legal claim it can't prove.
The flow is six stages: client documents, including Konkani voice notes; a fact card that keeps "alleged" separate from "documented"; precedent search; a Proof Ledger of missing evidence; the outcome band with citation checks; and a draft that only a senior advocate can approve.
The two gold MVP stages are exactly what PS 29 asks for: precedent search and outcome prediction, in one domain, civil property.`);
}

// ================================================================== 4 · Opportunity
pres.addSection({ title: 'The opportunity' });
{
  const s = hero('The opportunity');
  stage(s, 4, 'ov_left.png');
  brand(s);
  text(s, 'THE OPPORTUNITY', { x: 0.6, y: 1.25, w: 6, h: 0.3, fontFace: MONO, fontSize: 11, color: C.gold, charSpacing: 2 });
  text(s, 'Making justice more accessible, one case at a time.', { x: 0.6, y: 1.55, w: 7.6, h: 1.25, fontFace: 'Georgia', fontSize: 34 });
  const cols = [
    ['WHO PAYS', ['Independent advocates', 'Small chambers and firms', 'Corporate legal teams', 'Law schools, legal-aid clinics']],
    ['PROPOSED PRICING', ['Student ₹199 / month', 'Solo advocate ₹999 / month', 'Chamber ₹2,499 / seat / month', 'Per-case briefs and institutional licences']],
    ['WHAT’S NEXT', ['Goa pilot near Mapusa, Margao and Panaji courts', 'Bombay HC: Goa, then Maharashtra', 'Embedding search, more labelled outcomes', 'More languages and practice areas']],
  ];
  cols.forEach(([h, items], i) => {
    const x = 0.6 + i * 2.2;
    text(s, h, { x, y: 3.0, w: 2.1, h: 0.25, fontFace: MONO, fontSize: 10, color: C.gold, charSpacing: 1 });
    s.addText(items.map((t, k) => ({ text: t, options: { bullet: { indent: 12 }, breakLine: k < items.length - 1 } })),
      { isTextBox: true, x, y: 3.32, w: 2.0, h: 2.0, margin: 0, valign: 'top', fontSize: 11.5, color: C.ink, fontFace: 'Arial', paraSpaceAfter: 5 });
  });
  text(s, 'Prices are hypotheses to validate with pilot users, not current revenue.', { x: 0.6, y: 5.38, w: 7.5, h: 0.25, fontSize: 10, italic: true, color: C.muted });
  panel(s, 0.6, 5.8, 7.0, 0.85, { transparency: 12, line: C.gold, name: 'Why they pay' });
  text(s, 'Why they pay: the first research pass on a matter takes minutes, not an evening, and every claim in it can be shown to a senior or a judge.', { x: 0.8, y: 5.88, w: 6.65, h: 0.7, fontSize: 12, valign: 'middle' });
  s.addNotes(`[~45 s] The camera pulls back to a wide shot; the paper storm has almost cleared and the scales are nearly level.
Who pays: independent advocates, small chambers, corporate legal teams, law schools and legal-aid clinics, exactly the PS 29 customer list.
Pricing is a hypothesis we'll test: students at 199 rupees a month, a solo advocate at 999, chambers at 2,499 per seat, plus per-case briefs and institutional licences.
Why they pay: the first research pass takes minutes instead of an evening, and every claim can be shown to a senior or a judge.
Go-to-market starts at home: chambers around the Mapusa, Margao and Panaji courts, then the rest of the Bombay High Court's jurisdiction, then India.
Now let's look at why anyone should trust it.`);
}

// ================================================================== 5 · Trust layer
pres.addSection({ title: 'The proof' });
{
  const s = content('The proof');
  stage(s, 5, 'ov_dim.png');
  s.addText('THE TRUST LAYER · RESPONSES FROM THE LIVE APP', { placeholder: 'eyebrow' });
  s.addText('It doesn’t just answer. It proves.', { placeholder: 'title' });
  text(s, 'Authority Lock', { x: 0.6, y: 1.5, w: 4, h: 0.32, fontSize: 15, bold: true, color: C.gold });
  const lock = [
    ['BLOCKED', C.red, HEX.accent4, 'Held in Imaginary Case (2099) 1 SCC 1', 'No verified authority found.'],
    ['BLOCKED', C.red, HEX.accent4, 'Suraj Lamp held that a registered sale deed is not required', 'Claim contradicts the stored holding of this authority.'],
    ['VERIFIED', C.green, HEX.accent3, 'Suraj Lamp & Industries v. State of Haryana', 'Verified against stored paragraph 1 (SC, 2011).'],
  ];
  lock.forEach(([st, col, hex, claim, resp], i) => {
    const y = 1.92 + i * 1.15;
    panel(s, 0.6, y, 6.1, 1.02, { line: col, lineWidth: 1.25, transparency: 6, glow: hex, name: `Authority Lock ${i + 1}` });
    chip(s, 0.78, y + 0.14, 1.12, st, { fill: col, size: 10, h: 0.28, transparency: 78 });
    text(s, `“${claim}”`, { x: 2.05, y: y + 0.1, w: 4.5, h: 0.5, fontSize: 12.5, italic: true });
    text(s, resp, { x: 2.05, y: y + 0.63, w: 4.5, h: 0.3, fontSize: 12.5, bold: true, color: col });
  });
  panel(s, 0.6, 5.45, 6.1, 1.4, { name: 'Citation Health' });
  text(s, 'Citation Health', { x: 0.82, y: 5.56, w: 3, h: 0.3, fontSize: 14, bold: true, color: C.gold });
  text(s, 'Suresh Kumar Koushal v. Naz Foundation (2013) is flagged Overruled by Navtej Singh Johar (2018). The draft cannot be sealed until a senior advocate records a reasoned override.',
    { x: 0.82, y: 5.9, w: 5.7, h: 0.9, fontSize: 12.5 });

  text(s, 'Bias Firewall · 10 identities · ε = 0.02', { x: 7.05, y: 1.5, w: 5.7, h: 0.32, fontSize: 15, bold: true, color: C.gold });
  panel(s, 7.05, 1.92, 5.7, 3.4, { name: 'Firewall chart panel', transparency: 8 });
  const ids = ['Base', 'Muslim', 'Christian', 'Dalit', 'Adivasi', 'OBC', 'Woman', 'Trans', 'Non-Eng.', 'Rural'];
  const masked = [0.61, 0.61, 0.61, 0.61, 0.61, 0.61, 0.61, 0.61, 0.61, 0.61];
  const unmasked = [0.50, 0.42, 0.48, 0.43, 0.42, 0.46, 0.47, 0.45, 0.46, 0.44];
  const P = { x0: 7.85, x1: 12.4, y0: 2.5, y1: 4.4, v0: 0.40, v1: 0.65 };
  const px = (i) => P.x0 + (P.x1 - P.x0) * i / (ids.length - 1);
  const py = (v) => P.y1 - (P.y1 - P.y0) * (v - P.v0) / (P.v1 - P.v0);
  [0.40, 0.45, 0.50, 0.55, 0.60, 0.65].forEach((v) => {
    s.addShape(pres.shapes.LINE, { x: P.x0 - 0.1, y: py(v), w: P.x1 - P.x0 + 0.2, h: 0, line: { color: C.line, width: 0.5 }, objectName: `Grid ${v}` });
    text(s, v.toFixed(2), { x: 7.2, y: py(v) - 0.1, w: 0.5, h: 0.2, fontSize: 10, color: C.muted, align: 'right', fontFace: MONO });
  });
  const series = (vals, col, name, dash) => {
    vals.forEach((v, i) => {
      if (i < vals.length - 1) {
        const ya = py(v), yb = py(vals[i + 1]);
        s.addShape(pres.shapes.LINE, { x: px(i), y: Math.min(ya, yb), w: px(i + 1) - px(i), h: Math.abs(yb - ya), flipV: yb < ya,
          line: { color: col, width: 2.25, dashType: dash || 'solid' }, objectName: `${name} segment ${i + 1}` });
      }
    });
    vals.forEach((v, i) => s.addShape(pres.shapes.OVAL, { x: px(i) - 0.06, y: py(v) - 0.06, w: 0.12, h: 0.12, fill: { color: col }, line: { color: col, width: 0.5 }, objectName: `${name} point ${ids[i]}` }));
  };
  series(unmasked, C.red, 'Unmasked model', 'dash');
  series(masked, C.green, 'Masked Insaaf score');
  ids.forEach((id, i) => text(s, id, { x: px(i) - 0.45, y: 4.78, w: 0.9, h: 0.22, fontSize: 10, color: C.muted, align: 'center', rotate: -35 }));
  [[C.green, 'Insaaf score (identity masked)', 7.3, 'solid'], [C.red, 'Unmasked comparison model', 9.95, 'dash']].forEach(([col, lbl, x, dash]) => {
    s.addShape(pres.shapes.LINE, { x, y: 2.17, w: 0.35, h: 0, line: { color: col, width: 2.25, dashType: dash }, objectName: `Legend ${lbl}` });
    text(s, lbl, { x: x + 0.42, y: 2.06, w: 2.3, h: 0.22, fontSize: 10, color: C.ink });
  });
  text(s, 'Score per identity on the Socorro matter (0.40–0.65)', { x: 7.2, y: 5.05, w: 5.4, h: 0.22, fontSize: 10, italic: true, color: C.muted, align: 'center' });
  chip(s, 7.05, 5.45, 2.75, 'Masked score: Δ 0.00', { fill: C.green, size: 10.5, h: 0.32, transparency: 78 });
  chip(s, 9.95, 5.45, 2.8, 'Unmasked: drifts up to 0.08', { fill: C.red, size: 10.5, h: 0.32, transparency: 78 });
  text(s, 'Identity markers are masked, the score is re-run for every identity, and it is withheld if it moves more than 0.02. The unmasked model is a deliberately biased simulation shown for contrast. This proves our score is invariant; it does not certify any language model as unbiased.',
    { x: 7.05, y: 5.9, w: 5.7, h: 0.95, fontSize: 11, color: C.muted });
  s.addNotes(`[~60 s] The camera comes round to face the scales. This is the slide judges should remember.
Authority Lock, with responses copied from the running app: a case that doesn't exist, "Imaginary Case 2099", is refused: "No verified authority found." A real case with a twisted holding, claiming Suraj Lamp said a registered deed isn't needed, is refused: "Claim contradicts the stored holding." The real Suraj Lamp citation verifies against its stored paragraph.
Citation Health: Koushal is flagged overruled by Navtej Johar, and the draft can't be sealed until a senior records a reasoned override, which goes into a hash-chained ledger.
Bias Firewall: we inject ten protected identities. On the Socorro matter the masked Insaaf score stays at 0.61 for every one (delta zero). A deliberately biased comparison model drifts by up to eight points. If ours ever moved more than 0.02, the score would be withheld.
Honest line: the score model uses structured features, so this shows masking and invariance. It is not a claim that any LLM is unbiased.`);
}

// ================================================================== 6 · Prediction
{
  const s = content('The proof');
  stage(s, 6, 'ov_dim.png');
  s.addText('THE INTELLIGENCE · PS 29 OUTCOME PREDICTION', { placeholder: 'eyebrow' });
  s.addText('Predict. Evaluate. Decide.', { placeholder: 'title' });
  chip(s, 0.6, 1.45, 8.4, 'Real Goa case · Socorro, Bardez · hypothetical buyer of Plot 7 · Civil Judge Senior Division, Mapusa',
    { fill: C.blue, size: 10.5, bold: false, transparency: 85, color: C.ink, h: 0.32 });

  panel(s, 0.6, 1.95, 3.85, 2.15, { line: C.lgold, glow: HEX.accent5, transparency: 6, name: 'AI-B band' });
  text(s, 'INSAAF AI-B BAND', { x: 0.82, y: 2.1, w: 3, h: 0.22, fontFace: MONO, fontSize: 10, color: C.gold, charSpacing: 1 });
  text(s, 'Uncertain', { x: 0.8, y: 2.42, w: 2.6, h: 0.75, fontFace: 'Georgia', fontSize: 38, color: C.lgold });
  chip(s, 3.2, 2.6, 1.05, '61%', { fill: C.ink, transparency: 88, color: C.ink, size: 20, font: 'Georgia', h: 0.48 });
  text(s, 'Chance that relief is granted, released only after the Bias Firewall passes.', { x: 0.82, y: 3.3, w: 3.45, h: 0.65, fontSize: 12, color: C.muted });
  const blend = [['50%', 'Evidence model', 'deed, stamp duty, possession'], ['30%', 'Similar judgments', '4 of 11 retrieved granted relief'], ['20%', 'Court prior', 'Mapusa civil courts, pooled']];
  blend.forEach(([p, l, d], i) => {
    const x = 0.6 + i * 1.335;
    panel(s, x, 4.25, 1.18, 1.68, { transparency: 8, name: `Blend ${l}` });
    text(s, p, { x: x + 0.12, y: 4.36, w: 1.0, h: 0.4, fontFace: 'Georgia', fontSize: 20, color: C.gold });
    text(s, l, { x: x + 0.12, y: 4.8, w: 1.0, h: 0.42, fontSize: 10.5, bold: true });
    text(s, d, { x: x + 0.12, y: 5.24, w: 1.0, h: 0.62, fontSize: 10, color: C.muted });
  });

  text(s, 'Why the band is Uncertain', { x: 4.8, y: 1.95, w: 4.2, h: 0.3, fontSize: 14, bold: true, color: C.gold });
  const factors = [
    ['Registered sale deed: on record', 0.37], ['Within limitation', 0.14], ['Stamp duty paid on the deed', 0.11],
    ['Possession evidence: missing', -0.10], ['4 of 11 similar judgments granted relief', -0.07], ['Court baseline (Mapusa)', -0.02],
  ];
  const zero = 4.8 + 1.75, scale = 1.7 / 0.4;
  factors.forEach(([l, v], i) => {
    const y = 2.38 + i * 0.6;
    text(s, l, { x: 4.8, y, w: 3.4, h: 0.26, fontSize: 12 });
    text(s, (v > 0 ? '+' : '−') + Math.abs(v).toFixed(2), { x: 8.2, y, w: 0.8, h: 0.26, fontFace: MONO, fontSize: 12, bold: true, align: 'right', color: v > 0 ? C.green : C.red });
    s.addShape(pres.shapes.RECTANGLE, { x: 4.8, y: y + 0.33, w: 3.5, h: 0.08, fill: { color: C.line }, line: { color: C.line, width: 0 }, objectName: 'Factor track' });
    const w = Math.max(Math.abs(v) * scale, 0.04);
    s.addShape(pres.shapes.RECTANGLE, { x: v > 0 ? zero : zero - w, y: y + 0.31, w, h: 0.12, fill: { color: v > 0 ? C.green : C.red }, line: { color: v > 0 ? C.green : C.red, width: 0 }, objectName: `Factor ${l}` });
  });

  text(s, 'Proof Ledger', { x: 9.4, y: 1.95, w: 3.3, h: 0.3, fontSize: 14, bold: true, color: C.gold });
  const proof = [['PRESENT', C.green, 'Registered sale deed'], ['PRESENT', C.green, 'Stamp duty paid'], ['WEAK', C.lgold, 'Form I & XIV (not in her name)'], ['MISSING', C.red, 'Possession evidence'], ['MISSING', C.red, 'Payment trail (cash, no receipt)']];
  proof.forEach(([st, col, l], i) => {
    const y = 2.38 + i * 0.42;
    chip(s, 9.4, y, 0.95, st, { fill: col, size: 9, h: 0.27, transparency: 78 });
    text(s, l, { x: 10.47, y: y + 0.01, w: 2.3, h: 0.27, fontSize: 12, valign: 'middle' });
  });
  panel(s, 9.4, 4.6, 3.35, 1.33, { line: C.green, transparency: 6, name: 'Advice' });
  s.addText([{ text: 'Advice → ', options: { color: C.ink } }, { text: 'Settle', options: { color: C.green } }],
    { isTextBox: true, x: 9.58, y: 4.7, w: 3.1, h: 0.32, margin: 0, fontSize: 15, bold: true, fontFace: 'Arial' });
  text(s, 'Lok Adalat eligible (award final, fee refunded) and s.89 CPC mediation available. Precedents found: a power of attorney does not transfer title.',
    { x: 9.58, y: 5.05, w: 3.05, h: 0.85, fontSize: 11, color: C.muted });

  panel(s, 0.6, 6.12, 12.15, 0.72, { transparency: 10, name: 'Honesty strip' });
  const honest = ['Court-level priors only, never individual judges', 'Held-out check: 38 of 50 correct, Brier 0.152, demo scale', 'Decision support for the advocate, not a guarantee or legal advice'];
  honest.forEach((h, i) => {
    const x = 0.82 + i * 4.02;
    s.addShape(pres.shapes.OVAL, { x, y: 6.4, w: 0.13, h: 0.13, fill: { color: C.gold }, line: { color: C.gold, width: 0 }, objectName: 'Bullet dot' });
    text(s, h, { x: x + 0.22, y: 6.2, w: 3.7, h: 0.56, fontSize: 11.5, valign: 'middle' });
  });
  s.addNotes(`[~60 s] The camera rises over the scales; they are almost level now.
This is PS 29's prediction requirement on the real Socorro case, for a hypothetical buyer of one plot. The band is Uncertain, 61 percent, and every point is explained.
50 percent comes from the evidence model: her deed is registered and stamped, but she has no possession evidence. 30 percent comes from the real outcomes of the 11 most similar judgments we retrieved: only 4 granted relief. 20 percent is a court-level prior for Mapusa civil courts, pooled so a small sample can't swing it.
The Proof Ledger shows why paper isn't enough: Form I & XIV is not in her name, she has no possession evidence, and part of the price was paid in cash with no receipt. The precedents say a power of attorney does not transfer title. The advice is deterministic: settle, through Lok Adalat or mediation, rather than stake everything on a title that may rest on a forged heirship.
Honest numbers: court level only, never named judges. On held-out data the model got 38 of 50 right with a Brier score of 0.152. That's demo-scale, and we say so. It supports the advocate's decision; it doesn't replace it.`);
}

// ================================================================== 7 · Final: the product, live
pres.addSection({ title: 'The product' });
{
  const s = content('The product');
  stage(s, 7, 'ov_top.png');
  s.addText('THE PRODUCT · REAL SCREENS FROM THE RUNNING APP', { placeholder: 'eyebrow' });
  s.addText('From case file to legal clarity', { placeholder: 'title' });
  const labels = [
    [0.4, 3.62, '1', 'Precedent search · the Socorro facts, in plain English'],
    [8.73, 3.62, '2', 'Outcome band · Uncertain, 61%, with its reasons'],
    [0.4, 6.75, '3', 'Fact card · Konkani original beside English'],
    [8.73, 6.75, '4', 'Authority Lock · only verified law enters a draft'],
  ];
  labels.forEach(([x, y, n, t]) => {
    panel(s, x, y, 4.2, 0.36, { transparency: 4, line: C.gold, name: `Callout ${n}` });
    s.addShape(pres.shapes.OVAL, { x: x + 0.07, y: y + 0.05, w: 0.26, h: 0.26, fill: { color: C.gold }, line: { color: C.gold, width: 0.5 }, objectName: `Badge ${n}` });
    text(s, n, { x: x + 0.07, y: y + 0.05, w: 0.26, h: 0.26, align: 'center', valign: 'middle', fontSize: 10, bold: true, color: C.bg });
    text(s, t, { x: x + 0.42, y: y + 0.03, w: 3.7, h: 0.3, valign: 'middle', fontSize: 10.5 });
  });
  panel(s, 4.72, 5.55, 3.9, 1.05, { transparency: 18, name: 'Tagline backing' });
  text(s, 'Justice deserves intelligence.', { x: 4.72, y: 5.62, w: 3.9, h: 0.48, align: 'center', fontFace: 'Georgia', fontSize: 21, color: C.gold });
  text(s, 'We don’t replace lawyers. We empower them.', { x: 4.72, y: 6.12, w: 3.9, h: 0.36, align: 'center', fontSize: 12.5 });
  s.addText([{ text: '▶  Live demo · sign in', options: { hyperlink: { url: 'http://localhost:4173/', tooltip: 'Open Insaaf AI: sign in, intro, then the matter' } } }],
    { isTextBox: true, x: 5.1, y: 6.75, w: 3.13, h: 0.36, align: 'center', valign: 'middle', margin: 0, fontSize: 11, bold: true, color: C.lgold, fontFace: 'Arial',
      fill: { color: C.panel, transparency: 5 }, line: { color: C.blue, width: 1 } });
  s.addNotes(`[~30 s, then LIVE DEMO ~3 min] Final slide. The camera orbits to the side; four real screens from the running app fly in around the scales, which are now level.
One: precedent search on the Socorro facts in plain English, ranked against 1,400+ public judgments with binding courts first.
Two: the buyer's outcome band is Uncertain, 61%, with every factor shown.
Three: her Konkani statement sits next to the English, and an allegation never becomes a fact.
Four: the Authority Lock means only verified law can enter a draft.
Justice deserves intelligence. We don't replace lawyers. We empower them. Let me show you.
CLICK "Live demo · sign in" (or Cmd-Tab to the browser on http://localhost:4173). Follow LIVE_DEMO_RUNBOOK.md: sign in as Adv. Dhanshri, let the intro play, then the queue, the Socorro matter (mat_025), search, firewall, Authority Lock, advice.`);
}

// ================================================================== Appendix A · Sources & credits
pres.addSection({ title: 'Appendix' });
{
  const s = content('Appendix');
  s.background = { path: IMG('r3d_s7.jpg') };
  s.addImage({ path: IMG('ov_dim.png'), x: 0, y: 0, w: 13.333, h: 7.5, altText: '' });
  s.addImage({ path: IMG('ov_dim.png'), x: 0, y: 0, w: 13.333, h: 7.5, altText: '' });
  s.addText('APPENDIX A', { placeholder: 'eyebrow' });
  s.addText('Sources and credits', { placeholder: 'title' });
  const data = [
    'NJDG live dashboard (njdg.ecourts.gov.in), accessed 14 Nov 2026. All-India district and subordinate courts: 5,23,99,027 pending. Goa: 62,103 pending, 55.49% over one year old; 10,471 civil cases filed by senior citizens.',
    'PS 29 problem statement, hackathon brief (page 29 of 35).',
    'Mata v. Avianca, Inc., No. 22-cv-1461 (S.D.N.Y., 22 June 2023): $5,000 sanction for fabricated citations.',
    'Suraj Lamp & Industries v. State of Haryana (SC, 11 Oct 2011): indiankanoon.org/doc/1565619.',
    'Navtej Singh Johar v. Union of India (SC, 2018) overruled Suresh Kumar Koushal v. Naz Foundation (2013).',
    'Legal Services Authorities Act, 1987, s.21: Lok Adalat awards final, no appeal.',
    'Insaaf Precedent Index: 1,400+ public judgments (statute pages excluded), 15 practice areas (repo: ml/data/precedent_corpus.json). Model card: ml/training/artifacts/model_meta.json.',
  ];
  const visuals = [
    '3D scenes: original Scales-of-Justice monument modelled and rendered in code by the team (Three.js). No stock or AI-generated imagery.',
    'Product screens: real screenshots of the Insaaf AI app, 14 Nov 2026 (demo matters are fictional or reconstructed from public reporting).',
    'Socorro photo: “Socorro Plateau” by Mike Prince, CC BY 2.0, Wikimedia Commons.',
    'Real case: Northeast News, “ED attaches 11 Goa plots worth Rs 4.2 crore in alleged land grab case”, 24 Sep 2026. Demo client is hypothetical; no accused named.',
    'Authority Lock and Bias Firewall values: live API responses for demo matter mat_001.',
  ];
  text(s, 'DATA AND LAW', { x: 0.6, y: 1.55, w: 6, h: 0.25, fontFace: MONO, fontSize: 10, color: C.gold });
  s.addText(data.map((t, k) => ({ text: t, options: { bullet: { indent: 12 }, breakLine: k < data.length - 1 } })),
    { isTextBox: true, x: 0.6, y: 1.88, w: 6.6, h: 4.9, margin: 0, valign: 'top', fontSize: 11, color: C.ink, fontFace: 'Arial', paraSpaceAfter: 6 });
  text(s, 'VISUALS', { x: 7.6, y: 1.55, w: 5, h: 0.25, fontFace: MONO, fontSize: 10, color: C.gold });
  s.addText(visuals.map((t, k) => ({ text: t, options: { bullet: { indent: 12 }, breakLine: k < visuals.length - 1 } })),
    { isTextBox: true, x: 7.6, y: 1.88, w: 5.15, h: 4.9, margin: 0, valign: 'top', fontSize: 11, color: C.ink, fontFace: 'Arial', paraSpaceAfter: 6 });
  s.addNotes('Backup slide. Use if a judge asks where a number or image came from.');
}

// ================================================================== Appendix B · Under the hood & limits
{
  const s = content('Appendix');
  s.background = { path: IMG('r3d_s5.jpg') };
  s.addImage({ path: IMG('ov_dim.png'), x: 0, y: 0, w: 13.333, h: 7.5, altText: '' });
  s.addImage({ path: IMG('ov_dim.png'), x: 0, y: 0, w: 13.333, h: 7.5, altText: '' });
  s.addText('APPENDIX B', { placeholder: 'eyebrow' });
  s.addText('Under the hood, and what we don’t claim', { placeholder: 'title' });
  const how = [
    ['Search', 'Plain-language facts → legal alias expansion (GPA, s.138, 12A…) → TF-IDF word + character n-grams over LLM-labelled issue and holding summaries → re-rank by binding court (Art. 141, same bench), practice area and recency → paragraph-level evidence.'],
    ['Prediction', 'p = 0.5 · tempered evidence model + 0.3 · Beta-smoothed outcome rate of retrieved judgments + 0.2 · court prior, with the prior pooled as (n·local + k·parent) / (n + k).'],
    ['Trust', 'Authority Lock on every inserted citation, citator check for overruled law, 10-identity firewall with ε = 0.02, SHA-256 hash-chained reviewer ledger, role-based chamber access.'],
  ];
  how.forEach(([h, b], i) => {
    const y = 1.6 + i * 1.32;
    panel(s, 0.6, y, 6.5, 1.18, { transparency: 8, name: `How ${h}` });
    text(s, h, { x: 0.8, y: y + 0.12, w: 1.3, h: 0.3, fontSize: 14, bold: true, color: C.gold });
    text(s, b, { x: 2.0, y: y + 0.12, w: 4.95, h: 0.98, fontSize: 11 });
  });
  text(s, 'Calibration on held-out cases', { x: 7.5, y: 1.55, w: 5.2, h: 0.3, fontSize: 14, bold: true, color: C.gold });
  const xs = [0.107, 0.318, 0.42, 0.686, 0.977], ys = [0.273, 0.7, 1.0, 1.0, 0.96];
  const Q = { x0: 8.1, x1: 12.55, y0: 2.0, y1: 3.9 };
  const qx = (v) => Q.x0 + (Q.x1 - Q.x0) * v, qy = (v) => Q.y1 - (Q.y1 - Q.y0) * v;
  [0, 0.5, 1].forEach((v) => {
    s.addShape(pres.shapes.LINE, { x: Q.x0, y: qy(v), w: Q.x1 - Q.x0, h: 0, line: { color: C.line, width: 0.5 }, objectName: `Cal grid ${v}` });
    text(s, String(v), { x: Q.x0 - 0.45, y: qy(v) - 0.1, w: 0.38, h: 0.2, fontSize: 10, color: C.muted, align: 'right', fontFace: MONO });
    text(s, String(v), { x: qx(v) - 0.2, y: Q.y1 + 0.05, w: 0.4, h: 0.2, fontSize: 10, color: C.muted, align: 'center', fontFace: MONO });
  });
  s.addShape(pres.shapes.LINE, { x: Q.x0, y: Q.y0, w: Q.x1 - Q.x0, h: Q.y1 - Q.y0, flipV: true, line: { color: C.muted, width: 1, dashType: 'dash' }, objectName: 'Perfect calibration' });
  xs.forEach((x, i) => s.addShape(pres.shapes.OVAL, { x: qx(x) - 0.07, y: qy(ys[i]) - 0.07, w: 0.14, h: 0.14, fill: { color: C.gold }, line: { color: C.gold, width: 0.5 }, objectName: `Calibration bin ${i + 1}` }));
  text(s, 'x: predicted · y: observed · dashed: perfect calibration · gold: held-out bins', { x: 7.5, y: 4.22, w: 5.25, h: 0.22, fontSize: 10, italic: true, color: C.muted });
  text(s, 'What we don’t claim', { x: 7.5, y: 4.6, w: 5.2, h: 0.3, fontSize: 14, bold: true, color: C.red });
  const nots = ['Not legal advice; every draft needs an advocate’s approval.', 'Not a validated predictor: 240 labelled cases, 38 of 50 on held-out data.', 'Search ranks by weighted terms and court, not neural embeddings (yet).', 'The firewall proves invariance of our score, not LLM fairness.'];
  s.addText(nots.map((t, k) => ({ text: t, options: { bullet: { indent: 12 }, breakLine: k < nots.length - 1 } })),
    { isTextBox: true, x: 7.5, y: 4.95, w: 5.25, h: 1.9, margin: 0, valign: 'top', fontSize: 11, color: C.ink, fontFace: 'Arial', paraSpaceAfter: 5 });
  s.addNotes('Backup slide for technical judges: how search and prediction work, calibration, and the limits we state up front.');
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log('wrote', OUT);
})();
