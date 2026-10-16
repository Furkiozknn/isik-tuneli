import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mulberry32, dailySeed, dailyStorageKey, randomSeed, encodeRunCode, decodeRunCode } from './rng.js';
import { readAll, rising, actionFor } from './gamepad.js';

// ---------- Renderer / Scene / Camera ----------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05020c, 0.045);
scene.background = new THREE.TextureLoader().load('assets/nebula.webp');
scene.background.colorSpace = THREE.SRGBColorSpace;
// Scene fog never touches the background, so the nebula was the only thing on
// screen rendered at full strength - it read as the subject and the gameplay
// read as clutter on top of it. Dimming it is what turns a wallpaper back into
// a backdrop; everything the player must react to is emissive and unaffected.
scene.backgroundIntensity = 0.2;

// 72 deg vertical is right for landscape. In portrait that leaves only ~45 deg
// across, and the ship's edge positions (+-2.25 at 4.4 units from the camera)
// fall off-screen; below 1:1 the field of view widens so the whole play area
// stays visible (horizontal >= ~58 deg).
function baseFov(aspect) {
  if (aspect >= 1) return 72;
  const half = THREE.MathUtils.degToRad(29);
  return Math.min(96, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(half) / aspect)));
}
let fovBase = baseFov(window.innerWidth / window.innerHeight);
const camera = new THREE.PerspectiveCamera(fovBase, window.innerWidth / window.innerHeight, 0.1, 200);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.62, 0.35, 0.5);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// localStorage does not merely return null when a browser refuses site data -
// it throws. Safari's private mode and "block all cookies" both do it, and so
// does an embedded portal frame on a third-party origin. Every read and write
// goes through here so a blocked store behaves exactly like an empty one
// rather than killing the script on the first line that touches it.
const store = (() => {
  const get = (key) => {
    try { return localStorage.getItem(key); } catch { return null; }
  };
  const set = (key, value) => {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  };
  return { get, set };
})();

// ---------- Language ----------
// English is the source language in the markup (it still reads correctly if
// this script never runs). Default follows the browser; the player's own
// choice (Settings) is kept under a NEW key, so no old save is touched.
// Two dictionaries for ~40 strings do not justify an i18n library.
const STR = {
  en: {
    best: 'BEST', today: 'TODAY', dailyOn: 'DAILY MODE: ON', dailyOff: 'DAILY MODE: OFF',
    noScores: 'no scores yet', shield: 'SHIELD', magnet: 'MAGNET',
    modeTag: 'DAILY MODE', free: 'FREE · IN YOUR BROWSER', play: 'PLAY',
    how: 'Steer with mouse, touch or arrows. Grab the cyan orbs, dodge the red rocks.',
    settings: 'SETTINGS', todayBest: "today's best", runEnded: 'RUN ENDED', newRecord: 'NEW RECORD',
    newDaily: '(new daily best!)', again: 'TRY AGAIN', menu: 'MENU', paused: 'PAUSED', resume: 'RESUME',
    restart: 'RESTART', sound: 'Sound', language: 'Language', done: 'DONE', on: 'ON', off: 'OFF',
    pause: 'Pause', muteAria: 'Mute or unmute',
    hintPointer: 'Move the mouse to steer · collect cyan orbs · avoid red rocks',
    hintTouch: 'Drag anywhere to steer · collect cyan orbs · avoid red rocks',
    hintKeys: 'Arrows / WASD also steer · Esc pauses',
    hintPad: 'Gamepad: left stick steers · A plays · Start pauses',
    runCode: 'RUN CODE', copyLink: 'COPY CHALLENGE LINK', copied: 'LINK COPIED', challenge: 'CHALLENGE',
    shareLine: 'I scored {s} in Nova Drift. Same rocks, same orbs. Beat it:',
    bestLine: 'BEST',
  },
  tr: {
    best: 'EN İYİ', today: 'BUGÜN', dailyOn: 'GÜNLÜK MOD: AÇIK', dailyOff: 'GÜNLÜK MOD: KAPALI',
    noScores: 'henüz skor yok', shield: 'KALKAN', magnet: 'MIKNATIS',
    modeTag: 'GÜNLÜK MOD', free: 'ÜCRETSİZ · TARAYICIDA', play: 'OYNA',
    how: 'Fare, dokunmatik ya da oklarla yönlendir. Camgöbeği küreleri topla, kırmızı kayalardan kaç.',
    settings: 'AYARLAR', todayBest: 'bugünün en iyisi', runEnded: 'KOŞU BİTTİ', newRecord: 'YENİ REKOR',
    newDaily: '(yeni günlük rekor!)', again: 'TEKRAR DENE', menu: 'MENÜ', paused: 'DURAKLATILDI', resume: 'DEVAM ET',
    restart: 'BAŞTAN', sound: 'Ses', language: 'Dil', done: 'TAMAM', on: 'AÇIK', off: 'KAPALI',
    pause: 'Duraklat', muteAria: 'Sesi aç veya kapat',
    hintPointer: 'Yönlendirmek için fareyi oynat · camgöbeği küreleri topla · kırmızı kayalardan kaç',
    hintTouch: 'Yönlendirmek için ekranda sürükle · camgöbeği küreleri topla · kırmızı kayalardan kaç',
    hintKeys: 'Oklar / WASD de çalışır · Esc duraklatır',
    hintPad: 'Oyun kolu: sol çubuk yönlendirir · A oynatır · Start duraklatır',
    runCode: 'KOŞU KODU', copyLink: 'MEYDAN OKUMA LİNKİNİ KOPYALA', copied: 'LİNK KOPYALANDI', challenge: 'MEYDAN OKUMA',
    shareLine: "Nova Drift'te {s} puan yaptım. Aynı kayalar, aynı küreler. Geç bakalım:",
    bestLine: 'EN İYİ',
  },
};
// The player's stored choice wins; otherwise `tr*` browsers get Turkish and
// everyone else English. A blocked store behaves like an empty one.
let lang = (() => {
  const saved = store.get('novaDriftLang');
  if (saved === 'tr' || saved === 'en') return saved;
  return (navigator.language || '').toLowerCase().startsWith('tr') ? 'tr' : 'en';
})();
const t = new Proxy({}, { get: (_, k) => STR[lang][k] });
const coarsePointer = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
function applyLang() {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const v = STR[lang][el.dataset.i18n];
    if (v !== undefined) el.textContent = v;
  }
  for (const el of document.querySelectorAll('[data-i18n-aria]')) {
    el.setAttribute('aria-label', STR[lang][el.dataset.i18nAria]);
  }
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  if (w === 0 || h === 0) return;
  camera.aspect = w / h;
  camera.fov = fovBase = baseFov(camera.aspect);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass.resolution.set(w, h);
  const pr = renderer.getPixelRatio();
  starMat.uniforms.uPixelRatio.value = pr;
  // Trail/burst particles size themselves off the same uniform; without this
  // they keep the old ratio after an adaptive render-scale change and render
  // at the wrong size.
  trailMat.uniforms.uPixelRatio.value = pr;
}
window.addEventListener('resize', onResize);

// ---------- Adaptive render scale ----------
// Bloom is the expensive pass and its cost scales with pixel count. On a
// phone that cannot hold 60 fps at full DPR, dropping the render scale a
// notch buys more than any other single change, and nobody notices 0.85x
// at 2x DPR. Decisions are made from a moving average over 60 frames, with
// hysteresis (drop above 20 ms, recover below 12.5 ms) and a 2 s cooldown
// so the scale settles instead of oscillating. Frame timing is read from
// the raw clock delta, before the 0.05 s clamp that protects the physics.
const BASE_PIXEL_RATIO = Math.min(window.devicePixelRatio || 1, 2);
const RENDER_SCALE_MIN = 0.6;
let renderScale = 1;

