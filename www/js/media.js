// Music playing in other apps on this device, through DashMate's built-in native plugin:
//   Android: any music app (Spotify, Apple Music, YouTube Music…) via media sessions,
//            after the user turns on notification access for DashMate once.
//   iOS:     Apple Music only (Apple doesn't let apps control other music apps).
// In a desktop browser there is no plugin and this stays quiet.
import { emit } from './bus.js';

let plugin = null;
let status = null;
let timer = null;
let artKey = null;
let artwork = null;
let current = { active: false };

export async function initSystemMusic() {
  if (!window.Capacitor?.isNativePlatform?.()) return;
  try {
    plugin = window.Capacitor.registerPlugin('DashMedia');
    status = await plugin.status();
  } catch {
    plugin = null;
    return;
  }
  emit('system-music-status', status);
  // Coming back from Android's or iOS's settings screen: check whether access was granted.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshStatus(); });
  poll();
}

async function refreshStatus() {
  if (!plugin) return;
  try {
    status = await plugin.status();
    emit('system-music-status', status);
  } catch { /* ignore */ }
}

async function poll() {
  clearTimeout(timer);
  if (plugin && status?.allowed && !document.hidden) {
    try {
      const r = await plugin.nowPlaying({ art: false });
      if (r.active && r.artKey !== artKey) {
        artKey = r.artKey;
        artwork = (await plugin.nowPlaying({ art: true })).artwork || null;
      }
      current = { ...r, artwork: r.active ? artwork : null };
      emit('system-music', current);
    } catch { /* nothing playing, or access was turned off */ }
  }
  timer = setTimeout(poll, 1000);
}

export const systemStatus = () => status;
export const systemNow = () => current;

export async function requestSystemAccess() {
  if (!plugin) return false;
  const r = await plugin.requestAccess();
  await refreshStatus();
  return r.allowed;
}

// action: 'toggle' | 'play' | 'pause' | 'next' | 'previous'
export async function controlSystem(action) {
  if (!plugin) return;
  try {
    await plugin.control({ action });
  } catch (e) {
    emit('system-music-error', e.message);
  }
  setTimeout(poll, 300);
}

export async function systemPlaylists() {
  if (!plugin || !status?.allowed) return [];
  try {
    return (await plugin.playlists()).playlists || [];
  } catch {
    return [];
  }
}

export async function playSystemPlaylist(id) {
  await plugin?.playPlaylist({ id });
  setTimeout(poll, 500);
}
