// Unit tests for the gesture engine — the pure-logic section of index.html
// (between the @engine:begin / @engine:end markers). No browser or webcam needed:
// the tests feed synthetic hand landmarks and timestamps straight into the code
// that ships, extracted from index.html rather than copied.
//
// Run:  npm test        (or: node --test tests/engine.test.mjs)
// Written and run on Node 22; Node 18+ should work.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
const begin = html.indexOf('// @engine:begin');
const end = html.indexOf('// @engine:end');
assert.ok(begin > 0 && end > begin, 'engine markers not found in index.html');

const E = new Function(`${html.slice(begin, end)}
  return { classifyPose, isArmPose, palmCentroid, palmLength, reachFor,
           createNavMachine, stepNavMachine, createPointerMachine, stepPointerMachine, POINTER_REGION };`)();

// ---------------------------------------------------------------------------
// Reach-to-navigate
// ---------------------------------------------------------------------------
const DT = 33; // ms per frame, ~30 fps

// steps: { to?, ms, pose = 'open', arm = true, hand = true, palmLen, label }
// `to` moves the palm linearly (mirrored x, 0..1) over `ms`; omit it to hold still.
function timeline(startX, steps, dt = DT) {
  const frames = [];
  let t = 0;
  let x = startX;
  for (const s of steps) {
    const n = Math.max(1, Math.round(s.ms / dt));
    const x0 = x;
    for (let i = 1; i <= n; i++) {
      t += dt;
      const present = s.hand !== false;
      const pose = present ? (s.pose || 'open') : 'none';
      frames.push({
        hasHand: present,
        pose,
        armReady: present && pose === 'open' && s.arm !== false,
        palmX: present ? (s.to === undefined ? x0 : x0 + (s.to - x0) * (i / n)) : null,
        palmY: 0.55,
        palmLen: s.palmLen ?? 0.18,
        hand: s.label ?? 'Right',
        nowMs: t,
      });
    }
    if (s.to !== undefined) x = s.to;
  }
  return frames;
}

function run(frames) {
  const m = E.createNavMachine();
  const fired = [];
  for (const f of frames) {
    const a = E.stepNavMachine(m, f);
    if (a) fired.push(a);
  }
  return { fired: fired.join(',') || 'none', m };
}

const talking = (n) => {
  const s = [{ ms: 300 }];
  for (let i = 0; i < n; i++) s.push({ to: 0.5 + (i % 2 ? 0.07 : -0.07), ms: 150, arm: false });
  return s;
};

