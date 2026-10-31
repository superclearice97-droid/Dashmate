// Copies the third-party browser files the app needs from node_modules into
// www/vendor, and downloads the object-detection model into www/models.
// Nothing here is committed to git: it is rebuilt from pinned package versions
// (package.json) and a checksum-verified model download on every build.
//
//   node scripts/vendor.mjs            -> warn about anything missing
//   node scripts/vendor.mjs --strict   -> fail on anything missing (CI)

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict');

const FILES = [
  ['maplibre-gl/dist/maplibre-gl.js', 'maplibre/maplibre-gl.js'],
  ['maplibre-gl/dist/maplibre-gl.css', 'maplibre/maplibre-gl.css'],
  ['three/build/three.module.min.js', 'three/three.module.min.js'],
  ['three/build/three.core.min.js', 'three/three.core.min.js'],
  ['jsqr/dist/jsQR.js', 'jsqr/jsQR.js'],
  ['qrcode-generator/dist/qrcode.mjs', 'qrcode/qrcode.mjs'],
  ['onnxruntime-web/dist/ort.wasm.min.js', 'ort/ort.wasm.min.js'],
  ['onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', 'ort/ort-wasm-simd-threaded.wasm'],
  ['onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', 'ort/ort-wasm-simd-threaded.mjs'],
];

// YOLOX-Nano, Apache-2.0, published by Megvii in the official YOLOX release.
const MODEL = {
  url: 'https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_nano.onnx',
  sha256: 'c789161ed43c8269fcd4e67c67eeeb4e80c622da2eb296a20bc6007bd18a0b7d',
  out: 'www/models/yolox_nano.onnx',
};

let missing = 0;
for (const [from, to] of FILES) {
  const src = join(root, 'node_modules', from);
  const dst = join(root, 'www/vendor', to);
  if (!existsSync(src)) {
    console.warn(`missing: node_modules/${from}`);
    missing++;
    continue;
  }
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const cached = join(root, '.cache/yolox_nano.onnx');
let model = existsSync(cached) ? readFileSync(cached) : null;
if (!model || sha(model) !== MODEL.sha256) {
  try {
    const res = await fetch(MODEL.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    model = Buffer.from(await res.arrayBuffer());
    mkdirSync(dirname(cached), { recursive: true });
    writeFileSync(cached, model);
  } catch (e) {
    console.warn(`could not download model: ${e.message}`);
    model = null;
  }
}
if (model && sha(model) === MODEL.sha256) {
  mkdirSync(join(root, 'www/models'), { recursive: true });
  writeFileSync(join(root, MODEL.out), model);
} else {
  console.warn('model missing or checksum mismatch');
  missing++;
}

if (missing && strict) {
  console.error(`${missing} vendor file(s) missing`);
  process.exit(1);
}
console.log(missing ? `vendor done with ${missing} missing` : 'vendor done');
