// Small helpers for where the position comes from and how good it is.

const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

// A position sent by the paired phone ({lat, lon, acc, spd, hdg}, over the pairing link
// or the background link) -> a fix, or null if it isn't a sensible position.
export function fixFromMessage(m) {
  if (!m || !num(m.lat, -90, 90) || !num(m.lon, -180, 180)) return null;
  return {
    lat: m.lat,
    lon: m.lon,
    accuracy: num(m.acc, 0, 1e5) ? m.acc : 50,
    speed: num(m.spd, 0, 120) ? m.spd : null,
    heading: num(m.hdg, 0, 360) ? m.hdg : null,
  };
}

// Positions only ever go to addresses on the local network (the phone's hotspot).
export function isPrivateIPv4(s) {
  if (typeof s !== 'string' || !/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return false;
  const [a, b, ...rest] = s.split('.').map(Number);
  if ([a, b, ...rest].some((n) => n > 255)) return false;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

// The screen's invitation for background sending: a fresh 256-bit key, its UDP port and
// its local addresses, sent over the encrypted pairing link. Returns null if malformed.
export function beaconOffer(m) {
  if (!m || m.t !== 'beacon') return null;
  if (typeof m.k !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(m.k)) return null;
  if (!Number.isInteger(m.p) || m.p < 1 || m.p > 65535) return null;
  if (!Array.isArray(m.a)) return null;
  const hosts = m.a.filter(isPrivateIPv4).slice(0, 8);
  return hosts.length ? { key: m.k, port: m.p, hosts } : null;
}

// The GPS chip: what it says and whether to warn. Wi-Fi-only iPads report positions
// hundreds of metres out, which is why the car arrow can't follow the road.
export function gpsQuality(source, accuracy) {
  if (source === 'demo') return { label: 'Demo drive', level: 'good' };
  const where = source === 'phone' ? 'Phone' : 'This device';
  if (!(accuracy >= 0)) return { label: `GPS · ${where}`, level: 'weak' };
  if (accuracy > 100) return { label: source === 'phone' ? 'Weak GPS · Phone' : 'Wi-Fi location only', level: 'poor' };
  if (accuracy > 30) return { label: `GPS · ${where}`, level: 'weak' };
  return { label: `GPS · ${where}`, level: 'good' };
}

// The phone's own record of the background link ({sending, fixes, sent, failed, lastError}
// from the native plugin) -> what to tell the user while the screen hasn't confirmed it's
// receiving. {waiting: true} means "give it a moment"; otherwise `text` says what's wrong.
export function linkProblem(status, platform) {
  const why = status?.lastError ? ` (${String(status.lastError).slice(0, 80)})` : '';
  if (!status?.sending) {
    return { waiting: false, text: `The background service on this phone didn’t start${why}. Check DashMate has precise location permission, then pair again.` };
  }
  if (!status.fixes) return { waiting: true, text: 'Waiting for this phone’s GPS. It needs a view of the sky.' };
  if (!status.sent && status.failed) {
    return platform === 'ios'
      ? { waiting: false, text: `This iPhone is blocking DashMate from reaching your iPad${why}. Turn on Settings › Privacy & Security › Local Network › DashMate, then pair again.` }
      : { waiting: false, text: `This phone couldn’t send to the screen${why}. Check the screen is joined to this phone’s hotspot, then pair again.` };
  }
  return { waiting: false, text: 'This phone is sending, but the screen isn’t receiving it. Make sure the screen is joined to this phone’s hotspot (not another Wi-Fi network) and has DashMate open, then pair again.' };
}

// Both devices should run the same DashMate version for the background link.
export const sameVersion = (a, b) => typeof a === 'string' && typeof b === 'string' && a === b;
