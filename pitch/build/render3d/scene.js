// Insaaf AI — original 3D "Scales of Justice" monument scene (procedural, no external models).
// Rendered headless by render.py: window.ready, window.setSize(w,h), window.renderKey(i), window.renderBetween(a,b,u).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
scene.fog = new THREE.FogExp2(0x070912, 0.018);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 200);

// ---------------------------------------------------------------- materials
const GOLD = new THREE.MeshPhysicalMaterial({ color: 0xd2ad66, metalness: 1, roughness: 0.26, clearcoat: 0.3, clearcoatRoughness: 0.3 });
const GOLD_DARK = new THREE.MeshPhysicalMaterial({ color: 0x8c6a3a, metalness: 1, roughness: 0.38 });
const MARBLE = new THREE.MeshPhysicalMaterial({ color: 0x14151a, metalness: 0.1, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2 });
const STONE = new THREE.MeshStandardMaterial({ color: 0x1c1d24, metalness: 0.0, roughness: 0.85 });

// ---------------------------------------------------------------- floor (soft mirror)
const floorTint = new THREE.Mesh(new THREE.CircleGeometry(60, 96),
  new THREE.MeshPhysicalMaterial({ color: 0x050609, roughness: 0.5, metalness: 0.2, clearcoat: 0.35, clearcoatRoughness: 0.35, envMapIntensity: 0.4 }));
floorTint.rotation.x = -Math.PI / 2;
floorTint.receiveShadow = true;
scene.add(floorTint);

// marble veins: faint gold ring inlays on the floor
for (const r of [4.2, 4.32, 9.5]) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.03, 160),
    new THREE.MeshBasicMaterial({ color: 0x8c6a3a, transparent: true, opacity: 0.35 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.004; scene.add(ring);
}
const lightRing = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.025, 8, 200),
  new THREE.MeshBasicMaterial({ color: 0x5fa8d3, transparent: true, opacity: 0 }));
lightRing.rotation.x = -Math.PI / 2; lightRing.position.y = 0.03; scene.add(lightRing);

// ---------------------------------------------------------------- colonnade (full ring, courtroom hall)
function lathe(points, segs = 48, mat = STONE) {
  const g = new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segs);
  return new THREE.Mesh(g, mat);
}
const columnProfile = [[0, 0], [0.95, 0], [0.95, 0.35], [0.8, 0.45], [0.72, 0.6], [0.66, 0.8], [0.6, 15.0],
  [0.72, 15.25], [0.9, 15.45], [1.05, 15.6], [1.05, 15.9], [0, 15.9]];
const colGeo = new THREE.LatheGeometry(columnProfile.map(([x, y]) => new THREE.Vector2(x, y)), 20);
const N_COL = 20;
for (let i = 0; i < N_COL; i++) {
  const a = (i / N_COL) * Math.PI * 2;
  const c = new THREE.Mesh(colGeo, STONE);
  c.position.set(Math.sin(a) * 29, 0, Math.cos(a) * 29);
  c.castShadow = false; c.receiveShadow = true;
  scene.add(c);
}
// entablature ring
const ent = new THREE.Mesh(new THREE.TorusGeometry(29, 0.9, 6, 128), STONE);
ent.rotation.x = Math.PI / 2; ent.position.y = 16.5; scene.add(ent);

// ---------------------------------------------------------------- the monument: Scales of Justice
const monument = new THREE.Group(); scene.add(monument);
// stepped plinth
[[3.4, 0.35, 0], [2.8, 0.4, 0.35], [2.3, 0.55, 0.75]].forEach(([w, h, y]) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), MARBLE);
  m.position.y = y + h / 2; m.castShadow = true; m.receiveShadow = true; monument.add(m);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.04, w + 0.04), GOLD_DARK);
  trim.position.y = y + h; monument.add(trim);
});
const BASE_Y = 1.3;
// pillar (lathe): base flare, shaft with collar rings, capital
const pillar = lathe([[0, 0], [0.62, 0], [0.62, 0.12], [0.44, 0.22], [0.36, 0.45], [0.22, 0.8], [0.17, 1.2],
  [0.15, 3.0], [0.22, 3.05], [0.22, 3.15], [0.15, 3.2], [0.13, 5.0], [0.2, 5.2], [0.3, 5.35], [0.24, 5.45],
  [0.14, 5.5], [0, 5.5]], 64, GOLD);
