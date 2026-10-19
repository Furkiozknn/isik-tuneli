![Işık Tüneli](assets/banner.svg)

<p align="center"><img src="docs/reel/reel.gif" alt="Işık Tüneli - 15 saniyelik tanıtım videosu" width="720"></p>
<p align="center"><sub><a href="docs/reel/reel.mp4">Sesli MP4 sürümü</a></sub></p>

<div align="center">

**[▶ Play in your browser — furkiozknn.github.io/isik-tuneli](https://furkiozknn.github.io/isik-tuneli/)** · also on **[itch.io](https://furkiozknn.itch.io/isik-tuneli)**

![Işık Tüneli gameplay: the ship banks through a tunnel of light rings, dodging red rocks and collecting cyan orbs while the score counts up to 673](assets/gameplay.webp)

<sub>Real gameplay, not a montage: <code>node test/record-reel.js</code> opens the game with its interface hidden (<code>?rec=1</code>),
steps it frame by frame, steers it with pointer input and writes every frame. Six seconds of one portrait run, 0.46 MB.</sub>

![License](https://img.shields.io/badge/license-MIT-a5d9ff?style=flat-square)
![Three.js](https://img.shields.io/badge/three.js-r160-ffb3d9?style=flat-square)
![Build step](https://img.shields.io/badge/build%20step-none-6dff9e?style=flat-square)
![Audio](https://img.shields.io/badge/audio-synthesized%20live-ffd76d?style=flat-square)
![Platform](https://img.shields.io/badge/platform-browser%20(desktop%20%2B%20mobile)-7ee8ff?style=flat-square)
[![CI](https://github.com/Furkiozknn/isik-tuneli/actions/workflows/ci.yml/badge.svg)](https://github.com/Furkiozknn/isik-tuneli/actions/workflows/ci.yml)

</div>

---

**Işık Tüneli** (Turkish for "Light Tunnel"; formerly Nova Drift) is an endless space-runner that plays in any modern browser. Your ship holds its line while a tunnel of light rushes past; you drift left, right, up and down to dodge red rocks, collect cyan orbs and grab power-ups, and the speed never stops climbing.

It is a small, honest piece of web tech: real [Three.js](https://threejs.org/) bloom post-processing, hand-written particle shaders, and an audio engine synthesized live with the Web Audio API — there is not a single sound file in the repository. Three.js and the font are vendored, so the page makes no request to any other origin. No bundler, no build step: serve the folder and play.

| | |
|---|---|
| **Play** | [furkiozknn.github.io/isik-tuneli](https://furkiozknn.github.io/isik-tuneli/) or [furkiozknn.itch.io/isik-tuneli](https://furkiozknn.itch.io/isik-tuneli) — or [run it locally](#run-locally) in one command |
| **Objective** | Survive as long as you can; score comes from distance, orbs and near-misses |
| **Controls** | Mouse / touch-drag / arrow keys or WASD / gamepad · `Space`/`Enter` (or A) start · `Esc` (or Start) pause · Settings: sound, language (EN/TR) |
| **Platform** | Desktop and mobile browsers with WebGL and import maps (Chrome/Edge 89+, Firefox 108+, Safari 16.4+) |
| **Weight** | About 0.87 MB on first load (868,177 bytes measured before gamepad support and run codes; +11 KB since), 20 requests, all from the page's own origin |

## Table of Contents

- [Gameplay](#gameplay)
  - [Objective](#objective)
  - [Controls](#controls)
  - [Power-Ups](#power-ups)
  - [Scoring](#scoring)
  - [Leaderboard](#leaderboard)
  - [Daily Challenge](#daily-challenge)
  - [Run Codes & Challenge Links](#run-codes--challenge-links)
- [How It Works](#how-it-works)
  - [Scene, Camera & Tunnel](#scene-camera--tunnel)
  - [Bloom Pipeline](#bloom-pipeline)
  - [Particle Systems](#particle-systems)
  - [Object Pooling](#object-pooling)
  - [Synthesized Audio](#synthesized-audio)
  - [Accessibility](#accessibility)
- [Platform & Performance](#platform--performance)
- [Run Locally](#run-locally)
- [Troubleshooting](#troubleshooting)
- [Testing](#testing)
  - [Manual smoke test](#manual-smoke-test)
  - [Regenerating the demo media](#regenerating-the-demo-media)
- [Project Structure](#project-structure)
- [Stack & Credits](#stack--credits)
- [License](#license)

---

## Gameplay

![A run in progress: the ship low in the frame, a green power-up and cyan orbs ahead inside the rings](assets/screenshot.webp)

### Objective

Stay alive. A run ends the moment the ship touches a red rock (unless a shield absorbs the hit). Everything else is score: the distance you cover, the cyan orbs you collect and the rocks you skim past without touching. The run starts gentle and speeds up continuously, so every run ends eventually — the question is how far you get.

### Controls

| Input | Action |
|---|---|
| 🖱️ Mouse move | Ship follows your pointer directly |
| 👆 Touch-drag | A virtual joystick appears wherever you touch |
| ⌨️ Arrow keys / WASD | Nudge the ship left / right / up / down |
| 🎮 Gamepad left stick / d-pad | Steer, the same nudge as the arrow keys; letting go holds the line |
| 🎮 A | Play from the menu, try again after a crash, resume from pause |
| 🎮 Start | Pause and resume |
| 🎮 B | From the pause card, back to the menu |
| `Space` / `Enter` | Start or restart the run (a focused button gets its own key press instead) |
| `Escape` / pause button | Pause — freezes the scene exactly where it was; Resume, Restart, Settings and Menu on the card |
| Switch window / tab | Pauses automatically and releases any held key, so the ship does not drift into a wall while you are away |

**Gamepad.** Any pad the browser reports in the standard layout works, and two pads can be connected at once (steering comes from whichever is pushed harder). The Gamepad API has no input events, so the page polls once per frame. Buttons act on the *press*, not the hold, so holding A through a crash does not instantly restart the run. Steering is a velocity like the touch joystick, so letting go holds your line instead of snapping back to the centre. A short hint names the buttons the first time a pad is used in a run. The mapping and the menu flow are pure functions in `gamepad.js`, which the tests import directly.

The ship never chases your pointer instantly — its position *eases* toward a target each frame, and the last frame's velocity drives a small bank-and-tilt rotation, so movement reads as inertia rather than teleportation.

### Power-Ups

![Power-ups: Shield, Magnet, x2 Score](assets/powerups-strip.svg)

Power-ups spawn in the same stream as obstacles and orbs — you have to fly through them like everything else. All three stack independently of each other:

| Power-up | Effect | Duration |
|---|---|---|
| 🛡️ **Shield** | Absorbs one collision instead of ending the run | Stacks up to **2** charges |
| 🧲 **Magnet** | Pulls every orb within range straight into the ship | **6 seconds** (refreshes on pickup) |
| ✨ **x2** | Doubles *all* scoring — distance, orbs, near-misses | **8 seconds** (refreshes on pickup) |

### Scoring

![Scoring breakdown: distance, orb bonus, near-miss bonus](assets/scoring-breakdown.svg)

Your score is a running total of three sources, each of which the x2 power-up doubles:

- **Distance** — accrues continuously as `speed × 1.1` per second, so it snowballs as the run speeds up
- **Orb bonus** — a flat **+45** per cyan orb collected
- **💥 Near-miss bonus** — skim past an obstacle without touching it and you get **+10** plus a distinct chime — a small reward for flying dangerously close to the edge instead of playing it safe

### Leaderboard

The top **5** scores persist locally via `localStorage` and are rendered on both the start screen and the game-over screen, so you always know what you're chasing before you even hit start.

### Daily Challenge

A toggle on the start screen ("DAILY MODE" / "GÜNLÜK MOD") switches spawning from real randomness to a **seeded** run: a small [mulberry32](https://github.com/bryc/code/blob/master/jshash/PRNGs.md) PRNG, seeded from the current UTC date (`YYYYMMDD` as an integer), replaces every `Math.random()` call in the obstacle/orb/power-up spawn logic. Two players who open the page on the same calendar day get the byte-for-byte identical spawn sequence — same obstacles, same orbs, same power-ups, in the same order — so their scores are genuinely comparable, not just two unrelated random runs.

Today's Daily Challenge best is tracked separately from the endless-mode top-5 (`localStorage` key `novaDriftDaily-YYYYMMDD`, one per day) so the two modes never mix.

### Run Codes & Challenge Links

Every run is seeded now, not only the daily one. An endless run draws a fresh random 32-bit seed, and the game-over card shows it as an 8-character **run code** such as `K7Q2-M9XA`. **COPY CHALLENGE LINK** puts a short line and a link on the clipboard: *"I scored 1234 in Işık Tüneli. Same rocks, same orbs. Beat it: …?run=K7Q2-M9XA"*. Whoever opens the link plays the exact same spawn sequence, so the comparison is fair with no server involved. The same idea already makes the Daily Challenge work; this extends it to any run, on any day.

- **Code format.** Crockford base32 (no I, L, O or U), so a code read out loud or retyped from a screenshot survives. Case, dashes and spaces are ignored, and I/L/O are read as 1/1/0. The 8 characters carry the seed plus an 8-bit check, so a mistyped code is rejected instead of starting a different run. The test measures that more than 98% of one-character slips are caught.
- **A challenge stays on for retries.** "Try again" replays the same code. A challenge link wins over `?daily=1`, and turning Daily Mode on ends the challenge. The HUD tag reads `CHALLENGE K7Q2-M9XA`.
- **The link is clean.** It is the page address with `?run=` and nothing else, so it never carries `?debug=1`.
- **No clipboard?** In an http page or a portal frame without permission, the card shows the link itself in place of the code, selectable in one tap.
- **Scores.** Challenge runs count toward the local top 5 like any endless run. Nothing is stored that was not stored before.

---

## How It Works

A quick tour of the moving parts under the hood — everything below is grounded directly in `script.js`, nothing aspirational.

![How the tunnel, ship, and camera relate](assets/diagram-how-it-works.svg)

### Scene, Camera & Tunnel

- The ship's world position (`shipX, shipY, shipZ`) actually advances forward through `-Z` every frame — it isn't the tunnel sliding toward a fixed ship, it's the whole rig moving through an infinitely recycled corridor
- **18** torus rings sit `RING_SPACING = 7` units apart; once a ring falls more than `RECYCLE_MARGIN` behind the ship, it's teleported back to the far end of the chain instead of being destroyed and recreated
- A `PerspectiveCamera` chases the ship with easing + lag on all three axes, banks on a Z-rotation driven by lateral velocity, and looks a fixed distance ahead down the tunnel
- Speed ramps continuously from `BASE_SPEED` to `MAX_SPEED` the longer you survive, driving both the scroll rate and the score-per-second
- A `FogExp2` fog and a full-screen nebula texture (`assets/nebula.webp`) sit behind everything to sell depth without extra geometry. Fog never touches a scene background, so the nebula renders at `backgroundIntensity = 0.2` — otherwise the one object nobody interacts with is the only one at full strength, and the gameplay reads as clutter on top of it

### Bloom Pipeline

Real post-processing, not a CSS filter:

```
RenderPass → UnrealBloomPass(strength 0.62, radius 0.35, threshold 0.5) → OutputPass
```

Colors are rendered in `SRGBColorSpace` and finished with `ACESFilmicToneMapping` at `0.98` exposure, so bright emissive materials (obstacles, orbs, power-ups, the shield ring) bloom convincingly against the dark scene instead of just clipping to white.

### Particle Systems

Two independent point-cloud systems, both custom `ShaderMaterial`s with additive blending and pixel-ratio-aware point sizing so they stay crisp on high-DPI screens:

- **Starfield** — 700 points with a per-star phase offset driving a sine-wave twinkle in the fragment shader
- **Engine trail + impact bursts** — a shared pool of 70 particles. Idle exhaust spawns continuously behind the ship in alternating pink/cyan; a shield block, an orb pickup and a power-up pickup each spawn a small radial burst (5, 5 and 10 particles) at the spot. Both fade via a `life` value decayed each frame

### Object Pooling

Obstacles, orbs, and power-ups are never `new`'d mid-run. Fixed pools are allocated once at load —

| Pool | Size |
|---|---|
| Obstacles | 26 |
| Orbs | 26 |
| Power-ups | 9 (3 types × 3) |

— and each entry just toggles `visible` and gets repositioned when it spawns or recycles. Nothing is allocated or garbage-collected during play, which matters a lot when the scene is already pushing bloom + two particle systems + physics-adjacent collision checks every frame.

### Synthesized Audio

Every sound effect is generated live with the **Web Audio API** — there isn't a single audio file in the repo:

- Collect / power-up / shield-hit / near-miss chimes are short `OscillatorNode` tones (sine, triangle, or square waves) with hand-tuned gain envelopes
- The crash sound is a procedurally generated noise buffer run through a lowpass filter, layered with a low sawtooth thump
- A continuous engine drone plays while flying — a sawtooth oscillator through a lowpass filter, whose cutoff frequency tracks current speed in real time
- Mute state persists in `localStorage` and survives reloads

### Accessibility

Screen shake, the hit-flash overlay, the start-of-run "warp" (field-of-view kick), the score pulse, the screen-change iris and every menu animation check `prefers-reduced-motion` and quietly disable themselves when it's set — no motion-triggered discomfort for players who've asked their OS to avoid it. Every button has a visible focus ring, overlays leave the tab order while hidden, the primary action of each card takes focus, and text/background pairs are held to WCAG AA (4.5:1) by `test/contrast.spec.js`.

### Language

The interface is English and Turkish. It follows the browser language (`tr*` gets Turkish, everything else English); **Settings → Language** overrides that and the choice is stored under its own key (`novaDriftLang`), so no existing save is touched. First run only: a one-line hint names the goal and the first four seconds hold orbs and no rocks (never in Daily Mode, whose pattern is fixed).

---

## Platform & Performance

- **Runs on** any browser with WebGL, ES modules and import maps — Chrome/Edge 89+, Firefox 108+, Safari 16.4+ — on desktop and mobile. The automated suite runs in Chromium; other engines are covered by the [manual smoke test](#manual-smoke-test). The page is also a PWA (`manifest.json`; "Add to Home Screen" launches it fullscreen).
- **First load** is about 0.99 MB uncompressed across 21 requests (measured in Chromium against a local server: 993,235 bytes; `vendor/three.module.js` + `vendor/three.core.js` are 766 KB of that, the three font files 61 KB). three 0.186 no longer publishes a minified build, so `scripts/vendor-three.mjs` minifies those two files with the pinned esbuild.
- **Adaptive render scale.** A 60-frame moving average of frame time lowers the render scale in 0.15 steps (floor 0.6) when frames exceed 20 ms, and raises it in 0.1 steps below 12.5 ms, with a 2 s cooldown. The bloom pass is what a slow phone pays for, and it scales with pixel count.
- **No allocation during play.** Obstacles, orbs, power-ups, stars and trail particles are pooled (see [Object Pooling](#object-pooling)); the physics step clamps `dt` to 0.05 s so a stalled frame never teleports the ship.
- **Storage is optional.** Scores, the daily best, the mute switch and the language choice live in `localStorage`; when a browser refuses site data (private mode, third-party iframe) the game still starts and plays, it just forgets on reload.

## Run Locally

No install, no build, no bundler. Serve the folder over HTTP and open it:

```bash
git clone https://github.com/Furkiozknn/isik-tuneli.git
cd isik-tuneli
python3 -m http.server 8000      # then open http://localhost:8000
# or, with Node:  npx serve .    # then open the printed URL
```

It **must** be served over HTTP: `index.html` loads Three.js through an ES module import map pointed at `./vendor/`, and browsers refuse module imports from `file://`.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Black page, nothing happens, console says a module was blocked | You opened `index.html` from disk. Serve the folder over HTTP (see above). |
| Black canvas, console mentions WebGL | WebGL is disabled or unavailable (remote desktop, blocklisted GPU driver). Enable hardware acceleration in the browser settings, or try another browser. |
| No sound | Browsers only allow audio after a user gesture — press PLAY first. Check the speaker button (or Settings → Sound); mute persists across reloads. |
| Low frame rate | The render scale drops automatically; give it two seconds. On very old hardware close other GPU-heavy tabs. |
| The interface is in Turkish | The game follows the browser language: Turkish browsers get Turkish text, everything else gets English. Change it in Settings → Language. |

## Testing

A dev-only Playwright suite; it adds no build step to the game itself, which stays plain static HTML/CSS/JS.

```bash
npm install
npx playwright install --with-deps chromium   # first run only
npm test                                      # 61 tests in 13 spec files
```

`PW_CHROMIUM_PATH=/path/to/chrome npm test` points the suite at an already-installed Chromium on machines without a browser download. Every spec runs with the page **sealed to its own origin**: any request to another origin is aborted, exactly as it would fail on a game portal's network, so a reintroduced CDN import breaks CI instead of passing it. CI (`.github/workflows/ci.yml`) runs the whole suite on Node 20 and 22 on every push and pull request.

| Spec | What it proves |
|---|---|
| `smoke.spec.js` | No console errors with default and reduced-motion loads; the Daily toggle works; `manifest.json` is well-formed |
| `focus.spec.js` | Switching window or tab pauses a running game and releases held keys |
| `prng.spec.js` | The Daily Challenge RNG, executed from the real `rng.js` (not a copy): same seed, same sequence; stable across a UTC day; pinned to today's shipped sequence |
| `gamepad.spec.js` | Gamepad mapping, executed from the real `gamepad.js`: deadzone, stick and d-pad, two pads, press-not-hold, the menu flow; then a fake pad drives the real page through start, steer, pause, resume, menu and a crash |
| `run-code.spec.js` | Run codes, executed from the real `rng.js`: round trip, forgiving input, garbage rejected, one-character slips caught; then the page: the same code replays the same spawns, plain runs differ, an invalid code is ignored, the card shows the code and copies a clean link, Daily Mode ends a challenge |
| `adaptive.spec.js` | The render-scale decision function (thresholds, hysteresis, floor/ceiling), isolated and against the live page via `?debug=1` |
| `storage.spec.js` | The game starts, scores and mutes with `localStorage` throwing on every call |
| `no-external-requests.spec.js` | Nothing leaves the origin (observed, not just blocked) |
| `portal-sizes.spec.js` | The game starts and fits at the viewports Poki and CrazyGames require |
| `language.spec.js` | English markup; Turkish on a Turkish browser; the Settings switch and its own storage key; saved scores untouched |
| `font.spec.js` | Every vendored woff2 is served; Instrument Sans and JetBrains Mono are what the UI renders in; the Turkish letters are in the subset |
| `menu.spec.js` | Start, pause (Resume/Restart/Menu/Settings), game over (score, best, record stamp, focus, Enter to retry), settings, first-run hint and grace, focus ring, recording mode |
| `feel.spec.js` | Pointer input reaches the ship within 3 frames; the ship covers 90% of a full-width move in under 0.5 s |
| `contrast.spec.js` | Every text/background pair and score-tier colour is at least 4.5:1 |
| `vendor.spec.js` | `vendor/` is exactly what `scripts/vendor-three.mjs` produces from the pinned `three`, and regenerating keeps `vendor/fonts/` |

### Manual smoke test

Automated tests cannot judge feel. Before a release, play one run in a real browser with a real GPU:

1. Serve the folder, open it, and check the browser console stays free of errors.
2. Press `Space` — the run starts, the engine hum starts, the score counts up.
3. Steer with the arrow keys, then WASD, then the mouse; on a phone, touch-drag shows the joystick.
4. Press `Esc` — the scene freezes and the score stops; `Esc` again resumes. Switch to another tab and back — the game is paused.
5. Fly through an orb (+45 and a chime) and a power-up (icon appears under the score).
6. Crash into a rock — RUN ENDED card with score, best and leaderboard, TRY AGAIN focused; `Enter` starts a new run, MENU returns to the start screen.
7. Toggle **DAILY MODE**, play, and confirm "today's best" is tracked separately from the top 5.
8. Mute with the speaker button (or Settings → Sound), reload, and confirm it stays muted. Switch the language in Settings and confirm every screen follows.

### Regenerating the demo media

The animation and stills in this README are captured from the game itself, never drawn. Both scripts seal the page to its own origin, run the browser in `en-US` and drive the game clock with Playwright's fake clock, so each frame is exactly one step of game time even on a software renderer.

```bash
node test/record-reel.js .capture 18 30            # 18 s of portrait 1080x1920 play, interface hidden -> .capture/f0000.jpg ...
ffmpeg -y -framerate 30 -start_number 150 -t 6 -i .capture/f%04d.jpg \
  -vf "fps=12,scale=320:-1:flags=lanczos" \
  -c:v libwebp_anim -lossless 0 -quality 45 -compression_level 4 -loop 0 assets/gameplay.webp
node test/capture-screens.js .capture              # start / play / pause / settings / game over, desktop + mobile, EN + TR
```

The pilot is a humanlike pointer driver (0.17 s reaction delay, hand tremor, one deliberate crash), so the exact frames differ with the game's own randomness. `test/capture-gif.js` and `test/capture-shot.js` remain for keyboard-driven landscape captures. Set `PW_ARGS="--use-angle=d3d11 --ignore-gpu-blocklist"` to use a real GPU. `.capture/` is git-ignored.

## Project Structure

```
isik-tuneli/
├── index.html          # markup, HUD, overlays, import map, OG/Twitter meta
├── styles.css           # palette tokens, HUD, overlays, cards, buttons, screen band
├── script.js            # scene setup, game loop, audio, everything
├── rng.js                # the daily seed, the PRNG and run codes, alone so tests can import it
├── gamepad.js            # gamepad mapping and menu flow, pure, alone for the same reason
├── manifest.json         # PWA manifest (installable, fullscreen)
├── package.json           # dev-only: Playwright test runner
├── playwright.config.js   # dev-only: Playwright config (serves the page over http, no build)
├── test/
│   ├── prng.spec.js        # seeded-RNG determinism, no browser rendering needed
│   ├── smoke.spec.js       # console-error + Daily Challenge UI + manifest checks
│   ├── focus.spec.js       # switching window/tab pauses the run and releases held keys
│   ├── adaptive.spec.js    # adaptive render-scale decision function, isolated + live
│   ├── storage.spec.js     # the game with localStorage throwing on every call
│   ├── no-external-requests.spec.js  # nothing may leave the origin
│   ├── portal-sizes.spec.js  # the viewports Poki and CrazyGames require
│   ├── language.spec.js    # English markup, Turkish browser, Settings switch, saved scores untouched
│   ├── font.spec.js        # the vendored woff2 really loads; Instrument Sans + JetBrains Mono render
│   ├── menu.spec.js        # start / pause / game over / settings / first-run flows
│   ├── feel.spec.js        # input latency and follow speed guards
│   ├── contrast.spec.js    # WCAG AA for every palette pair
│   ├── vendor.spec.js      # vendor/ matches the pinned three, and keeps the font
│   ├── fixtures.js         # seals the page to its own origin, shared by the specs above
│   ├── record-reel.js      # dev-only: portrait gameplay frames for the README animation and the promo clip
│   ├── capture-screens.js  # dev-only: screenshots of every screen, desktop + mobile, EN + TR
│   ├── capture-gif.js      # dev-only: keyboard-driven landscape frames
│   └── capture-shot.js     # dev-only: a single still (before/after on the art, social card)
├── scripts/vendor-three.mjs  # copies the Three.js files the import graph reaches
├── vendor/                  # Three.js + Instrument Sans / JetBrains Mono (OFL), shipped so nothing is fetched
├── .github/workflows/ci.yml  # runs the suite on push/PR
└── assets/
    ├── banner.svg              # hero graphic (this README)
    ├── diagram-how-it-works.svg
    ├── powerups-strip.svg
    ├── scoring-breakdown.svg
    ├── gameplay.webp           # README animation, 6 s of real portrait play (animated WebP, 0.46 MB)
    ├── screenshot.webp         # README still, one frame of the same run
    ├── og-preview.jpg          # social-share preview image (Open Graph / Twitter Card)
    ├── nebula.webp             # backdrop, 32 KB
    └── icon_shield.png / icon_magnet.png / icon_mult.png  # in-HUD icons
```

## Stack & Credits

| | |
|---|---|
| **Engine** | [Three.js](https://threejs.org/) r160, loaded via an ES module import map pointed at the vendored copy in `vendor/` — no bundler, no CDN, no `node_modules` at runtime |
| **Rendering** | Real bloom post-processing (`EffectComposer` + `UnrealBloomPass`), ACES filmic tone mapping |
| **Audio** | 100% synthesized with the Web Audio API — zero audio files |
| **Markup / styling** | Plain HTML + CSS, Instrument Sans + JetBrains Mono (SIL OFL, Latin + Turkish subsets) shipped with the game — the portals reject any external request. Palette from the game's own promo video; design notes in [`docs/TASARIM.md`](docs/TASARIM.md), audit in [`docs/DENETIM.md`](docs/DENETIM.md) |
| **Art** | The ship is flat-coloured Three.js geometry, not a sprite: it is built along `-Z` so it reads as flying away from any angle and can actually bank into a turn. The nebula backdrop is an AI-generated image. Every line of game logic, rendering and audio synthesis is hand-written |
| **Build step** | None. Clone it, serve it, play it |

## License

MIT — see [`LICENSE`](LICENSE).

Built with Claude Code; the `Co-Authored-By` trail in the commit history shows which models were used. Game loop: [`script.js`](script.js).

---

## Bu ekosistemden başka projeler

- **[masal](https://github.com/Furkiozknn/masal)** — çocuğun adına yazılan uyku öncesi masalı
- **[buradane](https://github.com/Furkiozknn/buradane)** — ihtiyaç odaklı 167.829 OpenStreetMap noktası
- **[turkce-ajanlar](https://github.com/Furkiozknn/turkce-ajanlar)** — Türkçe düşünen 70 Claude Code alt-ajanı

<sub>Hepsi tek bir aranabilir sayfada: **[furkiozknn.github.io](https://furkiozknn.github.io/)** — her kart, o deponun kendi <code>project-meta.json</code> dosyasından üretiliyor.</sub>
