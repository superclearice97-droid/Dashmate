// DashMate: wires the dashboard, map, navigation, music, road reading and pairing together.
import { on, emit } from './bus.js';
import { settings, saveSettings, onSettings, TERMS_VERSION } from './settings.js';
import { speedValue, speedUnit, formatDistance, distanceText, spokenDistance, formatDuration, limitValue, MPS_TO_KMH } from './core/units.js';
import { distance } from './core/geo.js';
import { TripTracker } from './core/trip.js';
import { NavRoute } from './core/route.js';
import { SpeedWatcher, GreenLightWatcher, warningEffects } from './core/alerts.js';
import { TripLog } from './core/trips.js';
import { gpsQuality, linkProblem, sameVersion } from './core/gps.js';
import { initControls, openControls, closeControls, refreshControls, seg, bindFields, onlineFields } from './controls.js';
import { isDaytime } from './core/sun.js';
import { toScene, guessGear } from './core/scene.js';
import { summarize } from './core/vision-math.js';
import { startDeviceGps, startDemo, stopDemo, demoRunning, demoRoute, DEMO_LINE, demoRoadside } from './location.js';
import { updateRoadside, setDemoRoadside, cameraWarningsHere, camerasBannedIn, roadsideCount, currentCountry } from './roadside.js';
import { leadVehicle, timeGap, FollowWatcher } from './core/following.js';
import * as mapView from './map.js';
import { searchPlaces, fetchRoute, fetchRoad, fetchTemperature } from './services.js';
import * as music from './music.js';
import { chime, speak } from './sound.js';
import { startVision, stopVision, visionRunning } from './vision.js';
import { startAsScreen, finishAsScreen, startAsPhone, closeLink, linkRole, sendBeaconOffer, sendBeaconAck, sendHello } from './link.js';
import {
  listenForPhone, stopListening, hearingPhone, beaconListening, lastBeaconFix, beaconReceived, startSending, stopSending,
  beaconSending, beaconConfirmed, markConfirmed, refreshSending, sendStatus, platform,
} from './beacon.js';
import { openCamera, closeCamera, loadScript } from './camera.js';
import { qrSvg, scanQr } from './qr.js';
import { initSystemMusic, systemStatus, systemNow, requestSystemAccess, controlSystem, systemPlaylists, playSystemPlaylist } from './media.js';
import { pickSource } from './core/media-source.js';
import { initSpotify, spotifyConfigured, spotifyConnected, spotifyNow, connectSpotify, disconnectSpotify, handleSpotifyCallback, controlSpotify, spotifyPlaylists, playSpotifyPlaylist } from './spotify.js';
import { pairLink, extractPairCode } from './core/pairing-code.js';
import { PRIVACY, TERMS, LICENSES } from './legal.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
const isNative = () => !!window.Capacitor?.isNativePlatform?.();

const trip = new TripTracker();
const speedWatch = new SpeedWatcher();
const greenWatch = new GreenLightWatcher();
const followWatch = new FollowWatcher();
let car3d = null;
let streetView = null;
let snap = trip.snapshot();
let lastFix = null;
let nav = null;
let navDest = null;
let rerouting = false;
let lastReroute = 0;
let road = { name: '', maxspeed: null };
let roadQuery = { pos: null, t: 0, busy: false };
let slowActive = false;
let goTimer = null;
let lastMovingAt = 0;
let lastControlsRefresh = 0;

// ---------------------------------------------------------------- layout & theme
function layout() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const phone = Math.min(w, h) < 600;
  const was = app.dataset.layout;
  app.dataset.layout = phone ? 'phone' : 'tablet';
  app.dataset.orient = h > w ? 'portrait' : 'landscape';
  if (was !== app.dataset.layout) setTab(phone ? 'dash' : 'dash');
  applyTheme();
  requestAnimationFrame(() => mapView.resizeMap());
}

function currentTheme() {
  if (settings.theme !== 'auto') return settings.theme;
  // Auto: day look from sunrise to sunset where you are; system setting until GPS is known.
  if (snap.pos) return isDaytime(new Date(), snap.pos[1], snap.pos[0]) ? 'light' : 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme() {
  const t = currentTheme();
  if (document.documentElement.dataset.theme === t && car3d) return;
  document.documentElement.dataset.theme = t;
  mapView.setMapTheme(t);
  car3d?.setTheme(t);
  streetView?.setTheme(t);
}

function setTab(tab) {
  const phone = app.dataset.layout === 'phone';
  if (!phone && app.dataset.tab === tab) tab = 'dash'; // tablet: tapping again closes the card
  app.dataset.tab = tab;
  $$('[data-tab]', $('#dock')).forEach((b) => b.classList.toggle('active', b.dataset.tab === tab && (phone || tab !== 'dash')));
  requestAnimationFrame(() => mapView.resizeMap());
}

// ---------------------------------------------------------------- small UI helpers
let toastTimer = null;
function toast(text, ms = 3200) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

let sheetCleanup = null;
function openSheet(html, mount) {
  closeSheet();
  const sheet = $('#sheet');
  const card = $('.sheet-card', sheet);
  card.innerHTML = html;
  sheet.hidden = false;
  sheetCleanup = mount?.(card) || null;
  return card;
}
function closeSheet() {
  const cleanup = sheetCleanup;
  sheetCleanup = null;
  cleanup?.();
  $('#sheet').hidden = true;
}
$('#sheet').addEventListener('click', (e) => {
  if (e.target.id === 'sheet' && !$('#sheet').dataset.locked) closeSheet();
});
const head = (title) => `<div class="sheet-head"><h2>${title}</h2><button class="icon" data-close aria-label="Close"><svg><use href="#i-close"/></svg></button></div>`;
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closeSheet();
});

const clockText = (d = new Date()) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !settings.time24 });
function tickClock() {
  $('#clock').textContent = clockText();
  $('#dock-clock').textContent = clockText().replace(/\s?[AP]M$/i, '');
  renderGear();
  applyTheme(); // sunrise / sunset
}

function renderGear() {
  const g = snap.pos ? guessGear(snap.speed, Date.now() - lastMovingAt) : 'P';
  $$('#gear span').forEach((el) => el.classList.toggle('on', el.textContent === g));
}

// ---------------------------------------------------------------- position updates
on('fix', (fix) => {
  snap = trip.update(fix);
  const pos = snap.pos;
  const units = settings.units;

  const firstFix = !lastFix;
  lastFix = fix;
  if (snap.speed > 0.5) lastMovingAt = Date.now();
  $('#speed').textContent = speedValue(snap.speed, units);
  renderGear();
  if (firstFix) applyTheme();

  const q = gpsQuality(fix.source, fix.accuracy);
  $('#gps-chip').innerHTML = `<i class="dot" style="background:${{ good: '#22c55e', weak: '#f59e0b', poor: '#ef4444' }[q.level]}"></i>${q.label}`;
  $('#gps-chip').dataset.level = q.level;

  updateTrips();
  if (Date.now() - lastControlsRefresh > 2000) {
    lastControlsRefresh = Date.now();
    refreshControls();
  }
  car3d?.setSpeed(snap.speed);
  streetView?.update(pos, snap.heading, snap.speed);
  mapView.updatePosition(pos, snap.heading, snap.speed);
  updateNav(pos, fix.accuracy);
  const onRoute = nav?.lastProgress && !nav.lastProgress.offRoute;
  updateRoadside({
    pos, heading: snap.heading, speed: snap.speed, odo: snap.distance,
    route: onRoute ? { line: nav.line, cum: nav.cum, along: nav.lastProgress.along } : null,
  });
  updateRoad(pos);
  checkSpeed();
  maybeWeather(pos);
});

