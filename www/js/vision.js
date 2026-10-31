// Road reading (experimental): the camera identifies street objects with a YOLOX
// model, entirely on this device. No image ever leaves it.
//   Fast:     YOLOX-Nano, 416 px, several updates a second
//   Detailed: YOLOX-S, 640 px, sees smaller and farther things, about one update a second or slower
import { emit } from './bus.js';
import { settings } from './settings.js';
import { openCamera, closeCamera, loadScript, containRect } from './camera.js';
import { letterbox, toTensor, decode, nms, kindOf, countKinds, mainLight, lightColor, labelOf } from './core/vision-math.js';

// Box colour per kind: vehicles blue, bikes cyan, people orange, animals purple, signs red.
const COLORS = {
  car: '#3b82f6', truck: '#3b82f6', bus: '#3b82f6', tram: '#3b82f6', motorcycle: '#06b6d4', bicycle: '#06b6d4',
  person: '#f59e0b', animal: '#a855f7', light: '#22c55e', stop: '#ef4444',
};
const LIGHT_COLORS = { red: '#ef4444', yellow: '#eab308', green: '#22c55e' };
export const MODELS = {
  fast: { file: 'models/yolox_nano.onnx', size: 416 },
  detailed: { file: 'models/yolox_s.onnx', size: 640 },
};
const sessions = {};
let running = false;
let timer = null;
let els = null;

const modeName = () => (settings.detail === 'detailed' ? 'detailed' : 'fast');

// Loads (once) the model for the chosen detail level.
async function loadModel(mode) {
  if (!sessions[mode]) {
    sessions[mode] = (async () => {
      await loadScript('vendor/ort/ort.wasm.min.js');
      const ort = window.ort;
      ort.env.wasm.wasmPaths = new URL('vendor/ort/', location.href).href;
      ort.env.wasm.numThreads = 1;
      return ort.InferenceSession.create(MODELS[mode].file, { executionProviders: ['wasm'] });
    })();
    sessions[mode].catch(() => { delete sessions[mode]; });
  }
  return sessions[mode];
}

// video: <video>, overlay: <canvas> laid over it.
export async function startVision(video, overlay) {
  if (running) return;
  running = true;
  els = { video, overlay };
  emit('vision-status', { state: 'starting' });
  try {
    await openCamera(video, 'environment');
  } catch (e) {
    running = false;
    emit('vision-status', { state: 'error', message: e.name === 'NotAllowedError' ? 'Camera permission is off' : e.message });
    return;
  }
  try {
    await loadModel(modeName());
  } catch (e) {
    console.warn('[vision]', e);
    emit('vision-status', { state: 'error', message: 'Road reading isn’t available on this device' });
    return;
  }
  emit('vision-status', { state: 'running' });
  loop();
}

export function stopVision() {
  running = false;
  clearTimeout(timer);
  if (els) {
    closeCamera(els.video);
    els.overlay.getContext('2d').clearRect(0, 0, els.overlay.width, els.overlay.height);
  }
  emit('vision-status', { state: 'off' });
  emit('vision', null);
}

export const visionRunning = () => running;

const input = document.createElement('canvas');
const inCtx = input.getContext('2d', { willReadFrequently: true });
const frame = document.createElement('canvas');
const frCtx = frame.getContext('2d', { willReadFrequently: true });

async function loop() {
  if (!running) return;
  const t0 = performance.now();
  try {
    await detectOnce();
  } catch (e) {
    console.warn('[vision] frame failed', e);
  }
  // ~4 frames a second at most; leaves the phone cool and the battery alive.
  timer = setTimeout(loop, Math.max(60, 250 - (performance.now() - t0)));
}

async function detectOnce() {
  const { video, overlay } = els;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw) return;
  const mode = modeName();
  let session;
  try {
    session = await loadModel(mode); // switching detail level loads the other model on first use
  } catch (e) {
    console.warn('[vision] model', e);
    emit('vision-status', { state: 'running', message: 'Detailed mode isn’t available on this device; using Fast.' });
    settings.detail = 'fast';
    return;
  }
  if (!running) return;
  const size = MODELS[mode].size;
  const t0 = performance.now();

  const lb = letterbox(vw, vh, size);
  if (input.width !== size) input.width = input.height = size;
  inCtx.fillStyle = 'rgb(114,114,114)';
  inCtx.fillRect(0, 0, size, size);
  inCtx.drawImage(video, 0, 0, lb.w, lb.h);
  const tensor = new window.ort.Tensor('float32', toTensor(inCtx.getImageData(0, 0, size, size).data, size), [1, 3, size, size]);
  const out = await session.run({ [session.inputNames[0]]: tensor });
  const raw = out[session.outputNames[0]].data;
  const boxes = nms(decode(raw, size)).map((b) => ({
    ...b, kind: kindOf(b.cls),
    x1: b.x1 / lb.r, y1: b.y1 / lb.r, x2: b.x2 / lb.r, y2: b.y2 / lb.r,
  }));

  // Read the colour of each traffic light from the full-resolution frame.
  frame.width = vw;
  frame.height = vh;
  frCtx.drawImage(video, 0, 0);
  const lights = boxes.filter((b) => b.kind === 'light');
  for (const b of lights) {
    const x = Math.max(0, Math.floor(b.x1));
    const y = Math.max(0, Math.floor(b.y1));
    const w = Math.min(vw - x, Math.ceil(b.x2 - b.x1));
    const h = Math.min(vh - y, Math.ceil(b.y2 - b.y1));
    if (w > 2 && h > 2) b.color = lightColor(frCtx.getImageData(x, y, w, h).data);
  }
  const main = mainLight(lights, vw, vh);
  // Positions for the 3D view, as fractions of the frame.
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const scene = boxes.filter((b) => b.kind).slice(0, 24)
    .map((b) => ({ k: b.kind, b: [r3(b.x1 / vw), r3(b.y1 / vh), r3(b.x2 / vw), r3(b.y2 / vh)], c: b.color ?? null }));

  drawBoxes(overlay, containRect(video), boxes);
  emit('vision', { counts: countKinds(boxes), light: main?.color ?? null, boxes: scene, aspect: vw / vh, ms: performance.now() - t0, mode });
}

// Draws each detection with its label, e.g. "Truck 82%" or "Red light". rect maps
// frame pixels to the canvas: {x, y, s}.
export function drawBoxes(canvas, rect, boxes) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 2.5;
  ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textBaseline = 'middle';
  for (const b of boxes) {
    if (!b.kind) continue;
    const color = b.kind === 'light' ? LIGHT_COLORS[b.color] ?? COLORS.light : COLORS[b.kind];
    const x = rect.x + b.x1 * rect.s;
    const y = rect.y + b.y1 * rect.s;
    const w = (b.x2 - b.x1) * rect.s;
    const h = (b.y2 - b.y1) * rect.s;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.stroke();
    const text = `${labelOf(b)} ${Math.round(b.score * 100)}%`;
    const tw = ctx.measureText(text).width + 10;
    const ty = y > 20 ? y - 19 : y + h + 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - 1.25, ty, tw, 17, 4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(text, x + 4, ty + 9);
  }
}
