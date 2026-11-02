import test from 'node:test';
import assert from 'node:assert/strict';
import { fixFromMessage, isPrivateIPv4, beaconOffer, gpsQuality } from '../www/js/core/gps.js';

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
