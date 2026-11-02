// Speed cameras and road hazards mapped in OpenStreetMap, and which of them are ahead
// of you. Pure functions so they can be tested; the screen side is ../roadside.js.
import { distance, bearing, angleDiff, project } from './geo.js';
import { parseMaxspeed } from './speedlimit.js';

export const CAMERA_KINDS = ['camera', 'redlight', 'average'];
export const HAZARD_KINDS = ['bump', 'rail', 'hazard'];

// Where the law forbids or restricts warning drivers about speed cameras, DashMate shows
// none at all (no setting, no warnings). Kept on the cautious side: countries that only
// allow vague "danger zone" warnings are included.
export const NO_CAMERA_WARNINGS = {
  AT: 'Austria', BE: 'Belgium', CH: 'Switzerland', CY: 'Cyprus', DE: 'Germany', FR: 'France',
  KW: 'Kuwait', LI: 'Liechtenstein', LU: 'Luxembourg', MK: 'North Macedonia', TR: 'Turkey',
};

// Allowed only once we know the country and it isn't on the list.
export function cameraWarningsAllowed(code) {
  return typeof code === 'string' && /^[A-Z]{2}$/.test(code) && !(code in NO_CAMERA_WARNINGS);
}

const BUMPS = { bump: 'Speed bump', hump: 'Speed hump', cushion: 'Speed cushions', table: 'Raised crossing' };
const HAZARDS = [
  [/animal|deer|cattle|horse|wildlife|frog|toad|elk|moose/, 'Animals crossing'],
  [/school|children/, 'School zone'],
  [/curve|bend|turn/, 'Dangerous bend'],
  [/junction|intersection/, 'Dangerous junction'],
  [/rock|landslide/, 'Falling rocks'],
  [/pedestrian/, 'Pedestrians'],
  [/cycl|bicycle/, 'Cyclists'],
  [/slippery|ice|frost|snow/, 'Slippery road'],
  [/queue/, 'Queues likely'],
  [/aircraft/, 'Low-flying aircraft'],
];

export function hazardLabel(value) {
  const v = String(value || '').toLowerCase();
  return HAZARDS.find(([re]) => re.test(v))?.[1] ?? 'Hazard ahead';
}

export function roadsideQuery(lat, lon, radius = 1500) {
  const a = `(around:${radius},${lat.toFixed(5)},${lon.toFixed(5)})`;
  return `[out:json][timeout:15];(node${a}[highway=speed_camera];node${a}[traffic_calming~"^(bump|hump|cushion|table)$"];`
    + `node${a}[railway=level_crossing];node${a}[hazard];rel${a}[type=enforcement][enforcement~"^(maxspeed|average_speed|traffic_signals)$"];);out body geom;`;
}

export function countryQuery(lat, lon) {
  return `[out:json][timeout:15];is_in(${lat.toFixed(4)},${lon.toFixed(4)})->.a;area.a["admin_level"="2"];out tags;`;
}

export function countryFrom(elements) {
  const code = (elements || []).map((e) => e.tags?.['ISO3166-1'] ?? e.tags?.['ISO3166-1:alpha2'])
    .find((c) => /^[A-Z]{2}$/.test(c || ''));
  return code ?? null;
}

const nodePos = (m) => {
  if (!m) return null;
  if (Number.isFinite(m.lat) && Number.isFinite(m.lon)) return [m.lon, m.lat];
  const g = m.geometry;
  if (Array.isArray(g) && g.length) {
    const mid = g[Math.floor(g.length / 2)];
    if (Number.isFinite(mid?.lat)) return [mid.lon, mid.lat];
  }
  return null;
};

// Overpass elements -> [{id, kind, pos:[lon,lat], dir (deg of travel it applies to, or null),
// limit (km/h|null), label, end (average-speed zones)}].
export function parseRoadside(elements) {
  const out = [];
  const nodes = new Map();
  for (const e of elements || []) {
    if (e.type !== 'node' || !Number.isFinite(e.lat) || !Number.isFinite(e.lon)) continue;
    const t = e.tags || {};
    let item = null;
    if (t.highway === 'speed_camera') item = { kind: 'camera', label: 'Speed camera', limit: parseMaxspeed(t.maxspeed) };
    else if (t.traffic_calming in BUMPS) item = { kind: 'bump', label: BUMPS[t.traffic_calming] };
    else if (t.railway === 'level_crossing') item = { kind: 'rail', label: 'Railway crossing' };
    else if (t.hazard) item = { kind: 'hazard', label: hazardLabel(t.hazard) };
    if (!item) continue;
    Object.assign(item, { id: `n${e.id}`, pos: [e.lon, e.lat], dir: null, limit: item.limit ?? null });
    out.push(item);
    nodes.set(e.id, item);
  }
  const drop = new Set();
  for (const e of elements || []) {
    if (e.type !== 'relation' || e.tags?.type !== 'enforcement') continue;
    const t = e.tags;
    const member = (role) => (e.members || []).find((m) => m.role === role);
    const from = nodePos(member('from'));
    const to = nodePos(member('to'));
    const device = member('device');
    const devicePos = nodePos(device);
    const limit = parseMaxspeed(t.maxspeed);
    // The cameras of a zone are part of the zone, not separate warnings.
    for (const m of e.members || []) if (m.type === 'node' && m.role === 'device') drop.add(m.ref);
    if (t.enforcement === 'average_speed') {
      if (from && to && distance(from, to) > 50) {
        out.push({ id: `r${e.id}`, kind: 'average', label: 'Average speed zone', pos: from, end: to, dir: bearing(from, to), limit });
      }
      continue;
    }
    const where = to ?? devicePos ?? from;
    if (!where) continue;
    const dirFrom = from ?? null;
    const dir = dirFrom && distance(dirFrom, where) > 5 ? bearing(dirFrom, where) : null;
    const kind = t.enforcement === 'traffic_signals' ? 'redlight' : 'camera';
    const own = device?.type === 'node' ? nodes.get(device.ref) : null;
    out.push({
      id: `r${e.id}`, kind, label: kind === 'redlight' ? 'Red-light camera' : 'Speed camera',
      pos: where, dir, limit: limit ?? own?.limit ?? null,
    });
  }
  return out.filter((it) => !(it.id.startsWith('n') && drop.has(Number(it.id.slice(1)))));
}