// Pure decision function - mirrored in test/adaptive.spec.js, keep in sync.
function nextRenderScale(current, avgFrameMs) {
  if (avgFrameMs > 20 && current > RENDER_SCALE_MIN) {
    return Math.max(RENDER_SCALE_MIN, Math.round((current - 0.15) * 100) / 100);
  }
  if (avgFrameMs < 12.5 && current < 1) {
    return Math.min(1, Math.round((current + 0.1) * 100) / 100);
  }
  return current;
}

function applyRenderScale(scale) {
  renderScale = scale;
  const pr = BASE_PIXEL_RATIO * scale;
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);
  onResize();
}

let adaptFrames = 0;
let adaptAccumMs = 0;
let adaptLastChangeT = 0;
function adaptQuality(rawDt, t) {
  adaptFrames += 1;
  adaptAccumMs += rawDt * 1000;
  if (adaptFrames < 60) return;
  const avg = adaptAccumMs / adaptFrames;
  adaptFrames = 0;
  adaptAccumMs = 0;
  if (t - adaptLastChangeT < 2) return;
  const next = nextRenderScale(renderScale, avg);
  if (next !== renderScale) {
    applyRenderScale(next);
    adaptLastChangeT = t;
  }
}

// ---------- Tunable constants ----------
const PLAY_RADIUS = 2.25;
const RING_RADIUS = 3.3;
const RING_SPACING = 7;
const RING_COUNT = 18;
const SPAWN_AHEAD = 52;
const RECYCLE_MARGIN = 6;
const OBSTACLE_POOL = 26;
const ORB_POOL = 26;
const BASE_SPEED = 9;
const MAX_SPEED = 27;
const SPEED_RAMP = 0.14;
const COLLIDE_RADIUS = 0.72;
const ORB_RADIUS = 0.85;
const MAGNET_RADIUS = 4.5;
const SHIELD_MAX = 2;
const MAGNET_DURATION = 6;
const MULT_DURATION = 8;
const NEAR_MISS_RADIUS = COLLIDE_RADIUS + 0.45;
const NEAR_MISS_BONUS = 10;

const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// ---------- Daily Challenge: seedable RNG for spawn logic only ----------
// A tiny mulberry32 PRNG. When Daily Challenge mode is active, every spawn
// decision (obstacle/orb/power-up type, position, and timing) is drawn from
// this instead of Math.random(), seeded from today's UTC date — so every
// player who plays on the same calendar day gets the exact same pattern and
// scores are genuinely comparable. Endless runs are seeded too, from a fresh
// random seed, so any run can be replayed from its run code (see below).
// mulberry32/todayUTCStamp/dailySeed/dailyStorageKey live in ./rng.js, which
// touches neither the DOM nor Three - so test/prng.spec.js imports the file
// this page actually loads instead of re-declaring a copy of it that can
// silently drift from it.

function loadDailyBest() {
  return Number(store.get(dailyStorageKey()) || 0);
}
function saveDailyBest(s) {
  const val = Math.floor(s);
  store.set(dailyStorageKey(), String(val));
  return val;
}

let dailyMode = new URLSearchParams(window.location.search).get('daily') === '1';
let spawnRng = Math.random; // replaced by a seeded generator at the start of every run

// Run codes (rng.js). Every run is seeded now: the Daily Challenge from the
// date, an endless run from a fresh random seed. The seed is shown on the
// game-over card as a code, and a link with ?run=CODE replays that exact
// spawn sequence, so "beat my score" is a fair race with no server. A valid
// code in the URL starts a challenge, which wins over ?daily=1. An invalid
// code is ignored and the page plays normally.
let challengeSeed = decodeRunCode(new URLSearchParams(window.location.search).get('run') || '');
if (challengeSeed !== null) dailyMode = false;
let runSeed = 0;
const rand = () => spawnRng();

// Small record of recent spawns (position/type only) — used to verify that
// Daily Challenge mode is actually deterministic. Capped so it never grows
// unbounded during a long run.
let spawnLog = [];
function logSpawn(kind, x, y, z) {
  if (spawnLog.length < 200) spawnLog.push({ kind, x, y, z });
}

// ---------- Audio (synthesized with Web Audio API - no external files) ----------
const sfx = (() => {
  let ctx = null;
  let master = null;
  let engineOsc = null, engineGain = null, engineFilter = null;
  let muted = store.get('novaDriftMuted') === '1';

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.45;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, startGain, delay = 0) {
    const c = ensure();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain).connect(master);
    const t0 = c.currentTime + delay;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(startGain, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  function collect() {
    tone(880, 0.12, 'sine', 0.28);
    tone(1320, 0.15, 'sine', 0.2, 0.05);
  }

  function power() {
    tone(660, 0.1, 'triangle', 0.26);
    tone(880, 0.1, 'triangle', 0.22, 0.08);
    tone(1180, 0.18, 'triangle', 0.2, 0.16);
  }

  function shieldHit() {
    tone(220, 0.09, 'square', 0.3);
    tone(150, 0.14, 'square', 0.24, 0.03);
  }

  function nearMiss() {
    tone(1500, 0.07, 'sine', 0.16);
  }

  function crash() {
    const c = ensure();
    const bufferSize = Math.floor(c.sampleRate * 0.35);
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const noise = c.createBufferSource();
    noise.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const gain = c.createGain();
    gain.gain.value = 0.5;
    noise.connect(filter).connect(gain).connect(master);
    noise.start();
    tone(90, 0.32, 'sawtooth', 0.35);
  }

  function click() {
    tone(520, 0.06, 'square', 0.15);
  }

  function engineStart() {
    const c = ensure();
    if (engineOsc) return;
    engineOsc = c.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineFilter = c.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 220;
    engineGain = c.createGain();
    engineGain.gain.value = 0.025;
    engineOsc.connect(engineFilter).connect(engineGain).connect(master);
    engineOsc.start();
  }
  function engineSet(speed) {
    if (engineOsc) engineOsc.frequency.setTargetAtTime(55 + speed * 2.2, ctx.currentTime, 0.15);
  }
  function engineStop() {
    if (engineOsc) {
      engineOsc.stop();
      engineOsc.disconnect();
      engineFilter.disconnect();
      engineGain.disconnect();
      engineOsc = null;
      engineGain = null;
      engineFilter = null;
    }
  }

  function setMuted(m) {
    muted = m;
    store.set('novaDriftMuted', m ? '1' : '0');
    if (master) master.gain.value = m ? 0 : 0.45;
  }
  function isMuted() { return muted; }

  return { collect, power, shieldHit, nearMiss, crash, click, engineStart, engineSet, engineStop, setMuted, isMuted };
})();

const muteBtn = document.getElementById('muteBtn');
const soundToggle = document.getElementById('soundToggle');
function refreshSoundUI() {
  muteBtn.setAttribute('aria-pressed', String(sfx.isMuted()));
  soundToggle.setAttribute('aria-pressed', String(!sfx.isMuted()));
  soundToggle.textContent = sfx.isMuted() ? t.off : t.on;
}
function toggleMute() { sfx.setMuted(!sfx.isMuted()); refreshSoundUI(); }
muteBtn.addEventListener('click', toggleMute);
soundToggle.addEventListener('click', () => { toggleMute(); sfx.click(); });

