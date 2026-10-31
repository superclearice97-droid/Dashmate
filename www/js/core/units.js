// Unit conversion and formatting. Internally everything is metres and m/s.

export const MPS_TO_MPH = 2.2369362920544;
export const MPS_TO_KMH = 3.6;
const FT_PER_M = 3.28084;
const M_PER_MI = 1609.344;

export function defaultUnits(locale = 'en-US') {
  // Countries that drive in mph: US, UK, Liberia, Myanmar and a few territories.
  return /-(US|GB|LR|MM|PR|VI|GU|AS|MP)\b/i.test(locale) ? 'imperial' : 'metric';
}

export function speedValue(mps, units) {
  if (mps == null || !Number.isFinite(mps) || mps < 0) return 0;
  return Math.round(mps * (units === 'imperial' ? MPS_TO_MPH : MPS_TO_KMH));
}

export const speedUnit = (units) => (units === 'imperial' ? 'MPH' : 'KM/H');

// Distance for navigation cards: "450 ft", "0.3 mi", "12 mi" / "450 m", "1.2 km".
export function formatDistance(m, units) {
  if (!Number.isFinite(m) || m < 0) m = 0;
  if (units === 'imperial') {
    const ft = m * FT_PER_M;
    if (ft < 1000) return { value: String(ft < 100 ? Math.round(ft / 10) * 10 : Math.round(ft / 50) * 50), unit: 'ft' };
    const mi = m / M_PER_MI;
    return { value: mi < 10 ? mi.toFixed(1) : String(Math.round(mi)), unit: 'mi' };
  }
  if (m < 1000) return { value: String(m < 100 ? Math.round(m / 5) * 5 : Math.round(m / 10) * 10), unit: 'm' };
  const km = m / 1000;
  return { value: km < 10 ? km.toFixed(1) : String(Math.round(km)), unit: 'km' };
}

export const distanceText = (m, units) => {
  const d = formatDistance(m, units);
  return `${d.value} ${d.unit}`;
};

// Spoken version: "500 feet", "0.3 miles", "200 metres".
export function spokenDistance(m, units) {
  const d = formatDistance(m, units);
  const words = { ft: 'feet', mi: d.value === '1.0' ? 'mile' : 'miles', m: 'metres', km: 'kilometres' };
  return `${d.value} ${words[d.unit]}`;
}

export function formatDuration(sec) {
  const min = Math.max(0, Math.round(sec / 60));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

// A posted limit in the user's units (limits are stored as km/h).
export function limitValue(kmh, units) {
  if (kmh == null) return null;
  // Posted mph limits are stored exactly (e.g. 35 mph = 56.327 km/h), so rounding recovers them.
  return Math.round(units === 'imperial' ? kmh / 1.609344 : kmh);
}