on('gps-status', (s) => {
  if (!lastFix) $('#gps-chip').textContent = s.message;
});

// ---------------------------------------------------------------- speed limit & street
async function updateRoad(pos) {
  if (demoRunning()) {
    road = { name: nav?.steps[Math.max(0, (nav.lastNext || 1) - 1)]?.name || 'N State St', maxspeed: 30 * 1.609344 };
    renderRoad();
    return;
  }
  if (!settings.online.limits || roadQuery.busy) return;
  const moved = roadQuery.pos ? distance(roadQuery.pos, pos) : Infinity;
  const age = Date.now() - roadQuery.t;
  if (!(moved > 150 || (age > 30000 && moved > 25))) return;
  roadQuery = { pos, t: Date.now(), busy: true };
  try {
    const r = await fetchRoad(pos, snap.heading);
    road = r ? { name: r.name, maxspeed: r.maxspeed } : { name: road.name, maxspeed: null };
  } catch (e) {
    console.warn('[road]', e.message);
  } finally {
    roadQuery.busy = false;
  }
  renderRoad();
}

function renderRoad() {
  const navName = nav?.lastProgress?.step && nav.steps[Math.max(0, nav.lastProgress.next - 1)]?.name;
  $('#street').textContent = road.name || navName || '';
  const el = $('#limit');
  const v = limitValue(road.maxspeed, settings.units);
  el.hidden = v == null;
  if (v == null) return;
  el.className = `limit ${settings.units}${slowActive ? ' over' : ''}`;
  el.innerHTML = settings.units === 'imperial' ? `<small>SPEED<br>LIMIT</small><b>${v}</b>` : `${v}`;
}

function checkSpeed() {
  const tol = settings.overBy * (settings.units === 'imperial' ? 1.609344 : 1);
  const fx = warningEffects(settings.speedWarn);
  const r = speedWatch.update(snap.speed * MPS_TO_KMH, fx.show ? road.maxspeed : null, tol, Date.now());
  if (r.entered && fx.chime) chime('warn');
  if (r.active !== slowActive) {
    slowActive = r.active;
    renderRoad();
    renderAlert();
  }
}

