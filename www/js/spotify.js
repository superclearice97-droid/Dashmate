// "Connect Spotify": control Spotify on any of your devices through your Spotify account.
// Optional and off until you connect. Sent to Spotify: your sign-in (on Spotify's own page)
// and play/pause/skip commands; DashMate asks Spotify what's playing every few seconds while
// the app is open. Tokens are kept only on this device. Playback control needs Spotify Premium.
import { emit } from './bus.js';
import { SPOTIFY_CLIENT_ID, SPOTIFY_REDIRECT_URI } from './spotify-config.js';
import { randomString, pkceChallenge, authorizeUrl, parseCallback, tokenExpired, tokenFromResponse, toNowPlaying } from './core/spotify-auth.js';

const TOKEN_KEY = 'dashmate.spotify.v1';
const PENDING_KEY = 'dashmate.spotify.pending';
const API = 'https://api.spotify.com/v1';
let token = load(TOKEN_KEY);
let timer = null;
let current = { active: false };
let lastError = '';

function load(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function store(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage blocked: stays signed in for this session only */ }
}

export const spotifyConfigured = () => !!SPOTIFY_CLIENT_ID;
export const spotifyConnected = () => !!token?.refresh;
export const spotifyNow = () => current;
export const spotifyError = () => lastError;

function status() {
  emit('spotify-status', { configured: spotifyConfigured(), connected: spotifyConnected(), error: lastError });
}

// Step 1: open Spotify's sign-in page in the browser.
export async function connectSpotify(openUrl) {
  if (!spotifyConfigured()) return;
  const verifier = randomString(64);
  const state = randomString(24);
  store(PENDING_KEY, { verifier, state, at: Date.now() });
  openUrl(authorizeUrl({ clientId: SPOTIFY_CLIENT_ID, redirectUri: SPOTIFY_REDIRECT_URI, challenge: await pkceChallenge(verifier), state }));
}

async function tokenRequest(params) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: SPOTIFY_CLIENT_ID, ...params }),
    credentials: 'omit',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error_description || json.error || `Spotify said ${res.status}`);
  return json;
}

// Step 2: the app was opened with dashmate://spotify-callback?code=…&state=…
export async function handleSpotifyCallback(url) {
  const pending = load(PENDING_KEY);
  store(PENDING_KEY, null);
  const r = parseCallback(url, pending && Date.now() - pending.at < 15 * 60000 ? pending.state : null);
  if (r.error) {
    lastError = r.error;
    status();
    return false;
  }
  try {
    const json = await tokenRequest({ grant_type: 'authorization_code', code: r.code, redirect_uri: SPOTIFY_REDIRECT_URI, code_verifier: pending.verifier });
    token = tokenFromResponse(json);
    store(TOKEN_KEY, token);
    lastError = '';
    status();
    poll();
    return true;
  } catch (e) {
    lastError = e.message;
    status();
    return false;
  }
}

export function disconnectSpotify() {
  token = null;
  store(TOKEN_KEY, null);
  current = { active: false };
  emit('spotify-music', current);
  status();
}

async function accessToken() {
  if (!token) throw new Error('Spotify isn’t connected');
  if (tokenExpired(token)) {
    try {
      token = tokenFromResponse(await tokenRequest({ grant_type: 'refresh_token', refresh_token: token.refresh }), token);
      store(TOKEN_KEY, token);
    } catch (e) {
      if (/invalid_grant|revoked/i.test(e.message)) disconnectSpotify(); // access was removed on Spotify's side
      throw e;
    }
  }
  return token.access;
}

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'omit',
  });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const reason = json?.error?.reason || '';
    if (res.status === 403 || reason === 'PREMIUM_REQUIRED') throw new Error('Controlling Spotify needs Spotify Premium (or your account isn’t added to DashMate’s Spotify app yet).');
    if (res.status === 404 || reason === 'NO_ACTIVE_DEVICE') throw new Error('Open Spotify on one of your devices first.');
    if (res.status === 429) throw new Error('Spotify asked DashMate to slow down; try again in a moment.');
    throw new Error(json?.error?.message || `Spotify said ${res.status}`);
  }
  return json;
}

async function poll() {
  clearTimeout(timer);
  if (spotifyConnected() && !document.hidden) {
    try {
      current = toNowPlaying(await api('GET', '/me/player?additional_types=episode'));
      emit('spotify-music', current);
    } catch (e) {
      console.warn('[spotify]', e.message);
    }
  }
  timer = setTimeout(poll, spotifyConnected() ? 3000 : 30000);
}

export function initSpotify() {
  status();
  if (spotifyConnected()) poll();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && spotifyConnected()) poll(); });
}

// action: 'toggle' | 'next' | 'previous'
export async function controlSpotify(action) {
  try {
    if (action === 'toggle') await api('PUT', current.playing ? '/me/player/pause' : '/me/player/play');
    else if (action === 'next') await api('POST', '/me/player/next');
    else if (action === 'previous') await api('POST', '/me/player/previous');
  } catch (e) {
    emit('spotify-error', e.message);
  }
  setTimeout(poll, 400);
}

export async function spotifyPlaylists() {
  const json = await api('GET', '/me/playlists?limit=50');
  return (json?.items || []).filter(Boolean).map((p) => ({ uri: p.uri, name: p.name, count: p.items?.total ?? p.tracks?.total ?? 0, link: p.external_urls?.spotify }));
}

// Start a playlist on the active device, or on the first available one.
export async function playSpotifyPlaylist(uri) {
  try {
    await api('PUT', '/me/player/play', { context_uri: uri });
  } catch (e) {
    if (!/Open Spotify/.test(e.message)) return emit('spotify-error', e.message);
    try {
      const devices = (await api('GET', '/me/player/devices'))?.devices || [];
      if (!devices.length) throw e;
      await api('PUT', `/me/player/play?device_id=${encodeURIComponent(devices[0].id)}`, { context_uri: uri });
    } catch (err) {
      emit('spotify-error', err.message);
    }
  }
  setTimeout(poll, 600);
}