const NAV_CASES = [
  // [name, expected sequence of fires, start x, steps, frame dt]
  ['holding still near the middle arms but never fires', 'none', 0.5, [{ ms: 600 }]],
  ['one reach right fires one "next"', 'next', 0.5, [{ ms: 300 }, { to: 0.8, ms: 200 }, { ms: 400 }]],
  ['holding at the edge for 3 s does not repeat', 'next', 0.5, [{ ms: 300 }, { to: 0.8, ms: 200 }, { ms: 3000 }]],
  ['three reaches in a row without lowering the hand', 'next,next,next', 0.5, [
    { ms: 300 },
    { to: 0.8, ms: 200 }, { ms: 150 }, { to: 0.55, ms: 250 }, { ms: 100 },
    { to: 0.8, ms: 200 }, { ms: 150 }, { to: 0.55, ms: 250 }, { ms: 100 },
    { to: 0.8, ms: 200 }, { ms: 150 },
  ]],
  ['overshooting on the way back does not fire the opposite side', 'next', 0.5,
    [{ ms: 300 }, { to: 0.8, ms: 200 }, { ms: 100 }, { to: 0.2, ms: 250 }, { ms: 500 }]],
  ['next, rest in the middle, then previous', 'next,prev', 0.5, [
    { ms: 300 }, { to: 0.8, ms: 200 }, { ms: 100 }, { to: 0.5, ms: 250 }, { ms: 300 }, { to: 0.2, ms: 200 }, { ms: 300 },
  ]],
  ['two previous in a row', 'prev,prev', 0.5, [
    { ms: 300 }, { to: 0.2, ms: 200 }, { ms: 100 }, { to: 0.45, ms: 250 }, { ms: 50 }, { to: 0.2, ms: 200 }, { ms: 200 },
  ]],
  ['a hand entering the frame already at the side does not fire', 'none', 0.85, [{ ms: 1500 }]],
  ['a palm drifting sideways at 0.12 frames/s does not fire', 'none', 0.5, [{ ms: 300 }, { to: 0.85, ms: 3000 }]],
  ['a palm drifting sideways at 0.2 frames/s does not fire', 'none', 0.5, [{ ms: 300 }, { to: 0.85, ms: 1750 }]],
  ['a slow but deliberate reach (0.3 frames/s) fires', 'next', 0.5, [{ ms: 300 }, { to: 0.8, ms: 1000 }, { ms: 300 }]],
  ['pointing while moving right, then opening the hand there, does not fire', 'none', 0.5,
    [{ ms: 300 }, { to: 0.8, ms: 400, pose: 'point' }, { ms: 400 }]],
  ['a 2-frame pose blip mid-reach still fires', 'next', 0.5,
    [{ ms: 300 }, { to: 0.62, ms: 100 }, { to: 0.68, ms: 66, pose: 'other' }, { to: 0.8, ms: 100 }, { ms: 300 }]],
  ['a single-frame landmark teleport does not fire', 'none', 0.5, [{ ms: 300 }, { to: 0.95, ms: 33 }, { to: 0.5, ms: 33 }, { ms: 500 }]],
  ['a 150 ms tracking dropout while armed still lets the reach fire', 'next', 0.5,
    [{ ms: 300 }, { ms: 150, hand: false }, { ms: 66 }, { to: 0.8, ms: 200 }, { ms: 200 }]],
  ['a 600 ms dropout disarms; reappearing at the edge does not fire', 'none', 0.5,
    [{ ms: 300 }, { ms: 600, hand: false }, { to: 0.8, ms: 33 }, { ms: 600 }]],
  ['jitter around the threshold after a reach fires only once', 'next', 0.5, (() => {
    const s = [{ ms: 300 }, { to: 0.8, ms: 200 }];
    for (let i = 0; i < 20; i++) s.push({ to: i % 2 ? 0.74 : 0.69, ms: 33 });
    return s;
  })()],
  ['a 15 fps camera still fires', 'next', 0.5, [{ ms: 330 }, { to: 0.8, ms: 200 }, { ms: 400 }], 66],

  // Talking with your hands must not flip slides.
  ['a hand that is not in the deliberate palm pose never arms', 'none', 0.5,
    [{ ms: 500, arm: false }, { to: 0.8, ms: 350, arm: false }, { ms: 1200, arm: false }]],
  ['open-palm blips in an otherwise relaxed hand never arm', 'none', 0.5, (() => {
    const s = [];
    for (let i = 0; i < 20; i++) s.push({ ms: 33, pose: i % 3 === 0 ? 'open' : 'other' });
    s.push({ to: 0.8, ms: 300 });
    return s;
  })()],
  ['armed, then 4.5 s of gesturing, then a sweep: it disarmed itself, no fire', 'none', 0.5,
    [...talking(30), { to: 0.8, ms: 300, arm: false }, { ms: 300, arm: false }]],
  ['a hesitant reach (pause short of the line, then push) fires', 'next', 0.5,
    [{ ms: 300 }, { to: 0.70, ms: 300 }, { ms: 300 }, { to: 0.77, ms: 200 }, { ms: 300 }]],

  // Centre anchoring, other hands, distance.
  ['arming at the edge of the region still lets "previous" be reached', 'prev', 0.62, [{ ms: 300 }, { to: 0.37, ms: 250 }, { ms: 300 }]],
  ['a palm resting outside the arming region never arms', 'none', 0.67, [{ ms: 800 }, { to: 0.92, ms: 250 }, { ms: 300 }]],
  ['the tracker switching to the other hand (different label) does not fire', 'none', 0.5,
    [{ ms: 300 }, { ms: 66, hand: false }, { to: 0.22, ms: 33, label: 'Left' }, { ms: 500, label: 'Left' }]],
  ['a sudden jump with the same label does not fire', 'none', 0.5, [{ ms: 300 }, { ms: 66, hand: false }, { to: 0.8, ms: 33 }, { ms: 500 }]],
  ['standing far from the camera (small palm): a small reach fires', 'next', 0.5,
    [{ ms: 300, palmLen: 0.06 }, { to: 0.62, ms: 200, palmLen: 0.06 }, { ms: 300, palmLen: 0.06 }]],
  ['sitting close (large palm): the same small reach does not', 'none', 0.5,
    [{ ms: 300, palmLen: 0.18 }, { to: 0.62, ms: 200, palmLen: 0.18 }, { ms: 300, palmLen: 0.18 }]],
];

for (const [name, expected, startX, steps, dt] of NAV_CASES) {
  test(`nav: ${name}`, () => {
    assert.equal(run(timeline(startX, steps, dt || DT)).fired, expected);
  });
}

test('nav: an immediate swing to the locked side is refused and flagged for the HUD', () => {
  const { m } = run(timeline(0.5, [{ ms: 300 }, { to: 0.8, ms: 200 }, { ms: 100 }, { to: 0.22, ms: 250 }, { ms: 200 }]));
  assert.equal(m.blocked, true);
  assert.equal(m.phase, 'armed');
});

