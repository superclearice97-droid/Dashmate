import test from 'node:test';
import assert from 'node:assert/strict';

import { isDaytime, sunTimes } from '../www/js/core/sun.js';
import { toScene, boxFor, guessGear } from '../www/js/core/scene.js';

const CHI = [41.88, -87.63];
const at = (iso) => new Date(iso);

test('sun: day and night in Chicago in summer (sunrise ~5:16 CDT, sunset ~8:29 CDT)', () => {
  assert.equal(isDaytime(at('2026-06-21T17:00:00Z'), ...CHI), true, 'noon');
  assert.equal(isDaytime(at('2026-06-21T06:00:00Z'), ...CHI), false, '1 am');
  assert.equal(isDaytime(at('2026-06-22T01:00:00Z'), ...CHI), true, '8 pm, after UTC midnight');
  assert.equal(isDaytime(at('2026-06-22T02:00:00Z'), ...CHI), false, '9 pm');
  const t = sunTimes(at('2026-06-21T17:00:00Z'), ...CHI);
  const minutes = (d) => d.getUTCHours() * 60 + d.getUTCMinutes();
  assert.ok(Math.abs(minutes(t.sunrise) - (10 * 60 + 16)) <= 5, `sunrise ${t.sunrise.toISOString()}`);
  assert.ok(Math.abs(minutes(t.sunset) - (60 + 29)) <= 5, `sunset ${t.sunset.toISOString()}`);
});

test('sun: winter evening, southern hemisphere, polar extremes', () => {
  assert.equal(isDaytime(at('2026-12-21T23:30:00Z'), ...CHI), false, '5:30 pm in December is dark');
  assert.equal(isDaytime(at('2026-12-21T02:00:00Z'), -33.87, 151.21), true, 'Sydney 1 pm');
  assert.equal(isDaytime(at('2026-12-21T11:00:00Z'), 69.65, 18.96), false, 'Tromsø polar night at noon');
  assert.equal(isDaytime(at('2026-06-21T23:00:00Z'), 69.65, 18.96), true, 'Tromsø midnight sun');
  assert.equal(sunTimes(at('2026-12-21T11:00:00Z'), 69.65, 18.96), null);
});

test('scene: places detections by size and position', () => {
  // A car whose box is 10% of the frame height, centred: ~20.5 m straight ahead (66° camera).
  const [car] = toScene([{ k: 'car', b: [0.45, 0.5, 0.55, 0.6] }]);
  assert.equal(car.kind, 'car');
  assert.ok(Math.abs(car.z - 20.53) < 0.05, `z ${car.z}`);
  assert.ok(Math.abs(car.x) < 0.01);
  // Same size, centred at 75% across: ~6.7 m to the right.
  const [right] = toScene([{ k: 'car', b: [0.7, 0.5, 0.8, 0.6] }]);
  assert.ok(Math.abs(right.x - 6.67) < 0.05, `x ${right.x}`);
  // Nearest first, colour kept, unknown kinds and tiny/far boxes dropped.
  const s = toScene([
    { k: 'person', b: [0.2, 0.4, 0.22, 0.6] },
    { k: 'light', b: [0.5, 0.1, 0.52, 0.16], c: 'green' },
    { k: 'stop', b: [0.1, 0.1, 0.2, 0.2] },
    { k: 'car', b: [0.5, 0.5, 0.501, 0.502] },
  ]);
  assert.deepEqual(s.map((o) => o.kind), ['person', 'light']);
  assert.equal(s[1].color, 'green');
});

test('scene: caps how many objects of each kind are drawn', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ k: 'car', b: [0.4, 0.5, 0.5, 0.5 + 0.01 + i * 0.002] }));
  const s = toScene(many);
  assert.equal(s.length, 8);
  assert.ok(s[0].z <= s[7].z);
});

test('gear guess', () => {
  assert.equal(guessGear(10, 0), 'D');
  assert.equal(guessGear(0, 30000), 'D', 'stopped at a light');
  assert.equal(guessGear(0, 300000), 'P', 'parked');
});

test('scene: boxFor is the inverse of toScene', () => {
  for (const [kind, x, z] of [['car', 3.6, 25], ['person', -4, 12], ['light', 0.5, 30]]) {
    const [o] = toScene([boxFor(kind, x, z)]);
    assert.equal(o.kind, kind);
    assert.ok(Math.abs(o.x - x) < 1e-6 && Math.abs(o.z - z) < 1e-6, `${kind} ${o.x},${o.z}`);
  }
});
