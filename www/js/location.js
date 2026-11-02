// Where the car is. Three sources:
//   device - this device's own GPS
//   phone  - fixes sent from a paired phone (for Wi-Fi-only iPads)
//   demo   - a simulated drive, for trying the app at home
import { emit, on } from './bus.js';
import { cumulative, pointAt, distance } from './core/geo.js';
import { boxFor } from './core/scene.js';
import { countKinds } from './core/vision-math.js';

const REMOTE_FRESH_MS = 5000;
let watchId = null;
let lastRemote = 0;
let demoTimer = null;
export let source = 'none';

export function startDeviceGps() {
  if (!('geolocation' in navigator)) {
    emit('gps-status', { ok: false, message: 'This device has no location service' });
    return;
  }
  if (watchId != null) return;
  watchId = navigator.geolocation.watchPosition(
    (p) => {
      if (demoTimer || Date.now() - lastRemote < REMOTE_FRESH_MS) return; // phone or demo wins
      source = 'device';
      emit('fix', {
        lon: p.coords.longitude, lat: p.coords.latitude, accuracy: p.coords.accuracy,
        speed: p.coords.speed, heading: p.coords.heading, t: p.timestamp || Date.now(), source,
      });
    },
    (err) => {
      const msg = err.code === 1 ? 'Location permission is off' : 'Waiting for GPS…';
      emit('gps-status', { ok: false, message: msg });
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
  );
}

// Fixes arriving from the paired phone.
on('remote-fix', (f) => {
  if (demoTimer) return;
  lastRemote = Date.now();
  source = 'phone';
  emit('fix', { ...f, t: Date.now(), source });
});

export const remoteActive = () => Date.now() - lastRemote < REMOTE_FRESH_MS;

// ---------------------------------------------------------------- demo drive
// A loop through downtown Chicago with turns, a red light and one stretch over the limit.
export const DEMO_LINE = [
  [-87.62782, 41.88332], [-87.62790, 41.89167], [-87.62428, 41.89169],
  [-87.62397, 41.89683], [-87.62806, 41.89678], [-87.62790, 41.89300],
];
export const DEMO_STEPS = [
  { name: 'N State St', type: 'depart' },
  { name: 'E Grand Ave', type: 'turn', modifier: 'right' },
  { name: 'N Michigan Ave', type: 'turn', modifier: 'left' },
  { name: 'E Chicago Ave', type: 'turn', modifier: 'left' },
  { name: 'N State St', type: 'turn', modifier: 'left' },
  { name: 'N State St', type: 'arrive' },
];

// An OSRM-shaped route for the demo, so the real navigation code drives the screen.
export function demoRoute() {
  const legs = [{ steps: DEMO_STEPS.map((s, i) => ({
    maneuver: { type: s.type, modifier: s.modifier, location: DEMO_LINE[i] },
    name: s.name,
    distance: i < DEMO_LINE.length - 1 ? distance(DEMO_LINE[i], DEMO_LINE[i + 1]) : 0,
    duration: i < DEMO_LINE.length - 1 ? distance(DEMO_LINE[i], DEMO_LINE[i + 1]) / 11 : 0,
  })) }];
  const total = legs[0].steps.reduce((a, s) => a + s.distance, 0);
  return { geometry: { coordinates: DEMO_LINE }, legs, distance: total, duration: total / 11 };
}

// Made-up cameras and hazards along the demo drive, so their cards can be seen at home.
export function demoRoadside() {
  const cum = cumulative(DEMO_LINE);
  const at = (m) => pointAt(DEMO_LINE, cum, m);
  const mph = (v) => v * 1.609344;
  return [
    { id: 'demo-bump', kind: 'bump', label: 'Speed bump', pos: at(300), dir: null, limit: null },
    { id: 'demo-cam', kind: 'camera', label: 'Speed camera', pos: at(650), dir: null, limit: mph(25) },
    { id: 'demo-zone', kind: 'average', label: 'Average speed zone', pos: at(cum[2] + 60), end: at(cum[3] - 120), dir: null, limit: mph(30) },
    { id: 'demo-rail', kind: 'rail', label: 'Railway crossing', pos: at(cum[3] + 150), dir: null, limit: null },
    { id: 'demo-school', kind: 'hazard', label: 'School zone', pos: at(cum[4] + 200), dir: null, limit: null },
  ];
}

export function startDemo() {
  stopDemo();
  const cum = cumulative(DEMO_LINE);
  const total = cum[cum.length - 1];
  const stopAt = cum[1] - 35;              // red light before the first turn
  let along = 0;
  let speed = 0;
  let stoppedFor = 0;
  let last = performance.now();
  source = 'demo';
  emit('demo', true);
  demoTimer = setInterval(() => {
    const now = performance.now();
    const dt = Math.min(0.5, (now - last) / 1000);
    last = now;
    const nearTurn = cum.slice(1, -1).some((c) => Math.abs(c - along) < 45);
    const fast = along > cum[2] && along < cum[3] - 80; // Michigan Ave stretch: 38 mph in a 30
    let target = nearTurn ? 5 : fast ? 17 : 12;
    let light = null;
    if (along > stopAt - 60 && along < stopAt + 1 && stoppedFor < 6) {
      target = along >= stopAt - 1 ? 0 : 4;
      if (speed < 0.3) stoppedFor += dt;
      light = stoppedFor < 4 ? 'red' : 'green';
    }
    speed += Math.max(-4 * dt, Math.min(2.2 * dt, target - speed));
    along = Math.min(total, along + speed * dt);
    const pos = pointAt(DEMO_LINE, cum, along);
    const ahead = pointAt(DEMO_LINE, cum, along + 5);
    emit('fix', { lon: pos[0], lat: pos[1], accuracy: 5, speed, heading: headingOf(pos, ahead), t: Date.now(), source: 'demo' });
    emit('demo-vision', demoView(along, stopAt, speed, light, now / 1000));
    if (along >= total) stopDemo();
  }, 250);
}

// What the camera "sees" on the demo drive: a car ahead, traffic in the next lanes,
// and at the red light a stopped queue, a crossing pedestrian and the light itself.
let greenAt = null;
function demoView(along, stopAt, speed, light, t) {
  const boxes = [];
  const pullAway = light === 'green' ? Math.max(0, t - (greenAt ??= t)) * 4 : 0;
  if (light !== 'green') greenAt = null;
  const gap = light ? Math.max(7, stopAt - along + 7) + pullAway : 18 + speed * 1.2 + 4 * Math.sin(t / 5);
  boxes.push(boxFor('car', 0, gap));
  boxes.push(boxFor('car', 3.6, 28 + 8 * Math.sin(t / 7)));
  boxes.push(boxFor('car', -3.6, 45 + 10 * Math.cos(t / 9)));
  boxes.push(boxFor('truck', -3.6, 22 + 6 * Math.sin(t / 11)));
  boxes.push(boxFor('bicycle', 4.6, 18 + 5 * Math.cos(t / 6)));
  if (light) {
    boxes.push(boxFor('light', 0.8, gap + 9, light));
    boxes.push(boxFor('person', -7 + ((t * 1.3) % 14), gap + 3));
    boxes.push(boxFor('person', 6.5, gap + 5));
  }
  return { light, counts: countKinds(boxes), boxes, aspect: 16 / 9 };
}

function headingOf(a, b) {
  const dx = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180);
  const dy = b[1] - a[1];
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

export function stopDemo() {
  if (!demoTimer) return;
  clearInterval(demoTimer);
  demoTimer = null;
  source = 'none';
  emit('demo', false);
}

export const demoRunning = () => demoTimer != null;
