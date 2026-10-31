// The Controls screen, laid out like a modern EV's: quick-control tiles, a list of
// categories, the selected category's settings, and a search box across all of them.
// Only settings DashMate can really act on are shown; nothing here controls the car.
import { settings, saveSettings, onSettings } from './settings.js';
import { speedValue, speedUnit } from './core/units.js';
import { formatDriveTime } from './core/trips.js';
import { matches } from './core/search.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const NUMERIC = new Set(['overBy', 'volume']);
const COLORS = ['#eef0f3', '#1c1d21', '#c8102e', '#2a5bd7', '#7a8592', '#0f6b4f'];
export const RELEASES_URL = 'https://github.com/superclearice97-droid/Dashmate/releases';

export function seg(name, value, options) {
  return `<span class="seg" data-seg="${name}">${options.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(v) === String(value) ? 'on' : ''}">${l}</button>`).join('')}</span>`;
}
export function sw(name, checked) {
  return `<input type="checkbox" class="switch" data-sw="${name}" ${checked ? 'checked' : ''}>`;
}
// One settings row. `keys` are extra words the search box should find it by.
const row = (label, hint, control, keys = '') =>
  `<div class="field" data-keys="${keys}"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span>${control}</div>`;

export function onlineFields() {
  const o = settings.online;
  return row('Map', 'Map pieces from OpenFreeMap', sw('online.map', o.map), 'privacy internet online')
    + row('Directions &amp; search', 'Search text and route to Photon and OSRM (FOSSGIS)', sw('online.nav', o.nav), 'privacy internet online navigation')
    + row('Speed limits &amp; street names', 'Your position to the Overpass API', sw('online.limits', o.limits), 'privacy internet online')
    + row('Outside temperature', 'Your area (~10 km) to Open-Meteo', sw('online.weather', o.weather), 'privacy internet online weather');
}

export function bindFields(root) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-seg] button');
    if (!b) return;
    const name = b.closest('[data-seg]').dataset.seg;
    $$('button', b.parentElement).forEach((x) => x.classList.toggle('on', x === b));
    const v = b.dataset.v;
    saveSettings({ [name]: NUMERIC.has(name) ? Number(v) : name === 'time24' ? v === '24' : v });
  });
  root.addEventListener('change', (e) => {
    const el = e.target.closest('[data-sw]');
    if (!el) return;
    const [a, k] = el.dataset.sw.split('.');
    if (k) saveSettings({ [a]: { ...settings[a], [k]: el.checked } });
    else saveSettings({ [a]: el.checked });
  });
}

// ---------------------------------------------------------------- categories
const CATEGORIES = [
  ['quick', 'Quick controls', 'i-grid'],
  ['display', 'Display', 'i-sun'],
  ['navigation', 'Navigation', 'i-locate'],
  ['alerts', 'Speed & alerts', 'i-gauge'],
  ['road', 'Road reading', 'i-camera'],
  ['trips', 'Trips', 'i-car'],
  ['sound', 'Sound & media', 'i-music'],
  ['pairing', 'Phone pairing', 'i-link'],
  ['privacy', 'Privacy', 'i-lock'],
  ['software', 'Software', 'i-info'],
];

let ctx = null;
let current = 'quick';
let resetArmed = false;

function tile(act, icon, label, state, on) {
  return `<button class="tile${on ? ' on' : ''}" data-ctl="${act}" data-keys="${label} ${state}"><svg><use href="#${icon}"/></svg><b>${label}</b><small>${state}</small></button>`;
}

function tripCard(title, t, resetId) {
  const u = settings.units;
  const per = u === 'imperial' ? 1609.344 : 1000;
  const su = speedUnit(u).toLowerCase();
  const since = t.since ? `Since ${new Date(t.since).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : 'Since DashMate opened';
  return `<div class="trip-card" data-keys="trip odometer ${title}">
    <div class="trip-head"><b>${title}</b><small>${since}</small></div>
    <div class="trip-row">
      <div><b>${(t.distance / per).toFixed(1)}</b><small>${u === 'imperial' ? 'mi' : 'km'}</small><span>Distance</span></div>
      <div><b>${formatDriveTime(t.movingTime)}</b><span>Driving time</span></div>
      <div><b>${speedValue(t.avgSpeed, u)}</b><small>${su}</small><span>Average</span></div>
      <div><b>${speedValue(t.maxSpeed, u)}</b><small>${su}</small><span>Top</span></div>
    </div>
    <button class="btn" data-ctl="reset-trip" data-trip="${resetId}">Reset ${title}</button>
  </div>`;
}

