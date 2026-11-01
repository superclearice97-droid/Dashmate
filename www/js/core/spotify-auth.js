// Pure helpers for "Connect Spotify": the PKCE sign-in (no secret is ever stored in the
// app) and turning Spotify's playback state into what DashMate's media card shows.

export const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
];

const B64URL = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

export function randomString(length = 64) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

// RFC 7636 S256 code challenge.
export async function pkceChallenge(verifier) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return B64URL(new Uint8Array(hash));
}

export function authorizeUrl({ clientId, redirectUri, challenge, state }) {
  const p = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: SCOPES.join(' '),
  });
  return `https://accounts.spotify.com/authorize?${p}`;
}

// The link Spotify's sign-in sends back (via the relay page): dashmate://spotify-callback?code=…&state=…
// Returns {code} or {error}.
export function parseCallback(url, expectedState) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return { error: 'Bad sign-in link' };
  }
  const q = u.searchParams;
  if (q.get('error')) return { error: q.get('error') === 'access_denied' ? 'Spotify sign-in was cancelled' : `Spotify said: ${q.get('error')}` };
  if (!expectedState || q.get('state') !== expectedState) return { error: 'This sign-in link is out of date. Try Connect Spotify again.' };
  const code = q.get('code');
  if (!code || !/^[\w-]{10,1000}$/.test(code)) return { error: 'Bad sign-in link' };
  return { code };
}

// Access tokens last an hour; renew a minute early.
export const tokenExpired = (tok, now = Date.now()) => !tok?.access || now > tok.expires - 60000;

export function tokenFromResponse(json, previous = null, now = Date.now()) {
  if (!json?.access_token) throw new Error('Spotify didn’t return a token');
  return {
    access: json.access_token,
    refresh: json.refresh_token || previous?.refresh || null, // a refresh may not return a new refresh token
    expires: now + (Number(json.expires_in) || 3600) * 1000,
  };
}

// Album art closest to 300 px.
export function pickArt(images) {
  if (!Array.isArray(images) || !images.length) return null;
  return [...images].sort((a, b) => Math.abs((a.width || 300) - 300) - Math.abs((b.width || 300) - 300))[0].url || null;
}

// GET /me/player response (or null for "nothing playing") -> media card data.
export function toNowPlaying(state) {
  const item = state?.item;
  if (!item) return { active: false };
  const isEpisode = item.type === 'episode';
  return {
    active: true,
    app: 'Spotify',
    title: item.name || '',
    artist: isEpisode ? item.show?.name || '' : (item.artists || []).map((a) => a.name).join(', '),
    album: isEpisode ? '' : item.album?.name || '',
    artwork: pickArt(isEpisode ? item.images : item.album?.images),
    playing: !!state.is_playing,
    position: (state.progress_ms || 0) / 1000,
    duration: (item.duration_ms || 0) / 1000,
    device: state.device?.name || '',
    link: item.external_urls?.spotify || null,
  };
}