// ---------- Screen shake + hit flash ----------
let shakeT = 0, shakeMag = 0;
function triggerShake(mag, dur) {
  if (reducedMotion) return;
  shakeMag = mag;
  shakeT = dur;
}
const hitFlashEl = document.getElementById('hitFlash');
function flash(color) {
  hitFlashEl.style.background = color;
  hitFlashEl.classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => hitFlashEl.classList.remove('on')));
}

// ---------- Starfield ----------
const STAR_COUNT = 700;
const STAR_SPAN = 260; // depth of the field; stars recycle by this much (see the frame loop)
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(STAR_COUNT * 3);
const starPhase = new Float32Array(STAR_COUNT);
const starSize = new Float32Array(STAR_COUNT);
for (let i = 0; i < STAR_COUNT; i++) {
  const r = 18 + Math.random() * 50;
  const theta = Math.random() * Math.PI * 2;
  starPos[i * 3] = r * Math.cos(theta);
  starPos[i * 3 + 1] = r * Math.sin(theta) * 0.6;
  starPos[i * 3 + 2] = -Math.random() * STAR_SPAN;
  starPhase[i] = Math.random() * Math.PI * 2;
  starSize[i] = Math.random() * 5 + 2;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
starGeo.setAttribute('aPhase', new THREE.BufferAttribute(starPhase, 1));
starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1));
const starMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, uPixelRatio: { value: renderer.getPixelRatio() } },
  vertexShader: `
    attribute float aPhase;
    attribute float aSize;
    uniform float uTime;
    uniform float uPixelRatio;
    varying float vTwinkle;
    void main() {
      vTwinkle = 0.5 + 0.5 * sin(uTime * 2.0 + aPhase);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * uPixelRatio * (26.0 / -mv.z);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: `
    varying float vTwinkle;
    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      float a = smoothstep(0.5, 0.0, d);
      gl_FragColor = vec4(vec3(1.0, 0.98, 0.95), a * vTwinkle);
    }
  `,
});
const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);

// ---------- Tunnel rings ----------
const ringGeo = new THREE.TorusGeometry(RING_RADIUS, 0.062, 8, 48);
// Every ring used to share one material at a fixed opacity, which is why the
// tunnel read as two flat circles rather than a corridor: at equal brightness
// nothing tells the eye which ring is near. Each ring now owns its material
// and fades with distance, updated in the same loop that recycles it.
const rings = [];
for (let i = 0; i < RING_COUNT; i++) {
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
    color: 0x8ad6ff, transparent: true, opacity: 0.55, toneMapped: false,
  }));
  ring.position.z = -i * RING_SPACING;
  scene.add(ring);
  rings.push(ring);
}
// Fog (FogExp2 at 0.045) swallows anything past roughly this distance, so
// fading over the full tunnel length spent the whole gradient on rings the
// player never sees. Fade across what is actually visible instead.
const RING_FADE = 46;

// ---------- Player ship ----------
// Built from flat-coloured primitives rather than a painted sprite, for two
// reasons - the second is the one that mattered:
//
//   - the rest of the scene is untextured geometry lit only by bloom, so a
//     painted ship sat on top of it like a sticker rather than in it;
//   - a sprite always turns to face the camera. The old art was drawn in side
//     profile while the player flies away from the camera, so the ship was
//     permanently sideways to its own direction of travel, and no repaint
//     could fix it: a sprite has no other side to show when it banks.
//
// The model is built along -Z, so "flying away" is a property of the mesh
// rather than of the one angle the artwork happened to be drawn from. There
// are no lights in this scene, so the form reads through silhouette and
// flat colour separation, the same way every other object here does.
const shipGroup = new THREE.Group();
const HULL = 0x9b46dd;
const CREST = 0xf07ad0;
const BELLY = 0x2a1046;
const THRUST = 0x66f6ff;

const part = (geometry, color) =>
  new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, toneMapped: false }));

// A delta, not a cone.
//
// The chase camera sits about six degrees above the ship. At that angle a cone
// pointing away shows the player almost nothing but its base, so the first
// rebuild read as a flat diamond - correct geometry, unreadable silhouette.
// A wing flattened in Y keeps a triangular outline from a shallow angle, which
// is why every game in this genre uses one.
//
// The flattening is baked into the geometry rather than set on the mesh:
// Three composes scale before rotation, so scaling the mesh would have
// squashed the wing along its length instead of its thickness.
const delta = (radius, length, segments) =>
  new THREE.ConeGeometry(radius, length, segments).rotateX(-Math.PI / 2).scale(1, 0.26, 1);

const hull = part(delta(0.95, 1.9, 4), HULL);
hull.position.z = -0.1;
shipGroup.add(hull);

// A darker underside and a brighter crest: with no lights in this scene, two
// tones stacked on one shape are the only shading available.
const belly = part(delta(0.86, 1.7, 4), BELLY);
belly.position.set(0, -0.075, -0.05);
shipGroup.add(belly);

const crest = part(delta(0.3, 1.5, 4), CREST);
crest.position.set(0, 0.085, -0.14);
shipGroup.add(crest);

// The wing's trailing edge sits at z = 0.85 (half of its 1.9 length, offset
// by -0.1). The first pass put the engines at 0.76, i.e. inside the wing that
// was supposed to be in front of them - the glow that sells "flying away" was
// hidden by the ship's own body. Everything aft of the wing now clears it.
const TAIL = 0.88;
for (const side of [-1, 1]) {
  const nacelle = part(new THREE.CylinderGeometry(0.14, 0.17, 0.66, 10), HULL);
  nacelle.rotation.x = Math.PI / 2;
  nacelle.position.set(side * 0.4, 0.035, TAIL - 0.1);
  shipGroup.add(nacelle);

  // A circle faces +Z by default, so the exhaust discs point straight at the
  // camera. That is the whole reason for rebuilding the ship: the old sprite
  // was drawn in side profile while the player flies away from the viewer.
  const flame = part(new THREE.CircleGeometry(0.155, 16), THRUST);
  flame.position.set(side * 0.4, 0.035, TAIL + 0.25);
  shipGroup.add(flame);

  const tip = part(new THREE.BoxGeometry(0.07, 0.05, 0.3), THRUST);
  tip.position.set(side * 0.9, 0.01, TAIL - 0.12);
  shipGroup.add(tip);
}

const core = part(new THREE.SphereGeometry(0.11, 12, 10), 0xffffff);
core.position.set(0, 0.08, TAIL + 0.06);
shipGroup.add(core);

shipGroup.scale.setScalar(1.15);
const shieldRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.56, 0.035, 8, 32),
  new THREE.MeshBasicMaterial({ color: 0x6dff9e, toneMapped: false, transparent: true, opacity: 0.85 })
);
shieldRing.visible = false;
shipGroup.add(shieldRing);
scene.add(shipGroup);

// ---------- Engine exhaust trail + impact bursts (shared particle pool) ----------
const TRAIL_COUNT = 70;
const trailData = Array.from({ length: TRAIL_COUNT }, () => ({
  life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1,
}));
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_COUNT * 3), 3));
trailGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_COUNT * 3), 3));
trailGeo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(TRAIL_COUNT), 1));
const trailMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexColors: true,
  uniforms: { uPixelRatio: { value: renderer.getPixelRatio() } },
  vertexShader: `
    attribute float aAlpha;
    uniform float uPixelRatio;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vColor = color;
      vAlpha = aAlpha;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = 55.0 * uPixelRatio * aAlpha / -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: `
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      float a = smoothstep(0.5, 0.0, d);
      gl_FragColor = vec4(vColor, a * vAlpha);
    }
  `,
});
const trailPoints = new THREE.Points(trailGeo, trailMat);
scene.add(trailPoints);
let trailSpawnT = 0;

