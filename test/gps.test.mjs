import test from 'node:test';
import assert from 'node:assert/strict';
import { fromBackground, gpsQuality } from '../www/js/core/gps.js';

test('background GPS readings become normal fixes', () => {
  assert.deepEqual(fromBackground({ latitude: 41.9, longitude: -87.6, accuracy: 5, speed: 12.5, bearing: 90, time: 1000 }),
    { lat: 41.9, lon: -87.6, accuracy: 5, speed: 12.5, heading: 90, t: 1000 });
  const f = fromBackground({ latitude: 41.9, longitude: -87.6, accuracy: null, speed: null, bearing: null, time: null });
  assert.equal(f.speed, null);
  assert.equal(f.heading, null);
  assert.equal(f.accuracy, 50);
  assert.ok(Math.abs(f.t - Date.now()) < 1000);
  assert.equal(fromBackground(null), null);
  assert.equal(fromBackground({ latitude: 'x', longitude: 1 }), null);
});

test('GPS chip says when the iPad only has Wi-Fi location', () => {
  assert.deepEqual(gpsQuality('device', 8), { label: 'GPS · This device', level: 'good' });
  assert.deepEqual(gpsQuality('device', 65), { label: 'GPS · This device', level: 'weak' });
  assert.deepEqual(gpsQuality('device', 400), { label: 'Wi-Fi location only', level: 'poor' });
  assert.deepEqual(gpsQuality('phone', 6), { label: 'GPS · Phone', level: 'good' });
  assert.deepEqual(gpsQuality('phone', 300), { label: 'Weak GPS · Phone', level: 'poor' });
  assert.equal(gpsQuality('demo', 5).label, 'Demo drive');
});
