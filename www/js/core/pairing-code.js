// Packs a WebRTC session description into a short text for a QR code, and back.
// The description carries the DTLS fingerprint, so scanning the code is what
// authenticates the other device: the link is encrypted end to end and no
// server is involved.

const PREFIX = 'DM1:';

// Drop TCP candidates: they are never used on a local hotspot and make the code bigger.
export function minifySdp(sdp) {
  return sdp
    .split(/\r?\n/)
    .filter((l) => l && !(l.startsWith('a=candidate:') && / tcp /i.test(l)))
    .join('\r\n') + '\r\n';
}

async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toB64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(text) {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

// desc: {type: 'offer'|'answer', sdp}
export async function encodeDescription(desc) {
  const json = JSON.stringify({ t: desc.type === 'offer' ? 'o' : 'a', s: minifySdp(desc.sdp) });
  const packed = await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw'));
  return PREFIX + toB64url(packed);
}

export async function decodeDescription(text) {
  if (typeof text !== 'string' || !text.startsWith(PREFIX)) throw new Error('Not a DashMate pairing code');
  const bytes = await pipe(fromB64url(text.slice(PREFIX.length)), new DecompressionStream('deflate-raw'));
  const { t, s } = JSON.parse(new TextDecoder().decode(bytes));
  if ((t !== 'o' && t !== 'a') || typeof s !== 'string' || !s.startsWith('v=0')) throw new Error('Damaged pairing code');
  return { type: t === 'o' ? 'offer' : 'answer', sdp: s };
}
