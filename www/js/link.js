// Phone ⇄ screen link (experimental). The phone sends its GPS position and road-reading
// results to the screen (e.g. a Wi-Fi-only iPad on the phone's hotspot).
//
// Privacy & security: this is a direct WebRTC connection between your two devices.
// No server is used (not even to find each other): the two QR codes carry everything,
// including each side's encryption fingerprint, so only the device you scanned can
// connect, and all data is encrypted (DTLS).
import { emit, on } from './bus.js';
import { encodeDescription, decodeDescription } from './core/pairing-code.js';

let pc = null;
let channel = null;
let role = null; // 'screen' | 'phone'
let lastFixSent = 0;

function gathered(conn, ms = 3000) {
  return new Promise((resolve) => {
    if (conn.iceGatheringState === 'complete') return resolve();
    const done = () => { conn.removeEventListener('icegatheringstatechange', check); resolve(); };
    const check = () => conn.iceGatheringState === 'complete' && done();
    conn.addEventListener('icegatheringstatechange', check);
    setTimeout(done, ms);
  });
}

function newConnection() {
  closeLink();
  pc = new RTCPeerConnection({ iceServers: [] });
  pc.addEventListener('connectionstatechange', () => {
    const s = pc?.connectionState;
    if (s === 'failed' || s === 'disconnected' || s === 'closed') emit('link', { state: 'lost', role });
  });
  return pc;
}

function wire(dc) {
  channel = dc;
  dc.onopen = () => emit('link', { state: 'connected', role });
  dc.onclose = () => emit('link', { state: 'lost', role });
  dc.onmessage = (e) => receive(e.data);
}

const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

function receive(text) {
  if (role !== 'screen' || typeof text !== 'string' || text.length > 4000) return;
  let m;
  try { m = JSON.parse(text); } catch { return; }
  if (m.t === 'fix' && num(m.lat, -90, 90) && num(m.lon, -180, 180)) {
    emit('remote-fix', {
      lat: m.lat, lon: m.lon,
      accuracy: num(m.acc, 0, 1e5) ? m.acc : 50,
      speed: num(m.spd, 0, 120) ? m.spd : null,
      heading: num(m.hdg, 0, 360) ? m.hdg : null,
    });
  } else if (m.t === 'vision') {
    const c = m.counts || {};
    emit('remote-vision', {
      counts: { car: num(c.car, 0, 99) ? c.car : 0, person: num(c.person, 0, 99) ? c.person : 0, light: num(c.light, 0, 99) ? c.light : 0 },
      light: ['red', 'yellow', 'green'].includes(m.light) ? m.light : null,
      boxes: (Array.isArray(m.boxes) ? m.boxes.slice(0, 20) : [])
        .filter((x) => ['car', 'person', 'light'].includes(x?.k) && Array.isArray(x.b) && x.b.length === 4 && x.b.every((v) => num(v, 0, 1)))
        .map((x) => ({ k: x.k, b: x.b, c: ['red', 'yellow', 'green'].includes(x.c) ? x.c : null })),
      aspect: num(m.aspect, 0.2, 5) ? m.aspect : 16 / 9,
    });
  }
}

function send(obj) {
  if (channel?.readyState === 'open') channel.send(JSON.stringify(obj));
}

// ---- Screen side (iPad): show a code, then read the phone's reply code.
export async function startAsScreen() {
  role = 'screen';
  const conn = newConnection();
  wire(conn.createDataChannel('dashmate', { ordered: true }));
  await conn.setLocalDescription(await conn.createOffer());
  await gathered(conn);
  return encodeDescription(conn.localDescription);
}

export async function finishAsScreen(code) {
  const desc = await decodeDescription(code);
  if (desc.type !== 'answer') throw new Error('That’s the screen’s code. Scan the code shown on the phone.');
  await pc.setRemoteDescription(desc);
}

// ---- Phone side: read the screen's code, then show a reply code.
export async function startAsPhone(code) {
  const desc = await decodeDescription(code);
  if (desc.type !== 'offer') throw new Error('That’s a phone’s code. Scan the code on the screen you want to pair with.');
  role = 'phone';
  const conn = newConnection();
  conn.ondatachannel = (e) => wire(e.channel);
  await conn.setRemoteDescription(desc);
  await conn.setLocalDescription(await conn.createAnswer());
  await gathered(conn);
  return encodeDescription(conn.localDescription);
}

export function closeLink() {
  try { channel?.close(); } catch { /* already closed */ }
  try { pc?.close(); } catch { /* already closed */ }
  channel = null;
  pc = null;
}

export const linkRole = () => (channel?.readyState === 'open' ? role : null);

// The phone forwards its own GPS and road reading to the screen.
on('fix', (f) => {
  if (role !== 'phone' || f.source !== 'device') return;
  const now = Date.now();
  if (now - lastFixSent < 400) return;
  lastFixSent = now;
  send({ t: 'fix', lat: f.lat, lon: f.lon, acc: f.accuracy, spd: f.speed, hdg: f.heading });
});
on('vision', (v) => {
  if (role === 'phone' && v) send({ t: 'vision', counts: v.counts, light: v.light, boxes: v.boxes, aspect: v.aspect });
});
