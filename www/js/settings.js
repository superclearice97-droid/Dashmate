// User settings, stored only on this device.
import { defaultUnits } from './core/units.js';

const KEY = 'dashmate.settings.v1';
export const TERMS_VERSION = 1;

const DEFAULTS = {
  units: defaultUnits(typeof navigator !== 'undefined' ? navigator.language : 'en-US'),
  theme: 'auto',            // auto | light | dark
  carColor: '#eef0f3',
  volume: 0.6,              // DashMate's own sounds: music and spoken directions
  voice: true,              // spoken directions
  chimes: true,             // alert sounds
  detail: 'fast',           // road reading: fast | detailed
  overBy: 5,                // "Slow down" when this much over the limit (in the user's units)
  rememberMusic: true,      // keep added songs on this device
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
    return { ...DEFAULTS, ...saved, online: { ...DEFAULTS.online, ...(saved.online || {}) } };
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
