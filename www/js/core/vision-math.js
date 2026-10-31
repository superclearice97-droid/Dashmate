// Pure maths for on-device road reading with the YOLOX-Nano model (COCO classes).

export const INPUT = 416;
export const COCO = { person: 0, bicycle: 1, car: 2, motorcycle: 3, bus: 5, truck: 7, trafficLight: 9, stopSign: 11 };
const WANTED = new Set(Object.values(COCO));
const VEHICLES = new Set([COCO.car, COCO.motorcycle, COCO.bus, COCO.truck]);

// YOLOX letterbox: scale to fit, top-left aligned, rest padded with grey 114.
export function letterbox(srcW, srcH, size = INPUT) {
  const r = Math.min(size / srcW, size / srcH);
  return { r, w: Math.round(srcW * r), h: Math.round(srcH * r) };
}

// RGBA pixels (size x size) -> planar BGR float tensor with raw 0..255 values,
// which is what the official YOLOX ONNX export expects.
export function toTensor(rgba, size = INPUT) {
  const n = size * size;
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    out[i] = rgba[i * 4 + 2];
    out[n + i] = rgba[i * 4 + 1];
    out[2 * n + i] = rgba[i * 4];
  }
  return out;
}

// Decode raw YOLOX output [anchors x 85] (obj/cls already sigmoid) into boxes in input-pixel space.
export function decode(data, size = INPUT, scoreThr = 0.35, strides = [8, 16, 32]) {
  const ch = 85;
  const boxes = [];
  let a = 0;
  for (const s of strides) {
    const g = size / s;
    for (let gy = 0; gy < g; gy++) {
      for (let gx = 0; gx < g; gx++, a++) {
        const o = a * ch;
        const obj = data[o + 4];
        if (obj < scoreThr) continue;
        let cls = -1;
        let best = 0;
        for (const c of WANTED) {
          if (data[o + 5 + c] > best) { best = data[o + 5 + c]; cls = c; }
        }
        const score = obj * best;
        if (score < scoreThr) continue;
        const cx = (data[o] + gx) * s;
        const cy = (data[o + 1] + gy) * s;
        const w = Math.exp(data[o + 2]) * s;
        const h = Math.exp(data[o + 3]) * s;
        boxes.push({ x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2, score, cls });
      }
    }
  }
  return boxes;
}

export function iou(a, b) {
  const w = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const h = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const inter = w * h;
  const union = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter;
  return union > 0 ? inter / union : 0;
}

// Per-class non-maximum suppression.
export function nms(boxes, thr = 0.45) {
  const sorted = [...boxes].sort((p, q) => q.score - p.score);
  const keep = [];
  for (const b of sorted) {
    if (!keep.some((k) => k.cls === b.cls && iou(k, b) > thr)) keep.push(b);
  }
  return keep;
}

export function kindOf(cls) {
  if (VEHICLES.has(cls)) return 'car';
  if (cls === COCO.person || cls === COCO.bicycle) return 'person';
  if (cls === COCO.trafficLight) return 'light';
  if (cls === COCO.stopSign) return 'stop';
  return null;
}

export function countKinds(boxes) {
  const c = { car: 0, person: 0, light: 0 };
  for (const b of boxes) {
    const k = kindOf(b.cls);
    if (k in c) c[k]++;
  }
  return c;
}

// The light that most likely applies to us: biggest one in the middle/upper part of the frame.
export function mainLight(lights, frameW, frameH) {
  let best = null;
  for (const b of lights) {
    const cx = (b.x1 + b.x2) / 2 / frameW;
    const cy = (b.y1 + b.y2) / 2 / frameH;
    if (cx < 0.15 || cx > 0.85 || cy > 0.65) continue;
    const area = (b.x2 - b.x1) * (b.y2 - b.y1);
    if (!best || area > best.area) best = { ...b, area };
  }
  return best;
}

function hsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max / 255];
}

// Colour of a lit traffic light from a crop of RGBA pixels: 'red' | 'yellow' | 'green' | null.
export function lightColor(rgba) {
  let red = 0, yellow = 0, green = 0;
  const n = rgba.length / 4;
  for (let i = 0; i < n; i++) {
    const [h, s, v] = hsv(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    if (v < 0.55 || s < 0.35) continue;
    if (h < 18 || h >= 330) red++;
    else if (h < 65) yellow++;
    else if (h >= 110 && h < 200) green++;
  }
  const min = Math.max(4, n * 0.02);
  const ranked = [['red', red], ['yellow', yellow], ['green', green]].sort((a, b) => b[1] - a[1]);
  if (ranked[0][1] < min || ranked[0][1] < ranked[1][1] * 1.5) return null;
  return ranked[0][0];
}