pillar.position.y = BASE_Y; pillar.castShadow = true; monument.add(pillar);
const PIVOT_Y = BASE_Y + 5.6;
const finial = new THREE.Group(); finial.position.y = PIVOT_Y; monument.add(finial);
const orb = new THREE.Mesh(new THREE.SphereGeometry(0.26, 48, 32), GOLD); orb.position.y = 0.55; finial.add(orb);
const spire = lathe([[0, 0], [0.09, 0], [0.05, 0.5], [0, 0.95]], 32, GOLD); spire.position.y = 0.75; finial.add(spire);
const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.32, 48), GOLD); hub.rotation.x = Math.PI / 2; finial.add(hub);

// beam (rotates)
const BEAM_HALF = 2.6;
const beam = new THREE.Group(); beam.position.y = PIVOT_Y; monument.add(beam);
const beamBar = lathe([[0, -BEAM_HALF], [0.05, -BEAM_HALF], [0.09, -BEAM_HALF + 0.35], [0.06, -1.1], [0.11, -0.2],
  [0.11, 0.2], [0.06, 1.1], [0.09, BEAM_HALF - 0.35], [0.05, BEAM_HALF], [0, BEAM_HALF]], 32, GOLD);
beamBar.rotation.z = Math.PI / 2; beamBar.castShadow = true; beam.add(beamBar);
for (const s of [-1, 1]) {
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 32, 24), GOLD); cap.position.x = s * BEAM_HALF; beam.add(cap);
}

// pans + chains (hang vertically from beam ends)
const CHAIN_LEN = 2.6, PAN_R = 1.05;
function makePan() {
  const g = new THREE.Group();
  const bowl = lathe([[0, 0], [0.35, 0.0], [0.75, 0.06], [0.98, 0.17], [PAN_R, 0.27], [PAN_R - 0.03, 0.29], [0.95, 0.2],
    [0.72, 0.1], [0.34, 0.05], [0, 0.05]], 64, GOLD);
  bowl.castShadow = true; g.add(bowl);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(PAN_R - 0.01, 0.025, 12, 96), GOLD);
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.28; g.add(rim);
  const chains = [];
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2 + Math.PI / 6;
    const anchor = new THREE.Vector3(Math.cos(a) * (PAN_R - 0.05), 0.28, Math.sin(a) * (PAN_R - 0.05));
    const top = new THREE.Vector3(0, CHAIN_LEN, 0);
    const len = anchor.distanceTo(top);
    const links = new THREE.Group();
    const nLinks = 22;
    for (let j = 0; j < nLinks; j++) {
      const link = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 14), GOLD);
      link.position.y = (j + 0.5) / nLinks * len;
      link.rotation.y = j % 2 ? Math.PI / 2 : 0;
      link.scale.y = 1.6;
      links.add(link);
    }
    links.position.copy(anchor);
    links.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(anchor).normalize());
    g.add(links); chains.push(links);
  }
  const ringTop = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 10, 24), GOLD); ringTop.position.y = CHAIN_LEN; g.add(ringTop);
  return g;
}
const panL = makePan(), panR = makePan();
monument.add(panL, panR);

// case-file stack that sits in the left pan (crisis) — plain paper blocks, no text
const PAPER_COL = 0xe6dfcc;
const stack = new THREE.Group(); panL.add(stack);
for (let i = 0; i < 9; i++) {
  const s = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.07, 0.48),
    new THREE.MeshStandardMaterial({ color: i % 3 === 0 ? 0xb89e74 : PAPER_COL, roughness: 0.9 }));
  s.position.set((Math.sin(i * 7.1) * 0.06), 0.12 + i * 0.075, Math.cos(i * 3.3) * 0.05);
  s.rotation.y = Math.sin(i * 2.7) * 0.35;
  s.castShadow = true; stack.add(s);
}
// red warning glyph over the right pan
const warn = new THREE.Group(); panR.add(warn);
const triShape = new THREE.Shape();
triShape.moveTo(0, 0.62); triShape.lineTo(0.55, -0.32); triShape.lineTo(-0.55, -0.32); triShape.closePath();
const triHole = new THREE.Path();
triHole.moveTo(0, 0.48); triHole.lineTo(0.43, -0.25); triHole.lineTo(-0.43, -0.25); triHole.closePath();
triShape.holes.push(triHole);
const warnMat = new THREE.MeshBasicMaterial({ color: 0xff4d42, transparent: true, opacity: 1, side: THREE.DoubleSide });
const tri = new THREE.Mesh(new THREE.ShapeGeometry(triShape), warnMat); warn.add(tri);
const bang = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.38), warnMat); bang.position.y = 0.12; warn.add(bang);
const dot = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), warnMat); dot.position.y = -0.15; warn.add(dot);
warn.position.y = 1.15;