function spawnBurst(x, y, z, r, g, b, count) {
  for (let n = 0; n < count; n++) {
    const slot = trailData.find((p) => p.life <= 0);
    if (!slot) break;
    const angle = Math.random() * Math.PI * 2;
    const spd = 1.4 + Math.random() * 1.6;
    slot.life = 1;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.vx = Math.cos(angle) * spd;
    slot.vy = Math.sin(angle) * spd;
    slot.vz = (Math.random() - 0.5) * spd;
    slot.r = r;
    slot.g = g;
    slot.b = b;
  }
}

function updateTrail(dt) {
  trailSpawnT += dt;
  if (trailSpawnT > 0.018) {
    trailSpawnT = 0;
    const slot = trailData.find((p) => p.life <= 0);
    if (slot) {
      slot.life = 1;
      slot.x = shipX + (Math.random() - 0.5) * 0.1;
      slot.y = shipY + (Math.random() - 0.5) * 0.1 - 0.04;
      slot.z = shipZ + 0.34;
      slot.vx = 0;
      slot.vy = 0;
      slot.vz = 0;
      if (Math.random() < 0.5) { slot.r = 1; slot.g = 0.55; slot.b = 0.85; }
      else { slot.r = 0.5; slot.g = 0.9; slot.b = 1; }
    }
  }
  const posAttr = trailGeo.attributes.position;
  const colAttr = trailGeo.attributes.color;
  const alphaAttr = trailGeo.attributes.aAlpha;
  for (let i = 0; i < TRAIL_COUNT; i++) {
    const p = trailData[i];
    if (p.life > 0) {
      p.life = Math.max(0, p.life - dt * 1.7);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }
    posAttr.setXYZ(i, p.x, p.y, p.z);
    alphaAttr.setX(i, p.life);
    colAttr.setXYZ(i, p.r, p.g, p.b);
  }
  posAttr.needsUpdate = true;
  colAttr.needsUpdate = true;
  alphaAttr.needsUpdate = true;
}

// ---------- Obstacle / orb / power-up pools ----------
function makePool(count, geo, mat) {
  const pool = [];
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    pool.push({ mesh, active: false, z: 0, x: 0, y: 0, nearMissDone: false });
  }
  return pool;
}
const obstacleGeo = new THREE.OctahedronGeometry(0.42, 0);
const obstacleMat = new THREE.MeshBasicMaterial({ color: 0xff4d4d, toneMapped: false });
const obstacles = makePool(OBSTACLE_POOL, obstacleGeo, obstacleMat);

const orbGeo = new THREE.SphereGeometry(0.24, 12, 12);
const orbMat = new THREE.MeshBasicMaterial({ color: 0x7ee8ff, toneMapped: false });
const orbs = makePool(ORB_POOL, orbGeo, orbMat);

const POWERUP_GEO = {
  shield: new THREE.TorusGeometry(0.3, 0.075, 8, 20),
  magnet: new THREE.OctahedronGeometry(0.3, 0),
  mult: new THREE.TetrahedronGeometry(0.34, 0),
};
const POWERUP_MAT = {
  shield: new THREE.MeshBasicMaterial({ color: 0x6dff9e, toneMapped: false }),
  magnet: new THREE.MeshBasicMaterial({ color: 0xc98bff, toneMapped: false }),
  mult: new THREE.MeshBasicMaterial({ color: 0xffd76d, toneMapped: false }),
};
const POWERUP_TYPES = ['shield', 'magnet', 'mult'];
const powerups = [];
for (const type of POWERUP_TYPES) {
  for (let i = 0; i < 3; i++) {
    const mesh = new THREE.Mesh(POWERUP_GEO[type], POWERUP_MAT[type]);
    mesh.visible = false;
    scene.add(mesh);
    powerups.push({ mesh, active: false, z: 0, x: 0, y: 0, type });
  }
}

function spawnFrom(pool, atZ, kind) {
  const slot = pool.find((s) => !s.active);
  if (!slot) return;
  const angle = rand() * Math.PI * 2;
  const r = rand() * PLAY_RADIUS * 0.9;
  slot.x = Math.cos(angle) * r;
  slot.y = Math.sin(angle) * r;
  slot.z = atZ;
  slot.active = true;
  slot.spawnT = 0;
  slot.mesh.visible = true;
  slot.mesh.position.set(slot.x, slot.y, slot.z);
  slot.mesh.scale.setScalar(1);
  logSpawn(kind, slot.x, slot.y, slot.z);
}
function spawnPowerup(atZ) {
  const type = POWERUP_TYPES[Math.floor(rand() * POWERUP_TYPES.length)];
  const candidates = powerups.filter((s) => !s.active && s.type === type);
  const slot = candidates[0] || powerups.find((s) => !s.active);
  if (!slot) return;
  const angle = rand() * Math.PI * 2;
  const r = rand() * PLAY_RADIUS * 0.8;
  slot.x = Math.cos(angle) * r;
  slot.y = Math.sin(angle) * r;
  slot.z = atZ;
  slot.active = true;
  slot.spawnT = 0;
  slot.mesh.visible = true;
  slot.mesh.position.set(slot.x, slot.y, slot.z);
  slot.mesh.scale.setScalar(1);
  logSpawn(`powerup:${type}`, slot.x, slot.y, slot.z);
}

function resetPoolMesh(slot) {
  slot.active = false;
  slot.mesh.visible = false;
  slot.nearMissDone = false;
}

// ---------- Input: keyboard, mouse, virtual joystick (touch) ----------
const target = { x: 0, y: 0 };
const keys = new Set();
function pointerToTarget(clientX, clientY) {
  const nx = (clientX / window.innerWidth) * 2 - 1;
  const ny = (clientY / window.innerHeight) * 2 - 1;
  target.x = THREE.MathUtils.clamp(nx * PLAY_RADIUS, -PLAY_RADIUS, PLAY_RADIUS);
  target.y = THREE.MathUtils.clamp(-ny * PLAY_RADIUS, -PLAY_RADIUS, PLAY_RADIUS);
}
window.addEventListener('mousemove', (e) => pointerToTarget(e.clientX, e.clientY));

const joystickEl = document.getElementById('joystick');
const joystickKnob = document.getElementById('joystickKnob');
const JOY_MAX = 55;
let joyActive = false;
const joyBase = { x: 0, y: 0 };
const joyVec = { x: 0, y: 0 };

function joyStart(clientX, clientY) {
  joyActive = true;
  joyBase.x = clientX;
  joyBase.y = clientY;
  joystickEl.style.left = clientX + 'px';
  joystickEl.style.top = clientY + 'px';
  joystickEl.classList.remove('hidden');
  joystickKnob.style.transform = 'translate(-50%, -50%)';
}
function joyMove(clientX, clientY) {
  if (!joyActive) return;
  let dx = clientX - joyBase.x;
  let dy = clientY - joyBase.y;
  const dist = Math.hypot(dx, dy);
  if (dist > JOY_MAX) {
    dx = (dx / dist) * JOY_MAX;
    dy = (dy / dist) * JOY_MAX;
  }
  joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  joyVec.x = dx / JOY_MAX;
  joyVec.y = dy / JOY_MAX;
}
function joyEnd() {
  joyActive = false;
  joyVec.x = 0;
  joyVec.y = 0;
  joystickEl.classList.add('hidden');
}
canvas.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  if (t) joyStart(t.clientX, t.clientY);
}, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  const t = e.touches[0];
  if (t) joyMove(t.clientX, t.clientY);
}, { passive: true });
canvas.addEventListener('touchend', joyEnd, { passive: true });
canvas.addEventListener('touchcancel', joyEnd, { passive: true });

