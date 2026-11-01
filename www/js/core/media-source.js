// Which music the dashboard shows and controls: DashMate's own player, or the
// music app playing on the device (Spotify, Apple Music…) when DashMate can see it.
//   local:  {track, playing}
//   system: {active, playing, title} or null
export function pickSource(local, system) {
  if (local?.playing) return 'local';
  if (system?.active && (system.playing || !local?.track)) return 'system';
  return 'local';
}