// ---------------------------------------------------------------- god rays + dust
function rayMaterial(color, strength) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 uColor; uniform float uStrength; varying vec2 vUv; void main(){ float a = pow(vUv.y,1.6)*uStrength*(0.6+0.4*sin(vUv.x*40.0)); gl_FragColor=vec4(uColor*a,a);}',
  });
}
const rays = [];
for (const [x, z, rot, s] of [[-3, -2, 0.18, 0.18], [2.5, 3, -0.2, 0.12], [0, 0, 0.0, 0.14]]) {
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 3.6, 22, 48, 1, true), rayMaterial(0xffd9a0, s));
  cone.position.set(x, 11, z); cone.rotation.z = rot; scene.add(cone); rays.push(cone);
}
const dustGeo = new THREE.BufferGeometry();
const N_DUST = 2600, dustBase = new Float32Array(N_DUST * 3);
for (let i = 0; i < N_DUST; i++) {
  const r = Math.sqrt(Math.random()) * 13, a = Math.random() * Math.PI * 2;
  dustBase[i * 3] = Math.cos(a) * r; dustBase[i * 3 + 1] = Math.random() * 14; dustBase[i * 3 + 2] = Math.sin(a) * r;
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustBase.slice(), 3));
const dustMat = new THREE.PointsMaterial({ color: 0xffe2a8, size: 0.045, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
const dust = new THREE.Points(dustGeo, dustMat); scene.add(dust);

// ---------------------------------------------------------------- floating papers (instanced, text-free)
function paperTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 340;
  const g = c.getContext('2d');
  g.fillStyle = '#ece5d3'; g.fillRect(0, 0, 256, 340);
  g.fillStyle = '#d9cfb6'; g.fillRect(0, 0, 256, 6);
  g.fillStyle = 'rgba(70,64,55,0.55)';
  g.fillRect(70, 26, 116, 9);
  for (let y = 56; y < 320; y += 13) {
    const w = 150 + Math.random() * 60; if (Math.random() < 0.08) continue;
    g.fillRect(24, y, Math.min(w, 208), 4);
  }
  g.strokeStyle = 'rgba(150,40,35,0.55)'; g.lineWidth = 3; g.beginPath(); g.arc(200, 292, 18, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const N_PAPER = 420;
const paperMat = new THREE.MeshStandardMaterial({ map: paperTexture(), color: 0xa8a294, side: THREE.DoubleSide, roughness: 0.95, metalness: 0, envMapIntensity: 0.3 });
const papers = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.36, 0.48), paperMat, N_PAPER);
papers.castShadow = false;
scene.add(papers);
const seeds = [];
for (let i = 0; i < N_PAPER; i++) {
  seeds.push({ a: Math.random() * Math.PI * 2, r: 3.4 + Math.pow(Math.random(), 0.8) * 9.0, h: 0.2 + Math.random() * 11,
    rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6, sp: 0.4 + Math.random(), rank: Math.random() });
}
// floor piles of files (crisis)
const piles = new THREE.Group(); scene.add(piles);
for (let p = 0; p < 26; p++) {
  const a = p / 26 * Math.PI * 2 + Math.sin(p) * 0.2, r = 4.8 + (p % 3) * 1.4 + Math.sin(p * 1.7) * 0.5;
  const pile = new THREE.Group();
  const n = 4 + (p * 7) % 9;
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.11, 0.55),
      new THREE.MeshStandardMaterial({ color: i % 4 === 0 ? 0x9b8160 : (i % 4 === 1 ? 0x7d6448 : PAPER_COL), roughness: 0.9 }));
    s.position.set(Math.sin(i * 5.3) * 0.05, 0.055 + i * 0.11, Math.cos(i * 2.1) * 0.05);
    s.rotation.y = Math.sin(i * 3.1 + p) * 0.3; s.castShadow = true; s.receiveShadow = true; pile.add(s);
  }
  pile.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); pile.rotation.y = a;
  piles.add(pile);
}