const RENDER = {
  quick: () => {
    const s = settings;
    const look = { auto: 'Auto', light: 'Light', dark: 'Dark' }[s.theme];
    return `<div class="tiles">
      ${tile('cycle-theme', s.theme === 'dark' ? 'i-moon' : 'i-sun', 'Appearance', look, s.theme !== 'auto')}
      ${tile('toggle-units', 'i-gauge', 'Units', s.units === 'imperial' ? 'mph' : 'km/h', false)}
      ${tile('toggle-voice', 'i-volume', 'Voice guidance', s.voice ? 'On' : 'Off', s.voice)}
      ${tile('toggle-chimes', s.chimes ? 'i-volume' : 'i-mute', 'Alert sounds', s.chimes ? 'On' : 'Off', s.chimes)}
      ${tile('toggle-camera', 'i-camera', 'Road reading', ctx.vision.running() ? 'On' : 'Off', ctx.vision.running())}
      ${tile('toggle-3d', 'i-cube', 'Map view', ctx.map.is3d() ? '3D' : 'Flat', ctx.map.is3d())}
      ${tile('pair', 'i-link', 'Phone', ctx.pairing.role() ? 'Paired' : 'Not paired', !!ctx.pairing.role())}
      ${tile('demo', 'i-play', 'Demo drive', ctx.demo.running() ? 'Running' : 'Off', ctx.demo.running())}
    </div>`;
  },
  display: () => row('Appearance', 'Auto switches to dark at sunset where you are', seg('theme', settings.theme, [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]), 'theme dark light night mode look')
    + row('Distance &amp; speed units', '', seg('units', settings.units, [['imperial', 'mph'], ['metric', 'km/h']]), 'miles kilometres km mph')
    + row('Time format', '', seg('time24', settings.time24 ? '24' : '12', [['12', '12-hour'], ['24', '24-hour']]), 'clock')
    + row('Car color', 'In the car view', `<span class="swatches">${COLORS.map((c) => `<button data-ctl="color" data-color="${c}" style="background:${c}" class="${c === settings.carColor ? 'on' : ''}" aria-label="Car color ${c}"></button>`).join('')}</span>`, 'paint colour'),
  navigation: () => row('Voice guidance', 'Spoken turn-by-turn directions', sw('voice', settings.voice), 'speak directions')
    + row('Avoid highways', '', sw('avoid.highways', settings.avoid.highways), 'motorway freeway route')
    + row('Avoid tolls', '', sw('avoid.tolls', settings.avoid.tolls), 'toll route')
    + row('Avoid ferries', '', sw('avoid.ferries', settings.avoid.ferries), 'ferry boat route')
    + `<p class="muted small">If the route server can't avoid something on a trip, DashMate tells you and uses the normal route.</p>`,
  alerts: () => row('Speed limit warning', 'Uses speed limits from OpenStreetMap; posted signs always win', seg('speedWarn', settings.speedWarn, [['off', 'Off'], ['display', 'Display'], ['chime', 'Chime']]), 'speeding slow down')
    + row('Warning offset', `Warn when this many ${settings.units === 'imperial' ? 'mph' : 'km/h'} over the limit`, seg('overBy', settings.overBy, [[0, '0'], [5, '+5'], [10, '+10']]), 'speed limit tolerance')
    + row('Green traffic light chime', 'Needs road reading. Chimes when the light ahead turns green while you’re stopped', sw('greenChime', settings.greenChime), 'go signal')
    + row('Alert sounds', 'All DashMate chimes', sw('chimes', settings.chimes), 'mute sound'),
  road: () => row('Road reading <span class="tag">Experimental</span>', 'Identifies vehicles, bikes, people, animals, traffic lights and stop signs on this device. Not a safety system.',
    `<button class="btn ${ctx.vision.running() ? '' : 'primary'}" data-ctl="toggle-camera">${ctx.vision.running() ? 'Stop camera' : 'Start camera'}</button>`, 'camera detection objects autopilot')
    + row('Detail', 'Detailed spots smaller, farther things but updates about once a second', seg('detail', settings.detail, [['fast', 'Fast'], ['detailed', 'Detailed']]), 'model accuracy')
    + row('Green traffic light chime', '', sw('greenChime', settings.greenChime), 'go signal'),
  trips: () => {
    const cur = ctx.trips.current();
    return `${tripCard('Current drive', cur, 'current')}${tripCard('Trip A', ctx.trips.log.get('A'), 'A')}${tripCard('Trip B', ctx.trips.log.get('B'), 'B')}
      <p class="muted small">Trips are worked out from GPS and kept only on this device.</p>`;
  },
  sound: () => row('Volume', 'Music and spoken directions in DashMate', seg('volume', settings.volume, [[0.3, 'Low'], [0.6, 'Medium'], [1, 'High']]), 'loud quiet')
    + row('Voice guidance', '', sw('voice', settings.voice), 'speak directions')
    + row('Remember my songs', 'Kept only on this device', sw('rememberMusic', settings.rememberMusic), 'music library')
    + row('Stored songs', '', '<button class="btn" data-ctl="forget-songs">Forget my songs</button>', 'delete music')
    + row('Music apps', 'Open Spotify, Apple Music and others', '<button class="btn" data-ctl="apps">Open an app</button>', 'spotify youtube'),
  pairing: () => {
    const role = ctx.pairing.role();
    return row(role ? `Paired as the ${role}` : 'Not paired', 'Use your phone’s GPS and camera on a Wi-Fi-only iPad. Direct and encrypted, no server.',
      `<button class="btn ${role ? '' : 'primary'}" data-ctl="pair">${role ? 'Manage' : 'Pair'}</button>`, 'bluetooth phone gps link iphone android');
  },
  privacy: () => `${onlineFields()}<p class="muted small">Your speed, trips, music and camera images never leave your device.</p>`
    + row('Privacy policy', '', '<button class="btn" data-ctl="legal" data-legal="privacy">Read</button>', 'data'),
  software: () => row(`DashMate ${ctx.version}`, 'Free and open source (MIT)', `<button class="btn" data-ctl="releases">Release notes</button>`, 'version update about')
    + row('Demo drive', 'See everything working without driving', `<button class="btn" data-ctl="demo">${ctx.demo.running() ? 'Stop' : 'Start'}</button>`, 'try')
    + row('Terms &amp; safety', '', '<button class="btn" data-ctl="legal" data-legal="terms">Read</button>', 'legal')
    + row('Open-source licenses', '', '<button class="btn" data-ctl="legal" data-legal="licenses">Read</button>', 'legal credits')
    + row('Reset all settings', 'Trips and songs are kept', `<button class="btn danger" data-ctl="reset-settings">${resetArmed ? 'Tap again to reset' : 'Reset'}</button>`, 'factory default'),
};

