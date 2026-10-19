// Run codes: every run is seeded, the game-over card shows the seed as a
// code, and ?run=CODE replays that exact run. First the encoding in the
// shipped rng.js, then the page.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { sealToOrigin } = require('./fixtures');

let rng;
test.beforeAll(async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'rng.js'));
  rng = await import('data:text/javascript;base64,' + source.toString('base64'));
});

test('a code round-trips every kind of seed', () => {
  for (const seed of [0, 1, 20260831, 0x7fffffff, 0x80000000, 0xffffffff, 123456789]) {
    const code = rng.encodeRunCode(seed);
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(rng.decodeRunCode(code)).toBe(seed >>> 0);
  }
});

test('typing is forgiving: case, dashes, spaces and I/L/O', () => {
  const seed = 987654321;
  const code = rng.encodeRunCode(seed);
  expect(rng.decodeRunCode(code.toLowerCase())).toBe(seed);
  expect(rng.decodeRunCode(code.replace('-', ' '))).toBe(seed);
  expect(rng.decodeRunCode(code.replace('-', ''))).toBe(seed);
  const withO = code.replace(/0/g, 'O').replace(/1/g, 'I');
  expect(rng.decodeRunCode(withO)).toBe(seed);
});

test('garbage is rejected, not turned into some other run', () => {
  for (const bad of ['', 'ABC', 'ABCD-EFGH-J', 'UUUU-UUUU', null, undefined, 42]) {
    expect(rng.decodeRunCode(bad)).toBeNull();
  }
});

test('a single mistyped character is caught almost always', () => {
  // The 8-bit check rejects a random wrong code 255 times in 256. Measure it
  // over every one-character slip of a few codes rather than trust the claim.
  let tried = 0;
  let caught = 0;
  for (const seed of [1, 20261015, 3141592653, 2718281828]) {
    const code = rng.encodeRunCode(seed).replace('-', '');
    for (let i = 0; i < code.length; i += 1) {
      for (const ch of rng.CODE_ALPHABET) {
        if (ch === code[i]) continue;
        tried += 1;
        if (rng.decodeRunCode(code.slice(0, i) + ch + code.slice(i + 1)) === null) caught += 1;
      }
    }
  }
  expect(caught / tried).toBeGreaterThan(0.98);
});

test('random seeds are 32-bit integers and the source is injectable', () => {
  expect(rng.randomSeed(() => 0)).toBe(0);
  expect(rng.randomSeed(() => 0.999999999)).toBe(4294967291);
  for (let i = 0; i < 100; i += 1) {
    const s = rng.randomSeed();
    expect(Number.isInteger(s) && s >= 0 && s <= 0xffffffff).toBe(true);
  }
});

// --- the page --------------------------------------------------------------

// Not a first-ever run: that one swaps early rocks for orbs (the tutorial
// grace), which would make two loads of the same code differ for a reason
// that has nothing to do with the seed.
async function notFirstRun(page) {
  await page.addInitScript(() => { try { localStorage.setItem('novaDriftPlayed', '1'); } catch {} });
}

async function spawnsFor(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => window.__novaDriftDebug);
  await page.locator('#startBtn').click();
  await expect.poll(() => page.evaluate(() => window.__novaDriftDebug.world().state)).toBe('playing');
  // Frame-exact, so two loads take the same steps.
  return page.evaluate(() => {
    const d = window.__novaDriftDebug;
    d.manual();
    for (let i = 0; i < 360 && d.world().state === 'playing'; i++) d.step(1 / 60, false);
    // Kind and lateral position come from the seed. Depth (z) also depends on
    // how far the ship had flown when the spawn fired, which real frames before
    // manual() make machine-dependent, so it is left out.
    const log = d.getSpawnLog().slice(0, 10).map((s) => ({ kind: s.kind, x: +s.x.toFixed(4), y: +s.y.toFixed(4) }));
    return { seed: d.runSeed(), log };
  });
}

test.describe('in the page', () => {
  test.use({ locale: 'en-US' });

  test('?run=CODE replays the exact spawn sequence', async ({ page, baseURL }) => {
    await sealToOrigin(page, baseURL);
    await notFirstRun(page);
    const seed = 424242;
    const good = rng.encodeRunCode(seed);
    const a = await spawnsFor(page, `/index.html?debug=1&run=${good}`);
    const b = await spawnsFor(page, `/index.html?debug=1&run=${good}`);
    expect(a.seed).toBe(seed);
    expect(a.log.length).toBeGreaterThan(3);
    expect(b.log).toEqual(a.log);
    await expect(page.locator('#modeTag')).toContainText('CHALLENGE');
  });

  test('two plain endless runs get different seeds', async ({ page, baseURL }) => {
    await sealToOrigin(page, baseURL);
    const a = await spawnsFor(page, '/index.html?debug=1');
    const b = await spawnsFor(page, '/index.html?debug=1');
    expect(a.seed).not.toBe(b.seed);
    await expect(page.locator('#modeTag')).toBeHidden();
  });

  test('an invalid code is ignored and the page plays normally', async ({ page, baseURL }) => {
    await sealToOrigin(page, baseURL);
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const r = await spawnsFor(page, '/index.html?debug=1&run=NOPE');
    expect(Number.isInteger(r.seed)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('the game-over card shows the code and copies a clean challenge link', async ({ page, context, baseURL }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL });
    await sealToOrigin(page, baseURL);
    await page.goto('/index.html?debug=1');
    await page.waitForFunction(() => window.__novaDriftDebug);
    await page.locator('#startBtn').click();
    await expect.poll(() => page.evaluate(() => window.__novaDriftDebug.world().state)).toBe('playing');
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__novaDriftDebug.crash());
    const seed = await page.evaluate(() => window.__novaDriftDebug.runSeed());
    await expect(page.locator('#runCode')).toHaveText(rng.encodeRunCode(seed));
    // Try again keeps the focus, as before: the share button is secondary.
    await expect(page.locator('#restartBtn')).toBeFocused();

    await page.locator('#shareBtn').click();
    await expect.poll(() => page.evaluate(() => window.__novaDriftDebug.lastShare())).toContain('?run=');
    const share = await page.evaluate(() => window.__novaDriftDebug.lastShare());
    const link = share.slice(share.indexOf('http'));
    const u = new URL(link);
    expect([...u.searchParams.keys()]).toEqual(['run']); // never carries ?debug=1
    expect(rng.decodeRunCode(u.searchParams.get('run'))).toBe(seed);
    expect(share).toMatch(/^I scored \d+ in Işık Tüneli/);
    await expect(page.locator('#shareBtn')).toHaveText(/LINK COPIED|COPY CHALLENGE LINK/);
  });

  test('turning Daily Mode on ends a challenge', async ({ page, baseURL }) => {
    await sealToOrigin(page, baseURL);
    await page.goto(`/index.html?debug=1&run=${rng.encodeRunCode(77)}`);
    await page.waitForFunction(() => window.__novaDriftDebug);
    await page.locator('#dailyToggleBtn').click();
    await page.locator('#startBtn').click();
    await expect.poll(() => page.evaluate(() => window.__novaDriftDebug.world().state)).toBe('playing');
    const seed = await page.evaluate(() => window.__novaDriftDebug.runSeed());
    expect(seed).toBe(await page.evaluate(() => window.__novaDriftDebug.dailySeed()));
  });
});