// ---------------------------------------------------------------- holographic screens (REAL app screenshots)
const loader = new THREE.TextureLoader();
const SCREEN_FILES = ['/img/panel_src_search.png', '/img/panel_src_score.png', '/img/panel_src_facts.png', '/img/panel_src_draft.png'];
const screens = [];
function makeScreen(tex) {
  const aspect = tex.image.width / tex.image.height;
  const w = Math.min(3.2, 1.72 * aspect), h = w / aspect;
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
  face.position.z = 0.012; g.add(face);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.16, h + 0.16),
    new THREE.MeshBasicMaterial({ color: 0x0a1018, transparent: true, opacity: 0.85 }));
  g.add(glass);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.7, h + 0.7), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uO: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `uniform float uO; varying vec2 vUv; void main(){ vec2 d=abs(vUv-0.5)*2.0; float e=max(d.x,d.y); float a=smoothstep(0.80,0.93,e)*(1.0-smoothstep(0.93,1.0,e)); gl_FragColor=vec4(vec3(0.37,0.66,0.83)*a*0.9*uO, a*0.9*uO);}`,
  }));
  glow.position.z = -0.02; g.add(glow);
  const fm = new THREE.MeshBasicMaterial({ color: 0xd8b46e, transparent: true, toneMapped: false });
  const t = 0.022;
  for (const [x, y, sw, sh] of [[0, h / 2 + 0.08, w + 0.18, t], [0, -h / 2 - 0.08, w + 0.18, t], [w / 2 + 0.08, 0, t, h + 0.18], [-w / 2 - 0.08, 0, t, h + 0.18]]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), fm); b.position.set(x, y, 0.016); g.add(b);
  }
  g.userData = { face, glass, glow, frame: fm };
  scene.add(g);
  return g;
}

// ---------------------------------------------------------------- lights
const hemi = new THREE.HemisphereLight(0x8aa6c8, 0x0a0806, 0.25); scene.add(hemi);
const key = new THREE.SpotLight(0xffd6a0, 900, 40, 0.42, 0.65, 1.6);
key.position.set(3.5, 17, 7); key.target.position.set(0, 4.5, 0); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004;
scene.add(key, key.target);
const rim = new THREE.SpotLight(0x5fa8d3, 500, 40, 0.5, 0.8, 1.6);
rim.position.set(-6, 12, -9); rim.target.position.set(0, 5, 0); scene.add(rim, rim.target);
const fill = new THREE.PointLight(0xffc98a, 18, 18, 1.5); fill.position.set(-4, 3, 6); scene.add(fill);
const redLight = new THREE.PointLight(0xff4d42, 0, 6, 1.5); scene.add(redLight);

