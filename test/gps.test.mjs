import test from 'node:test';
import assert from 'node:assert/strict';
import { fixFromMessage, isPrivateIPv4, beaconOffer, gpsQuality, isFresh, loadPairing, savePairing, forgetPairing, BEACON_PORT } from '../www/js/core/gps.js';

test('positions from the phone are checked before use', () => {
  assert.deepEqual(fixFromMessage({ lat: 41.9, lon: -87.6, acc: 5, spd: 12.5, hdg: 90, t: 1 }),
    { lat: 41.9, lon: -87.6, accuracy: 5, speed: 12.5, heading: 90 });
  assert.deepEqual(fixFromMessage({ lat: 41.9, lon: -87.6, acc: null, spd: null, hdg: null }),
    { lat: 41.9, lon: -87.6, accuracy: 50, speed: null, heading: null });
  assert.equal(fixFromMessage({ lat: 41.9, lon: -87.6, spd: 500 }).speed, null);
  assert.equal(fixFromMessage({ lat: 91, lon: 0 }), null);
  assert.equal(fixFromMessage({ lat: '41', lon: 0 }), null);
  assert.equal(fixFromMessage(null), null);
});

test('background sending only goes to private local addresses', () => {
  for (const ok of ['172.20.10.2', '192.168.43.1', '10.1.2.3', '169.254.0.9']) assert.ok(isPrivateIPv4(ok), ok);
  for (const bad of ['8.8.8.8', '172.15.0.1', '100.64.0.1', '127.0.0.1', '300.1.1.1', 'phone.local', '', null, '1.2.3']) assert.ok(!isPrivateIPv4(bad), bad);
});

test('the screen’s background-link offer is validated', () => {
  const k = Buffer.alloc(32, 7).toString('base64');
  assert.deepEqual(beaconOffer({ t: 'beacon', k, p: 50123, a: ['172.20.10.2', '8.8.8.8', 'evil.example'] }),
    { key: k, port: 50123, hosts: ['172.20.10.2'] });
  assert.equal(beaconOffer({ t: 'beacon', k, p: 50123, a: ['8.8.8.8'] }), null, 'no local address');
  assert.equal(beaconOffer({ t: 'beacon', k: 'short', p: 50123, a: ['172.20.10.2'] }), null);
  assert.equal(beaconOffer({ t: 'beacon', k, p: 70000, a: ['172.20.10.2'] }), null);
  assert.equal(beaconOffer({ t: 'beacon', k, p: 5.5, a: ['172.20.10.2'] }), null);
  assert.equal(beaconOffer({ t: 'fix', k, p: 50123, a: ['172.20.10.2'] }), null);
  assert.equal(beaconOffer({ t: 'beacon', k, p: 50123, a: 'x' }), null);
  assert.equal(beaconOffer({ t: 'beacon', k, p: 1, a: Array(20).fill('10.0.0.1') }).hosts.length, 8);
});

test('GPS chip says when the iPad only has Wi-Fi location', () => {
  assert.deepEqual(gpsQuality('device', 8), { label: 'GPS · This device', level: 'good' });
  assert.deepEqual(gpsQuality('device', 65), { label: 'GPS · This device', level: 'weak' });
  assert.deepEqual(gpsQuality('device', 400), { label: 'Wi-Fi location only', level: 'poor' });
  assert.deepEqual(gpsQuality('phone', 6), { label: 'GPS · Phone', level: 'good' });
  assert.deepEqual(gpsQuality('phone', 300), { label: 'Weak GPS · Phone', level: 'poor' });
  assert.equal(gpsQuality('demo', 5).label, 'Demo drive');
});

import { linkProblem } from '../www/js/core/gps.js';

test('background link check explains what is wrong', () => {
  assert.match(linkProblem({ sending: false, lastError: 'precise location permission is off' }, 'android').text, /didn’t start \(precise location/);
  assert.equal(linkProblem({ sending: true, fixes: 0, sent: 0, failed: 0 }, 'ios').waiting, true);
  const ios = linkProblem({ sending: true, fixes: 5, sent: 0, failed: 5, lastError: 'No route to host' }, 'ios');
  assert.equal(ios.waiting, false);
  assert.match(ios.text, /Local Network › DashMate/);
  assert.match(ios.text, /No route to host/);
  assert.match(linkProblem({ sending: true, fixes: 5, sent: 0, failed: 5, lastError: 'Network is unreachable' }, 'android').text, /hotspot/);
  assert.match(linkProblem({ sending: true, fixes: 8, sent: 8, failed: 0 }, 'android').text, /isn’t receiving/);
  assert.match(linkProblem(null, 'ios').text, /didn’t start/);
});

test('replayed old packets are dropped, recent and untimed ones pass', () => {
  const now = 1_700_000_000_000;
  assert.ok(isFresh(now - 2000, now));
  assert.ok(isFresh(now + 5000, now), 'small clock difference');
  assert.ok(!isFresh(now - 3_600_000, now), 'an hour old');
  assert.ok(isFresh(undefined, now));
});

test('pairing is remembered on the device and validated when read back', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const key = Buffer.alloc(32, 9).toString('base64');
  assert.equal(loadPairing(storage), null);
  savePairing(storage, { role: 'phone', key, port: BEACON_PORT });
  assert.deepEqual(loadPairing(storage), { role: 'phone', key, port: BEACON_PORT });
  forgetPairing(storage);
  assert.equal(loadPairing(storage), null);
  for (const bad of ['{', '{"role":"x"}', JSON.stringify({ role: 'phone', key: 'short', port: 1 }), JSON.stringify({ role: 'phone', key, port: 0 })]) {
    mem.set('dashmate.pairing', bad);
    assert.equal(loadPairing(storage), null, bad);
  }
  assert.equal(loadPairing({ getItem() { throw new Error('blocked'); } }), null);
});

test('a screen paired to a phone says it is waiting instead of showing its own guess', () => {
  assert.equal(gpsQuality('device', 900, true).label, 'Waiting for phone');
  assert.equal(gpsQuality('device', 900, false).label, 'Wi-Fi location only');
  assert.equal(gpsQuality('phone', 5, true).label, 'GPS · Phone');
});
