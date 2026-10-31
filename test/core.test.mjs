import test from 'node:test';
import assert from 'node:assert/strict';

import { distance, bearing, project, cumulative, angleDiff, pointAt } from '../www/js/core/geo.js';
import { speedValue, formatDistance, defaultUnits, limitValue, formatDuration, spokenDistance } from '../www/js/core/units.js';
import { TripTracker } from '../www/js/core/trip.js';
import { instructionText, maneuverIcon, NavRoute, osrmUrl } from '../www/js/core/route.js';
import { parseMaxspeed, pickWay, overpassQuery } from '../www/js/core/speedlimit.js';
import { SpeedWatcher, GreenLightWatcher } from '../www/js/core/alerts.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ±${tol}, got ${a}`);

// ~111.2 m per 0.001° of latitude
const north = (m) => m / 111195;

test('geo: distance, bearing, projection', () => {
  near(distance([0, 0], [0, 1]), 111195, 5, '1° latitude');
  near(bearing([0, 0], [1, 0]), 90, 0.01);
  near(bearing([0, 0], [0, -1]), 180, 0.01);
  assert.equal(angleDiff(350, 10), 20);
  const line = [[0, 0], [0, north(100)], [0, north(200)]];
  const cum = cumulative(line);
  near(cum[2], 200, 0.5);
  const p = project(line, cum, [0.0001, north(150)]); // ~11 m east of the line
  near(p.along, 150, 0.5);
  near(p.offset, 11.1, 0.5);
  const mid = pointAt(line, cum, 50);
  near(distance(mid, [0, north(50)]), 0, 0.1);
});

test('units: speeds, distances, durations', () => {
  assert.equal(speedValue(10, 'metric'), 36);
  assert.equal(speedValue(10, 'imperial'), 22);
  assert.equal(speedValue(null, 'metric'), 0);
  assert.equal(defaultUnits('en-US'), 'imperial');
  assert.equal(defaultUnits('de-DE'), 'metric');
  assert.deepEqual(formatDistance(137, 'imperial'), { value: '450', unit: 'ft' });
  assert.deepEqual(formatDistance(20, 'imperial'), { value: '70', unit: 'ft' });
  assert.deepEqual(formatDistance(800, 'imperial'), { value: '0.5', unit: 'mi' });
  assert.deepEqual(formatDistance(450, 'metric'), { value: '450', unit: 'm' });
  assert.deepEqual(formatDistance(1234, 'metric'), { value: '1.2', unit: 'km' });
  assert.deepEqual(formatDistance(23456, 'metric'), { value: '23', unit: 'km' });
  assert.equal(spokenDistance(450, 'metric'), '450 metres');
  assert.equal(limitValue(35 * 1.609344, 'imperial'), 35);
  assert.equal(limitValue(50, 'metric'), 50);
  assert.equal(limitValue(null, 'metric'), null);
  assert.equal(formatDuration(27 * 60), '27 min');
  assert.equal(formatDuration(95 * 60), '1 h 35 min');
});

test('trip: derives speed, rejects GPS jumps, tracks stats', () => {
  const trip = new TripTracker();
  let s;
  for (let i = 0; i <= 10; i++) s = trip.update({ lon: 0, lat: north(i * 10), accuracy: 5, speed: null, heading: null, t: i * 1000 });
  near(s.speed, 10, 0.2, 'speed from positions');
  near(s.distance, 100, 1);
  near(s.avgSpeed, 10, 0.2);
  near(s.heading, 0, 1, 'heading north');
  // A 5 km jump in one second is ignored.
  s = trip.update({ lon: 0, lat: north(5000), accuracy: 5, speed: null, heading: null, t: 11000 });
  near(s.distance, 100, 1, 'jump ignored');
  // Measured speed from the device wins; stopping reads 0 quickly.
  s = trip.update({ lon: 0, lat: north(5010), accuracy: 5, speed: 0, heading: null, t: 12000 });
  assert.equal(s.speed, 0);
  trip.reset();
  assert.equal(trip.snapshot().distance, 0);
});

