// Gamepad support: the pure mapping in ./gamepad.js, then the real page
// driven by a fake pad.
//
// The module is imported from its own bytes through a data: URL, for the
// reason test/prng.spec.js explains: the spec is CommonJS, the repository has
// no "type": "module", and Node 20 would otherwise refuse the `export`.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { sealToOrigin } = require('./fixtures');

const PAD_PATH = path.resolve(__dirname, '..', 'gamepad.js');

let gp;
test.beforeAll(async () => {
  gp = await import('data:text/javascript;base64,' + fs.readFileSync(PAD_PATH).toString('base64'));
});

/** A standard-mapping pad: 4 axes, 17 buttons. */
function fakePad({ x = 0, y = 0, buttons = [] } = {}) {
  const b = Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i), value: buttons.includes(i) ? 1 : 0 }));
  return { connected: true, mapping: 'standard', axes: [x, y, 0, 0], buttons: b };
}

test('the module under test is the one the page loads', () => {
  const script = fs.readFileSync(path.resolve(__dirname, '..', 'script.js'), 'utf8');
  expect(script).toContain("from './gamepad.js'");
});

test('deadzone: a resting or drifting stick is zero, full tilt still reaches 1', () => {
  expect(gp.applyDeadzone(0.1, -0.1)).toEqual({ x: 0, y: 0 });
  const full = gp.applyDeadzone(1, 0);
  expect(full.x).toBeCloseTo(1, 6);
  const just = gp.applyDeadzone(gp.DEADZONE + 0.01, 0);
  expect(just.x).toBeGreaterThan(0);
  expect(just.x).toBeLessThan(0.05);
  const diag = gp.applyDeadzone(1, 1);
  expect(Math.hypot(diag.x, diag.y)).toBeLessThanOrEqual(1.000001);
});

test('stick up steers up (browsers report up as negative)', () => {
  const s = gp.readPad(fakePad({ y: -1 }));
  expect(s.y).toBeCloseTo(1, 6);
  expect(gp.readPad(fakePad({ x: 1 })).x).toBeCloseTo(1, 6);
});

test('the d-pad steers and wins over a drifting stick', () => {
  const s = gp.readPad(fakePad({ x: 0.4, buttons: [gp.BTN.LEFT, gp.BTN.DOWN] }));
  expect(s.x).toBe(-1);
  expect(s.y).toBe(-1);
});

test('missing or disconnected pads read as nothing', () => {
  expect(gp.readPad(null)).toEqual({ x: 0, y: 0, a: false, b: false, start: false });
  expect(gp.readAll([null, null]).connected).toBe(false);
  expect(gp.readAll([{ ...fakePad({ x: 1 }), connected: false }]).x).toBe(0);
});

test('two pads: steering from the one pushed hardest, buttons from either', () => {
  const s = gp.readAll([fakePad({ x: 0.5 }), null, fakePad({ x: -1, buttons: [gp.BTN.A] })]);
  expect(s.connected).toBe(true);
  expect(s.x).toBeLessThan(-0.9);
  expect(s.a).toBe(true);
});

test('buttons act on the press, not the hold', () => {
  const up = { a: false, b: false, start: false };
  const down = { a: true, b: false, start: true };
  expect(gp.rising(up, down)).toEqual({ a: true, b: false, start: true });
  expect(gp.rising(down, down)).toEqual({ a: false, b: false, start: false });
});

test('menu flow: A plays, A retries, Start pauses and resumes, B leaves the pause card', () => {
  const press = (k) => ({ a: k === 'a', b: k === 'b', start: k === 'start' });
  expect(gp.actionFor('idle', press('a'))).toBe('begin');
  expect(gp.actionFor('idle', press('start'))).toBe('begin');
  expect(gp.actionFor('gameover', press('a'))).toBe('restart');
  expect(gp.actionFor('playing', press('start'))).toBe('pause');
  expect(gp.actionFor('playing', press('a'))).toBeNull(); // A mid-run must not pause or restart
  expect(gp.actionFor('paused', press('start'))).toBe('resume');
  expect(gp.actionFor('paused', press('a'))).toBe('resume');
  expect(gp.actionFor('paused', press('b'))).toBe('menu');
  expect(gp.actionFor('idle', press('a'), true)).toBeNull(); // settings open: the card has focus
});

