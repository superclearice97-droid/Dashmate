// Small helpers for where the position comes from and how good it is.

// A reading from the background-location plugin -> the same shape as the browser's fixes.
export function fromBackground(loc) {
  if (!loc || !Number.isFinite(loc.latitude) || !Number.isFinite(loc.longitude)) return null;
  const num = (v) => (Number.isFinite(v) ? v : null);
  return {
    lat: loc.latitude,
    lon: loc.longitude,
    accuracy: num(loc.accuracy) ?? 50,
    speed: num(loc.speed),
    heading: num(loc.bearing),
    t: num(loc.time) ?? Date.now(),
  };
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