// ---------------------------------------------------------------- alerts banner
let goActive = false;
let movingActive = false;
let closeActive = false;
let movingTimer = null;
function renderAlert() {
  const el = $('#alert');
  if (goActive) {
    el.className = 'alert go';
    el.innerHTML = '<span class="lamp"><i></i></span>Green · go';
    el.hidden = false;
  } else if (movingActive) {
    el.className = 'alert go';
    el.innerHTML = '<svg class="alert-icon"><use href="#i-car"/></svg>Traffic is moving';
    el.hidden = false;
  } else if (closeActive) {
    el.className = 'alert close';
    el.innerHTML = '<svg class="alert-icon"><use href="#i-car"/></svg>Too close';
    el.hidden = false;
  } else if (slowActive) {
    const v = limitValue(road.maxspeed, settings.units);
    el.className = 'alert slow';
    el.innerHTML = `<span class="mini-limit">${v ?? ''}</span>Slow down`;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

// ---------------------------------------------------------------- road reading results
function handleVision(v) {
  const chips = $('#vision-chips');
  const camChips = $('#cam-counts');
  if (!v) {
    chips.innerHTML = '';
    camChips.innerHTML = '';
    car3d?.setObjects([]);
    renderFollowing(null);
    return;
  }
  const parts = summarize(v.counts);
  const html = (parts.length ? parts : ['Nothing spotted']).map((t) => `<span class="chip">${esc(t)}</span>`).join('');
  chips.innerHTML = html;
  camChips.innerHTML = html;
  const scene = toScene(v.boxes, v.aspect);
  car3d?.setObjects(scene);
  if (greenWatch.update(v.light, snap.speed, Date.now()) === 'go' && settings.greenChime) {
    goActive = true;
    chime('go');
    renderAlert();
    clearTimeout(goTimer);
    goTimer = setTimeout(() => { goActive = false; renderAlert(); }, 4500);
  }
  renderFollowing(leadVehicle(scene));
}

// The car ahead in your lane: distance and time gap, "Too close", "Traffic is moving".
function renderFollowing(lead) {
  const chip = $('#lead-chip');
  const r = followWatch.update(lead, snap.speed, Date.now());
  if (!lead) chip.hidden = true;
  else {
    const gap = timeGap(lead.z, snap.speed);
    const d = settings.units === 'imperial' ? `${Math.round(lead.z * 3.28084 / 5) * 5} ft` : `${Math.round(lead.z)} m`;
    chip.innerHTML = `<svg><use href="#i-car"/></svg>${d}${gap != null ? ` · ${gap.toFixed(1)} s` : ''}`;
    chip.classList.toggle('close', r.close);
    chip.hidden = false;
  }
  const close = r.close && settings.followWarn;
  if (r.closeStarted && settings.followWarn) chime('warn');
  if (close !== closeActive) {
    closeActive = close;
    renderAlert();
  }
  if (r.movedOff && settings.queueChime && !goActive) {
    movingActive = true;
    chime('go');
    renderAlert();
    clearTimeout(movingTimer);
    movingTimer = setTimeout(() => { movingActive = false; renderAlert(); }, 4000);
  }
}
on('vision', (v) => {
  handleVision(v);
  // How often the camera view updates, so the cost of Detailed mode is visible.
  if (v?.ms && Date.now() - lastSpeedNote > 2000) {
    lastSpeedNote = Date.now();
    const every = Math.max(0.25, v.ms / 1000);
    $('#cam-status').textContent = `${v.mode === 'detailed' ? 'Detailed' : 'Fast'} · updates every ${every.toFixed(1)} s`
      + (linkRole() === 'phone' ? ' · sent to your paired screen' : '');
  }
});
let lastSpeedNote = 0;
on('remote-vision', handleVision);
on('demo-vision', handleVision);

on('vision-status', (s) => {
  const btn = $('#cam-toggle');
  const msg = $('#cam-status');
  if (s.state === 'running') {
    btn.textContent = 'Stop camera';
    msg.textContent = linkRole() === 'phone' ? 'Reading the road · results go to your paired screen' : 'Reading the road on this device';
  } else if (s.state === 'starting') {
    btn.textContent = 'Stop camera';
    msg.textContent = 'Starting camera…';
  } else if (s.state === 'error') {
    btn.textContent = 'Start camera';
    msg.textContent = s.message;
    stopVision();
    msg.textContent = s.message;
  } else {
    btn.textContent = 'Start camera';
  }
});
$('#cam-toggle').addEventListener('click', () => {
  if (visionRunning()) stopVision();
  else startVision($('#cam-video'), $('#cam-overlay'));
});

// ---------------------------------------------------------------- navigation
function iconHref(icon) {
  return icon.kind === 'arrive' ? '#i-flag' : icon.kind === 'roundabout' ? '#i-round' : '#i-arrow';
}

function updateNav(pos, accuracy) {
  if (!nav) return;
  const p = nav.progress(pos, accuracy);
  nav.lastProgress = p;
  nav.lastNext = p.next;
  if (p.arrived) {
    speak('You have arrived');
    toast('You’ve arrived');
    endNavigation();
    return;
  }
  const cue = nav.cue(p, snap.speed, (m) => spokenDistance(m, settings.units));
  if (cue) speak(cue);
  renderNav(p);
  if (p.offRoute && !rerouting && navDest && !demoRunning() && Date.now() - lastReroute > 15000) reroute(pos);
}

function renderNav(p) {
  const units = settings.units;
  const d = formatDistance(p.distToNext, units);
  $('#nav-dist').textContent = `${d.value} ${d.unit}`;
  $('#nav-text').textContent = p.step.text;
  const icon = $('#nav-icon');
  icon.innerHTML = `<use href="${iconHref(p.step.icon)}"/>`;
  icon.style.transform = `rotate(${p.step.icon.angle}deg)`;
  const list = $('#turn-list');
  if (!list.hidden) {
    list.innerHTML = nav.steps.slice(p.next + 1).map((st) => `<li><svg style="transform:rotate(${st.icon.angle}deg)"><use href="${iconHref(st.icon)}"/></svg>`
      + `<span>${esc(st.text)}</span><b>${esc(distanceText(st.along - p.along, units))}</b></li>`).join('');
  }
  const arrive = new Date(Date.now() + p.remainingTime * 1000);
  $('#eta-time').textContent = clockText(arrive).replace(/\s?[AP]M$/i, '');
  $('#eta-left').textContent = formatDuration(p.remainingTime);
  $('#eta-dist').textContent = distanceText(p.remaining, units);
  $('#nav-card').hidden = false;
  $('#where-to').hidden = true;
}

async function reroute(pos) {
  rerouting = true;
  lastReroute = Date.now();
  try {
    const r = await fetchRoute(pos, navDest.coord, settings.avoid);
    nav = new NavRoute(r, navDest.coord);
    showRoute(nav.line);
    speak('Rerouting');
  } catch (e) {
    console.warn('[reroute]', e.message);
  } finally {
    rerouting = false;
  }
}

async function startNavigation(dest) {
  if (!snap.pos) {
    toast('Waiting for your location…');
    return;
  }
  toast('Finding the best route…', 8000);
  try {
    const r = await fetchRoute(snap.pos, dest.coord, settings.avoid);
    navDest = dest;
    nav = new NavRoute(r, dest.coord);
    rememberDestination(dest);
    showRoute(nav.line);
    mapView.overview(nav.line);
    if (r.avoidIgnored) toast('The route server couldn’t avoid what you asked on this trip, so this is the normal route.', 6000);
    else $('#toast').hidden = true;
    updateNav(snap.pos, lastFix?.accuracy);
    speak(nav.steps[1] ? `Starting route to ${dest.title}` : '');
  } catch (e) {
    toast(e.name === 'AbortError' ? 'The route server didn’t answer. Try again.' : e.message);
  }
}

// The last few places you navigated to, kept only on this device (Controls › Navigation › Clear).
function rememberDestination(dest) {
  if (!dest?.coord || dest.saved) return;
  const entry = { title: dest.title, subtitle: dest.subtitle || '', coord: dest.coord };
  const rest = settings.recent.filter((r) => r.title !== entry.title || distance(r.coord, entry.coord) > 50);
  saveSettings({ recent: [entry, ...rest].slice(0, 5) });
}

function endNavigation() {
  nav = null;
  navDest = null;
  showRoute(null);
  $('#nav-card').hidden = true;
  $('#turn-list').hidden = true;
  $('#where-to').hidden = false;
  if (demoRunning()) stopDemo();
}

on('demo', (running) => {
  $('#demo-badge').hidden = !running;
  if (running) {
    trip.reset();
    navDest = { title: 'Demo', coord: DEMO_LINE[DEMO_LINE.length - 1] };
    nav = new NavRoute(demoRoute(), navDest.coord);
    showRoute(nav.line);
    setDemoRoadside(demoRoadside());
  } else {
    setDemoRoadside(null);
    if (nav && navDest?.title === 'Demo') endNavigation();
    road = { name: '', maxspeed: null };
    renderRoad();
    handleVision(null);
    slowActive = false;
    renderAlert();
  }
});

// ---------------------------------------------------------------- search sheet
// Home, Work and recent destinations, shown before you search.
function shortcuts() {
  return [settings.home, settings.work, ...settings.recent].filter(Boolean);
}
function shortcutList() {
  const list = shortcuts();
  if (!list.length) return '<li class="empty">Search for an address, a business or a city.</li>';
  return list.map((f, i) => `<li data-i="${i}"><svg><use href="${f.title === 'Home' || f.title === 'Work' ? '#i-flag' : '#i-locate'}"/></svg>`
    + `<span class="t"><b>${esc(f.title)}</b><span>${esc(f.subtitle || '')}</span></span></li>`).join('');
}

function openSearch() {
  if (!settings.online.nav) {
    openSheet(`${head('Where to?')}<p>Directions are turned off. They need the internet: your search text and route go to free OpenStreetMap services.</p>
      <div class="row-btns"><button class="btn primary" data-go-settings>Open Controls</button></div>`, (card) => {
      $('[data-go-settings]', card).onclick = () => { closeSheet(); openControls('privacy'); };
    });
    return;
  }
  openSheet(`${head('Where to?')}
    <form class="search-row" autocomplete="off"><input type="search" placeholder="Address or place" enterkeyhint="search" aria-label="Destination">
    <button class="btn primary">Search</button></form>
    <ul class="list" id="results">${shortcutList()}</ul>
    <p class="muted small">Search © Photon by komoot · OpenStreetMap contributors</p>`, (card) => {
    const input = $('input', card);
    const list = $('#results', card);
    let found = shortcuts();
    setTimeout(() => input.focus(), 50);
    $('form', card).addEventListener('submit', async (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (q.length < 2) return;
      list.innerHTML = '<li class="empty">Searching…</li>';
      try {
        found = await searchPlaces(q, snap.pos);
        list.innerHTML = found.length
          ? found.map((f, i) => `<li data-i="${i}"><svg><use href="#i-locate"/></svg><span class="t"><b>${esc(f.title)}</b><span>${esc(f.subtitle)}</span></span></li>`).join('')
          : '<li class="empty">Nothing found. Try adding the city.</li>';
      } catch (err) {
        list.innerHTML = `<li class="empty">${esc(err.name === 'AbortError' ? 'Search didn’t answer. Check your connection.' : err.message)}</li>`;
      }
    });
    list.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-i]');
      if (!li) return;
      closeSheet();
      startNavigation(found[Number(li.dataset.i)]);
    });
  });
}