function render() {
  const panel = $('#controls');
  const q = $('#ctl-search', panel).value.trim();
  $$('.ctl-nav button', panel).forEach((b) => b.classList.toggle('on', !q && b.dataset.cat === current));
  const content = $('.ctl-content', panel);
  if (!q) {
    const [, label] = CATEGORIES.find(([id]) => id === current);
    content.innerHTML = `<h2>${label}</h2>${RENDER[current]()}`;
    return;
  }
  // Search: every category's settings, keeping only the matches.
  content.innerHTML = CATEGORIES.map(([id, label]) => `<section data-cat="${id}"><h3>${label}</h3>${RENDER[id]()}</section>`).join('');
  let any = false;
  for (const sec of $$('section', content)) {
    let hits = 0;
    for (const el of $$('.field, .tile, .trip-card', sec)) {
      const hit = matches(`${el.textContent} ${el.dataset.keys || ''}`, q);
      el.hidden = !hit;
      hits += hit;
    }
    $$('p', sec).forEach((p) => { p.hidden = true; });
    sec.hidden = !hits;
    any ||= hits > 0;
  }
  if (!any) content.innerHTML = `<p class="muted">No settings match “${q.replace(/[<>&]/g, '')}”.</p>`;
}

export function openControls(cat = current) {
  current = cat;
  resetArmed = false;
  $('#controls').hidden = false;
  render();
}

export function closeControls() {
  $('#controls').hidden = true;
  $('#ctl-search').value = '';
}

export const controlsOpen = () => !$('#controls').hidden;

// Re-draw when something shown here changes (a fix updates trips, a toggle flips a tile).
export function refreshControls() {
  if (controlsOpen() && !document.activeElement?.closest?.('.ctl-content')) render();
}

// context: callbacks into the rest of the app (camera, pairing, demo, trips, map, legal...).
export function initControls(context) {
  ctx = context;
  const panel = $('#controls');
  $('.ctl-nav', panel).innerHTML = CATEGORIES.map(([id, label, icon]) => `<button data-cat="${id}"><svg><use href="#${icon}"/></svg><span>${label}</span></button>`).join('');
  bindFields(panel);
  onSettings(() => controlsOpen() && render());
  $('#ctl-search', panel).addEventListener('input', render);
  panel.addEventListener('click', async (e) => {
    const nav = e.target.closest('.ctl-nav [data-cat]');
    if (nav) {
      $('#ctl-search', panel).value = '';
      current = nav.dataset.cat;
      render();
      return;
    }
    if (e.target.closest('[data-ctl-close]')) return closeControls();
    const el = e.target.closest('[data-ctl]');
    if (!el) return;
    const s = settings;
    switch (el.dataset.ctl) {
      case 'cycle-theme': return saveSettings({ theme: { auto: 'light', light: 'dark', dark: 'auto' }[s.theme] });
      case 'toggle-units': return saveSettings({ units: s.units === 'imperial' ? 'metric' : 'imperial' });
      case 'toggle-voice': return saveSettings({ voice: !s.voice });
      case 'toggle-chimes': return saveSettings({ chimes: !s.chimes });
      case 'toggle-3d': ctx.map.toggle3d(); return render();
      case 'toggle-camera': await ctx.vision.toggle(); return render();
      case 'pair': closeControls(); return ctx.pairing.open();
      case 'demo': closeControls(); return ctx.demo.toggle();
      case 'apps': return ctx.openApps();
      case 'color': return saveSettings({ carColor: el.dataset.color });
      case 'legal': return ctx.openLegal(el.dataset.legal);
      case 'releases': return ctx.openUrl(RELEASES_URL);
      case 'forget-songs':
        await ctx.forgetSongs();
        return ctx.toast('Stored songs removed from this device');
      case 'reset-trip':
        ctx.trips.reset(el.dataset.trip);
        return render();
      case 'reset-settings':
        if (!resetArmed) {
          resetArmed = true;
          return render();
        }
        return ctx.resetSettings();
      default:
    }
  });
}
