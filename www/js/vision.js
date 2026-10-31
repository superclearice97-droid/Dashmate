// Road reading (experimental): the camera spots cars, people and traffic lights
// with the YOLOX-Nano model, entirely on this device. No image ever leaves it.
import { emit } from './bus.js';
import { openCamera, closeCamera, loadScript, containRect } from './camera.js';
import { INPUT, letterbox, toTensor, decode, nms, kindOf, countKinds, mainLight, lightColor } from './core/vision-math.js';

const COLORS = { car: '#3b82f6', person: '#f59e0b', light: '#22c55e', stop: '#ef4444' };
let session = null;
let running = false;
let timer = null;
let els = null;

async function loadModel() {
  if (session) return session;
  await loadScript('vendor/ort/ort.wasm.min.js');
  const ort = window.ort;
  ort.env.wasm.wasmPaths = new URL('vendor/ort/', location.href).href;
  ort.env.wasm.numThreads = 1;
  session = await ort.InferenceSession.create('models/yolox_nano.onnx', { executionProviders: ['wasm'] });
  return session;
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
    await loadModel();
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
input.width = input.height = INPUT;
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
  if (!vw || !session) return;

  const lb = letterbox(vw, vh);
  inCtx.fillStyle = 'rgb(114,114,114)';
  inCtx.fillRect(0, 0, INPUT, INPUT);
  inCtx.drawImage(video, 0, 0, lb.w, lb.h);
  const tensor = new window.ort.Tensor('float32', toTensor(inCtx.getImageData(0, 0, INPUT, INPUT).data), [1, 3, INPUT, INPUT]);
  const out = await session.run({ [session.inputNames[0]]: tensor });
  const raw = out[session.outputNames[0]].data;
  const boxes = nms(decode(raw)).map((b) => ({
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
  const scene = boxes.filter((b) => ['car', 'person', 'light'].includes(b.kind)).slice(0, 20)
    .map((b) => ({ k: b.kind, b: [r3(b.x1 / vw), r3(b.y1 / vh), r3(b.x2 / vw), r3(b.y2 / vh)], c: b.color ?? null }));

  draw(overlay, video, boxes);
  emit('vision', { counts: countKinds(boxes), light: main?.color ?? null, boxes: scene, aspect: vw / vh });
}

function draw(canvas, video, boxes) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const r = containRect(video);
  ctx.lineWidth = 2.5;
  for (const b of boxes) {
    if (!b.kind) continue;
    ctx.strokeStyle = b.kind === 'light' && b.color === 'red' ? '#ef4444' : COLORS[b.kind];
    const x = r.x + b.x1 * r.s;
    const y = r.y + b.y1 * r.s;
    ctx.beginPath();
    ctx.roundRect(x, y, (b.x2 - b.x1) * r.s, (b.y2 - b.y1) * r.s, 6);
    ctx.stroke();
  }
}
