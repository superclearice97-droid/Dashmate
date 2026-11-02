// Speed cameras and road hazards on the road ahead: fetching them (with the speed-limit
// switch), the cards on the map and the voice/tone alerts. The logic is in core/roadside.js.
import { settings } from './settings.js';
import { fetchRoadside, fetchCountry } from './services.js';
import {
  upcoming, RoadsideWatcher, cameraWarningsAllowed, CAMERA_KINDS, HAZARD_KINDS, NO_CAMERA_WARNINGS,
} from './core/roadside.js';
import { distance } from './core/geo.js';
import { chime, speak } from './sound.js';
import { distanceText, spokenDistance, limitValue, speedUnit } from './core/units.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let items = [];
let fetchedAt = null;      // where the last list was fetched
let country = null;        // ISO code, once known
let countryAt = null;
let busy = false;
let retryAfter = 0;
let demoItems = null;      // set while the demo drive runs
const watcher = new RoadsideWatcher();

export const currentCountry = () => (demoItems ? 'US' : country);
export const cameraWarningsHere = () => cameraWarningsAllowed(currentCountry());
// The name of the country when camera warnings are switched off there by law.
export const camerasBannedIn = () => NO_CAMERA_WARNINGS[currentCountry()] ?? null;
export const roadsideCount = () => (demoItems ?? items).filter((i) => CAMERA_KINDS.includes(i.kind)).length;

export function setDemoRoadside(list) {
  demoItems = list;
  watcher.reset();
  render({ camera: null, hazard: null });
}

function wanted() {
  return settings.cameras || Object.values(settings.hazards).some(Boolean);
}

async function refresh(pos) {
  if (demoItems || busy || !settings.online.limits || !wanted() || Date.now() < retryAfter) return;
  const needCountry = settings.cameras && (!country || distance(countryAt, pos) > 25000);
  const needItems = !fetchedAt || distance(fetchedAt, pos) > 500;
  if (!needCountry && !needItems) return;
  busy = true;
  try {
    if (needCountry) {
      const c = await fetchCountry(pos);
      if (c) {
        country = c;
        countryAt = pos;
      }
    }
    if (needItems) {
      items = await fetchRoadside(pos);
      fetchedAt = pos;
    }
  } catch (e) {
    console.warn('[roadside]', e.message);
    retryAfter = Date.now() + 60000;
  } finally {
    busy = false;
  }
}

// Which items the user wants warnings for, here.
function enabled(item) {
  if (CAMERA_KINDS.includes(item.kind)) {
    return settings.cameras && cameraWarningsHere() && (item.kind !== 'redlight' || settings.redlight);
  }
  return HAZARD_KINDS.includes(item.kind) && settings.hazards[item.kind];
}

// Called on every position update. route: {line, cum, along} while navigating, else null.
export function updateRoadside({ pos, heading, speed, odo, route }) {
  if (!pos) return;
  refresh(pos);
  const list = (demoItems ?? items).filter(enabled);
  const ahead = upcoming(list, { pos, heading, route });
  const r = watcher.update({ ahead, pos, speedMps: speed, odo, t: Date.now() });
  for (const a of r.announce) announce(a);
  render(r);
}

function limitText(kmh) {
  const v = limitValue(kmh, settings.units);
  return v == null ? '' : `, limit ${v}`;
}

function announce({ item, dist }) {
  const cam = CAMERA_KINDS.includes(item.kind);
  const mode = cam ? settings.cameraAlert : settings.hazardAlert;
  if (mode === 'banner') return;
  chime(cam ? 'camera' : 'ding');
  if (mode !== 'voice' || !settings.voice) return; // just the tone while voice guidance is off
  const what = item.kind === 'average' ? 'Average speed zone' : item.label;
  speak(`${what} in ${spokenDistance(dist, settings.units)}${cam ? limitText(item.limit) : ''}`, { queue: true });
}

const ICON = {
  camera: '<svg viewBox="0 0 24 24"><path d="M9 4 7.5 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.5L15 4H9Zm3 4.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z"/></svg>',
  redlight: '<svg viewBox="0 0 24 24"><path d="M9 2h6a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm3 2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Zm0 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"/></svg>',
  zone: '<svg viewBox="0 0 24 24"><path d="M12 4a9 9 0 0 0-7.8 13.5l1.7-1A7 7 0 1 1 19 12a7 7 0 0 1-.9 3.5l1.7 1A9 9 0 0 0 12 4Zm3.7 3.9-4.6 4.3a1.5 1.5 0 1 0 1.8 1.8l2.8-6.1Z"/></svg>',
  hazard: '<svg viewBox="0 0 24 24"><path d="M12 2 1 21h22L12 2Zm-1 7h2v6h-2V9Zm0 8h2v2h-2v-2Z"/></svg>',
};

function sign(kmh) {
  const v = limitValue(kmh, settings.units);
  if (v == null) return '';
  return settings.units === 'imperial'
    ? `<span class="rs-limit us"><small>LIMIT</small>${v}</span>`
    : `<span class="rs-limit">${v}</span>`;
}

function cameraCard(c) {
  const u = settings.units;
  if (c.type === 'zone') {
    const avg = limitValue(c.avg, u);
    return `<div class="rs-card zone${c.over ? ' over' : ''}" role="status">
      <span class="rs-icon">${ICON.zone}</span>
      <span class="rs-main"><small>Average speed zone</small><b>${avg} <i>${speedUnit(u).toLowerCase()} avg</i></b><em>${esc(distanceText(c.left, u))} to the end</em></span>
      ${sign(c.limit)}<span class="rs-bar"><i style="width:${Math.round(100 * Math.max(0, Math.min(1, 1 - c.left / distance(c.item.pos, c.item.end))))}%"></i></span></div>`;
  }
  const title = c.type === 'redlight' ? 'Red-light camera' : c.type === 'average' ? 'Average speed zone ahead' : 'Speed camera';
  return `<div class="rs-card rs-cam${c.over ? ' over' : ''}" role="status">
    <span class="rs-icon">${ICON[c.type === 'redlight' ? 'redlight' : 'camera']}</span>
    <span class="rs-main"><small>${title}</small><b>${esc(distanceText(c.dist, u))}</b></span>
    ${sign(c.limit)}<span class="rs-bar"><i style="width:${Math.round(c.progress * 100)}%"></i></span></div>`;
}

function hazardCard(h) {
  return `<div class="rs-card hazard" role="status"><span class="rs-icon">${ICON.hazard}</span>
    <span class="rs-main"><b class="rs-what">${esc(h.item.label)}</b><em>${esc(distanceText(h.dist, settings.units))}</em></span></div>`;
}

let lastHtml = '';
function render(r) {
  const el = $('#roadside');
  if (!el) return;
  const html = (r.camera ? cameraCard(r.camera) : '') + (r.hazard ? hazardCard(r.hazard) : '');
  if (html !== lastHtml) {
    el.innerHTML = html;
    lastHtml = html;
  }
  el.hidden = !html;
  if (!html) return;
  // Sit under the turn card (or the Navigate bar).
  const nav = $('#nav-card');
  const above = nav && !nav.hidden ? nav : $('#where-to');
  el.style.top = above && above.offsetParent ? `${above.offsetTop + above.offsetHeight + 8}px` : '';
}
