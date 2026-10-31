// Alert chimes (generated, no sound files) and spoken directions.
import { settings } from './settings.js';

let ctx = null;
const unlock = () => {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* no Web Audio */ }
};
window.addEventListener('pointerdown', unlock, { passive: true });

// kind: 'go' (two rising notes) or 'warn' (two low notes)
export function chime(kind) {
  if (!settings.chimes || !ctx) return;
  const notes = kind === 'go' ? [660, 990] : [440, 330];
  notes.forEach((f, i) => {
    const t = ctx.currentTime + i * 0.16;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.01, 0.4 * settings.volume), t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.3);
  });
}

export function speak(text) {
  if (!settings.voice || !('speechSynthesis' in window) || !text) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.02;
  u.volume = settings.volume;
  u.lang = navigator.language || 'en-US';
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
