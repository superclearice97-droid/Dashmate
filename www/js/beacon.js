// Background GPS link (phone → screen). Native code on both devices (the DashLink plugin
// in plugins/dashmate-media) does the work, so it keeps going with the phone locked or
// another app in front, where this web code is paused:
//   - the screen opens a UDP port and sends the phone a fresh random key, the port and its
//     local addresses over the encrypted pairing link;
//   - the phone's native service reads GPS once a second and sends each position to the
//     screen, encrypted and authenticated with that key (AES-256-GCM), only to private
//     addresses on the local network (the hotspot).
import { emit } from './bus.js';
import { fixFromMessage, isPrivateIPv4 } from './core/gps.js';

let plugin = null;
function native() {
  if (!window.Capacitor?.isNativePlatform?.()) return null;
  plugin ??= window.Capacitor.registerPlugin('DashLink');
  return plugin;
}

let sending = false;
let listening = false;
let fixHandle = null;
let lastFix = 0;

function randomKey() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b));
}

// ---- Screen side
// Returns the offer to send to the phone, or null when background sending isn't possible.
export async function listenForPhone() {
  const p = native();
  if (!p) return null;
  const k = randomKey();
  try {
    await stopListening();
    fixHandle = await p.addListener('fix', (m) => {
      const f = fixFromMessage(m);
      if (!f) return;
      lastFix = Date.now();
      emit('remote-fix', f);
    });
    const r = await p.listen({ key: k });
    const a = (r?.addrs || []).filter(isPrivateIPv4).slice(0, 8);
    if (!a.length || !Number.isInteger(r.port)) {
      await stopListening();
      return null;
    }
    listening = true;
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

// ---- Phone side
// Returns 'ok', 'no-location' or 'unavailable'.
export async function startSending(offer) {
  const p = native();
  if (!p) return 'unavailable';
  try {
    await p.startSending({ key: offer.key, port: offer.port, hosts: offer.hosts });
    sending = true;
    return 'ok';
  } catch (e) {
    console.warn('[beacon] send', e);
    return e?.code === 'NO_LOCATION' ? 'no-location' : 'unavailable';
  }
}

export async function stopSending() {
  sending = false;
  try { await native()?.stopSending(); } catch { /* not sending */ }
}

export const beaconSending = () => sending;

// The phone's notification has its own Stop button; this finds out if it was used.
export async function refreshSending() {
  if (!sending) return false;
  try {
    sending = !!(await native()?.isSending())?.sending;
  } catch { /* keep what we had */ }
  return sending;
}