// ---------------------------------------------------------------- music UI
// The media cards show DashMate's own player or the music app playing on the device.
let localMusic = { track: null, playing: false };
const mediaSource = () => pickSource(localMusic, systemNow(), spotifyNow());

function renderMedia() {
  const src = mediaSource();
  const sys = src === 'spotify' ? spotifyNow() : systemNow();
  const hint = systemStatus()?.allowed ? 'Play music in any app, or add songs' : 'Tap ♪ to add songs';
  const other = src !== 'local';
  const title = other ? sys.title || sys.app : localMusic.track?.title ?? 'No music yet';
  const where = src === 'spotify' && sys.device ? `Spotify on ${sys.device}` : sys.app;
  const sub = other ? [sys.artist, where].filter(Boolean).join(' · ') : localMusic.track?.artist ?? hint;
  const playing = other ? sys.playing : localMusic.playing;
  const art = other && sys.artwork ? `<img src="${esc(sys.artwork)}" alt="">` : '<svg><use href="#i-music"/></svg>';
  $$('[data-music-mini]').forEach((el) => {
    $('[data-m-title]', el).textContent = title;
    $('[data-m-artist]', el).textContent = sub;
    $('[data-m-icon]', el).innerHTML = `<use href="${playing ? '#i-pause' : '#i-play'}"/>`;
    const a = $('.art', el);
    if (a.dataset.src !== art) {
      a.innerHTML = art;
      a.dataset.src = art;
    }
  });
  if (other && sys.duration > 0) {
    $$('[data-m-bar]').forEach((b) => { b.style.width = `${Math.min(100, (sys.position / sys.duration) * 100)}%`; });
  }
}

on('system-music', renderMedia);
on('spotify-music', (now) => {
  renderMedia();
  const line = $('#spotify-now');
  if (line) line.innerHTML = spotifyLine(now);
});
function spotifyLine(now) {
  return `Connected. ${now.active ? `${now.playing ? 'Playing' : 'Paused'} on ${esc(now.device || 'a device')}.` : 'Start Spotify on a device, or pick a playlist.'}`
    + (now.link ? ` <a href="${esc(now.link)}" data-open>Open in Spotify</a>` : '');
}
on('spotify-error', (msg) => toast(msg, 5000));
on('spotify-status', () => { renderMedia(); renderSpotifyPanel(); refreshControls(); });

// Spotify section of the Music panel.
async function renderSpotifyPanel() {
  const box = $('#spotify-box');
  if (!spotifyConfigured()) {
    box.innerHTML = '<b>Spotify</b><p class="muted small">Spotify isn’t set up in this copy of DashMate yet (its owner adds a Spotify app ID).</p>';
    return;
  }
  if (!spotifyConnected()) {
    box.innerHTML = `<b>Spotify</b><p class="muted small">Control Spotify on any of your devices and play your playlists. Signs in on Spotify’s own page. Needs Spotify Premium, and your Spotify account must be added to DashMate’s Spotify app by its owner.</p>
      <button class="btn primary" data-spotify="connect">Connect Spotify</button>`;
    return;
  }
  box.innerHTML = '<b>Spotify</b><p class="muted small">Loading your playlists…</p>';
  let lists = [];
  try { lists = await spotifyPlaylists(); } catch (e) { toast(e.message); }
  const now = spotifyNow();
  box.innerHTML = `<b>Spotify</b>
    <p class="muted small" id="spotify-now">${spotifyLine(now)}</p>
    <ul class="list">${lists.length ? lists.map((l) => `<li data-sp="${esc(l.uri)}"><svg><use href="#i-music"/></svg><span class="t"><b>${esc(l.name)}</b><span>${l.count} items · Spotify</span></span></li>`).join('') : '<li class="empty">No playlists found.</li>'}</ul>
    <div class="row-btns"><button class="btn" data-spotify="disconnect">Disconnect Spotify</button></div>`;
}

$('#spotify-box').addEventListener('click', (e) => {
  const act = e.target.closest('[data-spotify]')?.dataset.spotify;
  if (act === 'connect') return connectSpotify(openUrl);
  if (act === 'disconnect') { disconnectSpotify(); return toast('Spotify disconnected'); }
  const open = e.target.closest('a[data-open]');
  if (open) { e.preventDefault(); return openUrl(open.href); }
  const pl = e.target.closest('[data-sp]');
  if (pl) playSpotifyPlaylist(pl.dataset.sp);
});
on('system-music-error', (msg) => toast(msg));
on('system-music-status', () => { renderMedia(); renderSystemPanel(); });

async function renderSystemPanel() {
  const st = systemStatus();
  const box = $('#sys-music');
  if (!st) return;
  box.hidden = false;
  const ios = st.platform === 'ios';
  if (!st.allowed) {
    box.innerHTML = ios
      ? `<b>Apple Music</b><p class="muted small">See and control what's playing in Apple Music, and play your playlists from here.</p>
         <button class="btn primary" data-sys="allow">Connect Apple Music</button>`
      : `<b>Your music apps</b><p class="muted small">Control Spotify, Apple Music, YouTube Music and others from here. Android asks you to turn on <b>notification access</b> for DashMate. It's only used to see and control what's playing; DashMate doesn't read your notifications.</p>
         <button class="btn primary" data-sys="allow">Allow music control</button>`;
    return;
  }
  if (!ios) {
    box.innerHTML = '<b>Your music apps</b><p class="muted small">Start music in Spotify, Apple Music, YouTube Music or another app once; then control it from DashMate.</p>';
    return;
  }
  const lists = await systemPlaylists();
  box.innerHTML = `<b>Apple Music playlists</b>
    <p class="muted small">Spotify and other apps can't be controlled by other apps on iPad and iPhone; use their own controls.</p>
    <ul class="list">${lists.length ? lists.map((l) => `<li data-pl="${esc(l.id)}"><svg><use href="#i-music"/></svg><span class="t"><b>${esc(l.name)}</b><span>${l.count} songs</span></span></li>`).join('') : '<li class="empty">No playlists in your library.</li>'}</ul>`;
}

$('#sys-music').addEventListener('click', async (e) => {
  if (e.target.closest('[data-sys="allow"]')) {
    await requestSystemAccess();
    renderSystemPanel();
    return;
  }
  const pl = e.target.closest('[data-pl]');
  if (pl) playSystemPlaylist(pl.dataset.pl);
});

on('music', (m) => {
  localMusic = m;
  renderMedia();
  $$('[data-act="shuffle"]').forEach((b) => b.classList.toggle('on', m.shuffle));
  const list = $('#track-list');
  list.innerHTML = m.tracks.length
    ? m.tracks.map((t) => `<li data-id="${t.id}" class="${m.track?.id === t.id ? 'now' : ''}"><svg><use href="#i-music"/></svg>
        <span class="t"><b>${esc(t.title)}</b><span>${esc(t.artist)}</span></span>
        <button class="icon" data-remove="${t.id}" aria-label="Remove"><svg><use href="#i-close"/></svg></button></li>`).join('')
    : '<li class="empty">Add songs from this device (MP3, M4A, FLAC…). They stay on this device.</li>';
});
on('music-time', ({ position, duration }) => {
  if (mediaSource() !== 'local') return;
  const pct = duration ? (position / duration) * 100 : 0;
  $$('[data-m-bar]').forEach((b) => { b.style.width = `${pct}%`; });
});
$('#track-list').addEventListener('click', (e) => {
  const rm = e.target.closest('[data-remove]');
  if (rm) return music.removeTrack(rm.dataset.remove);
  const li = e.target.closest('li[data-id]');
  if (li) music.playTrack(li.dataset.id);
});
$('#music-files').addEventListener('change', (e) => {
  music.addFiles([...e.target.files]);
  e.target.value = '';
});