window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  // Space / Enter on a focused button must click that button, not start a run.
  const onButton = !!(e.target && e.target.closest && e.target.closest('button'));
  if ((e.code === 'Space' || e.code === 'Enter') && !onButton && !settingsOpen && (state === 'idle' || state === 'gameover')) {
    e.preventDefault();
    if (state === 'idle') beginFromMenu(); else startGame();
  }
  if (e.code === 'Escape') {
    if (settingsOpen) closeSettings();
    else if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

// ---------- Input: gamepad ----------
// Polled once per frame (the Gamepad API has no input events, only
// connect/disconnect). Steering is a velocity like the touch joystick; the
// buttons act on the press, through the same start/pause/resume functions the
// keyboard uses. The mapping and the menu flow live in ./gamepad.js, which
// test/gamepad.spec.js imports directly.
let pad = { x: 0, y: 0, a: false, b: false, start: false, connected: false };
let padPrev = pad;
let padHintShown = false;
function pollGamepad() {
  if (!navigator.getGamepads) return;
  let pads;
  try { pads = navigator.getGamepads(); } catch { return; }
  pad = readAll(pads);
  const edge = rising(padPrev, pad);
  padPrev = pad;
  switch (actionFor(state, edge, settingsOpen)) {
    case 'begin': beginFromMenu(); break;
    case 'restart': startGame(); break;
    case 'pause': pauseGame(); break;
    case 'resume': resumeGame(); break;
    case 'menu': goMenu(); break;
    default: break;
  }
  if (pad.connected && !padHintShown && state === 'playing') {
    padHintShown = true;
    showHint(t.hintPad, 4000);
  }
}

// A keyup that happens while another window has focus never reaches the page,
// so a key held during an alt-tab would stay "held" and steer the ship into
// the wall after the player came back. Forget held keys when focus goes, and
// pause the run rather than let it play on unattended.
function onFocusLost() {
  keys.clear();
  joyEnd();
  if (state === 'playing') pauseGame();
}
window.addEventListener('blur', onFocusLost);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') onFocusLost();
});

// ---------- Game state ----------
let state = 'idle'; // idle | playing | paused | gameover
let shipX = 0, shipY = 0, shipZ = 0;
let speed = BASE_SPEED;
let score = 0;
let survivedT = 0;
let distSinceSpawn = 0;
let nextSpawnAt = 2.2;
let hudPulseT = 0;
let shieldCharges = 0;
let magnetUntil = 0;
let multUntil = 0;

// ---------- Local top-5 leaderboard ----------
function loadScores() {
  try {
    const raw = store.get('novaDriftScores');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore malformed storage */ }
  const legacyBest = Number(store.get('novaDriftBest') || 0);
  return legacyBest > 0 ? [legacyBest] : [];
}
function saveScore(s) {
  const list = loadScores();
  list.push(Math.floor(s));
  list.sort((a, b) => b - a);
  const top5 = list.slice(0, 5);
  store.set('novaDriftScores', JSON.stringify(top5));
  return top5;
}
function renderLeaderboard(list) {
  const html = list.length
    ? list.map((s, i) => `<div class="lbRow"><span>${i + 1}.</span><span>${s}</span></div>`).join('')
    : `<div class="lbRow lbEmpty">${t.noScores}</div>`;
  leaderboardStartEl.innerHTML = html;
  leaderboardEndEl.innerHTML = html;
}

let scores = loadScores();
let best = scores[0] || 0;

const hud = document.getElementById('hud');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const powerupsEl = document.getElementById('powerups');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const pauseScreen = document.getElementById('pauseScreen');
const finalScoreEl = document.getElementById('finalScore');
const newBestEl = document.getElementById('newBest');
const leaderboardStartEl = document.getElementById('leaderboardStart');
const leaderboardEndEl = document.getElementById('leaderboardEnd');
const pauseBtn = document.getElementById('pauseBtn');
const modeTagEl = document.getElementById('modeTag');
const dailyToggleBtn = document.getElementById('dailyToggleBtn');
const dailyInfoStartEl = document.getElementById('dailyInfoStart');
const dailyBestStartEl = document.getElementById('dailyBestStart');
const dailyInfoEndEl = document.getElementById('dailyInfoEnd');
const dailyBestEndEl = document.getElementById('dailyBestEnd');
const newDailyBestEl = document.getElementById('newDailyBest');
const hintEl = document.getElementById('hint');
const settingsScreen = document.getElementById('settingsScreen');
const bandEl = document.getElementById('band');
const bestLineEl = document.getElementById('bestLine');
const recMode = new URLSearchParams(window.location.search).get('rec') === '1';
if (recMode) document.body.classList.add('rec');

// Palette accents cycled by the score tiers, the screen band and the cards:
// the video's cyan / violet / pink bands plus amber + mint from the "Derin uzay"
// theme. Contrast against the ink background is asserted in test/contrast.spec.js.
const ACCENTS = ['#eef1ff', '#7bdff6', '#b5a4fa', '#f577b2', '#ffab40', '#7dffc8'];
let bandIx = 0;

// Screen change: a palette-coloured iris closes (260 ms), the change happens
// under it, then it fades (200 ms). Skipped for reduced motion. Not used for
// TRY AGAIN: a retry has to be instant.
function withBand(fn) {
  if (reducedMotion || recMode) { fn(); return; }
  bandEl.style.background = ACCENTS[1 + (bandIx++ % (ACCENTS.length - 1))];
  bandEl.className = 'cover';
  setTimeout(() => {
    fn();
    bandEl.className = 'reveal';
    setTimeout(() => { bandEl.className = ''; }, 220);
  }, 260);
}
function beginFromMenu() { withBand(startGame); }

// An overlay's `visibility` is still transitioning on the frame it is
// un-hidden, and a button inside it cannot take focus until that ends.
function focusSoon(el, tries = 8) {
  setTimeout(() => {
    el.focus({ preventScroll: true });
    if (document.activeElement !== el && tries > 0) focusSoon(el, tries - 1);
  }, 30);
}

let settingsOpen = false;
let settingsReturnFocus = null;
function openSettings() {
  settingsOpen = true;
  settingsReturnFocus = document.activeElement;
  syncLangButtons();
  refreshSoundUI();
  settingsScreen.classList.remove('hidden');
  focusSoon(document.getElementById('settingsDoneBtn'));
}
function closeSettings() {
  settingsOpen = false;
  settingsScreen.classList.add('hidden');
  if (settingsReturnFocus && settingsReturnFocus.focus) focusSoon(settingsReturnFocus);
}
function syncLangButtons() {
  document.getElementById('langEn').setAttribute('aria-pressed', String(lang === 'en'));
  document.getElementById('langTr').setAttribute('aria-pressed', String(lang === 'tr'));
}
function setLang(l) {
  if (l === lang) return;
  lang = l;
  store.set('novaDriftLang', l);
  // "kararma" (fade) transition of the daily-video set: the text swaps under a 250 ms fade-in.
  document.body.classList.remove('langswap');
  void document.body.offsetWidth;
  document.body.classList.add('langswap');
  refreshUI();
  syncLangButtons();
}
document.getElementById('langEn').addEventListener('click', () => { sfx.click(); setLang('en'); });
document.getElementById('langTr').addEventListener('click', () => { sfx.click(); setLang('tr'); });
document.getElementById('settingsBtn').addEventListener('click', () => { sfx.click(); openSettings(); });
document.getElementById('pauseSettingsBtn').addEventListener('click', () => { sfx.click(); openSettings(); });
document.getElementById('settingsDoneBtn').addEventListener('click', () => { sfx.click(); closeSettings(); });
document.getElementById('menuBtn').addEventListener('click', () => { sfx.click(); withBand(goMenu); });
document.getElementById('menuBtn2').addEventListener('click', () => { sfx.click(); withBand(goMenu); });

