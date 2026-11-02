// User settings, stored only on this device.
import { defaultUnits } from './core/units.js';

const KEY = 'dashmate.settings.v1';
export const TERMS_VERSION = 2;

const DEFAULTS = {
  units: defaultUnits(typeof navigator !== 'undefined' ? navigator.language : 'en-US'),
  theme: 'auto',            // auto | light | dark
  carColor: '#eef0f3',
  volume: 0.6,              // DashMate's own sounds: music and spoken directions
  voice: true,              // spoken directions
  chimes: true,             // alert sounds
  detail: 'fast',           // road reading: fast | detailed
  speedWarn: 'chime',       // speed limit warning: off | display | chime
  greenChime: true,         // chime when the light ahead turns green while stopped
  time24: false,            // 24-hour clock
  avoid: { tolls: false, highways: false, ferries: false },
  overBy: 5,                // "Slow down" when this much over the limit (in the user's units)
  rememberMusic: true,      // keep added songs on this device
  cameras: true,            // speed camera warnings (only where legal; needs speed limits online)
  redlight: true,           // include red-light cameras
  cameraAlert: 'voice',     // voice | tone | banner
  hazards: { bump: true, rail: true, hazard: true }, // road hazard warnings by kind
  hazardAlert: 'voice',     // voice | tone | banner
  followWarn: true,         // road reading: warn when following too closely
  queueChime: true,         // road reading: chime when the queue ahead moves off
  home: null,               // {title, coord} saved places, kept only on this device
  work: null,
  recent: [],               // last few destinations, kept only on this device
  online: {                 // every feature that talks to the internet can be switched off
    map: true,
    nav: true,
    limits: true,
    weather: false,
  },
  acceptedTerms: 0,         // TERMS_VERSION the user accepted
};

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULTS, ...saved, online: { ...DEFAULTS.online, ...(saved.online || {}) }, avoid: { ...DEFAULTS.avoid, ...(saved.avoid || {}) }, hazards: { ...DEFAULTS.hazards, ...(saved.hazards || {}) } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export const settings = load();
const listeners = new Set();

export function saveSettings(patch = {}) {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch { /* private mode or storage blocked: settings last for this session */ }
  for (const fn of listeners) fn(settings);
}

export const onSettings = (fn) => listeners.add(fn);