// ---------------------------------------------------------------- post
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1920, 1080), 0.5, 0.55, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------- keyframes (one per slide, index 0 = dark intro)
// tilt: beam angle (+ = left pan down). papers: 0..1 storm amount. order: 0 chaos .. 1 papers pulled into a ring.
// screens: [opacity, worldPos, facing] per screen; computed below from camera bases.
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const K = [
  { cam: V(0, 1.6, 27), tgt: V(-2.6, 5.2, 0), fov: 30, tilt: 0.30, papers: 1.0, order: 0, piles: 1, stack: 1, warn: 0, key: 0.05, rim: 0.0, warm: 1, ring: 0, exposure: 0.35 },
  { cam: V(2.2, 2.4, 19.5), tgt: V(-3.4, 5.0, 0), fov: 34, tilt: 0.30, papers: 1.0, order: 0, piles: 1, stack: 1, warn: 0, key: 1, rim: 0.5, warm: 1, ring: 0, exposure: 1.0 },
  { cam: V(-7.8, 7.6, 8.5), tgt: V(-2.6, 5.4, -0.4), fov: 33, tilt: 0.30, papers: 0.65, order: 0, piles: 1, stack: 1, warn: 1, key: 1, rim: 0.6, warm: 1, ring: 0, exposure: 1.0 },
  { cam: V(6.5, 9.5, -12.5), tgt: V(-1.0, 4.4, 4.0), fov: 36, rays: 0.4, tilt: 0.16, papers: 0.3, order: 1, piles: 0.5, stack: 0.3, warn: 0, key: 0.85, rim: 1.2, warm: 0.6, ring: 0.6, exposure: 1.0 },
  { cam: V(2.8, 3.2, 22), tgt: V(-6.4, 5.6, 0), fov: 34, tilt: 0.07, papers: 0.08, order: 1, piles: 0.15, stack: 0, warn: 0, key: 1.1, rim: 0.8, warm: 1.0, ring: 0.6, exposure: 1.05 },
  { cam: V(0, 6.4, 13.5), tgt: V(0, 6.2, 0), fov: 34, tilt: 0.04, papers: 0.05, order: 1, piles: 0, stack: 0, warn: 0, key: 0.9, rim: 1.0, warm: 0.7, ring: 0.8, exposure: 0.95 },
  { cam: V(2.4, 13.5, 6.8), tgt: V(0, 6.6, 0), fov: 36, rays: 0.0, tilt: 0.015, papers: 0, order: 1, piles: 0, stack: 0, warn: 0, key: 0.9, rim: 1.0, warm: 0.8, ring: 1, exposure: 0.95 },
  { cam: V(12.5, 5.6, 8.2), tgt: V(0.3, 5.0, 0), fov: 36, tilt: 0.0, papers: 0, order: 1, piles: 0, stack: 0, warn: 0, key: 1.05, rim: 1.1, warm: 1.2, ring: 1, exposure: 1.05, screens: 1 },
];

