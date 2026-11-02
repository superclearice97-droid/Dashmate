// Every request DashMate makes to the internet lives in this file, and each one
// is gated by its own switch in Controls › Online features.
import { settings } from './settings.js';
import { osrmUrl } from './core/route.js';
import { overpassQuery, OVERPASS_URL, pickWay } from './core/speedlimit.js';
import { roadsideQuery, countryQuery, countryFrom, parseRoadside } from './core/roadside.js';

async function getJson(url, init = {}, ms = 10000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error(`Server said ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function need(flag, label) {
  if (!settings.online[flag]) throw new Error(`${label} is turned off in Controls`);
}

// Place search (Photon by komoot, OpenStreetMap data). Sent: the search text and,
// to rank nearby places first, your approximate position (rounded to ~1 km).
export async function searchPlaces(text, near) {
  need('nav', 'Directions & search');
  const p = new URLSearchParams({ q: text, limit: '8', lang: 'en' });
  if (near) {
    p.set('lat', near[1].toFixed(2));
    p.set('lon', near[0].toFixed(2));
  }
  const data = await getJson(`https://photon.komoot.io/api/?${p}`);
  return (data.features || []).map((f) => {
    const pr = f.properties || {};
    const line1 = pr.name || [pr.housenumber, pr.street].filter(Boolean).join(' ') || pr.city || 'Unnamed place';
    const line2 = [pr.name && pr.street ? [pr.housenumber, pr.street].filter(Boolean).join(' ') : '', pr.city, pr.state, pr.country].filter(Boolean).join(', ');
    return { title: line1, subtitle: line2, coord: f.geometry.coordinates };
  });
}

// Driving route (OSRM on the FOSSGIS server). Sent: start and destination.
// avoid: {tolls, highways, ferries}. If the server can't honour them, the normal route is
// returned with avoidIgnored set, so the app can say so.
export async function fetchRoute(from, to, avoid = {}) {
  need('nav', 'Directions & search');
  const wants = Object.values(avoid).some(Boolean);
  if (wants) {
    try {
      const data = await getJson(osrmUrl(from, to, avoid), {}, 15000);
      if (data.code === 'Ok' && data.routes?.length) return data.routes[0];
    } catch { /* fall through to the normal route */ }
  }
  const data = await getJson(osrmUrl(from, to), {}, 15000);
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No route found');
  return wants ? { ...data.routes[0], avoidIgnored: true } : data.routes[0];
}

// Speed limit and street name (Overpass API, OpenStreetMap). Sent: your current position.
export async function fetchRoad(pos, heading) {
  need('limits', 'Speed limits');
  const body = new URLSearchParams({ data: overpassQuery(pos[1], pos[0]) });
  const data = await getJson(OVERPASS_URL, { method: 'POST', body }, 12000);
  return pickWay(data.elements, pos, heading);
}

// Speed cameras and road hazards mapped within ~1.5 km (Overpass API). Part of the same
// switch as speed limits. Sent: your current position.
export async function fetchRoadside(pos) {
  need('limits', 'Speed limits');
  const body = new URLSearchParams({ data: roadsideQuery(pos[1], pos[0]) });
  const data = await getJson(OVERPASS_URL, { method: 'POST', body }, 20000);
  return parseRoadside(data.elements);
}

// Which country you're in (Overpass API), so camera warnings are only offered where they
// are legal. Sent: your position rounded to ~10 m. Asked once, then again after ~25 km.
export async function fetchCountry(pos) {
  need('limits', 'Speed limits');
  const body = new URLSearchParams({ data: countryQuery(pos[1], pos[0]) });
  const data = await getJson(OVERPASS_URL, { method: 'POST', body }, 20000);
  return countryFrom(data.elements);
}

// Outside temperature (Open-Meteo). Sent: your position rounded to ~10 km.
export async function fetchTemperature(pos, units) {
  need('weather', 'Weather');
  const p = new URLSearchParams({
    latitude: pos[1].toFixed(1), longitude: pos[0].toFixed(1), current: 'temperature_2m',
    temperature_unit: units === 'imperial' ? 'fahrenheit' : 'celsius',
  });
  const data = await getJson(`https://api.open-meteo.com/v1/forecast?${p}`);
  return Math.round(data.current.temperature_2m);
}
