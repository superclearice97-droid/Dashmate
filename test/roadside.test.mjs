import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRoadside, upcoming, RoadsideWatcher, cameraWarningsAllowed, cameraWarnDistance, hazardWarnDistance,
  hazardLabel, countryFrom, roadsideQuery,
} from '../www/js/core/roadside.js';
import { cumulative } from '../www/js/core/geo.js';
import { leadVehicle, timeGap, FollowWatcher } from '../www/js/core/following.js';

// A straight road heading north from (0, 0): 0.001° of latitude ≈ 111 m.
const north = (m) => [0, m / 111195];
const node = (id, m, tags, east = 0) => ({ type: 'node', id, lat: m / 111195, lon: east / 111195, tags });

test('roadside: OpenStreetMap tags become cameras and hazards', () => {
  const items = parseRoadside([
    node(1, 100, { highway: 'speed_camera', maxspeed: '50' }),
    node(2, 200, { traffic_calming: 'table' }),
    node(3, 300, { railway: 'level_crossing' }),
    node(4, 400, { hazard: 'animal_crossing' }),
    node(5, 500, { traffic_calming: 'chicane' }), // not a bump
    node(6, 600, { highway: 'speed_camera', maxspeed: '30 mph' }),
  ]);
  assert.deepEqual(items.map((i) => [i.kind, i.label]), [
    ['camera', 'Speed camera'], ['bump', 'Raised crossing'], ['rail', 'Railway crossing'], ['hazard', 'Animals crossing'], ['camera', 'Speed camera'],
  ]);
  assert.equal(items[0].limit, 50);
  assert.ok(Math.abs(items[4].limit - 48.28) < 0.01);
  assert.equal(hazardLabel('school_zone'), 'School zone');
  assert.equal(hazardLabel('dangerous_curve'), 'Dangerous bend');
  assert.equal(hazardLabel('something_new'), 'Hazard ahead');
});

test('roadside: enforcement relations give direction, red-light cameras and average-speed zones', () => {
  const pt = (m) => ({ lat: m / 111195, lon: 0 });
  const items = parseRoadside([
    node(10, 500, { highway: 'speed_camera' }),
    { type: 'relation', id: 20, tags: { type: 'enforcement', enforcement: 'maxspeed', maxspeed: '70' },
      members: [{ type: 'node', ref: 10, role: 'device', ...pt(500) }, { type: 'node', ref: 11, role: 'from', ...pt(400) }, { type: 'node', ref: 12, role: 'to', ...pt(480) }] },
    { type: 'relation', id: 21, tags: { type: 'enforcement', enforcement: 'traffic_signals' },
      members: [{ type: 'node', ref: 13, role: 'device', ...pt(900) }] },
    { type: 'relation', id: 22, tags: { type: 'enforcement', enforcement: 'average_speed', maxspeed: '80' },
      members: [{ type: 'node', ref: 14, role: 'from', ...pt(1000) }, { type: 'node', ref: 15, role: 'to', ...pt(3000) }] },
  ]);
  assert.deepEqual(items.map((i) => i.kind), ['camera', 'redlight', 'average'], 'the device node is not repeated');
  assert.equal(items[0].limit, 70);
  assert.ok(Math.abs(items[0].dir) < 1, 'from → to points north');
  assert.equal(items[1].dir, null);
  assert.ok(Math.abs(items[2].end[1] * 111195 - 3000) < 1);
});

test('roadside: only items ahead, on your road and in your direction', () => {
  const items = [
    { id: 'a', kind: 'camera', pos: north(400), dir: null },
    { id: 'b', kind: 'camera', pos: north(-200), dir: null },              // behind
    { id: 'c', kind: 'camera', pos: [300 / 111195 / 1, 300 / 111195], dir: null }, // off to the side
    { id: 'd', kind: 'camera', pos: north(600), dir: 180 },                // for southbound traffic
    { id: 'e', kind: 'bump', pos: north(1500), dir: null },                // too far
  ];
  const ahead = upcoming(items, { pos: north(0), heading: 0 });
  assert.deepEqual(ahead.map((a) => a.item.id), ['a']);
  assert.ok(Math.abs(ahead[0].dist - 400) < 2);
  // Along a route: distance is measured along it, even round a corner.
  const line = [north(0), north(300), [300 / 111195, 300 / 111195]];
  const route = { line, cum: cumulative(line), along: 100 };
  const onRoute = upcoming([{ id: 'x', kind: 'camera', pos: [200 / 111195, 300 / 111195], dir: 90 }], { route });
  assert.equal(onRoute.length, 1);
  assert.ok(Math.abs(onRoute[0].dist - 400) < 3);
  assert.equal(upcoming([{ id: 'y', kind: 'camera', pos: [200 / 111195, 300 / 111195], dir: 270 }], { route }).length, 0);
});

test('roadside: warned about 20 s ahead, 300 m in town to 1 km on motorways', () => {
  assert.equal(cameraWarnDistance(10), 300);
  assert.equal(cameraWarnDistance(25), 500);
  assert.equal(cameraWarnDistance(40), 800);
  assert.equal(cameraWarnDistance(60), 1000);
  assert.equal(hazardWarnDistance(5), 80);
  assert.equal(hazardWarnDistance(20), 160);
});