test('route: instruction text', () => {
  const st = (type, modifier, name = 'Main St', extra = {}) => ({ maneuver: { type, modifier, ...extra }, name, ...extra.step });
  assert.equal(instructionText(st('turn', 'right')), 'Turn right onto Main St');
  assert.equal(instructionText(st('turn', 'slight left', '')), 'Turn slight left');
  assert.equal(instructionText(st('turn', 'uturn')), 'Make a U-turn onto Main St');
  assert.equal(instructionText(st('new name', 'straight')), 'Continue onto Main St');
  assert.equal(instructionText(st('depart', undefined)), 'Head out on Main St');
  assert.equal(instructionText(st('arrive', 'right')), 'Arrive — destination on the right');
  assert.equal(instructionText(st('fork', 'slight left', '')), 'Keep left at the fork');
  assert.equal(instructionText(st('roundabout', undefined, 'Oak Ave', { exit: 2 })), 'At the roundabout, take the 2nd exit onto Oak Ave');
  assert.equal(instructionText({ maneuver: { type: 'off ramp', modifier: 'slight right' }, name: '', destinations: 'I 90: Chicago' }), 'Take the exit on the right toward Chicago');
  assert.deepEqual(maneuverIcon(st('turn', 'left')), { kind: 'arrow', angle: -90 });
  assert.equal(maneuverIcon(st('arrive')).kind, 'arrive');
  assert.match(osrmUrl([-87.6, 41.8], [-87.7, 41.9]), /routed-car\/route\/v1\/driving\/-87\.600000,41\.800000;-87\.700000,41\.900000\?.*steps=true/);
});

// A 1 km straight road north, then a right turn, then 500 m east.
function sampleRoute() {
  const turn = [0, north(1000)];
  const end = [500 / 111195, north(1000)];
  return {
    distance: 1500, duration: 150,
    geometry: { coordinates: [[0, 0], turn, end] },
    legs: [{ steps: [
      { maneuver: { type: 'depart', location: [0, 0] }, name: 'First St', distance: 1000, duration: 100 },
      { maneuver: { type: 'turn', modifier: 'right', location: turn }, name: 'Second St', distance: 500, duration: 50 },
      { maneuver: { type: 'arrive', location: end }, name: 'Second St', distance: 0, duration: 0 },
    ] }],
  };
}

test('route: progress, off-route detection, voice cues', () => {
  const r = new NavRoute(sampleRoute(), [0, 0]);
  let p = r.progress([0, north(400)]);
  assert.equal(p.next, 1);
  near(p.distToNext, 600, 2);
  near(p.remaining, 1100, 2);
  near(p.remainingTime, 110, 1);
  assert.equal(p.step.text, 'Turn right onto Second St');
  assert.equal(p.then.maneuver.type, 'arrive');
  assert.equal(p.arrived, false);

  const spoken = (m) => spokenDistance(m, 'metric');
  assert.equal(r.cue(p, 15, spoken), null, 'too far for a cue');
  p = r.progress([0, north(705)]);
  assert.equal(r.cue(p, 10, spoken), 'In 300 metres, turn right onto Second St');
  assert.equal(r.cue(p, 10, spoken), null, 'only once');
  p = r.progress([0, north(950)]);
  assert.equal(r.cue(p, 10, spoken), 'Turn right onto Second St');

  p = r.progress([0.0002, north(1000)]);
  assert.equal(p.next, 2, 'past the turn, next is arrival');
  p = r.progress([500 / 111195, north(1000)]);
  assert.equal(p.arrived, true);

  // Three fixes 200 m off the route flag it.
  const r2 = new NavRoute(sampleRoute(), [0, 0]);
  for (let i = 0; i < 2; i++) assert.equal(r2.progress([-0.0018, north(300)]).offRoute, false);
  assert.equal(r2.progress([-0.0018, north(300)]).offRoute, true);
  assert.equal(r2.progress([0, north(300)]).offRoute, false, 'back on route clears it');
});

