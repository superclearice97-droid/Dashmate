// Small geodesy helpers. Coordinates are [lon, lat] (GeoJSON order).

const R = 6371008.8; // mean Earth radius, metres
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export function distance(a, b) {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bearing(a, b) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

// Smallest absolute difference between two compass bearings (0..180).
export function angleDiff(a, b) {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return d > 180 ? 360 - d : d;
}

// Local flat projection around `origin`, in metres. Fine for the short
// distances used here (a road segment, a few hundred metres).
function toXY(p, origin) {
  return [rad(p[0] - origin[0]) * R * Math.cos(rad(origin[1])), rad(p[1] - origin[1]) * R];
}

// Closest point on segment a-b to p. Returns {dist, t} where t is 0..1 along the segment.
export function pointToSegment(p, a, b) {
  const [ax, ay] = toXY(a, p);
  const [bx, by] = toXY(b, p);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? -(ax * dx + ay * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return { dist: Math.hypot(cx, cy), t };
}

// Cumulative distance (m) at each vertex of a polyline.
export function cumulative(line) {
  const out = [0];
  for (let i = 1; i < line.length; i++) out.push(out[i - 1] + distance(line[i - 1], line[i]));
  return out;
}

// Project p onto a polyline. Returns {along, offset, index}:
// along = metres from the start, offset = metres off the line, index = segment.
export function project(line, cum, p) {
  let best = { along: 0, offset: Infinity, index: 0 };
  for (let i = 0; i < line.length - 1; i++) {
    const { dist, t } = pointToSegment(p, line[i], line[i + 1]);
    if (dist < best.offset) {
      best = { along: cum[i] + t * (cum[i + 1] - cum[i]), offset: dist, index: i };
    }
  }
  if (line.length === 1) best = { along: 0, offset: distance(line[0], p), index: 0 };
  return best;
}

// Point at a given distance along a polyline (used by the demo drive).
export function pointAt(line, cum, along) {
  if (along <= 0) return line[0];
  for (let i = 1; i < line.length; i++) {
    if (cum[i] >= along) {
      const t = (along - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
      return [line[i - 1][0] + t * (line[i][0] - line[i - 1][0]), line[i - 1][1] + t * (line[i][1] - line[i - 1][1])];
    }
  }
  return line[line.length - 1];
}
