// Cross-checks the phone's packet code (Java) against Node's own AES-256-GCM, so the
// format is pinned by two independent implementations. Skipped if no Java compiler.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const src = join(root, 'plugins/dashmate-media/android/src/main/java/io/github/superclearice97/dashmate/media/BeaconPacket.java');
let out = null;
try {
  out = mkdtempSync(join(tmpdir(), 'beacon-'));
  execFileSync('javac', ['-d', out, src, join(root, 'test/java/BeaconPacketCheck.java')], { stdio: 'pipe' });
} catch {
  out = null;
}
if (!out && process.env.DASHMATE_REQUIRE_JAVA) throw new Error('javac is needed for the beacon tests');
const java = (...args) => execFileSync('java', ['-cp', out, 'BeaconPacketCheck', ...args], { encoding: 'utf8' }).trim();

function nodeSeal(key, counter, nonce, json) {
  const header = Buffer.alloc(12);
  header.write('DMB1', 0, 'ascii');
  header.writeBigInt64BE(BigInt(counter), 4);
  const c = createCipheriv('aes-256-gcm', key, nonce);
  c.setAAD(header);
  const body = Buffer.concat([c.update(json, 'utf8'), c.final(), c.getAuthTag()]);
  return Buffer.concat([header, nonce, body]);
}

function nodeOpen(key, packet) {
  const header = packet.subarray(0, 12);
  const d = createDecipheriv('aes-256-gcm', key, packet.subarray(12, 24));
  d.setAAD(header);
  d.setAuthTag(packet.subarray(packet.length - 16));
  return Buffer.concat([d.update(packet.subarray(24, packet.length - 16)), d.final()]).toString('utf8');
}

const key = Buffer.from([...Array(32).keys()]);
const nonce = Buffer.from([...Array(12).keys()].map((i) => 200 + i));
const json = '{"lat":41.8781000,"lon":-87.6298000,"acc":4.500000,"spd":13.400000,"hdg":null,"t":1700000000000}';

test('beacon: Java packets are byte-identical to an independent AES-256-GCM', { skip: !out && 'no javac' }, () => {
  const fromJava = java('seal', key.toString('hex'), '1700000000000123', nonce.toString('hex'), json);
  assert.equal(fromJava, nodeSeal(key, 1700000000000123n, nonce, json).toString('hex'));
  assert.equal(nodeOpen(key, Buffer.from(fromJava, 'hex')), json);
});

test('beacon: Java opens Node packets and rejects tampering, wrong keys and junk', { skip: !out && 'no javac' }, () => {
  const p = nodeSeal(key, 42n, randomBytes(12), json);
  assert.equal(java('open', key.toString('hex'), p.toString('hex')), `42 ${json}`);
  const flipped = Buffer.from(p);
  flipped[30] ^= 1; // ciphertext
  assert.equal(java('open', key.toString('hex'), flipped.toString('hex')), 'REJECTED');
  const counterChanged = Buffer.from(p);
  counterChanged[11] ^= 1; // the counter is authenticated too
  assert.equal(java('open', key.toString('hex'), counterChanged.toString('hex')), 'REJECTED');
  assert.equal(java('open', randomBytes(32).toString('hex'), p.toString('hex')), 'REJECTED');
  assert.equal(java('open', key.toString('hex'), 'deadbeef'), 'REJECTED');
});

test('beacon: position JSON and replay protection', { skip: !out && 'no javac' }, () => {
  assert.deepEqual(JSON.parse(java('fix')), { lat: 41.8781, lon: -87.6298, acc: 4.5, spd: 13.4, hdg: null, t: 1700000000000 });
  assert.equal(java('replay'), 'true true false false true');
});

test('beacon: only sends to private IPv4 literals, never host names or public addresses', { skip: !out && 'no javac' }, () => {
  const cases = {
    '172.20.10.2': 'y', '192.168.43.17': 'y', '10.0.0.5': 'y', '169.254.3.4': 'y', '172.31.255.1': 'y',
    '8.8.8.8': 'n', '172.32.0.1': 'n', '100.64.1.1': 'n', '127.0.0.1': 'n', '256.1.1.1': 'n',
    'example.com': 'n', '192.168.1': 'n', '::1': 'n', '192.168.1.1.1': 'n',
  };
  assert.equal(java('ip', ...Object.keys(cases)), Object.values(cases).join(''));
});

test('beacon: the phone sweeps its own hotspot network, never more than 254 addresses', { skip: !out && 'no javac' }, () => {
  assert.equal(java('sweep', '192.168.43.1', '24'), '253 2 254'); // Android hotspot, all but itself
  assert.equal(java('sweep', '172.20.10.1', '28'), '13 2 14'); // iPhone hotspot (a /28)
  assert.equal(java('sweep', '10.5.4.9', '8'), '253 1 254', 'a huge network is limited to its /24');
  assert.equal(java('sweep', '8.8.8.8', '24'), '0', 'public addresses are never swept');
});

test('beacon: any phone’s hotspot interface name is searched; mobile data and tunnels are not', { skip: !out && 'no javac' }, () => {
  const cases = { ap0: 'y', swlan0: 'y', wlan1: 'y', wlan0: 'y', ap_br_wlan2: 'y', rndis0: 'y', 'bt-pan': 'y', rmnet_data0: 'n', ccmni0: 'n', lo: 'n', dummy0: 'n', tun0: 'n', ccmni1: 'n' };
  assert.equal(java('iface', ...Object.keys(cases)), Object.values(cases).join(''));
});
