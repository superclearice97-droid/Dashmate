// Speed limits and street names from OpenStreetMap (via the Overpass API).
import { angleDiff, bearing, pointToSegment } from './geo.js';

const MPH = 1.609344;

// OSM maxspeed tag -> km/h, or null when there is no usable number.
export function parseMaxspeed(tag) {
  if (tag == null) return null;
  const first = String(tag).split(';')[0].trim().toLowerCase();
  const m = first.match(/^(\d+(?:\.\d+)?)\s*(mph|km\/h|kmh|kph)?$/);
  if (!m) return null; // "none", "walk", "signals", "US:urban", knots...
  const v = Number(m[1]);
  if (!(v > 0 && v < 200)) return null;
  return m[2] === 'mph' ? v * MPH : v;
}

const HIGHWAYS = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link';

export function overpassQuery(lat, lon, radius = 30) {
  return `[out:json][timeout:8];way(around:${radius},${lat.toFixed(6)},${lon.toFixed(6)})[highway~"^(${HIGHWAYS})$"];out tags geom;`;
}

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Choose the road we are most likely on. ways: Overpass elements with .geometry and .tags.
// pos: [lon, lat]; heading: degrees or null. Returns {name, maxspeed (km/h|null), dist} or null.
export function pickWay(ways, pos, heading) {
  let best = null;
  for (const w of ways || []) {
    const g = w.geometry || [];
    for (let i = 0; i < g.length - 1; i++) {
      const a = [g[i].lon, g[i].lat];
      const b = [g[i + 1].lon, g[i + 1].lat];
      const { dist } = pointToSegment(pos, a, b);
      let score = dist;
      if (heading != null) {
        const diff = angleDiff(heading, bearing(a, b));
        score += Math.min(diff, 180 - diff) * 0.35; // either travel direction is fine
      }
      if (!best || score < best.score) best = { score, dist, tags: w.tags || {} };
    }
  }
  if (!best || best.dist > 30) return null;
  const t = best.tags;
  const fwd = t['maxspeed'] ?? t['maxspeed:forward'] ?? t['maxspeed:backward'];
  return {
    name: t.name || t.ref || '',
    maxspeed: parseMaxspeed(fwd),
    dist: best.dist,
  };
}