// ---------------------------------------------------------------- other apps
const APPS = [
  { name: 'Spotify', url: 'spotify:' },
  { name: 'Apple Music', url: 'music://', ios: true },
  { name: 'YouTube Music', url: 'https://music.youtube.com/' },
  { name: 'Amazon Music', url: 'https://music.amazon.com/' },
];
function openApps() {
  const ios = /iPad|iPhone|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;
  openSheet(`${head('Open another app')}<p class="muted small">Opens the app if it's installed. DashMate can't control other apps' music.</p>
    <div class="row-btns">${APPS.filter((a) => !a.ios || ios).map((a) => `<button class="btn" data-url="${a.url}">${a.name}</button>`).join('')}</div>`, (card) => {
    card.addEventListener('click', (e) => {
      const b = e.target.closest('[data-url]');
      if (!b) return;
      const url = b.dataset.url;
      if (isNative() || !url.startsWith('http')) window.location.href = url;
      else window.open(url, '_blank', 'noopener');
    });
  });
}

// ---------------------------------------------------------------- pairing
function openPair() {
  if (beaconSending()) return openSharingSheet(beaconConfirmed() ? 'background' : 'checking');
  if (!linkRole() && hearingPhone()) {
    openSheet(`${head('Paired')}<p>This screen is getting the phone’s GPS over the background link.</p>
      <div class="row-btns"><button class="btn danger" data-unpair>Disconnect</button></div>`, (card) => {
      $('[data-unpair]', card).onclick = () => { stopListening(); closeSheet(); toast('Disconnected'); };
    });
    return;
  }
  const role = linkRole();
  if (role) {
    const bg = role === 'screen'
      ? `<p class="small">${hearingPhone() ? `✓ Receiving the phone’s position in the background (${beaconReceived()} so far). The phone can be locked.` : 'Not receiving the background link yet. Check the phone’s DashMate screen.'}</p>`
      : '';
    openSheet(`${head('Paired')}<p>This device is connected as the <b>${role === 'phone' ? 'phone' : 'screen'}</b>.
      ${role === 'phone' ? 'It sends its GPS (and road reading, if the camera is on) to the screen.' : 'It shows the phone’s GPS and road reading.'}</p>${bg}
      <div class="row-btns"><button class="btn danger" data-unpair>Disconnect</button></div>`, (card) => {
      $('[data-unpair]', card).onclick = () => { stopSharing(); stopListening(); closeSheet(); toast('Disconnected'); };
    });
    return;
  }
  const phone = app.dataset.layout === 'phone';
  openSheet(`${head('Pair phone and screen <span class="tag">Experimental</span>')}
    <p>Use your phone as the GPS (and road camera) for a Wi-Fi-only iPad or tablet.</p>
    <ol class="small steps"><li>Install DashMate on the phone too (same download as this one).</li>
    <li>Turn on the phone's <b>Personal Hotspot</b> and join it from the tablet.</li>
    <li>On the tablet tap <b>This is the screen</b>, then point the <b>phone's normal camera</b> at the code. It opens DashMate on the phone.</li></ol>
    <p class="muted small">Direct and encrypted between your two devices. No server, no account.</p>
    <div class="row-btns">
      <button class="btn ${phone ? '' : 'primary'}" data-role="screen">This is the screen</button>
      <button class="btn ${phone ? 'primary' : ''}" data-role="phone">This is the phone</button>
    </div>`, (card) => {
    card.addEventListener('click', (e) => {
      const b = e.target.closest('[data-role]');
      if (b) (b.dataset.role === 'screen' ? pairAsScreen() : pairAsPhone());
    });
  });
}

function pairSheet(title, body) {
  return `${head(title)}${body}<p class="muted small" data-status></p>`;
}

function pairAsScreen() {
  if (visionRunning()) stopVision();
  let stopScan = null;
  const card = openSheet(pairSheet('Pair · screen', `
    <div class="qr-wrap"><div class="qr" data-qr><span class="muted small">Making code…</span></div>
    <div><div class="scan"><video playsinline muted></video></div><p class="small">1. Point your <b>phone's camera app</b> at this code. It opens DashMate on the phone (DashMate must be installed there).<br>2. Then hold the code the phone shows up to this camera.</p></div></div>`), () => () => {
    stopScan?.();
    closeCamera($('video', card));
  });
  const status = $('[data-status]', card);
  (async () => {
    try {
      // Opening the camera first also lets WebRTC use real local addresses on the hotspot.
      await openCamera($('video', card), 'user');
      const code = await startAsScreen();
      $('[data-qr]', card).innerHTML = qrSvg(pairLink(code));
      stopScan = await scanQr($('video', card), (t) => !!extractPairCode(t), async (t) => {
        try {
          status.textContent = 'Connecting…';
          await finishAsScreen(extractPairCode(t));
        } catch (err) {
          status.textContent = err.message;
        }
      });
    } catch (err) {
      status.textContent = err.name === 'NotAllowedError' ? 'Camera permission is needed to read the phone’s code.' : err.message;
    }
  })();
}

// code: the screen's code when DashMate was opened from it by the phone's camera app.
function pairAsPhone(code = null) {
  if (visionRunning()) stopVision();
  let stopScan = null;
  const card = openSheet(pairSheet('Pair · phone', `
    <div data-step1><div class="scan"><video playsinline muted></video></div><p class="small">Point the camera at the code on the screen.</p></div>
    <div data-step2 hidden><div class="qr" data-qr></div><p class="small">Now hold this code up to the screen's camera.</p></div>`), () => () => {
    stopScan?.();
    closeCamera($('video', card));
  });
  const status = $('[data-status]', card);
  const reply = async (screenCode) => {
    try {
      status.textContent = 'Making reply code…';
      const answer = await startAsPhone(screenCode);
      closeCamera($('video', card));
      $('[data-step1]', card).hidden = true;
      $('[data-step2]', card).hidden = false;
      $('[data-qr]', card).innerHTML = qrSvg(pairLink(answer));
      status.textContent = 'Waiting for the screen…';
    } catch (err) {
      status.textContent = err.message;
    }
  };
  if (code) {
    reply(code);
    return;
  }
  (async () => {
    try {
      await openCamera($('video', card), 'environment');
      stopScan = await scanQr($('video', card), (t) => !!extractPairCode(t), (t) => reply(extractPairCode(t)));
    } catch (err) {
      status.textContent = err.name === 'NotAllowedError' ? 'Camera permission is needed to read the screen’s code.' : err.message;
    }
  })();
}