// The challenge link for the run that just ended: this page with ?run=CODE and
// nothing else, so it never carries ?debug=1 or another player's state.
const runCodeEl = document.getElementById('runCode');
const shareBtn = document.getElementById('shareBtn');
let lastShare = '';
function challengeLink(seed = runSeed) {
  const u = new URL(window.location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('run', encodeRunCode(seed));
  return u.toString();
}
async function copyChallenge() {
  lastShare = `${t.shareLine.replace('{s}', String(Math.floor(score)))} ${challengeLink()}`;
  let ok = false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(lastShare);
      ok = true;
    }
  } catch { ok = false; }
  // No clipboard (an http page, a portal frame without permission): show the
  // link itself where the code was. It is selectable in one tap.
  if (ok) shareBtn.textContent = t.copied;
  else runCodeEl.textContent = challengeLink();
}
shareBtn.addEventListener('click', () => { sfx.click(); copyChallenge(); });document.getElementById('pauseRestartBtn').addEventListener('click', () => { sfx.click(); startGame(); });
document.getElementById('startBtn').addEventListener('click', () => { sfx.click(); beginFromMenu(); });
document.getElementById('restartBtn').addEventListener('click', () => { sfx.click(); startGame(); });
document.getElementById('resumeBtn').addEventListener('click', () => { sfx.click(); resumeGame(); });

// First-run teaching: one line that names the goal for the very first run,
// then a keys line for players with a keyboard.
let hintTimer = null;
function showHint(text, ms) {
  hintEl.textContent = text;
  hintEl.classList.remove('hidden');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hintEl.classList.add('hidden'), ms);
}
function hideHint() { clearTimeout(hintTimer); hintEl.classList.add('hidden'); }
let firstRun = store.get('novaDriftPlayed') !== '1';
let graceRun = false; // first ever run: the first seconds hold orbs only
const GRACE_SECONDS = 4;

function tierColor(sc) { return ACCENTS[Math.floor(sc / 250) % ACCENTS.length]; }
let scoreTier = 0;
function pulseScore() {
  scoreEl.classList.remove('beat');
  void scoreEl.offsetWidth;
  scoreEl.classList.add('beat');
}

// Re-applies every piece of text that depends on the language.
function refreshUI() {
  applyLang();
  refreshDailyToggleUI();
  refreshSoundUI();
  refreshPowerupHud();
  renderLeaderboard(scores);
  bestEl.textContent = (dailyMode && (state === 'playing' || state === 'paused'))
    ? `${t.today}: ${Math.floor(loadDailyBest())}`
    : `${t.best}: ${Math.floor(best)}`;
  if (state === 'gameover') updateBestLine();
}
function updateBestLine() {
  bestLineEl.textContent = dailyMode ? '' : `${t.bestLine}: ${Math.floor(best)}`;
  bestLineEl.classList.toggle('hidden', dailyMode);
}
pauseBtn.addEventListener('click', () => {
  if (state === 'playing') pauseGame();
  else if (state === 'paused') resumeGame();
});
dailyToggleBtn.addEventListener('click', () => {
  sfx.click();
  dailyMode = !dailyMode;
  if (dailyMode) challengeSeed = null; // a challenge link is one specific run; Daily replaces it
  refreshDailyToggleUI();
});

function refreshDailyToggleUI() {
  dailyToggleBtn.textContent = dailyMode ? t.dailyOn : t.dailyOff;
  dailyToggleBtn.classList.toggle('active', dailyMode);
  dailyToggleBtn.setAttribute('aria-pressed', String(dailyMode));
  dailyInfoStartEl.classList.toggle('hidden', !dailyMode);
  if (dailyMode) dailyBestStartEl.textContent = Math.floor(loadDailyBest());
}
refreshUI();

function refreshPowerupHud() {
  const chips = [];
  if (shieldCharges > 0) chips.push(`<span class="powerchip"><img class="icon" src="assets/icon_shield.png" alt="">${t.shield} x${shieldCharges}</span>`);
  if (survivedT < magnetUntil) chips.push(`<span class="powerchip"><img class="icon" src="assets/icon_magnet.png" alt="">${t.magnet} ${Math.ceil(magnetUntil - survivedT)}s</span>`);
  if (survivedT < multUntil) chips.push(`<span class="powerchip"><img class="icon" src="assets/icon_mult.png" alt="">x2 ${Math.ceil(multUntil - survivedT)}s</span>`);
  powerupsEl.innerHTML = chips.join('');
}

function applyPowerup(type) {
  sfx.power();
  if (type === 'shield') shieldCharges = Math.min(shieldCharges + 1, SHIELD_MAX);
  else if (type === 'magnet') magnetUntil = survivedT + MAGNET_DURATION;
  else if (type === 'mult') multUntil = survivedT + MULT_DURATION;
  refreshPowerupHud();
}

function startGame() {
  state = 'playing';
  shipX = shipY = target.x = target.y = 0;
  shipZ = 0;
  speed = BASE_SPEED;
  score = 0;
  survivedT = 0;
  distSinceSpawn = 0;
  nextSpawnAt = 2.2;
  shieldCharges = 0;
  magnetUntil = 0;
  multUntil = 0;
  hudPulseT = 0;
  shakeT = 0;
  spawnLog = [];
  runSeed = dailyMode ? dailySeed() : (challengeSeed !== null ? challengeSeed : randomSeed());
  spawnRng = mulberry32(runSeed);
  shipGroup.rotation.set(0, 0, 0);
  obstacles.forEach(resetPoolMesh);
  orbs.forEach(resetPoolMesh);
  powerups.forEach(resetPoolMesh);
  trailData.forEach((p) => (p.life = 0));
  rings.forEach((ring, i) => (ring.position.z = -i * RING_SPACING));
  startScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  newBestEl.classList.add('hidden');
  newDailyBestEl.classList.add('hidden');
  modeTagEl.classList.toggle('hidden', !dailyMode && challengeSeed === null);
  modeTagEl.textContent = dailyMode ? t.modeTag : `${t.challenge} ${encodeRunCode(runSeed)}`;
  bestEl.textContent = dailyMode
    ? `${t.today}: ${Math.floor(loadDailyBest())}`
    : `${t.best}: ${Math.floor(best)}`;
  hud.classList.add('visible');
  pauseBtn.classList.add('visible');
  document.body.classList.add('playing');
  scoreTier = 0;
  scoreEl.style.setProperty('--score-c', ACCENTS[0]);
  scoreEl.textContent = '0';
  refreshPowerupHud();
  sfx.engineStart();
  fovKick = 1;
  // First ever run (never in Daily Mode, whose spawn pattern is fixed): teach
  // the goal in one line and keep the first seconds free of rocks.
  graceRun = firstRun && !dailyMode;
  hideHint();
  if (firstRun) {
    firstRun = false;
    store.set('novaDriftPlayed', '1');
    showHint(coarsePointer ? t.hintTouch : t.hintPointer, 5500);
    if (!coarsePointer) setTimeout(() => { if (state === 'playing') showHint(t.hintKeys, 3000); }, 5800);
  }
}

