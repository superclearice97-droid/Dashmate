import test from 'node:test';
import assert from 'node:assert/strict';

import { letterbox, toTensor, decode, nms, iou, lightColor, mainLight, countKinds, summarize, labelOf, kindOf, COCO, INPUT } from '../www/js/core/vision-math.js';
import { encodeDescription, decodeDescription, minifySdp } from '../www/js/core/pairing-code.js';

test('vision: letterbox and tensor layout', () => {
  assert.deepEqual(letterbox(640, 480), { r: 0.65, w: 416, h: 312 });
  const rgba = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255, 1, 2, 3, 255, 4, 5, 6, 255]);
  // 2x2 image -> planar B, G, R
  assert.deepEqual([...toTensor(rgba, 2)], [30, 60, 3, 6, 20, 50, 2, 5, 10, 40, 1, 4]);
});

test('vision: decode one strong anchor into a box', () => {
  const anchors = (INPUT / 8) ** 2 + (INPUT / 16) ** 2 + (INPUT / 32) ** 2;
  assert.equal(anchors, 3549);
  const data = new Float32Array(anchors * 85);
  // stride-8 grid cell (gx=10, gy=20) -> anchor index 20*52+10
  const a = 20 * 52 + 10;
  data.set([0.5, 0.5, Math.log(4), Math.log(2), 0.9], a * 85);
  data[a * 85 + 5 + COCO.car] = 0.8;
  data[a * 85 + 5 + 50] = 0.99; // a class we don't care about (broccoli) is ignored
  const boxes = decode(data);
  assert.equal(boxes.length, 1);
  const b = boxes[0];
  assert.equal(b.cls, COCO.car);
  assert.ok(Math.abs(b.score - 0.72) < 1e-6);
  assert.deepEqual([b.x1, b.y1, b.x2, b.y2].map((v) => Math.round(v)), [68, 156, 100, 172]);
});

test('vision: nms keeps the best of overlapping boxes per class', () => {
  const A = { x1: 0, y1: 0, x2: 10, y2: 10, score: 0.9, cls: 2 };
  const B = { x1: 1, y1: 1, x2: 11, y2: 11, score: 0.8, cls: 2 };
  const C = { x1: 1, y1: 1, x2: 11, y2: 11, score: 0.7, cls: 0 };
  assert.ok(iou(A, B) > 0.6);
  assert.deepEqual(nms([B, A, C]), [A, C]);
  const c = countKinds([A, C, { cls: COCO.trafficLight }, { cls: COCO.truck }]);
  assert.deepEqual([c.car, c.truck, c.person, c.light, c.bus], [1, 1, 1, 1, 0]);
});

function crop(color, lit = 40, total = 400) {
  const px = new Uint8ClampedArray(total * 4);
  for (let i = 0; i < total; i++) px.set(i < lit ? color : [20, 20, 25], i * 4), (px[i * 4 + 3] = 255);
  return px;
}

test('vision: identifies each street object by type', () => {
  const expect = { person: 'person', bicycle: 'bicycle', car: 'car', motorcycle: 'motorcycle', bus: 'bus', train: 'tram',
    truck: 'truck', trafficLight: 'light', stopSign: 'stop', cat: 'animal', dog: 'animal', horse: 'animal' };
  for (const [name, kind] of Object.entries(expect)) assert.equal(kindOf(COCO[name]), kind, name);
  assert.equal(kindOf(50), null, 'broccoli is not a street object');
  assert.equal(labelOf({ cls: COCO.dog }), 'Dog');
  assert.equal(labelOf({ cls: COCO.trafficLight, color: 'red' }), 'Red light');
  assert.equal(labelOf({ cls: COCO.trafficLight }), 'Traffic light');
  assert.equal(labelOf({ cls: COCO.stopSign }), 'Stop sign');
  assert.equal(labelOf({ cls: COCO.train }), 'Tram or train');
  assert.equal(labelOf({ cls: COCO.truck }), 'Truck');
});

test('vision: chip summaries in a fixed order with plurals', () => {
  const counts = countKinds([{ k: 'person' }, { k: 'car' }, { k: 'person' }, { k: 'bus' }, { k: 'bicycle' }, { k: 'stop' }, { k: 'person' }]);
  assert.deepEqual(summarize(counts), ['1 car', '1 bus', '1 bike', '3 people', '1 stop sign']);
  assert.deepEqual(summarize(countKinds([])), []);
  assert.deepEqual(summarize({ bus: 2, light: 1 }), ['2 buses', '1 light']);
});

test('vision: traffic light colour', () => {
  assert.equal(lightColor(crop([255, 40, 30])), 'red');
  assert.equal(lightColor(crop([40, 255, 170])), 'green');
  assert.equal(lightColor(crop([255, 190, 20])), 'yellow');
  assert.equal(lightColor(crop([255, 40, 30], 2)), null, 'too few lit pixels');
  assert.equal(lightColor(crop([20, 20, 25])), null, 'dark');
});

test('vision: picks the light ahead, not one at the edge', () => {
  const lights = [
    { x1: 10, y1: 50, x2: 40, y2: 120 },    // far left edge
    { x1: 300, y1: 60, x2: 320, y2: 100 },  // centre, small
    { x1: 350, y1: 40, x2: 380, y2: 110 },  // centre, bigger
    { x1: 300, y1: 400, x2: 340, y2: 470 }, // too low
  ];
  assert.equal(mainLight(lights, 640, 480).x1, 350);
  assert.equal(mainLight([], 640, 480), null);
});

const SDP = [
  'v=0', 'o=- 4611 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
  'a=candidate:1 1 udp 2122260223 172.20.10.2 53412 typ host generation 0',
  'a=candidate:2 1 tcp 1518280447 172.20.10.2 9 typ host tcptype active generation 0',
  'a=ice-ufrag:abcd', 'a=ice-pwd:0123456789abcdefghijklmn',
  'a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
  'a=setup:actpass', 'a=mid:0', 'a=sctp-port:5000',
].join('\r\n') + '\r\n';

test('pairing: code round trip keeps the fingerprint and drops TCP candidates', async () => {
  assert.ok(!minifySdp(SDP).includes(' tcp '));
  const code = await encodeDescription({ type: 'offer', sdp: SDP });
  assert.match(code, /^DM1:[A-Za-z0-9_-]+$/);
  assert.ok(code.length < SDP.length, 'compressed');
  const back = await decodeDescription(code);
  assert.equal(back.type, 'offer');
  assert.equal(back.sdp, minifySdp(SDP));
  assert.ok(back.sdp.includes('a=fingerprint:sha-256 AA:BB'));
  await assert.rejects(decodeDescription('https://example.com'), /Not a DashMate/);
  await assert.rejects(decodeDescription('DM1:AAAA'));
});
