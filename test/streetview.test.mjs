import test from 'node:test';
import assert from 'node:assert/strict';
import { offset } from '../www/js/streetview.js';
import { distance, bearing } from '../www/js/core/geo.js';

test('street view: moving a point by metres and bearing (camera behind the car)', () => {
  const car = [-87.6279, 41.889];
  for (const [b, m] of [[0, 100], [90, 16], [225, 40], [313, 7]]) {
    const p = offset(car, b, m);
    assert.ok(Math.abs(distance(car, p) - m) < 0.05, `${m} m`);
    assert.ok(Math.abs(((bearing(car, p) - b + 540) % 360) - 180) < 0.1, `${b}°`);
  }
  const behind = offset(car, 90, -16);
  assert.ok(Math.abs(bearing(car, behind) - 270) < 0.1, 'negative distance goes the other way');
});