test('nav: reach distance scales with palm size and is clamped', () => {
  assert.equal(E.reachFor(0.06), 0.10);
  assert.equal(E.reachFor(0.18), 0.22);
  assert.ok(Math.abs(E.reachFor(0.12) - 0.156) < 1e-9);
  assert.equal(E.reachFor(undefined), 0.22);
});

// ---------------------------------------------------------------------------
// Pose classification
// ---------------------------------------------------------------------------
// An articulated 21-point hand. Each finger is three segments bent by the given
// angles (degrees); `angle` rotates the whole hand about the wrist.
function hand({ curls = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], angle = 0 } = {}) {
  const W = { x: 0.5, y: 0.8, z: 0 };
  const pts = new Array(21);
  pts[0] = { ...W };
  [[0.42, 0.74], [0.37, 0.68], [0.34, 0.63], [0.31, 0.59]].forEach(([x, y], i) => { pts[1 + i] = { x, y, z: 0 }; });
  const segs = [0.1, 0.055, 0.045];
  [0.44, 0.49, 0.54, 0.59].forEach((bx, f) => {
    const b = 5 + f * 4;
    pts[b] = { x: bx, y: 0.6, z: 0 };
    let dir = -Math.PI / 2;
    let px = bx;
    let py = 0.6;
    curls[f].forEach((deg, j) => {
      dir += (deg * Math.PI) / 180;
      px += Math.cos(dir) * segs[j];
      py += Math.sin(dir) * segs[j];
      pts[b + 1 + j] = { x: px, y: py, z: 0 };
    });
  });
  const a = (angle * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return pts.map((p) => ({
    x: W.x + (p.x - W.x) * c - (p.y - W.y) * s,
    y: W.y + (p.x - W.x) * s + (p.y - W.y) * c,
    z: 0,
  }));
}

const STRAIGHT = [0, 0, 0];
const RELAX30 = [30, 45, 20];
const RELAX20 = [20, 35, 15];
const CURL = [80, 100, 70];
const ALL = (c) => [c, c, c, c];
const pose = (lm, name = 'None', score = 0.9) => E.classifyPose(lm, name, score, 1);
const armPose = (lm, name = 'None', score = 0.9) => E.isArmPose(lm, name, score, pose(lm, name, score), 1);

test('pose: straight fingers read as open, at any rotation', () => {
  assert.equal(pose(hand({ curls: ALL(STRAIGHT) })), 'open');
  assert.equal(pose(hand({ curls: ALL(STRAIGHT), angle: 70 })), 'open');
});

test('pose: a relaxed, loosely curled hand is not "open"', () => {
  assert.equal(pose(hand({ curls: ALL(RELAX30) })), 'other');
  assert.equal(pose(hand({ curls: ALL(RELAX20) })), 'other');
});

test('pose: index out, others curled reads as pointing — including sideways and loosely curled', () => {
  assert.equal(pose(hand({ curls: [STRAIGHT, CURL, CURL, CURL] })), 'point');
  assert.equal(pose(hand({ curls: [STRAIGHT, RELAX30, RELAX30, RELAX30], angle: 90 })), 'point');
});

test('pose: fist and victory sign are neither open nor pointing', () => {
  assert.equal(pose(hand({ curls: ALL(CURL) })), 'other');
  assert.equal(pose(hand({ curls: [STRAIGHT, STRAIGHT, CURL, CURL] })), 'other');
});

test('pose: MediaPipe\'s own label wins when it is confident, geometry otherwise', () => {
  const open = hand({ curls: ALL(STRAIGHT) });
  assert.equal(pose(open, 'Victory', 0.8), 'other');
  assert.equal(pose(open, 'Pointing_Up', 0.7), 'point');
  assert.equal(pose(hand({ curls: ALL(CURL) }), 'Open_Palm', 0.55), 'open');
  assert.equal(pose(hand({ curls: [STRAIGHT, CURL, CURL, CURL] }), 'Open_Palm', 0.4), 'point'); // low confidence → geometry
});

test('arm pose: an upright palm facing the camera arms, tilted up to 40° is fine', () => {
  assert.equal(armPose(hand({ curls: ALL(STRAIGHT) })), true);
  assert.equal(armPose(hand({ curls: ALL(STRAIGHT), angle: 40 })), true);
});

test('arm pose: a hanging hand, a hand turned sideways, an edge-on palm, and pointing do not arm', () => {
  assert.equal(armPose(hand({ curls: ALL(STRAIGHT), angle: 180 })), false);
  assert.equal(armPose(hand({ curls: ALL(STRAIGHT), angle: 95 })), false);
  const edgeOn = hand({ curls: ALL(STRAIGHT) }).map((p) => ({ ...p, x: 0.5 + (p.x - 0.5) * 0.25 }));
  assert.equal(E.isArmPose(edgeOn, 'None', 0, 'open', 1), false);
  assert.equal(armPose(hand({ curls: [STRAIGHT, CURL, CURL, CURL] })), false);
});

// ---------------------------------------------------------------------------
// Laser pointer
// ---------------------------------------------------------------------------
const step = (p, o) => E.stepPointerMachine(p, o);
const pt = (over) => ({ hasHand: true, isPointing: true, tipX: 0.5, tipY: 0.4, ...over });

test('pointer: appears only after ~60 ms of continuous pointing', () => {
  const p = E.createPointerMachine();
  const seen = [];
  for (let i = 1; i <= 4; i++) seen.push(step(p, pt({ nowMs: i * 33 })).visible);
  assert.deepEqual(seen, [false, false, true, true]);
});

test('pointer: a single misread frame never shows it', () => {
  const p = E.createPointerMachine();
  const seen = [step(p, pt({ nowMs: 33 })).visible];
  for (let i = 2; i <= 12; i++) seen.push(step(p, pt({ isPointing: false, nowMs: i * 33 })).visible);
  assert.ok(seen.every((v) => !v));
});

test('pointer: stays up through a 2-frame tracking dropout', () => {
  const p = E.createPointerMachine();
  let t = 0;
  for (let i = 0; i < 6; i++) step(p, pt({ nowMs: (t += 33) }));
  const during = [];
  for (let i = 0; i < 2; i++) during.push(step(p, { hasHand: false, isPointing: false, tipX: null, tipY: null, nowMs: (t += 33) }).visible);
  for (let i = 0; i < 3; i++) during.push(step(p, pt({ nowMs: (t += 33) })).visible);
  assert.ok(during.every(Boolean));
});

test('pointer: hides ~200 ms after pointing stops', () => {
  const p = E.createPointerMachine();
  let t = 0;
  for (let i = 0; i < 6; i++) step(p, pt({ nowMs: (t += 33) }));
  const seq = [];
  for (let i = 0; i < 10; i++) seq.push(step(p, pt({ isPointing: false, nowMs: (t += 33) })).visible ? 1 : 0);
  assert.ok(seq.slice(0, 6).every((v) => v === 1));
  assert.ok(seq.slice(7).every((v) => v === 0));
});

test('pointer: the dot holds still once pointing stops instead of following the hand away', () => {
  const p = E.createPointerMachine();
  let t = 0;
  for (let i = 0; i < 10; i++) step(p, pt({ nowMs: (t += 33) }));
  const { x, y } = p;
  for (let i = 1; i <= 5; i++) step(p, pt({ isPointing: false, tipY: 0.4 + 0.03 * i, nowMs: (t += 33) }));
  assert.equal(p.x, x);
  assert.equal(p.y, y);
});

test('pointer: a jump to a different hand hides it and snaps rather than sliding', () => {
  const p = E.createPointerMachine();
  let t = 0;
  for (let i = 0; i < 6; i++) step(p, pt({ tipX: 0.3, nowMs: (t += 33) }));
  const r = step(p, pt({ tipX: 0.75, nowMs: (t += 33) }));
  assert.equal(r.visible, false);
  const R = E.POINTER_REGION;
  assert.ok(Math.abs(p.x - (0.75 - R.x0) / (R.x1 - R.x0)) < 1e-9);
});

test('pointer: smoothing takes the same wall-clock time at 15 fps as at 30 fps', () => {
  const settle = (dt) => {
    const p = E.createPointerMachine();
    let t = 0;
    for (let i = 0; i < 4; i++) step(p, pt({ tipX: 0.18, tipY: 0.44, nowMs: (t += dt) }));
    const t0 = t;
    while (t - t0 < 330) step(p, pt({ tipX: 0.3, tipY: 0.44, nowMs: (t += dt) }));
    return p.x;
  };
  assert.ok(Math.abs(settle(33) - settle(66)) < 0.01);
});

test('pointer: the central region of the camera view maps onto the whole slide, and clamps outside it', () => {
  const R = E.POINTER_REGION;
  const a = E.createPointerMachine();
  step(a, pt({ tipX: R.x0, tipY: R.y0, nowMs: 0 }));
  assert.deepEqual([a.x, a.y], [0, 0]);
  const b = E.createPointerMachine();
  step(b, pt({ tipX: R.x1, tipY: R.y1, nowMs: 0 }));
  assert.ok(Math.abs(b.x - 1) < 1e-9 && Math.abs(b.y - 1) < 1e-9);
  const c = E.createPointerMachine();
  step(c, pt({ tipX: 0.97, tipY: 0.01, nowMs: 0 }));
  assert.deepEqual([c.x, c.y], [1, 0]);
});