// --- the real page ---------------------------------------------------------

/** Replace navigator.getGamepads with one driven by window.__pad. */
async function installFakePad(page) {
  await page.addInitScript(() => {
    window.__pad = { x: 0, y: 0, buttons: [] };
    const make = () => {
      const p = window.__pad;
      const b = Array.from({ length: 17 }, (_, i) => ({ pressed: p.buttons.includes(i), value: p.buttons.includes(i) ? 1 : 0 }));
      return { id: 'fake', index: 0, connected: true, mapping: 'standard', axes: [p.x, p.y, 0, 0], buttons: b };
    };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [make(), null, null, null] });
  });
}

// Held for several frames, released for several: the page polls once per
// animation frame, so a press shorter than a frame could be missed.
async function tap(page, button) {
  await page.evaluate((b) => { window.__pad.buttons = [b]; }, button);
  await page.waitForTimeout(250);
  await page.evaluate(() => { window.__pad.buttons = []; });
  await page.waitForTimeout(250);
}

/** Wait until the game loop is running (the first frames poll the pad). */
async function ready(page) {
  await page.waitForFunction(() => window.__novaDriftDebug && window.__novaDriftDebug.world());
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

test.describe('in the page', () => {
  test.use({ locale: 'en-US' });

  test('a pad starts, steers, pauses, resumes and retries a run', async ({ page, baseURL }) => {
    await sealToOrigin(page, baseURL);
    await installFakePad(page);
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/index.html?debug=1');
    await expect(page.locator('#startBtn')).toBeVisible();
    await ready(page);

    await tap(page, 0); // A
    await expect.poll(() => page.evaluate(() => window.__novaDriftDebug.world().state)).toBe('playing');
    await expect(page.locator('#hint')).toContainText('Gamepad');

    const x0 = await page.evaluate(() => window.__novaDriftDebug.world().targetX);
    await page.evaluate(() => { window.__pad.x = 1; });
    await page.waitForTimeout(400);
    await page.evaluate(() => { window.__pad.x = 0; });
    const x1 = await page.evaluate(() => window.__novaDriftDebug.world().targetX);
    expect(x1).toBeGreaterThan(x0 + 0.3);
    // Letting go holds the line: the stick is a velocity, not a position.
    await page.waitForTimeout(300);
    const x2 = await page.evaluate(() => window.__novaDriftDebug.world().targetX);
    expect(Math.abs(x2 - x1)).toBeLessThan(0.05);

    await tap(page, 9); // Start
    await expect(page.locator('#pauseScreen')).toBeVisible();
    await tap(page, 9);
    await expect.poll(() => page.evaluate(() => window.__novaDriftDebug.world().state)).toBe('playing');

    await tap(page, 9);
    await tap(page, 1); // B: pause card -> menu
    await expect(page.locator('#startBtn')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('holding A through a crash does not restart the run by itself', async ({ page, baseURL }) => {
    await sealToOrigin(page, baseURL);
    await installFakePad(page);
    await page.goto('/index.html?debug=1');
    await ready(page);
    await tap(page, 0);
    await expect.poll(() => page.evaluate(() => window.__novaDriftDebug.world().state)).toBe('playing');
    // Hold A, then end the run the way a rock would.
    await page.evaluate(() => { window.__pad.buttons = [0]; });
    await page.waitForTimeout(250); // the page has seen the press while playing
    await page.evaluate(() => window.__novaDriftDebug.crash());
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__novaDriftDebug.world().state)).toBe('gameover');
    await page.evaluate(() => { window.__pad.buttons = []; });
    await page.waitForTimeout(150);
    await tap(page, 0); // a fresh press retries
    await expect.poll(() => page.evaluate(() => window.__novaDriftDebug.world().state)).toBe('playing');
  });
});