test('roadside: camera card counts down, turns red when over, announces once', () => {
  const w = new RoadsideWatcher();
  const cam = { id: 'a', kind: 'camera', limit: 50, pos: north(400) };
  let r = w.update({ ahead: [{ item: cam, dist: 450 }], pos: north(0), speedMps: 14, odo: 0, t: 0 });
  assert.equal(r.camera, null, '450 m is more than 20 s away at 50 km/h');
  r = w.update({ ahead: [{ item: cam, dist: 280 }], pos: north(170), speedMps: 14, odo: 170, t: 12000 });
  assert.equal(r.camera.dist, 280);
  assert.equal(r.camera.over, true, '50.4 km/h in a 50');
  assert.equal(r.announce.length, 1);
  r = w.update({ ahead: [{ item: cam, dist: 200 }], pos: north(250), speedMps: 13, odo: 250, t: 18000 });
  assert.equal(r.camera.over, false);
  assert.equal(r.announce.length, 0, 'announced only once');
  assert.ok(r.camera.progress > 0.3);
});

test('roadside: average-speed zone shows your average and the distance left', () => {
  const w = new RoadsideWatcher();
  const zone = { id: 'z', kind: 'average', limit: 70, pos: north(100), end: north(2100) };
  w.update({ ahead: [{ item: zone, dist: 10 }], pos: north(90), speedMps: 20, odo: 1000, t: 0 });
  const r = w.update({ ahead: [], pos: north(1100), speedMps: 20, odo: 2000, t: 50000 });
  assert.equal(r.camera.type, 'zone');
  assert.ok(Math.abs(r.camera.avg - 72) < 0.1, '1000 m in 50 s = 72 km/h');
  assert.equal(r.camera.over, true);
  assert.ok(Math.abs(r.camera.left - 1000) < 2);
  assert.equal(w.update({ ahead: [], pos: north(2090), speedMps: 20, odo: 3000, t: 100000 }).camera, null, 'zone ends');
});

test('roadside: no camera warnings where they are not allowed, or before the country is known', () => {
  for (const c of ['DE', 'FR', 'CH', 'AT', 'BE', 'CY', 'TR', 'LU', 'LI', 'MK', 'KW']) assert.equal(cameraWarningsAllowed(c), false, c);
  for (const c of ['US', 'PL', 'GB', 'IT', 'CA']) assert.equal(cameraWarningsAllowed(c), true, c);
  assert.equal(cameraWarningsAllowed(null), false);
  assert.equal(cameraWarningsAllowed('de'), false);
  assert.equal(countryFrom([{ type: 'area', tags: { 'ISO3166-1': 'PL', name: 'Polska' } }]), 'PL');
  assert.equal(countryFrom([]), null);
  assert.match(roadsideQuery(41.9, -87.6), /highway=speed_camera.*enforcement/);
});

test('following: distance and time gap to the car in your lane', () => {
  const lead = leadVehicle([{ kind: 'car', x: 3.5, z: 8 }, { kind: 'person', x: 0, z: 5 }, { kind: 'truck', x: 0.4, z: 20 }, { kind: 'car', x: -0.3, z: 31 }]);
  assert.deepEqual(lead, { kind: 'truck', z: 20 });
  assert.equal(leadVehicle([{ kind: 'car', x: 3, z: 8 }]), null);
  assert.equal(timeGap(20, 10), 2);
  assert.equal(timeGap(20, 1), null);
});

test('following: warns after 2 s closer than 1 s, clears above 1.4 s', () => {
  const w = new FollowWatcher();
  assert.equal(w.update({ z: 12 }, 15, 0).close, false);
  assert.equal(w.update({ z: 12 }, 15, 1000).close, false);
  const r = w.update({ z: 12 }, 15, 2100);
  assert.equal(r.close, true);
  assert.equal(r.closeStarted, true);
  assert.equal(w.update({ z: 18 }, 15, 3000).close, true, '1.2 s: still close');
  assert.equal(w.update({ z: 24 }, 15, 4000).close, false, '1.6 s: clear');
  assert.equal(w.update({ z: 5 }, 5, 5000).close, false, 'not in slow traffic');
});

test('following: tells you when the queue ahead moves off', () => {
  const w = new FollowWatcher();
  assert.equal(w.update({ z: 7 }, 0, 0).movedOff, false);
  assert.equal(w.update({ z: 7.5 }, 0, 1000).movedOff, false);
  assert.equal(w.update({ z: 12 }, 0, 2000).movedOff, true);
  assert.equal(w.update({ z: 20 }, 0, 3000).movedOff, false, 'once');
  w.update({ z: 20 }, 5, 4000); // you drive off
  w.update({ z: 6 }, 0, 9000);
  assert.equal(w.update({ z: 6.2 }, 0, 9500).movedOff, false, 'small jitter is not moving off');
});
