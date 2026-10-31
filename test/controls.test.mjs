import test from 'node:test';
import assert from 'node:assert/strict';

import { TripLog, formatDriveTime } from '../www/js/core/trips.js';
import { matches } from '../www/js/core/search.js';
import { osrmUrl } from '../www/js/core/route.js';
import { warningEffects } from '../www/js/core/alerts.js';

test('trips: A and B accumulate across drives and reset separately', () => {
  const log = new TripLog(null, 1000);
  log.add(1000, 100, 12);
  log.add(500, 50, 20);
  assert.equal(log.get('A').distance, 1500);
  assert.equal(log.get('B').movingTime, 150);
  assert.equal(log.get('A').avgSpeed, 10);
  assert.equal(log.get('A').maxSpeed, 20);
  log.reset('A', 5000);
  assert.deepEqual(log.get('A'), { distance: 0, movingTime: 0, maxSpeed: 0, since: 5000, avgSpeed: 0 });
  assert.equal(log.get('B').distance, 1500, 'B untouched');
  // Saved and restored (JSON) keeps the numbers; damaged data starts fresh.
  const back = new TripLog(JSON.parse(JSON.stringify(log)), 9000);
  assert.equal(back.get('B').distance, 1500);
  assert.equal(back.get('A').since, 5000);
  assert.equal(new TripLog({ A: { distance: 'x' } }, 7).get('A').since, 7);
  log.add(-5, 1, 1);
  assert.equal(log.get('B').distance, 1500, 'negative ignored');
  assert.equal(formatDriveTime(125 * 60), '2 h 5 min');
  assert.equal(formatDriveTime(59), '0 min');
});

test('settings search', () => {
  assert.ok(matches('Appearance Auto Light Dark', 'dark'));
  assert.ok(matches('Units mph km/h distance', 'KM'));
  assert.ok(matches('Avoid tolls', 'toll'));
  assert.ok(matches('Green traffic light chime', 'green light'));
  assert.ok(!matches('Green traffic light chime', 'green speed'));
  assert.ok(matches('Anything', '   '));
  assert.ok(matches('Café sounds', 'cafe'));
});

test('routing: avoid options become OSRM excludes', () => {
  const from = [-87.6, 41.8];
  const to = [-87.7, 41.9];
  assert.ok(!osrmUrl(from, to).includes('exclude'));
  assert.match(osrmUrl(from, to, { tolls: true }), /&exclude=toll$/);
  assert.match(osrmUrl(from, to, { tolls: true, highways: true, ferries: true }), /&exclude=toll,motorway,ferry$/);
});

test('speed limit warning modes', () => {
  assert.deepEqual(warningEffects('off'), { show: false, chime: false });
  assert.deepEqual(warningEffects('display'), { show: true, chime: false });
  assert.deepEqual(warningEffects('chime'), { show: true, chime: true });
});
