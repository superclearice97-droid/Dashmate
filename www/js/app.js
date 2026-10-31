// DashMate: wires the dashboard, map, navigation, music, road reading and pairing together.
import { on, emit } from './bus.js';
import { settings, saveSettings, onSettings, TERMS_VERSION } from './settings.js';
import { speedValue, speedUnit, formatDistance, distanceText, spokenDistance, formatDuration, limitValue, MPS_TO_KMH } from './core/units.js';
import { distance } from './core/geo.js';
import { TripTracker } from './core/trip.js';
import { NavRoute } from './core/route.js';
import { SpeedWatcher, GreenLightWatcher } from './core/alerts.js';
import { isDaytime } from './core/sun.js';
import { toScene, guessGear } from './core/scene.js';
import { summarize } from './core/vision-math.js';
import { startDeviceGps, startDemo, stopDemo, demoRunning, demoRoute, DEMO_LINE } from './location.js';
import * as mapView from './map.js';
import { searchPlaces, fetchRoute, fetchRoad, fetchTemperature } from './services.js';
import * as music from './music.js';
import { chime, speak } from './sound.js';
import { startVision, stopVision, visionRunning } from './vision.js';
import { startAsScreen, finishAsScreen, startAsPhone, closeLink, linkRole } from './link.js';
import { openCamera, closeCamera, loadScript } from './camera.js';
import { qrSvg, scanQr } from './qr.js';
import { PRIVACY, TERMS, LICENSES } from './legal.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
const isNative = () => !!window.Capacitor?.isNativePlatform?.();

const trip = new TripTracker();
const speedWatch = new SpeedWatcher();
const greenWatch = new GreenLightWatcher();
let car3d = null;
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

const clockText = (d = new Date()) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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

  const label = { device: 'GPS · This device', phone: 'GPS · Phone', demo: 'Demo drive' }[fix.source] || 'GPS';
  $('#gps-chip').innerHTML = `<i class="dot" style="background:${fix.accuracy > 50 ? '#f59e0b' : '#22c55e'}"></i>${label}`;

  car3d?.setSpeed(snap.speed);
  mapView.updatePosition(pos, snap.heading, snap.speed);
  updateNav(pos, fix.accuracy);
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
  const r = speedWatch.update(snap.speed * MPS_TO_KMH, road.maxspeed, tol, Date.now());
  if (r.entered) chime('warn');
  if (r.active !== slowActive) {
    slowActive = r.active;
    renderRoad();
    renderAlert();
  }
}

// ---------------------------------------------------------------- alerts banner
let goActive = false;
function renderAlert() {
  const el = $('#alert');
  if (goActive) {
    el.className = 'alert go';
    el.innerHTML = '<span class="lamp"><i></i></span>Green · go';
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
    return;
  }
  const parts = summarize(v.counts);
  const html = (parts.length ? parts : ['Nothing spotted']).map((t) => `<span class="chip">${esc(t)}</span>`).join('');
  chips.innerHTML = html;
  camChips.innerHTML = html;
  car3d?.setObjects(toScene(v.boxes, v.aspect));
  if (greenWatch.update(v.light, snap.speed, Date.now()) === 'go') {
    goActive = true;
    chime('go');
    renderAlert();
    clearTimeout(goTimer);
    goTimer = setTimeout(() => { goActive = false; renderAlert(); }, 4500);
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
    const r = await fetchRoute(pos, navDest.coord);
    nav = new NavRoute(r, navDest.coord);
    mapView.showRoute(nav.line);
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
    const r = await fetchRoute(snap.pos, dest.coord);
    navDest = dest;
    nav = new NavRoute(r, dest.coord);
    mapView.showRoute(nav.line);
    mapView.overview(nav.line);
    $('#toast').hidden = true;
    updateNav(snap.pos, lastFix?.accuracy);
    speak(nav.steps[1] ? `Starting route to ${dest.title}` : '');
  } catch (e) {
    toast(e.name === 'AbortError' ? 'The route server didn’t answer. Try again.' : e.message);
  }
}

function endNavigation() {
  nav = null;
  navDest = null;
  mapView.showRoute(null);
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
    mapView.showRoute(nav.line);
  } else {
    if (nav && navDest?.title === 'Demo') endNavigation();
    road = { name: '', maxspeed: null };
    renderRoad();
    handleVision(null);
    slowActive = false;
    renderAlert();
  }
});

