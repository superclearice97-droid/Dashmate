import test from 'node:test';
import assert from 'node:assert/strict';

import { pkceChallenge, randomString, authorizeUrl, parseCallback, tokenExpired, tokenFromResponse, toNowPlaying, pickArt, SCOPES } from '../www/js/core/spotify-auth.js';
import { pickSource } from '../www/js/core/media-source.js';

test('spotify: PKCE challenge matches RFC 7636 example', async () => {
  assert.equal(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  const v = randomString(64);
  assert.match(v, /^[A-Za-z0-9\-._~]{64}$/);
  assert.notEqual(v, randomString(64));
});

test('spotify: sign-in link has PKCE, state and only the needed scopes', () => {
  const u = new URL(authorizeUrl({ clientId: 'abc', redirectUri: 'https://x.github.io/Dashmate/spotify-callback.html', challenge: 'ch', state: 'st' }));
  assert.equal(u.origin + u.pathname, 'https://accounts.spotify.com/authorize');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('state'), 'st');
  assert.equal(u.searchParams.get('scope'), SCOPES.join(' '));
  assert.ok(!SCOPES.some((s) => /email|private-read|follow|library-modify/.test(s) && s !== 'playlist-read-private'));
});

test('spotify: callback must carry the state we sent', () => {
  assert.deepEqual(parseCallback('dashmate://spotify-callback?code=AQB_abc-123xyz&state=s1', 's1'), { code: 'AQB_abc-123xyz' });
  assert.match(parseCallback('dashmate://spotify-callback?code=AQB_abc-123xyz&state=evil', 's1').error, /out of date/);
  assert.match(parseCallback('dashmate://spotify-callback?error=access_denied&state=s1', 's1').error, /cancelled/);
  assert.match(parseCallback('dashmate://spotify-callback?code=<script>&state=s1', 's1').error, /Bad/);
  assert.match(parseCallback('not a url', 's1').error, /Bad/);
  assert.match(parseCallback('dashmate://spotify-callback?code=AQB_abc-123xyz&state=s1', null).error, /out of date/);
});

test('spotify: tokens refresh a minute early and keep the refresh token', () => {
  const t = tokenFromResponse({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }, null, 0);
  assert.deepEqual(t, { access: 'a', refresh: 'r', expires: 3600000 });
  assert.equal(tokenExpired(t, 3500000), false);
  assert.equal(tokenExpired(t, 3550000), true);
  assert.equal(tokenExpired(null), true);
  assert.equal(tokenFromResponse({ access_token: 'b', expires_in: 3600 }, t, 0).refresh, 'r', 'kept when not renewed');
  assert.throws(() => tokenFromResponse({}), /token/);
});

test('spotify: playback state to media card', () => {
  assert.deepEqual(toNowPlaying(null), { active: false });
  const track = toNowPlaying({
    is_playing: true, progress_ms: 30500, device: { name: 'iPad' },
    item: {
      type: 'track', name: 'Night Drive', duration_ms: 200000, artists: [{ name: 'A' }, { name: 'B' }],
      album: { name: 'Album', images: [{ url: 'big', width: 640 }, { url: 'mid', width: 300 }, { url: 'small', width: 64 }] },
      external_urls: { spotify: 'https://open.spotify.com/track/1' },
    },
  });
  assert.deepEqual(track, { active: true, app: 'Spotify', title: 'Night Drive', artist: 'A, B', album: 'Album', artwork: 'mid', playing: true, position: 30.5, duration: 200, device: 'iPad', link: 'https://open.spotify.com/track/1' });
  const ep = toNowPlaying({ is_playing: false, item: { type: 'episode', name: 'Ep 1', duration_ms: 1000, show: { name: 'Pod' }, images: [{ url: 'p' }] } });
  assert.equal(ep.artist, 'Pod');
  assert.equal(ep.artwork, 'p');
  assert.equal(pickArt([]), null);
});

test('music: source choice with Spotify', () => {
  const on = (playing) => ({ active: true, playing });
  assert.equal(pickSource({ track: {}, playing: true }, on(true), on(true)), 'local');
  assert.equal(pickSource({ track: {}, playing: false }, on(false), on(true)), 'spotify', 'Spotify playing elsewhere');
  assert.equal(pickSource({ track: null, playing: false }, on(true), on(true)), 'system', 'the app on this device first');
  assert.equal(pickSource({ track: {}, playing: false }, null, on(false)), 'local', 'nothing playing: own songs');
  assert.equal(pickSource({ track: null, playing: false }, null, on(false)), 'spotify');
});
