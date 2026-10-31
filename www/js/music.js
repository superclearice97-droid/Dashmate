// A simple music player for songs you add from this device. Songs never leave the
// device; with "Remember my songs" on, they are kept in the app's local storage.
import { emit } from './bus.js';
import { settings } from './settings.js';

const audio = new Audio();
audio.preload = 'auto';
let tracks = [];
let index = -1;
let shuffle = false;
let url = null;

function parseName(file) {
  const base = file.name.replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ').trim();
  const m = base.match(/^(.+?)\s+-\s+(.+)$/);
  return m ? { artist: m[1], title: m[2] } : { artist: 'Your music', title: base };
}

// ---- local storage (IndexedDB)
function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('dashmate', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('tracks', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function store(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction('tracks', mode);
    const r = fn(tx.objectStore('tracks'));
    tx.oncomplete = () => resolve(r?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function initMusic() {
  try {
    if (settings.rememberMusic) {
      const saved = await store('readonly', (s) => s.getAll());
      tracks = (saved || []).sort((a, b) => a.added - b.added);
    }
  } catch { /* storage unavailable: start with an empty library */ }
  publish();
}

export async function addFiles(files) {
  const added = [];
  for (const f of files) {
    if (!f.type.startsWith('audio/') && !/\.(mp3|m4a|aac|wav|flac|ogg|opus)$/i.test(f.name)) continue;
    added.push({ id: crypto.randomUUID(), added: Date.now() + added.length, ...parseName(f), blob: f });
  }
  tracks.push(...added);
  if (settings.rememberMusic) {
    try {
      await store('readwrite', (s) => added.forEach((t) => s.put({ ...t, blob: t.blob })));
    } catch { /* not enough space: songs stay for this session only */ }
  }
  if (index === -1 && tracks.length) load(0, false);
  publish();
}

export async function removeTrack(id) {
  const i = tracks.findIndex((t) => t.id === id);
  if (i < 0) return;
  tracks.splice(i, 1);
  try { await store('readwrite', (s) => s.delete(id)); } catch { /* ignore */ }
  if (i === index) {
    audio.pause();
    index = -1;
    if (tracks.length) load(Math.min(i, tracks.length - 1), false);
  } else if (i < index) index--;
  publish();
}

export async function forgetAllMusic() {
  try { await store('readwrite', (s) => s.clear()); } catch { /* ignore */ }
}

function load(i, play = true) {
  if (!tracks.length) return;
  index = (i + tracks.length) % tracks.length;
  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(tracks[index].blob);
  audio.src = url;
  if (play) audio.play().catch(() => {});
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: tracks[index].title, artist: tracks[index].artist, album: 'DashMate' });
  }
  publish();
}

export function playTrack(id) {
  const i = tracks.findIndex((t) => t.id === id);
  if (i >= 0) load(i);
}

export function togglePlay() {
  if (index === -1) {
    if (tracks.length) load(0);
    return;
  }
  if (audio.paused) audio.play().catch(() => {});
  else audio.pause();
}

export function next() {
  if (!tracks.length) return;
  load(shuffle && tracks.length > 1 ? (index + 1 + Math.floor(Math.random() * (tracks.length - 1))) % tracks.length : index + 1);
}

export function prev() {
  if (audio.currentTime > 4) audio.currentTime = 0;
  else load(index - 1);
}

export function toggleShuffle() {
  shuffle = !shuffle;
  publish();
}

export function seek(fraction) {
  if (audio.duration) audio.currentTime = fraction * audio.duration;
}

function publish() {
  emit('music', {
    track: tracks[index] || null,
    playing: !audio.paused,
    position: audio.currentTime || 0,
    duration: audio.duration || 0,
    tracks,
    shuffle,
  });
}

audio.addEventListener('play', publish);
audio.addEventListener('pause', publish);
audio.addEventListener('ended', next);
audio.addEventListener('timeupdate', () => emit('music-time', { position: audio.currentTime, duration: audio.duration || 0 }));

if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  ms.setActionHandler('play', togglePlay);
  ms.setActionHandler('pause', togglePlay);
  ms.setActionHandler('nexttrack', next);
  ms.setActionHandler('previoustrack', prev);
}