// Back to the start screen (from pause or game over).
function goMenu() {
  state = 'idle';
  document.body.classList.remove('playing');
  hud.classList.remove('visible');
  pauseBtn.classList.remove('visible');
  gameOverScreen.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  startScreen.classList.remove('hidden');
  hideHint();
  sfx.engineStop();
  joyEnd();
  refreshUI();
  focusSoon(document.getElementById('startBtn'));
}

function endGame() {
  state = 'gameover';
  hud.classList.remove('visible');
  pauseBtn.classList.remove('visible');
  document.body.classList.remove('playing');
  hideHint();
  finalScoreEl.textContent = Math.floor(score);
  if (dailyMode) {
    // Daily Challenge runs never touch the endless top-5 leaderboard — they
    // get their own per-day best score, kept separate so the two modes never mix.
    const prevDailyBest = loadDailyBest();
    const wasNewDailyBest = score > prevDailyBest;
    const dailyBest = wasNewDailyBest ? saveDailyBest(score) : prevDailyBest;
    dailyBestEndEl.textContent = dailyBest;
    dailyInfoEndEl.classList.remove('hidden');
    newDailyBestEl.classList.toggle('hidden', !wasNewDailyBest);
    newBestEl.classList.add('hidden');
    leaderboardEndEl.classList.add('hidden');
  } else {
    const wasNewBest = score > best;
    scores = saveScore(score);
    best = scores[0] || 0;
    if (wasNewBest) newBestEl.classList.remove('hidden');
    bestEl.textContent = `${t.best}: ${Math.floor(best)}`;
    renderLeaderboard(scores);
    dailyInfoEndEl.classList.add('hidden');
    leaderboardEndEl.classList.remove('hidden');
  }
  runCodeEl.textContent = encodeRunCode(runSeed);
  shareBtn.textContent = t.copyLink;
  const goCard = gameOverScreen.querySelector('.card');
  goCard.style.setProperty('--card-accent', !newBestEl.classList.contains('hidden') ? '#ffab40' : tierColor(score));
  updateBestLine();
  gameOverScreen.classList.remove('hidden');
  focusSoon(document.getElementById('restartBtn'));
  triggerShake(0.3, 0.15);
  flash('#ff3b3b');
  sfx.crash();
  sfx.engineStop();
  joyEnd();
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  hud.classList.remove('visible');
  pauseScreen.classList.remove('hidden');
  hideHint();
  focusSoon(document.getElementById('resumeBtn'));
  sfx.engineStop();
  joyEnd();
}

function resumeGame() {
  if (state !== 'paused') return;
  state = 'playing';
  pauseScreen.classList.add('hidden');
  hud.classList.add('visible');
  sfx.engineStart();
}

// ---------- Main loop ----------
const clock = new THREE.Clock();
let fovKick = 0;