// ---- Pairing link and the background link (see beacon.js).
// The phone only says "you can lock it" once the screen confirms it is receiving positions
// over the background link; otherwise it says exactly what's wrong and keeps sending over
// the pairing link with its screen on.
let peerVersion = null;
let checkTimer = null;

on('peer-hello', (v) => {
  peerVersion = v;
  if (!sameVersion(v, VERSION)) {
    const other = linkRole() === 'phone' ? 'screen' : 'phone';
    toast(`The ${other} has DashMate ${v} and this device has ${VERSION}. Install the same version on both so the phone can keep sending with its screen off.`, 8000);
  }
});

on('link', async (s) => {
  if (s.state === 'connected') {
    closeSheet();
    peerVersion = null;
    sendHello(VERSION);
    if (s.role === 'phone') {
      startDeviceGps();
      openSharingSheet('starting');
      // An older screen never sends an offer.
      setTimeout(() => { if (sharingMode === 'starting') openSharingSheet('foreground'); }, 6000);
      return;
    }
    toast('Paired · using the phone’s GPS');
    // Invite the phone to keep sending with its screen off (native background link).
    const offer = await listenForPhone();
    if (offer) sendBeaconOffer(offer);
    else toast('This screen can’t receive the background link, so keep DashMate open on the phone.', 6000);
    setTimeout(() => {
      if (linkRole() === 'screen' && !peerVersion) toast(`Update DashMate on the phone to ${VERSION} so it can keep sending with its screen off.`, 8000);
    }, 6000);
  } else if (s.state === 'lost') {
    // The background link carries on without the pairing link.
    if (s.role === 'phone' ? beaconConfirmed() : hearingPhone()) return;
    clearInterval(checkTimer);
    toast('Pairing lost. Pair again to reconnect.');
  }
});

// Screen: tell the phone positions are arriving over the background link.
let lastAck = 0;
on('remote-fix', () => {
  if (!beaconListening() || Date.now() - lastAck < 1500 || !beaconReceived()) return;
  lastAck = Date.now();
  sendBeaconAck(beaconReceived());
});

// Phone: the screen sent the key and address for background sending.
on('beacon-offer', async (offer) => {
  const r = await startSending(offer);
  if (r !== 'ok') return openSharingSheet(r === 'no-location' ? 'no-location' : 'foreground');
  openSharingSheet('checking');
  const started = Date.now();
  clearInterval(checkTimer);
  checkTimer = setInterval(async () => {
    if (beaconConfirmed() || !beaconSending()) return clearInterval(checkTimer);
    if (Date.now() - started < 8000) return;
    const problem = linkProblem(await sendStatus(), platform());
    if (problem.waiting && Date.now() - started < 60000) return openSharingSheet('checking', problem.text);
    if (sharingMode !== 'problem') openSharingSheet('problem', problem.text);
  }, 2000);
});

// Phone: the screen is receiving. Now it's safe to lock the phone.
on('beacon-ack', () => {
  if (beaconConfirmed() || !beaconSending()) return;
  markConfirmed();
  clearInterval(checkTimer);
  setScreenAwake(false);
  openSharingSheet('background');
});

function stopSharing() {
  clearInterval(checkTimer);
  if (beaconSending()) stopSending();
  closeLink();
  setScreenAwake(true);
}

const SHARING_TEXT = {
  starting: 'Setting up… Keep DashMate open for a moment.',
  checking: 'Checking that your screen receives this phone’s position in the background… <b>Keep DashMate open</b> until it says you can lock the phone.',
  background: '✓ Your screen is receiving it. You can <b>lock this phone and put it away</b>, or use other apps. It keeps sending its location straight to the screen over your hotspot, encrypted.',
  problem: '<b>Don’t lock this phone yet.</b> Your screen isn’t receiving the background link, so it only gets this phone’s position while DashMate is open here.',
  foreground: 'Keep DashMate open on this phone. Background sending isn’t available with this screen, so the phone stops sending if you leave DashMate. Install the same DashMate version on both devices to fix this.',
  'no-location': 'DashMate needs location permission on this phone to share it. Allow it in the phone’s settings, then pair again.',
};

let sharingMode = null;
function openSharingSheet(mode, detail = '') {
  const android = /Android/i.test(navigator.userAgent);
  openSheet(`${head('Sharing GPS with your screen')}
    <p>${SHARING_TEXT[mode]}</p>
    ${detail ? `<p class="${mode === 'problem' ? 'link-problem' : 'muted small'}">${esc(detail)}</p>` : ''}
    ${mode === 'background' ? `<p class="muted small">${android
    ? 'Android shows a “DashMate is sharing GPS” notification while this runs; it has a Stop button too.'
    : 'iPhone shows the location arrow in the status bar while this runs. If it asks to find devices on your local network, tap Allow.'}</p>` : ''}
    <div class="row-btns"><button class="btn danger" data-stop-share>Stop sharing</button><button class="btn" data-close>OK</button></div>`, (card) => {
    $('[data-stop-share]', card).onclick = () => { stopSharing(); closeSheet(); toast('Stopped sharing GPS'); };
    return () => { sharingMode = null; };
  });
  sharingMode = mode;
}

// Back in DashMate: notice if sharing was stopped from the notification, and on the
// screen, warn once if the phone has gone quiet.
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !beaconSending()) return;
  if (!(await refreshSending())) {
    closeLink();
    setScreenAwake(true);
    toast('Stopped sharing GPS');
  }
});
let quietWarned = false;
setInterval(() => {
  if (!beaconListening() || !lastBeaconFix()) return;
  if (hearingPhone(15000)) quietWarned = false;
  else if (!quietWarned) {
    quietWarned = true;
    toast('Not hearing from the phone. Check its hotspot is on, or pair again.');
  }
}, 5000);

// Tapping the GPS chip explains weak location (Wi-Fi-only iPads have no GPS chip).
$('#gps-chip').addEventListener('click', () => {
  const level = $('#gps-chip').dataset.level;
  if (level !== 'poor' && level !== 'weak') return;
  openSheet(`${head('Weak location')}
    <p>This device is only getting a rough position (often hundreds of metres out), so the car arrow and speed can't follow the road. Wi-Fi-only iPads have no GPS chip; they guess from nearby Wi-Fi, and a phone hotspot moves with you, so the guess barely changes.</p>
    <h3>Ways to fix it</h3>
    <ul class="legal"><li><b>A Bluetooth GPS receiver</b> (for example Garmin GLO or Bad Elf). iPadOS uses it automatically; DashMate then works on its own.</li>
    <li><b>An iPad with cellular</b> has real GPS, even without a data plan.</li>
    <li><b>Pair your phone</b> as the GPS (pair button). It can stay locked in your pocket.</li></ul>
    <div class="row-btns"><button class="btn primary" data-act="pair">Pair phone</button><button class="btn" data-close>OK</button></div>`);
});

// Play/pause/skip go to whatever the media card is showing.
function mediaControl(action) {
  const src = mediaSource();
  if (src === 'system') return controlSystem(action);
  if (src === 'spotify') return controlSpotify(action);
  if (action === 'toggle') return music.togglePlay();
  return action === 'next' ? music.next() : music.prev();
}