// screen layout for slide 4: four panels around the monument facing the slide-4 camera
function screenLayout() {
  const k = K[7];
  const fwd = k.tgt.clone().sub(k.cam).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, V(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
  const at = (dx, dy, d) => k.cam.clone().add(fwd.clone().multiplyScalar(d)).add(right.clone().multiplyScalar(dx)).add(up.clone().multiplyScalar(dy));
  return [at(-4.05, 0.95, 11.2), at(4.05, 0.95, 11.2), at(-3.85, -1.5, 10.6), at(3.85, -1.5, 10.6)];
}

const ease = (u) => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
const lerp = (a, b, u) => a + (b - a) * u;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

function apply(st, time) {
  camera.position.copy(st.cam); camera.fov = st.fov; camera.updateProjectionMatrix(); camera.lookAt(st.tgt);
  renderer.toneMappingExposure = st.exposure;
  // scales
  beam.rotation.z = st.tilt;
  for (const [pan, s] of [[panL, -1], [panR, 1]]) {
    const x = s * BEAM_HALF * Math.cos(st.tilt), y = PIVOT_Y + s * BEAM_HALF * Math.sin(st.tilt);
    pan.position.set(x, y - CHAIN_LEN, 0);
  }
  stack.scale.setScalar(Math.max(st.stack, 0.0001)); stack.visible = st.stack > 0.01;
  warn.visible = st.warn > 0.01; warnMat.opacity = st.warn;
  warn.rotation.y = time * 0.6;
  warn.getWorldPosition(_p); redLight.position.copy(_p); redLight.intensity = 25 * st.warn;
  piles.children.forEach((p, i) => { const v = THREE.MathUtils.clamp(st.piles * 1.6 - (i % 5) * 0.12, 0, 1); p.scale.set(1, Math.max(v, 0.0001), 1); p.visible = v > 0.01; });
  // lights
  key.intensity = 900 * st.key * st.warm; key.color.setHSL(0.09, 0.75, 0.62 + 0.08 * (st.warm - 1));
  rim.intensity = 500 * st.rim;
  fill.intensity = 18 * st.key;
  rays.forEach((r) => (r.material.uniforms.uStrength.value = 0.13 * st.key * st.warm * (st.rays ?? 1)));
  lightRing.material.opacity = 0.75 * st.ring;
  dustMat.opacity = 0.25 + 0.35 * st.key;
  // dust drift
  const pos = dustGeo.attributes.position.array;
  for (let i = 0; i < N_DUST; i++) {
    pos[i * 3 + 1] = (dustBase[i * 3 + 1] + time * 0.15 * (0.5 + (i % 7) / 7)) % 14;
    pos[i * 3] = dustBase[i * 3] + Math.sin(time * 0.3 + i) * 0.15;
  }
  dustGeo.attributes.position.needsUpdate = true;
  // papers: chaos spiral -> ordered ring that shrinks away
  for (let i = 0; i < N_PAPER; i++) {
    const sd = seeds[i];
    const vis = sd.rank < st.papers ? 1 : 0;
    const a = sd.a + time * 0.08 * sd.sp;
    const rChaos = sd.r, hChaos = sd.h + Math.sin(time * 0.5 + sd.rx) * 0.25;
    const rOrd = 11.5 + (i % 3) * 0.3, hOrd = 13.5 + (i % 5) * 0.15;
    const r = lerp(rChaos, rOrd, st.order), h = lerp(hChaos, hOrd, st.order);
    _p.set(Math.cos(a) * r, h, Math.sin(a) * r);
    _e.set(lerp(sd.rx + time * 0.3 * sd.sp, Math.PI / 2, st.order), lerp(sd.ry, -a, st.order), lerp(sd.rz + time * 0.2, 0, st.order));
    _q.setFromEuler(_e);
    const sc = vis * (st.order > 0 ? lerp(1, 0.6, st.order) : 1);
    _s.setScalar(Math.max(sc, 0.0001));
    _m.compose(_p, _q, _s); papers.setMatrixAt(i, _m);
  }
  papers.instanceMatrix.needsUpdate = true;
  // screens
  const lay = screenLayout();
  screens.forEach((g, i) => {
    const o = st.screens || 0;
    const orbit = (1 - o) * (1.2 + i * 0.35);           // swing in from an orbit around the monument
    const target = lay[i];
    const ang = Math.atan2(target.x, target.z) - orbit;
    const rad = Math.hypot(target.x, target.z) * (1 + (1 - o) * 0.4);
    g.position.set(Math.sin(ang) * rad, target.y + (1 - o) * 2.0, Math.cos(ang) * rad);
    g.lookAt(camera.position);
    g.visible = o > 0.01;
    g.userData.face.material.opacity = o; g.userData.glass.material.opacity = 0.85 * o;
    g.userData.glow.material.uniforms.uO.value = o; g.userData.frame.opacity = o;
  });
}

function stateAt(a, b, u) {
  const A = K[a], B = K[b], e = ease(u), out = {};
  for (const k of Object.keys({ ...A, ...B })) {
    const dflt = k === 'rays' ? 1 : 0; const x = A[k] ?? dflt, y = B[k] ?? dflt;
    out[k] = x instanceof THREE.Vector3 ? x.clone().lerp(y, e) : lerp(x, y, e);
  }
  // swing the camera on an arc (orbit) rather than a straight line, around the monument axis
  const ca = Math.atan2(A.cam.x, A.cam.z), cb = Math.atan2(B.cam.x, B.cam.z);
  let d = cb - ca; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
  const ra = Math.hypot(A.cam.x, A.cam.z), rb = Math.hypot(B.cam.x, B.cam.z);
  const ang = ca + d * e, rad = lerp(ra, rb, e);
  out.cam = V(Math.sin(ang) * rad, lerp(A.cam.y, B.cam.y, e), Math.cos(ang) * rad);
  return out;
}

function draw() { composer.render(); }

window.setSize = (w, h) => {
  renderer.setSize(w, h, false); composer.setSize(w, h); bloom.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
};
window.renderKey = (i, time = 10) => { apply(stateAt(i, i, 1), time); draw(); return true; };
window.renderBetween = (a, b, u, time) => { apply(stateAt(a, b, u), time); draw(); return true; };
window.frame = () => canvas.toDataURL('image/jpeg', 0.93);
window.framePng = () => canvas.toDataURL('image/png');

Promise.all(SCREEN_FILES.map((f) => loader.loadAsync(f))).then((texs) => {
  texs.forEach((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.generateMipmaps = true; screens.push(makeScreen(t)); });
  window.ready = true;
}).catch((e) => { window.loadError = String(e); });