// ---------------------------------------------------------------- search sheet
function openSearch() {
  if (!settings.online.nav) {
    openSheet(`${head('Where to?')}<p>Directions are turned off. They need the internet: your search text and route go to free OpenStreetMap services.</p>
      <div class="row-btns"><button class="btn primary" data-go-settings>Open Controls</button></div>`, (card) => {
      $('[data-go-settings]', card).onclick = openSettings;
    });
    return;
  }
  openSheet(`${head('Where to?')}
    <form class="search-row" autocomplete="off"><input type="search" placeholder="Address or place" enterkeyhint="search" aria-label="Destination">
    <button class="btn primary">Search</button></form>
    <ul class="list" id="results"><li class="empty">Search for an address, a business or a city.</li></ul>
    <p class="muted small">Search © Photon by komoot · OpenStreetMap contributors</p>`, (card) => {
    const input = $('input', card);
    const list = $('#results', card);
    let found = [];
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
on('music', (m) => {
  $$('[data-music-mini]').forEach((el) => {
    $('[data-m-title]', el).textContent = m.track ? m.track.title : 'No music yet';
    $('[data-m-artist]', el).textContent = m.track ? m.track.artist : 'Tap ♪ to add songs';
    $('[data-m-icon]', el).innerHTML = `<use href="${m.playing ? '#i-pause' : '#i-play'}"/>`;
  });
  $$('[data-act="shuffle"]').forEach((b) => b.classList.toggle('on', m.shuffle));
  const list = $('#track-list');
  list.innerHTML = m.tracks.length
    ? m.tracks.map((t) => `<li data-id="${t.id}" class="${m.track?.id === t.id ? 'now' : ''}"><svg><use href="#i-music"/></svg>
        <span class="t"><b>${esc(t.title)}</b><span>${esc(t.artist)}</span></span>
        <button class="icon" data-remove="${t.id}" aria-label="Remove"><svg><use href="#i-close"/></svg></button></li>`).join('')
    : '<li class="empty">Add songs from this device (MP3, M4A, FLAC…). They stay on this device.</li>';
});
on('music-time', ({ position, duration }) => {
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
  const role = linkRole();
  if (role) {
    openSheet(`${head('Paired')}<p>This device is connected as the <b>${role === 'phone' ? 'phone' : 'screen'}</b>.
      ${role === 'phone' ? 'It sends its GPS (and road reading, if the camera is on) to the screen.' : 'It shows the phone’s GPS and road reading.'}</p>
      <div class="row-btns"><button class="btn danger" data-unpair>Disconnect</button></div>`, (card) => {
      $('[data-unpair]', card).onclick = () => { closeLink(); closeSheet(); toast('Disconnected'); };
    });
    return;
  }
  const phone = app.dataset.layout === 'phone';
  openSheet(`${head('Pair phone and screen <span class="tag">Experimental</span>')}
    <p>Use your phone as the GPS (and road camera) for a Wi-Fi-only iPad or tablet. Turn on the phone's <b>Personal Hotspot</b>, join it from the tablet, then open this on both.</p>
    <p class="muted small">Direct and encrypted between your two devices. No server, no account.</p>
    <div class="row-btns">
      <button class="btn ${phone ? '' : 'primary'}" data-role="screen">This is the screen</button>
      <button class="btn ${phone ? 'primary' : ''}" data-role="phone">This is the phone</button>
    </div>`, (card) => {
    card.addEventListener('click', (e) => {
      const b = e.target.closest('[data-role]');
      if (b) (b.dataset.role === 'screen' ? pairAsScreen : pairAsPhone)();
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
    <div><div class="scan"><video playsinline muted></video></div><p class="small">1. Scan this code with the phone.<br>2. Then hold the phone's code up to this camera.</p></div></div>`), () => () => {
    stopScan?.();
    closeCamera($('video', card));
  });
  const status = $('[data-status]', card);
  (async () => {
    try {
      // Opening the camera first also lets WebRTC use real local addresses on the hotspot.
      await openCamera($('video', card), 'user');
      const code = await startAsScreen();
      $('[data-qr]', card).innerHTML = qrSvg(code);
      stopScan = await scanQr($('video', card), (t) => t.startsWith('DM1:'), async (t) => {
        try {
          status.textContent = 'Connecting…';
          await finishAsScreen(t);
        } catch (err) {
          status.textContent = err.message;
        }
      });
    } catch (err) {
      status.textContent = err.name === 'NotAllowedError' ? 'Camera permission is needed to read the phone’s code.' : err.message;
    }
  })();
}

function pairAsPhone() {
  if (visionRunning()) stopVision();
  let stopScan = null;
  const card = openSheet(pairSheet('Pair · phone', `
    <div data-step1><div class="scan"><video playsinline muted></video></div><p class="small">Point the camera at the code on the screen.</p></div>
    <div data-step2 hidden><div class="qr" data-qr></div><p class="small">Now hold this code up to the screen's camera.</p></div>`), () => () => {
    stopScan?.();
    closeCamera($('video', card));
  });
  const status = $('[data-status]', card);
  (async () => {
    try {
      await openCamera($('video', card), 'environment');
      stopScan = await scanQr($('video', card), (t) => t.startsWith('DM1:'), async (t) => {
        try {
          status.textContent = 'Making reply code…';
          const reply = await startAsPhone(t);
          closeCamera($('video', card));
          $('[data-step1]', card).hidden = true;
          $('[data-step2]', card).hidden = false;
          $('[data-qr]', card).innerHTML = qrSvg(reply);
          status.textContent = 'Waiting for the screen…';
        } catch (err) {
          status.textContent = err.message;
        }
      });
    } catch (err) {
      status.textContent = err.name === 'NotAllowedError' ? 'Camera permission is needed to read the screen’s code.' : err.message;
    }
  })();
}

on('link', (s) => {
  if (s.state === 'connected') {
    closeSheet();
    toast(s.role === 'phone' ? 'Paired · sending GPS to the screen' : 'Paired · using the phone’s GPS');
    if (s.role === 'phone') startDeviceGps();
  } else if (s.state === 'lost') {
    toast('Pairing lost. Pair again to reconnect.');
  }
});

// ---------------------------------------------------------------- settings
function seg(name, value, options) {
  return `<span class="seg" data-seg="${name}">${options.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(v) === String(value) ? 'on' : ''}">${l}</button>`).join('')}</span>`;
}
function sw(name, checked) {
  return `<input type="checkbox" class="switch" data-sw="${name}" ${checked ? 'checked' : ''}>`;
}
const COLORS = ['#eef0f3', '#1c1d21', '#c8102e', '#2a5bd7', '#7a8592', '#0f6b4f'];

function onlineFields() {
  const o = settings.online;
  return `
    <div class="field"><span>Map<small>Map pieces from OpenFreeMap</small></span>${sw('online.map', o.map)}</div>
    <div class="field"><span>Directions &amp; search<small>Search text and route to Photon and OSRM (FOSSGIS)</small></span>${sw('online.nav', o.nav)}</div>
    <div class="field"><span>Speed limits &amp; street names<small>Your position to the Overpass API</small></span>${sw('online.limits', o.limits)}</div>
    <div class="field"><span>Outside temperature<small>Your area (~10 km) to Open-Meteo</small></span>${sw('online.weather', o.weather)}</div>`;
}

function bindFields(card) {
  card.addEventListener('click', (e) => {
    const b = e.target.closest('[data-seg] button');
    if (!b) return;
    const name = b.closest('[data-seg]').dataset.seg;
    const v = name === 'overBy' || name === 'volume' ? Number(b.dataset.v) : b.dataset.v;
    $$('button', b.parentElement).forEach((x) => x.classList.toggle('on', x === b));
    saveSettings({ [name]: v });
  });
  card.addEventListener('change', (e) => {
    const el = e.target.closest('[data-sw]');
    if (!el) return;
    const [a, k] = el.dataset.sw.split('.');
    if (k) saveSettings({ [a]: { ...settings[a], [k]: el.checked } });
    else saveSettings({ [a]: el.checked });
  });
}

function openSettings() {
  const u = settings.units;
  const per = u === 'imperial' ? 1609.344 : 1000;
  openSheet(`${head('Controls')}
    <h3>Trip</h3>
    <div class="trip-row">
      <div><b>${(snap.distance / per).toFixed(1)}</b><small>${u === 'imperial' ? 'mi' : 'km'}</small><span>Distance</span></div>
      <div><b>${speedValue(snap.avgSpeed, u)}</b><small>${speedUnit(u).toLowerCase()}</small><span>Average</span></div>
      <div><b>${speedValue(snap.maxSpeed, u)}</b><small>${speedUnit(u).toLowerCase()}</small><span>Top speed</span></div>
    </div>
    <div class="row-btns"><button class="btn" data-reset-trip>Reset trip</button></div>
    <h3>Display</h3>
    <div class="field"><span>Units</span>${seg('units', settings.units, [['imperial', 'mph'], ['metric', 'km/h']])}</div>
    <div class="field"><span>Look<small>Auto switches to dark at sunset where you are</small></span>${seg('theme', settings.theme, [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']])}</div>
    <div class="field"><span>Car color</span><span class="swatches">${COLORS.map((c) => `<button data-color="${c}" style="background:${c}" class="${c === settings.carColor ? 'on' : ''}" aria-label="Car color ${c}"></button>`).join('')}</span></div>
    <div class="field"><span>Spoken directions</span>${sw('voice', settings.voice)}</div>
    <div class="field"><span>Alert sounds</span>${sw('chimes', settings.chimes)}</div>
    <div class="field"><span>“Slow down” when over by<small>Compared with the speed limit from OpenStreetMap</small></span>${seg('overBy', settings.overBy, [[0, '0'], [5, '5'], [10, '10']])}</div>
    <h3>Sound</h3>
    <div class="field"><span>Volume<small>Music and spoken directions in DashMate</small></span>${seg('volume', settings.volume, [[0.3, 'Low'], [0.6, 'Medium'], [1, 'High']])}</div>
    <h3>Online features</h3>${onlineFields()}
    <h3>Music</h3>
    <div class="field"><span>Remember my songs<small>Kept only on this device</small></span>${sw('rememberMusic', settings.rememberMusic)}</div>
    <div class="row-btns"><button class="btn" data-forget>Forget my songs</button></div>
    <h3>Try it</h3>
    <div class="row-btns"><button class="btn" data-demo>${demoRunning() ? 'Stop demo drive' : 'Start demo drive'}</button></div>
    <h3>About</h3>
    <div class="row-btns"><button class="btn" data-legal="privacy">Privacy</button><button class="btn" data-legal="terms">Terms &amp; safety</button><button class="btn" data-legal="licenses">Licenses</button></div>
    <p class="muted small">DashMate 0.4.0 · free and open source (MIT)</p>`, (card) => {
    bindFields(card);
    card.addEventListener('click', async (e) => {
      const c = e.target.closest('[data-color]');
      if (c) {
        saveSettings({ carColor: c.dataset.color });
        $$('[data-color]', card).forEach((x) => x.classList.toggle('on', x === c));
      }
      if (e.target.closest('[data-reset-trip]')) {
        trip.reset();
        openSettings();
        return;
      }
      if (e.target.closest('[data-forget]')) {
        await music.forgetAllMusic();
        toast('Stored songs removed from this device');
      }
      if (e.target.closest('[data-demo]')) {
        closeSheet();
        if (demoRunning()) stopDemo();
        else startDemo();
      }
      const l = e.target.closest('[data-legal]');
      if (l) openLegal(l.dataset.legal);
    });
  });
}

function openLegal(which) {
  const body = { privacy: PRIVACY, terms: TERMS, licenses: LICENSES }[which];
  openSheet(`<div class="sheet-head"><span></span><button class="icon" data-back aria-label="Back"><svg><use href="#i-close"/></svg></button></div><div class="legal">${body}</div>`, (card) => {
    $('[data-back]', card).onclick = openSettings;
  });
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
    if (nav) mapView.showRoute(nav.line);
  } catch (e) {
    console.warn('[map]', e);
    $('#map-off').hidden = false;
    $('#map-off').innerHTML = '<p>The map couldn’t start on this device.</p>';
  }
}
on('follow', (f) => $('#recenter').classList.toggle('off', !f));

// ---------------------------------------------------------------- buttons
document.addEventListener('click', (e) => {
  const tab = e.target.closest('#dock [data-tab]');
  if (tab) return setTab(tab.dataset.tab);
  const act = e.target.closest('[data-act]')?.dataset.act;
  switch (act) {
    case 'search': return openSearch();
    case 'settings': return openSettings();
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
    case 'play': return music.togglePlay();
    case 'next': return music.next();
    case 'prev': return music.prev();
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
async function keepAwake() {
  try {
    if (isNative()) {
      const plugin = window.Capacitor.registerPlugin?.('KeepAwake') ?? window.Capacitor.Plugins?.KeepAwake;
      if (plugin) return await plugin.keepAwake();
    }
    if ('wakeLock' in navigator) {
      const lock = () => navigator.wakeLock.request('screen').catch(() => {});
      await lock();
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && lock());
    }
  } catch { /* not supported: the device's own auto-lock applies */ }
}

// ---------------------------------------------------------------- first run
function onboarding(done) {
  $('#sheet').dataset.locked = '1';
  const step1 = () => openSheet(`<h2>Welcome to DashMate</h2>
    <p>A dashboard for any car: map and directions, your speed and the speed limit, your music, and an experimental road camera.</p>
    <h3>Before you drive</h3>
    <ul class="legal"><li>Set things up while parked. Keep your eyes on the road.</li>
    <li>Speed limits and directions come from OpenStreetMap and can be wrong. Posted signs always win.</li>
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
    startDeviceGps();
    keepAwake();
  };
  if (settings.acceptedTerms >= TERMS_VERSION) go();
  else onboarding(go);
  emit('ready');
}

boot();
