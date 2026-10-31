// Is the sun up? Computed on the device from the date and position (no internet),
// using the standard sunrise equation. Used to switch between the day and night look.

const rad = Math.PI / 180;
const J2000 = 2451545;
const julian = (date) => date.getTime() / 86400000 + 2440587.5;

// Solar transit and half-day length (in days) for day number n at longitude lon (east +).
function solarDay(n, lat, lon) {
  const j = n - lon / 360;
  const M = (357.5291 + 0.98560028 * j) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const transit = J2000 + j + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lambda * rad);
  const sinDec = Math.sin(lambda * rad) * Math.sin(23.44 * rad);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosW = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * sinDec) / (Math.cos(lat * rad) * cosDec);
  // cosW > 1: sun never rises (polar night); < -1: never sets (midnight sun).
  const half = cosW >= 1 ? 0 : cosW <= -1 ? 0.5 : Math.acos(cosW) / (2 * Math.PI);
  return { transit, half };
}

export function isDaytime(date, lat, lon) {
  const jd = julian(date);
  const n = Math.round(jd - J2000 + lon / 360);
  // Use the solar noon closest to now, so far-west/east longitudes work across UTC midnight.
  let best = null;
  for (const k of [n - 1, n, n + 1]) {
    const d = solarDay(k, lat, lon);
    if (!best || Math.abs(jd - d.transit) < Math.abs(jd - best.transit)) best = d;
  }
  return Math.abs(jd - best.transit) < best.half;
}

// Sunrise and sunset (Date) for the solar day nearest `date`; null at the poles' extremes.
export function sunTimes(date, lat, lon) {
  const n = Math.round(julian(date) - J2000 + lon / 360);
  const { transit, half } = solarDay(n, lat, lon);
  if (half === 0 || half === 0.5) return null;
  const toDate = (j) => new Date((j - 2440587.5) * 86400000);
  return { sunrise: toDate(transit - half), sunset: toDate(transit + half) };
}