function updatePlaying(dt) {
  survivedT += dt;
  speed = Math.min(MAX_SPEED, BASE_SPEED + survivedT * SPEED_RAMP);
  shipZ -= speed * dt;
  const mult = survivedT < multUntil ? 2 : 1;
  score += speed * dt * 1.1 * mult;
  scoreEl.textContent = Math.floor(score);
  const tier = Math.floor(score / 250);
  if (tier !== scoreTier) {
    scoreTier = tier;
    scoreEl.style.setProperty('--score-c', tierColor(score));
    if (!reducedMotion) pulseScore();
  }
  sfx.engineSet(speed);

  // keyboard + joystick nudge the target continuously
  const kSpeed = 3.6;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) target.x -= kSpeed * dt;
  if (keys.has('ArrowRight') || keys.has('KeyD')) target.x += kSpeed * dt;
  if (keys.has('ArrowUp') || keys.has('KeyW')) target.y += kSpeed * dt;
  if (keys.has('ArrowDown') || keys.has('KeyS')) target.y -= kSpeed * dt;
  if (joyActive) {
    target.x += joyVec.x * kSpeed * dt;
    target.y -= joyVec.y * kSpeed * dt;
  }
  if (pad.x !== 0 || pad.y !== 0) {
    target.x += pad.x * kSpeed * dt;
    target.y += pad.y * kSpeed * dt;
  }
  target.x = THREE.MathUtils.clamp(target.x, -PLAY_RADIUS, PLAY_RADIUS);
  target.y = THREE.MathUtils.clamp(target.y, -PLAY_RADIUS, PLAY_RADIUS);

  const ease = Math.min(1, dt * 8);
  const prevX = shipX, prevY = shipY;
  shipX += (target.x - shipX) * ease;
  shipY += (target.y - shipY) * ease;
  const velX = (shipX - prevX) / Math.max(dt, 0.0001);
  const velY = (shipY - prevY) / Math.max(dt, 0.0001);

  shipGroup.position.set(shipX, shipY, shipZ);
  shipGroup.rotation.x = THREE.MathUtils.clamp(velY * 0.06, -0.4, 0.4);
  // Roll opposite to the sideways velocity, so the ship banks into its turn.
  // The sprite could only spin in the screen plane; a mesh actually leans.
  shipGroup.rotation.z = THREE.MathUtils.clamp(-velX * 0.09, -0.5, 0.5);
  shieldRing.visible = shieldCharges > 0;
  if (shieldRing.visible) shieldRing.rotation.z += dt * 1.6;

  // recycle rings, and fade each by how far ahead it still is
  for (const ring of rings) {
    if (ring.position.z > shipZ + RECYCLE_MARGIN) {
      ring.position.z -= RING_COUNT * RING_SPACING;
    }
    const depth = Math.min(Math.max((shipZ - ring.position.z) / RING_FADE, 0), 1);
    ring.material.opacity = 0.1 + 0.8 * (1 - depth);
  }

  // recycle stars the same way - without this the field spans only
  // STAR_SPAN of z, so 20-30 s into a run the ship passed every star and
  // the sky went permanently empty. 700 comparisons per frame is noise.
  {
    const positions = starGeo.attributes.position;
    let starsMoved = false;
    for (let i = 0; i < STAR_COUNT; i++) {
      if (positions.array[i * 3 + 2] > shipZ + RECYCLE_MARGIN) {
        positions.array[i * 3 + 2] -= STAR_SPAN;
        starsMoved = true;
      }
    }
    if (starsMoved) positions.needsUpdate = true;
  }

  // spawn obstacles / orbs / power-ups based on distance traveled
  distSinceSpawn += speed * dt;
  if (distSinceSpawn > nextSpawnAt) {
    distSinceSpawn = 0;
    nextSpawnAt = 1.7 + rand() * 1.1;
    const r = rand();
    if (r < 0.46) {
      if (graceRun && survivedT < GRACE_SECONDS) spawnFrom(orbs, shipZ - SPAWN_AHEAD, 'orb');
      else spawnFrom(obstacles, shipZ - SPAWN_AHEAD, 'obstacle');
    }
    else if (r < 0.88) spawnFrom(orbs, shipZ - SPAWN_AHEAD, 'orb');
    else spawnPowerup(shipZ - SPAWN_AHEAD);
  }

  // update obstacles: recycle, shield-absorb, or collide
  for (const o of obstacles) {
    if (!o.active) continue;
    o.mesh.rotation.x += dt * 1.4;
    o.mesh.rotation.y += dt * 1.1;
    if (o.z > shipZ + RECYCLE_MARGIN) { resetPoolMesh(o); continue; }
    if (Math.abs(o.z - shipZ) < 0.85) {
      const dx = o.x - shipX, dy = o.y - shipY;
      const dist = Math.hypot(dx, dy);
      if (dist < COLLIDE_RADIUS) {
        if (shieldCharges > 0) {
          shieldCharges--;
          spawnBurst(o.x, o.y, o.z, 0.43, 1, 0.62, 14);
          resetPoolMesh(o);
          sfx.shieldHit();
          triggerShake(0.16, 0.22);
          flash('#6dff9e');
          refreshPowerupHud();
          continue;
        }
        endGame();
        return;
      } else if (!o.nearMissDone && dist < NEAR_MISS_RADIUS) {
        o.nearMissDone = true;
        score += NEAR_MISS_BONUS * mult;
        sfx.nearMiss();
      }
    }
  }

  // update orbs: magnet pull, recycle, collect, or pulse
  const magnetOn = survivedT < magnetUntil;
  for (const orb of orbs) {
    if (!orb.active) continue;
    orb.spawnT += dt;
    const pulse = 1 + Math.sin(orb.spawnT * 6) * 0.12;

    if (magnetOn) {
      const dx = shipX - orb.x, dy = shipY - orb.y, dz = shipZ - orb.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < MAGNET_RADIUS && dist > 0.001) {
        const pull = Math.min(1, dt * 6);
        orb.x += dx * pull;
        orb.y += dy * pull;
        orb.z += dz * pull;
      }
    }
    orb.mesh.position.set(orb.x, orb.y, orb.z);
    orb.mesh.scale.setScalar(pulse);

    if (orb.z > shipZ + RECYCLE_MARGIN) { resetPoolMesh(orb); continue; }
    if (Math.abs(orb.z - shipZ) < 0.9) {
      const dx = orb.x - shipX, dy = orb.y - shipY;
      if (Math.hypot(dx, dy) < ORB_RADIUS) {
        score += 45 * mult;
        sfx.collect();
        spawnBurst(orb.x, orb.y, orb.z, 0.48, 0.87, 0.96, 5);
        resetPoolMesh(orb);
      }
    }
  }

  // update power-ups: recycle, collect
  for (const p of powerups) {
    if (!p.active) continue;
    p.spawnT += dt;
    p.mesh.rotation.y += dt * 2;
    p.mesh.rotation.x += dt * 1.3;
    p.mesh.scale.setScalar(1 + Math.sin(p.spawnT * 5) * 0.12);
    if (p.z > shipZ + RECYCLE_MARGIN) { resetPoolMesh(p); continue; }
    if (Math.abs(p.z - shipZ) < 0.9) {
      const dx = p.x - shipX, dy = p.y - shipY;
      if (Math.hypot(dx, dy) < ORB_RADIUS) {
        applyPowerup(p.type);
        spawnBurst(p.x, p.y, p.z, 1, 0.67, 0.25, 10);
        resetPoolMesh(p);
      }
    }
  }

  hudPulseT += dt;
  if (hudPulseT > 0.2) { hudPulseT = 0; refreshPowerupHud(); }

  // chase camera with a bit of lag + bank
  const camTargetX = shipX * 0.55;
  const camTargetY = shipY * 0.4 + 1.05;
  const camTargetZ = shipZ + 4.4;
  camera.position.x += (camTargetX - camera.position.x) * Math.min(1, dt * 5);
  camera.position.y += (camTargetY - camera.position.y) * Math.min(1, dt * 5);
  camera.position.z += (camTargetZ - camera.position.z) * Math.min(1, dt * 5);
  camera.lookAt(shipX, shipY, shipZ - 6);
  camera.rotation.z += (-velX * 0.05 - camera.rotation.z) * Math.min(1, dt * 4);
  // "warp" (the daily-video transition family): the field of view opens
  // 72 -> 86 and settles back over ~0.45 s when a run starts.
  if (fovKick > 0) {
    fovKick = Math.max(0, fovKick - dt / 0.45);
    camera.fov = fovBase + (reducedMotion ? 0 : 14 * fovKick * fovKick);
    camera.updateProjectionMatrix();
  }

  if (shakeT > 0) {
    shakeT -= dt;
    const s = shakeMag * Math.max(0, shakeT);
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
  }

  updateTrail(dt);
}

function idleDrift(t) {
  shipGroup.position.set(Math.sin(t * 0.4) * 0.8, -0.85 + Math.cos(t * 0.3) * 0.15, -4.2);
  shipGroup.rotation.y += 0.006;
  shipGroup.rotation.z = Math.sin(t * 0.5) * 0.15;
  camera.position.set(0, 1.05, 4.4);
  camera.lookAt(0, 0, -6);
}

// One frame. `adapt` is off in manual mode: a fixed 1/30 s step would read as
// a slow machine to the adaptive render scale.
let manual = false;
let manualT = 0;
function frame(rawDt, t, adapt, draw = true) {
  const dt = Math.min(rawDt, 0.05);
  if (adapt) adaptQuality(rawDt, t);

  starMat.uniforms.uTime.value = t;

  pollGamepad();
  if (state === 'playing') updatePlaying(dt);
  else if (state !== 'paused') idleDrift(t);

  if (draw) composer.render();
}

function animate() {
  if (manual) return;
  frame(clock.getDelta(), clock.getElapsedTime(), true);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// ---------- Debug hook (opt-in via ?debug=1, never shipped to normal players) ----------
// Exists solely so the Daily Challenge seeded RNG can be verified end-to-end
// (identical spawn sequence across two separate page loads on the same UTC
// day) without exposing a seed-override footgun to real players chasing the
// daily leaderboard.
if (new URLSearchParams(window.location.search).get('debug') === '1') {
  window.__novaDriftDebug = {
    startDaily(seed) {
      dailyMode = true;
      refreshDailyToggleUI();
      startGame();
      if (seed !== undefined) { runSeed = Number(seed) >>> 0; spawnRng = mulberry32(runSeed); }
    },
    getSpawnLog() { return spawnLog.slice(); },
    dailySeed,
    getRenderScale() { return renderScale; },
    heldKeys() { return [...keys]; },
    pad() { return { ...pad }; },
    runSeed() { return runSeed; },
    lastShare() { return lastShare; },
    challengeLink,
    // Ends the run the way a rock does, for tests that need a game-over screen.
    crash() { if (state === 'playing') endGame(); },
    // Frame-exact driving, used to record the promo clip and to measure input
    // latency: manual() stops the rAF loop, step(dt) advances one frame
    // (step(dt, false) skips drawing: a software-GL machine cannot keep up with
    // hundreds of queued frames).
    manual() { manual = true; },
    step(dt, draw = true) { manualT += dt; frame(dt, manualT, false, draw); },
    world() {
      const live = (pool) => pool.filter((o) => o.active).map((o) => ({ x: o.x, y: o.y, z: o.z }));
      return { state, shipX, shipY, shipZ, targetX: target.x, targetY: target.y, score,
        obstacles: live(obstacles), orbs: live(orbs), powerups: live(powerups), speed };
    },
    nextRenderScale,
  };
}