// ---------------------------------------------------------------- controls (settings)
const VERSION = '0.11.0';
const TRIPS_KEY = 'dashmate.trips.v1';
let tripLog;
try { tripLog = new TripLog(JSON.parse(localStorage.getItem(TRIPS_KEY) || 'null')); } catch { tripLog = new TripLog(); }
const appStart = Date.now();
let tripMark = { distance: 0, movingTime: 0 };
let tripsSavedAt = 0;
function saveTrips() {
  try { localStorage.setItem(TRIPS_KEY, JSON.stringify(tripLog)); } catch { /* storage blocked */ }
  tripsSavedAt = Date.now();
}
document.addEventListener('visibilitychange', () => document.hidden && saveTrips());

// Feed Trip A/B with what was driven since the last fix.
function updateTrips() {
  tripLog.add(snap.distance - tripMark.distance, snap.movingTime - tripMark.movingTime, snap.speed);
  tripMark = { distance: snap.distance, movingTime: snap.movingTime };
  if (Date.now() - tripsSavedAt > 20000) saveTrips();
}

function openUrl(url) {
  if (isNative()) window.location.href = url;
  else window.open(url, '_blank', 'noopener');
}

initControls({
  version: VERSION,
  vision: {
    running: visionRunning,
    async toggle() {
      if (visionRunning()) return stopVision();
      closeControls();
      setTab('camera');
      return startVision($('#cam-video'), $('#cam-overlay'));
    },
  },
  map: { is3d: mapView.is3d, toggle3d: mapView.toggle3d },
  roadside: {
    allowed: cameraWarningsHere,
    bannedIn: camerasBannedIn,
    count: roadsideCount,
    preview(kind) {
      const cam = kind === 'camera';
      const mode = cam ? settings.cameraAlert : settings.hazardAlert;
      if (mode === 'banner') return toast('Banner only: no sound');
      chime(cam ? 'camera' : 'ding');
      const imperial = settings.units === 'imperial';
      if (mode === 'voice' && settings.voice) {
        speak(cam ? (imperial ? 'Speed camera in 1300 feet, limit 30' : 'Speed camera in 400 metres, limit 50')
          : (imperial ? 'Speed bump in 300 feet' : 'Speed bump in 100 metres'), { queue: true });
      }
    },
  },
  places: {
    setHere(kind) {
      if (!snap.pos) return toast('Waiting for your location…');
      saveSettings({ [kind]: { title: kind === 'home' ? 'Home' : 'Work', subtitle: 'Saved place', coord: snap.pos, saved: true } });
      return toast(`${kind === 'home' ? 'Home' : 'Work'} saved on this device`);
    },
  },
  pairing: { role: linkRole, open: openPair },
  demo: { running: demoRunning, toggle: () => (demoRunning() ? stopDemo() : startDemo()) },
  trips: {
    log: tripLog,
    current: () => ({ distance: snap.distance, movingTime: snap.movingTime, avgSpeed: snap.avgSpeed, maxSpeed: snap.maxSpeed, since: appStart }),
    reset(id) {
      if (id === 'current') {
        trip.reset();
        snap = trip.snapshot();
        tripMark = { distance: 0, movingTime: 0 };
      } else {
        tripLog.reset(id);
        saveTrips();
      }
    },
  },
  spotify: {
    configured: spotifyConfigured,
    connected: spotifyConnected,
    connect: () => connectSpotify(openUrl),
    disconnect: disconnectSpotify,
  },
  openApps,
  openLegal,
  openUrl,
  toast,
  forgetSongs: () => music.forgetAllMusic(),
  resetSettings() {
    try { localStorage.setItem('dashmate.settings.v1', JSON.stringify({ acceptedTerms: settings.acceptedTerms })); } catch { /* ignore */ }
    location.reload();
  },
});

function openLegal(which) {
  const body = { privacy: PRIVACY, terms: TERMS, licenses: LICENSES }[which];
  openSheet(`<div class="sheet-head"><span></span><button class="icon" data-close aria-label="Close"><svg><use href="#i-close"/></svg></button></div><div class="legal">${body}</div>`);
}

let lastSettings = JSON.stringify(settings);
onSettings((s) => {
  const prev = JSON.parse(lastSettings);
  lastSettings = JSON.stringify(s);
  applyTheme();
  car3d?.setColor(s.carColor);
  music.setVolume(s.volume);
  $('#speed-unit').textContent = speedUnit(s.units);
  $('#mute-icon').innerHTML = `<use href="${s.voice || s.chimes ? '#i-volume' : '#i-mute'}"/>`;
  renderRoad();
  if (prev.online.map !== s.online.map) setupMap();
  else if (prev.carView !== s.carView) setupStreets();
  if (!s.online.limits) { road = { name: road.name, maxspeed: null }; renderRoad(); }
  if (!s.online.weather) $('#temp').textContent = '';
  if (!s.online.nav && nav && !demoRunning()) endNavigation();
});

// ---------------------------------------------------------------- weather
let lastWeather = 0;
async function maybeWeather(pos) {
  if (!settings.online.weather || Date.now() - lastWeather < 20 * 60 * 1000) return;
  lastWeather = Date.now();
  try {
    $('#temp').textContent = `${await fetchTemperature(pos, settings.units)}°`;
  } catch {
    lastWeather = Date.now() - 15 * 60 * 1000; // try again in ~5 minutes
  }
}

// ---------------------------------------------------------------- map
async function setupMap() {
  const off = !settings.online.map;
  $('#map-off').hidden = !off;
  if (off || mapView.hasMap()) {
    if (off && mapView.hasMap()) location.reload(); // simplest way to drop the map and its connections
    return;
  }
  try {
    await loadScript('vendor/maplibre/maplibre-gl.js');
    mapView.createMap($('#map'), { theme: currentTheme(), center: snap.pos });
    if (nav) showRoute(nav.line);
    setupStreets();
  } catch (e) {
    console.warn('[map]', e);
    $('#map-off').hidden = false;
    $('#map-off').innerHTML = '<p>The map couldn’t start on this device.</p>';
  }
}
on('follow', (f) => $('#recenter').classList.toggle('off', !f));

function showRoute(coords) {
  mapView.showRoute(coords);
  streetView?.showRoute(coords);
}

// Real streets and buildings behind the 3D car (Controls › Display › Car view). Uses the
// same map tiles as the main map, so it follows the Map switch too.
async function setupStreets() {
  const want = settings.online.map && settings.carView === 'streets' && car3d && window.maplibregl;
  if (!want) {
    streetView?.destroy();
    streetView = null;
    car3d?.setStreets(false);
    $('#street-view').hidden = true;
    return;
  }
  if (streetView) return;
  try {
    const { createStreetView } = await import('./streetview.js');
    $('#street-view').hidden = false;
    streetView = createStreetView($('#street-view'), {
      theme: currentTheme(),
      camera: () => car3d.camera(),
      onReady: (on) => car3d?.setStreets(on),
    });
    if (snap.pos) streetView?.update(snap.pos, snap.heading, snap.speed);
    if (nav) streetView?.showRoute(nav.line);
    streetView?.start();
  } catch (e) {
    console.warn('[streets]', e);
    streetView = null;
  }
}

