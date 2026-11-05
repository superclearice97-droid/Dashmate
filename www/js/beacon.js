// Background GPS link (phone → screen). Native code on both devices (the DashLink plugin
// in plugins/dashmate-media) does the work, so it keeps going with the phone locked or
// another app in front, where this web code is paused:
//   - the screen opens a UDP port and sends the phone a fresh random key, the port and its
//     local addresses over the encrypted pairing link;
//   - the phone's native service reads GPS once a second and sends each position to the
//     screen, encrypted and authenticated with that key (AES-256-GCM), only to private
//     addresses on the local network (the hotspot).
import { emit } from './bus.js';
import { fixFromMessage, isPrivateIPv4, isFresh, BEACON_PORT, loadPairing, savePairing, forgetPairing } from './core/gps.js';

// Pair once, then it reconnects by itself: the key and port are kept on this device, the
// screen always listens on the same port and the phone finds it by sweeping its own
// hotspot network, so a new IP address, a restart or the hotspot being switched off and
// on needs no new pairing.
const store = () => { try { return window.localStorage; } catch { return null; } };
export const pairing = () => { const s = store(); return s ? loadPairing(s) : null; };
export const forgetPair = () => { const s = store(); if (s) forgetPairing(s); };

let plugin = null;
function native() {
  if (!window.Capacitor?.isNativePlatform?.()) return null;
  plugin ??= window.Capacitor.registerPlugin('DashLink');
  return plugin;
}

let sending = false;
let confirmed = false;     // phone: the screen said it is receiving
let listening = false;
let fixHandle = null;
let lastFix = 0;
let received = 0;

function randomKey() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b));
}

// ---- Screen side
// Returns the offer to send to the phone, or null when background sending isn't possible.
// With `resume`, listens again with the remembered key (no pairing code needed); otherwise
// makes a fresh key for a new pairing.
export async function listenForPhone(resume = false) {
  const p = native();
  if (!p) return null;
  const saved = pairing();
  if (resume && saved?.role !== 'screen') return null;
  const k = resume ? saved.key : randomKey();
  try {
    await stopListening();
    fixHandle = await p.addListener('fix', (m) => {
      const f = fixFromMessage(m);
      if (!f || !isFresh(m.t)) return; // a replayed old packet
      lastFix = Date.now();
      received++;
      emit('remote-fix', f);
    });
    const r = await p.listen({ key: k, port: BEACON_PORT });
    const a = (r?.addrs || []).filter(isPrivateIPv4).slice(0, 8);
    if (!Number.isInteger(r?.port)) {
      await stopListening();
      return null;
    }
    listening = true;
    received = 0;
    const s = store();
    if (s) savePairing(s, { role: 'screen', key: k, port: r.port });
    return { t: 'beacon', k, p: r.port, a };
  } catch (e) {
    console.warn('[beacon] listen', e);
    await stopListening();
    return null;
  }
}

export async function stopListening() {
  listening = false;
  try { await fixHandle?.remove(); } catch { /* gone */ }
  fixHandle = null;
  try { await native()?.stopListening(); } catch { /* not listening */ }
}

export const beaconListening = () => listening;
// The screen is getting positions from the phone over the background link right now.
export const hearingPhone = (ms = 10000) => listening && Date.now() - lastFix < ms;
export const lastBeaconFix = () => lastFix;
export const beaconReceived = () => received;

// ---- Phone side
// Returns 'ok', 'no-location' or 'unavailable'. `offer` is {key, port, hosts?}: from a
// new pairing, or the remembered one (then it is already known to work).
export async function startSending(offer, resumed = false) {
  const p = native();
  if (!p) return 'unavailable';
  try {
    await p.startSending({ key: offer.key, port: offer.port, hosts: offer.hosts || [] });
    sending = true;
    confirmed = resumed;
    const s = store();
    if (s) savePairing(s, { role: 'phone', key: offer.key, port: offer.port });
    return 'ok';
  } catch (e) {
    console.warn('[beacon] send', e);
    return e?.code === 'NO_LOCATION' ? 'no-location' : 'unavailable';
  }
}

export async function stopSending() {
  sending = false;
  confirmed = false;
  try { await native()?.stopSending(); } catch { /* not sending */ }
}

export const beaconSending = () => sending;
// Only once the screen has confirmed it receives the background link is it safe to lock
// the phone; until then positions also go over the pairing link.
export const beaconConfirmed = () => sending && confirmed;
export function markConfirmed() {
  if (sending) confirmed = true;
}

// The phone's own counters: {sending, fixes, sent, failed, lastError}.
export async function sendStatus() {
  try {
    return (await native()?.isSending()) ?? null;
  } catch {
    return null;
  }
}

export const platform = () => window.Capacitor?.getPlatform?.() ?? 'web';

// The phone's notification has its own Stop button; this finds out if it was used.
export async function refreshSending() {
  if (!sending) return false;
  try {
    sending = !!(await native()?.isSending())?.sending;
    if (!sending) confirmed = false;
  } catch { /* keep what we had */ }
  return sending;
}
