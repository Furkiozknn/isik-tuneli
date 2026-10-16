/*
 * Gamepad input, as pure functions.
 *
 * Kept out of `script.js` for the same reason as `rng.js`: that module
 * touches Three.js and the DOM at the top level, so a test cannot import
 * it. This file has neither, so test/gamepad.spec.js runs the exact code
 * the page loads, in Node, with fake pads.
 *
 * Mapping (the W3C "standard" layout every mainstream pad reports in
 * Chrome, Edge, Firefox and Safari):
 *   left stick or d-pad  steer (the same nudge the arrow keys give)
 *   A (button 0)         play / try again / resume
 *   Start (button 9)     pause and resume
 *   B (button 1)         back to the menu from the pause card
 *
 * The stick drives the ship the way the touch joystick does: a velocity,
 * not an absolute position, so letting go holds the line instead of
 * snapping the ship back to the centre.
 */

/** Stick values inside this radius count as zero (worn sticks drift). */
export const DEADZONE = 0.18;

/** Standard-mapping button indices. */
export const BTN = { A: 0, B: 1, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

const pressed = (pad, i) => {
  const b = pad && pad.buttons && pad.buttons[i];
  if (!b) return false;
  return typeof b === 'object' ? !!b.pressed || b.value > 0.5 : b > 0.5;
};

/**
 * Radial deadzone, rescaled so the stick still reaches 1 at full tilt
 * instead of jumping from 0 to 0.18 at the edge of the dead area.
 * Returns { x, y } with length <= 1.
 */
export function applyDeadzone(x, y, dz = DEADZONE) {
  const len = Math.hypot(x, y);
  if (!(len > dz)) return { x: 0, y: 0 };
  const scaled = Math.min(1, (len - dz) / (1 - dz));
  return { x: (x / len) * scaled, y: (y / len) * scaled };
}

/**
 * One pad's state this frame: steering (x right, y UP, both -1..1) and the
 * three buttons the game uses. The d-pad wins over the stick when held,
 * so a player on a pad with a drifting stick can still steer.
 */
export function readPad(pad) {
  if (!pad || pad.connected === false) {
    return { x: 0, y: 0, a: false, b: false, start: false };
  }
  const axes = pad.axes || [];
  let { x, y } = applyDeadzone(Number(axes[0]) || 0, Number(axes[1]) || 0);
  // Browsers report stick-up as negative; the game's y axis points up.
  y = -y;
  const dx = (pressed(pad, BTN.RIGHT) ? 1 : 0) - (pressed(pad, BTN.LEFT) ? 1 : 0);
  const dy = (pressed(pad, BTN.UP) ? 1 : 0) - (pressed(pad, BTN.DOWN) ? 1 : 0);
  if (dx !== 0) x = dx;
  if (dy !== 0) y = dy;
  return {
    x, y,
    a: pressed(pad, BTN.A),
    b: pressed(pad, BTN.B),
    start: pressed(pad, BTN.START),
  };
}

/**
 * Merge every connected pad into one state: steering from the pad with the
 * largest deflection, buttons from any pad. `pads` is what
 * navigator.getGamepads() returns (an array with null holes).
 */
export function readAll(pads) {
  const out = { x: 0, y: 0, a: false, b: false, start: false, connected: false };
  let best = 0;
  for (const pad of pads || []) {
    if (!pad || pad.connected === false) continue;
    out.connected = true;
    const s = readPad(pad);
    const mag = Math.hypot(s.x, s.y);
    if (mag > best) { best = mag; out.x = s.x; out.y = s.y; }
    out.a = out.a || s.a;
    out.b = out.b || s.b;
    out.start = out.start || s.start;
  }
  return out;
}

/**
 * Buttons that went down since the previous frame. Acting on the press,
 * not on the hold, is what stops one press of A from starting a run and
 * then instantly restarting it after a crash.
 */
export function rising(prev, cur) {
  return {
    a: !!cur.a && !prev.a,
    b: !!cur.b && !prev.b,
    start: !!cur.start && !prev.start,
  };
}

/**
 * What a button press means in each screen. Pure, so the whole menu flow is
 * testable without a page: returns one of 'begin', 'restart', 'pause',
 * 'resume', 'menu' or null.
 */
export function actionFor(state, edge, settingsOpen = false) {
  if (settingsOpen) return null;
  if (state === 'idle') return edge.a || edge.start ? 'begin' : null;
  if (state === 'gameover') return edge.a || edge.start ? 'restart' : null;
  if (state === 'playing') return edge.start ? 'pause' : null;
  if (state === 'paused') {
    if (edge.a || edge.start) return 'resume';
    if (edge.b) return 'menu';
  }
  return null;
}