// ---------------------------------------------------------------- buttons
document.addEventListener('click', (e) => {
  const tab = e.target.closest('#dock [data-tab]');
  if (tab) return setTab(tab.dataset.tab);
  const act = e.target.closest('[data-act]')?.dataset.act;
  switch (act) {
    case 'search': return openSearch();
    case 'settings': return openControls();
    case 'pair': return openPair();
    case 'apps': return openApps();
    case 'close-tab': return setTab('dash');
    case 'turns': {
      const list = $('#turn-list');
      list.hidden = !list.hidden;
      if (nav?.lastProgress) renderNav(nav.lastProgress);
      return;
    }
    case 'vol-up':
    case 'vol-down': {
      const v = Math.round(Math.min(1, Math.max(0, settings.volume + (act === 'vol-up' ? 0.1 : -0.1))) * 10) / 10;
      saveSettings({ volume: v });
      return toast(`Volume ${Math.round(v * 100)}%`, 1200);
    }
    case 'end': return endNavigation();
    case 'recenter': return mapView.recenter();
    case 'pitch': return mapView.toggle3d();
    case 'zoom-in': return mapView.zoomBy(1);
    case 'zoom-out': return mapView.zoomBy(-1);
    case 'play': return mediaControl('toggle');
    case 'next': return mediaControl('next');
    case 'prev': return mediaControl('previous');
    case 'shuffle': return music.toggleShuffle();
    case 'mute': {
      const on = !(settings.voice || settings.chimes);
      saveSettings({ voice: on, chimes: on });
      return toast(on ? 'Voice and alert sounds on' : 'Voice and alert sounds off');
    }
    default:
  }
});

// ---------------------------------------------------------------- keep the screen on
// The dashboard keeps its screen on; a phone that's only feeding GPS to a screen lets it sleep.
let wantAwake = false;
let wakeLock = null;
let keepAwakePlugin = null;
async function setScreenAwake(on) {
  wantAwake = on;
  try {
    if (isNative()) {
      keepAwakePlugin ??= window.Capacitor.registerPlugin?.('KeepAwake') ?? window.Capacitor.Plugins?.KeepAwake;
      if (keepAwakePlugin) return await (on ? keepAwakePlugin.keepAwake() : keepAwakePlugin.allowSleep());
    }
    if ('wakeLock' in navigator) {
      if (on) wakeLock = await navigator.wakeLock.request('screen').catch(() => null);
      else {
        await wakeLock?.release();
        wakeLock = null;
      }
    }
  } catch { /* not supported: the device's own auto-lock applies */ }
}
document.addEventListener('visibilitychange', () => {
  if (wantAwake && document.visibilityState === 'visible' && !isNative()) setScreenAwake(true);
});

// ---------------------------------------------------------------- first run
function onboarding(done) {
  $('#sheet').dataset.locked = '1';
  const step1 = () => openSheet(`<h2>Welcome to DashMate</h2>
    <p>A dashboard for any car: map and directions, your speed and the speed limit, your music, and an experimental road camera.</p>
    <h3>Before you drive</h3>
    <ul class="legal"><li>Set things up while parked. Keep your eyes on the road.</li>
    <li>Speed limits, speed cameras and directions come from OpenStreetMap and can be wrong. Posted signs always win.</li>
    <li>Road reading is experimental and is <b>not</b> a safety system.</li></ul>
    <label class="check"><input type="checkbox" data-ok> <span>I've read and agree to the <a href="#" data-legal="terms">Terms &amp; safety</a> and the <a href="#" data-legal="privacy">Privacy</a> notice.</span></label>
    <div class="row-btns"><button class="btn primary block" data-next disabled>Continue</button></div>`, (card) => {
    const ok = $('[data-ok]', card);
    const next = $('[data-next]', card);
    ok.onchange = () => { next.disabled = !ok.checked; };
    next.onclick = step2;
    card.addEventListener('click', (e) => {
      const l = e.target.closest('[data-legal]');
      if (!l) return;
      e.preventDefault();
      openSheet(`<div class="legal">${l.dataset.legal === 'terms' ? TERMS : PRIVACY}</div><div class="row-btns"><button class="btn primary block" data-back>Back</button></div>`, (c) => {
        $('[data-back]', c).onclick = step1;
      });
    });
  });
  const step2 = () => openSheet(`<h2>Online features</h2>
    <p>These use free OpenStreetMap services over the internet. Each one only sends what's listed. You can change this any time under the car button › Controls.</p>
    ${onlineFields()}
    <p class="muted small">Your speed, trips, music and camera images never leave your device.</p>
    <div class="row-btns"><button class="btn primary block" data-start>Start driving</button></div>`, (card) => {
    bindFields(card);
    $('[data-start]', card).onclick = () => {
      saveSettings({ acceptedTerms: TERMS_VERSION });
      delete $('#sheet').dataset.locked;
      closeSheet();
      done();
    };
  });
  step1();
}

// dashmate://pair?c=… opened by the phone's camera app: go straight to the phone's reply code.
let ready = false;
let pendingPairCode = null;
function handleLink(url) {
  if (/^dashmate:\/\/spotify-callback/i.test(url)) {
    handleSpotifyCallback(url).then((ok) => toast(ok ? 'Spotify connected' : 'Spotify didn’t connect. Try again from the Music panel.', 4000));
    return;
  }
  const code = extractPairCode(url);
  if (!code) return;
  if (ready) pairAsPhone(code);
  else pendingPairCode = code; // after the first-run screens
}
function listenForLinks() {
  if (!isNative()) return;
  try {
    const App = window.Capacitor.registerPlugin('App');
    App.addListener('appUrlOpen', ({ url }) => handleLink(url));
    App.getLaunchUrl().then((r) => r?.url && handleLink(r.url)).catch(() => {});
  } catch { /* App plugin missing: scanning inside DashMate still works */ }
}

async function boot() {
  layout();
  window.addEventListener('resize', layout);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  $('#speed-unit').textContent = speedUnit(settings.units);
  music.setVolume(settings.volume);
  $('#detail-seg').outerHTML = seg('detail', settings.detail, [['fast', 'Fast'], ['detailed', 'Detailed']]);
  bindFields($('#camera-panel'));
  tickClock();
  setInterval(tickClock, 10000);
  // The 3D view needs WebGL; load it separately so the rest works without it.
  try {
    const { createCar3d } = await import('./car3d.js');
    car3d = createCar3d($('#car3d'), { theme: currentTheme(), color: settings.carColor });
    car3d?.start();
  } catch (e) {
    console.warn('[3d]', e);
  }
  const go = () => {
    setupMap();
    music.initMusic();
    initSystemMusic();
    initSpotify();
    startDeviceGps();
    setScreenAwake(true);
    ready = true;
    if (pendingPairCode) {
      pairAsPhone(pendingPairCode);
      pendingPairCode = null;
    }
  };
  listenForLinks();
  if (settings.acceptedTerms >= TERMS_VERSION) go();
  else onboarding(go);
  emit('ready');
}

boot();
