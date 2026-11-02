// Phone ⇄ screen link (experimental). The phone sends its GPS position and road-reading
// results to the screen (e.g. a Wi-Fi-only iPad on the phone's hotspot).
//
// Privacy & security: this is a direct WebRTC connection between your two devices.
// No server is used (not even to find each other): the two QR codes carry everything,
// including each side's encryption fingerprint, so only the device you scanned can
// connect, and all data is encrypted (DTLS).
import { emit, on } from './bus.js';
import { encodeDescription, decodeDescription } from './core/pairing-code.js';
import { KINDS } from './core/vision-math.js';
import { fixFromMessage, beaconOffer } from './core/gps.js';
import { beaconSending } from './beacon.js';

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
  const conn = new RTCPeerConnection({ iceServers: [] });
  pc = conn;
  conn.addEventListener('connectionstatechange', () => {
    if (conn !== pc) return; // closed on purpose
    const s = conn.connectionState;
    if (s === 'failed' || s === 'disconnected' || s === 'closed') emit('link', { state: 'lost', role });
  });
  return conn;
}

function wire(dc) {
  channel = dc;
  dc.onopen = () => emit('link', { state: 'connected', role });
  dc.onclose = () => dc === channel && emit('link', { state: 'lost', role });
  dc.onmessage = (e) => receive(e.data);
}

const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

function receive(text) {
  if (!role || typeof text !== 'string' || text.length > 4000) return;
  let m;
  try { m = JSON.parse(text); } catch { return; }
  if (role === 'phone') {
    // The screen's invitation to keep sending in the background.
    const offer = beaconOffer(m);
    if (offer) emit('beacon-offer', offer);
    return;
  }
  if (m.t === 'fix') {
    const f = fixFromMessage(m);
    if (f) emit('remote-fix', f);
  } else if (m.t === 'vision') {
    const c = m.counts || {};
    emit('remote-vision', {
      counts: Object.fromEntries(KINDS.map((k) => [k, num(c[k], 0, 99) ? c[k] : 0])),
      light: ['red', 'yellow', 'green'].includes(m.light) ? m.light : null,
      boxes: (Array.isArray(m.boxes) ? m.boxes.slice(0, 24) : [])
        .filter((x) => KINDS.includes(x?.k) && Array.isArray(x.b) && x.b.length === 4 && x.b.every((v) => num(v, 0, 1)))
        .map((x) => ({ k: x.k, b: x.b, c: ['red', 'yellow', 'green'].includes(x.c) ? x.c : null })),
      aspect: num(m.aspect, 0.2, 5) ? m.aspect : 16 / 9,
    });
  }
}

function send(obj) {
  if (channel?.readyState === 'open') channel.send(JSON.stringify(obj));
}

// Screen: hand the phone the key, port and addresses for background sending.
export const sendBeaconOffer = (offer) => role === 'screen' && send(offer);

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

// Closing on purpose (Disconnect, Stop sharing) isn't reported as a lost link.
export function closeLink() {
  const [c, p] = [channel, pc];
  channel = null;
  pc = null;
  try { c?.close(); } catch { /* already closed */ }
  try { p?.close(); } catch { /* already closed */ }
}

export const linkRole = () => (channel?.readyState === 'open' ? role : null);

// The phone forwards its own GPS and road reading to the screen.
on('fix', (f) => {
  if (role !== 'phone' || f.source !== 'device' || beaconSending()) return; // the background link sends it
  const now = Date.now();
  if (now - lastFixSent < 400) return;
  lastFixSent = now;
  send({ t: 'fix', lat: f.lat, lon: f.lon, acc: f.accuracy, spd: f.speed, hdg: f.heading });
});
on('vision', (v) => {
  if (role === 'phone' && v) send({ t: 'vision', counts: v.counts, light: v.light, boxes: v.boxes, aspect: v.aspect });
});