// How far ahead to warn: about 20 s, at least 300 m (town), at most 1 km (motorway).
export const cameraWarnDistance = (speedMps) => Math.min(1000, Math.max(300, (speedMps || 0) * 20));
// Hazards: a few seconds before you reach them.
export const hazardWarnDistance = (speedMps) => Math.min(300, Math.max(80, (speedMps || 0) * 8));

// Items ahead of you, nearest first: [{item, dist}].
// With a route, items must be on it (within 30 m); without one, roughly straight ahead along
// your heading. Items that only apply to the other direction of travel are left out.
export function upcoming(items, { pos, heading, route, maxDist = 1000 }) {
  const out = [];
  for (const item of items || []) {
    let dist;
    let travel;
    if (route) {
      const p = project(route.line, route.cum, item.pos);
      if (p.offset > 30) continue;
      dist = p.along - route.along;
      const i = p.index;
      travel = bearing(route.line[i], route.line[i + 1] ?? route.line[i]);
    } else {
      if (heading == null || !pos) continue;
      const d = distance(pos, item.pos);
      const off = angleDiff(heading, bearing(pos, item.pos)) * (Math.PI / 180);
      dist = d * Math.cos(off);
      const cross = Math.abs(d * Math.sin(off));
      if (cross > 25 + dist * 0.05) continue;
      travel = heading;
    }
    if (!(dist > 0 && dist <= maxDist)) continue;
    if (item.dir != null && angleDiff(item.dir, travel) > 60) continue;
    out.push({ item, dist });
  }
  return out.sort((a, b) => a.dist - b.dist);
}

// Decides what to show and when to announce it. One camera card and one hazard card at a
// time; each item is announced once, when it comes within warning distance.
export class RoadsideWatcher {
  constructor() {
    this.announced = new Set();
    this.zone = null;
  }

  reset() {
    this.announced.clear();
    this.zone = null;
  }

  // ahead: from upcoming(). pos: [lon,lat]. speedMps; odo: distance driven so far (m); t: ms.
  // Returns {camera, hazard, announce: [{item, dist}]}.
  update({ ahead, pos, speedMps, odo, t }) {
    const kmh = (speedMps || 0) * 3.6;
    const announce = [];
    let camera = null;
    let hazard = null;

    // Inside an average-speed zone: your average since its start and the distance left.
    if (this.zone) {
      const left = distance(pos, this.zone.item.end);
      this.zone.minLeft = Math.min(this.zone.minLeft, left);
      if (left < 25 || left > this.zone.minLeft + 150) this.zone = null;
      else {
        const secs = (t - this.zone.t0) / 1000;
        const avg = secs > 2 ? ((odo - this.zone.odo0) / secs) * 3.6 : kmh;
        camera = { type: 'zone', item: this.zone.item, avg, left, limit: this.zone.item.limit, over: this.zone.item.limit != null && avg > this.zone.item.limit };
      }
    }

    const camWarn = cameraWarnDistance(speedMps);
    const hazWarn = hazardWarnDistance(speedMps);
    for (const a of ahead || []) {
      const cam = CAMERA_KINDS.includes(a.item.kind);
      const warn = cam ? camWarn : hazWarn;
      if (a.item.kind === 'average' && a.dist < 20 && this.zone?.item.id !== a.item.id) {
        this.zone = { item: a.item, t0: t, odo0: odo, minLeft: Infinity };
        this.announced.add(a.item.id);
        continue;
      }
      if (a.dist > warn) continue;
      if (!this.announced.has(a.item.id)) {
        this.announced.add(a.item.id);
        announce.push(a);
      }
      if (cam && !camera) {
        const limit = a.item.limit;
        camera = { type: a.item.kind, item: a.item, dist: a.dist, limit, over: limit != null && kmh > limit, progress: Math.max(0, Math.min(1, 1 - a.dist / warn)) };
      } else if (!cam && !hazard) {
        hazard = { type: a.item.kind, item: a.item, dist: a.dist };
      }
    }
    if (this.announced.size > 500) this.announced = new Set([...this.announced].slice(-200));
    return { camera, hazard, announce };
  }
}