test('speed limits: parsing and choosing the road', () => {
  assert.equal(parseMaxspeed('50'), 50);
  near(parseMaxspeed('35 mph'), 56.327, 0.01);
  near(parseMaxspeed('30mph'), 48.28, 0.01);
  assert.equal(parseMaxspeed('60;40'), 60);
  for (const v of ['none', 'walk', 'signals', 'US:urban', '', null, '0', '25 knots']) assert.equal(parseMaxspeed(v), null, v);

  const pos = [0, 0];
  const ways = [
    { tags: { name: 'Side St', maxspeed: '25 mph' }, geometry: [{ lon: -0.001, lat: 0.0001 }, { lon: 0.001, lat: 0.0001 }] }, // east-west, 11 m away
    { tags: { name: 'Main St', maxspeed: '35 mph' }, geometry: [{ lon: 0.00012, lat: -0.001 }, { lon: 0.00012, lat: 0.001 }] }, // north-south, 13 m away
  ];
  assert.equal(pickWay(ways, pos, null).name, 'Side St', 'nearest without heading');
  const w = pickWay(ways, pos, 2);
  assert.equal(w.name, 'Main St', 'heading north picks the north-south road');
  assert.equal(limitValue35(w.maxspeed), 35);
  assert.equal(pickWay(ways, [0.01, 0.01], null), null, 'nothing close');
  assert.match(overpassQuery(41.88, -87.63), /around:30,41\.880000,-87\.630000/);
});
const limitValue35 = (kmh) => Math.round(kmh / 1.609344);

test('alerts: slow down', () => {
  const w = new SpeedWatcher();
  assert.deepEqual(w.update(60, 50, 5, 0), { active: false, entered: false });
  assert.deepEqual(w.update(60, 50, 5, 1500), { active: false, entered: false });
  assert.deepEqual(w.update(60, 50, 5, 2100), { active: true, entered: true });
  assert.deepEqual(w.update(61, 50, 5, 3000), { active: true, entered: false });
  assert.deepEqual(w.update(54, 50, 5, 3500), { active: true, entered: false }, 'hysteresis');
  assert.deepEqual(w.update(52, 50, 5, 4000), { active: false, entered: false });
  assert.deepEqual(w.update(90, null, 5, 5000), { active: false, entered: false }, 'unknown limit');
});

test('alerts: green light while stopped', () => {
  let g = new GreenLightWatcher();
  const feed = (seq) => seq.map(([light, speed, t]) => g.update(light, speed, t));
  assert.deepEqual(feed([['red', 0, 0], ['red', 0, 800], ['red', 0, 1600], ['green', 0, 1900], ['green', 0, 2100]]), [null, null, null, null, 'go']);
  assert.equal(g.update('green', 0, 2300), null, 'fires once');

  g = new GreenLightWatcher();
  assert.deepEqual(feed([['red', 0, 0], ['green', 0, 400], ['green', 0, 600]]), [null, null, null], 'red too brief');

  g = new GreenLightWatcher();
  assert.deepEqual(feed([['green', 0, 0], ['green', 0, 300]]), [null, null], 'no red first');

  g = new GreenLightWatcher();
  assert.deepEqual(feed([['red', 0, 0], ['red', 0, 1500], ['red', 5, 1700], ['green', 0, 1900], ['green', 0, 2000]]), [null, null, null, null, null], 'driving resets');

  // Detailed mode updates only every few seconds; the alert must still fire.
  g = new GreenLightWatcher();
  assert.deepEqual(feed([['red', 0, 0], ['red', 0, 3000], ['green', 0, 6000], ['green', 0, 9000]]), [null, null, null, 'go'], 'slow frames');
  g = new GreenLightWatcher();
  assert.deepEqual(feed([['red', 0, 0], ['red', 0, 3000], ['green', 0, 9500], ['green', 0, 12500]]), [null, null, null, null], 'red seen too long ago');
});
