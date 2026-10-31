// Turns camera detections into positions on the road for the 3D view.
// A simple pinhole-camera estimate: the smaller something looks, the farther away it is.
// Good enough to place cars, people and lights in roughly the right lane and order.

export const CAMERA_HFOV_DEG = 66; // typical phone main camera, landscape
const REAL_HEIGHT = { car: 1.5, person: 1.7, light: 1.0 };
const LIMITS = { car: 8, person: 6, light: 3 };
const MAX_DIST = 80;

// boxes: [{k: 'car'|'person'|'light', b: [x1, y1, x2, y2] normalised 0..1, c?: colour}]
// aspect: frame width / height. Returns [{kind, x (m, right +), z (m ahead), color}] nearest first.
export function toScene(boxes, aspect = 16 / 9, hfovDeg = CAMERA_HFOV_DEG) {
  const tanH = Math.tan((hfovDeg * Math.PI) / 360);
  const tanV = tanH / aspect;
  const out = [];
  for (const { k, b, c } of boxes || []) {
    if (!(k in REAL_HEIGHT) || !Array.isArray(b) || b.length !== 4) continue;
    const h = b[3] - b[1];
    if (!(h > 0.005)) continue;
    const z = REAL_HEIGHT[k] / (h * 2 * tanV);
    if (z > MAX_DIST) continue;
    const cx = (b[0] + b[2]) / 2;
    out.push({ kind: k, x: (cx - 0.5) * 2 * tanH * z, z: Math.max(3, z), color: c ?? null });
  }
  out.sort((p, q) => p.z - q.z);
  const counts = { car: 0, person: 0, light: 0 };
  return out.filter((o) => counts[o.kind]++ < LIMITS[o.kind]);
}

// The reverse of toScene: the box a thing at (x, z) would make in the camera frame.
// Used by the demo drive to fake what the camera would see.
export function boxFor(kind, x, z, color = null, aspect = 16 / 9, hfovDeg = CAMERA_HFOV_DEG) {
  const tanH = Math.tan((hfovDeg * Math.PI) / 360);
  const tanV = tanH / aspect;
  const h = REAL_HEIGHT[kind] / (z * 2 * tanV);
  const cx = 0.5 + x / (2 * tanH * z);
  const w = kind === 'car' ? h * 0.75 : kind === 'person' ? h * 0.22 : h * 0.2;
  const cy = kind === 'light' ? 0.3 : 0.5 + h * 0.2; // lights hang above the road
  return { k: kind, b: [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], c: color };
}

// Driving gear shown in the P R N D strip. DashMate can't read the car, so this is a
// guess from movement: D while driving or recently stopped, P once parked a while.
export function guessGear(speedMps, msSinceMoving) {
  if (speedMps > 0.5) return 'D';
  return msSinceMoving < 120000 ? 'D' : 'P';
}
