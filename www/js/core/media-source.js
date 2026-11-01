// Which music the dashboard shows and controls:
//   'local'   DashMate's own player (songs stored on this device)
//   'system'  the music app playing on this device (Android: any app; iOS: Apple Music)
//   'spotify' Spotify, through your connected Spotify account (any of your devices)
// Something playing wins; DashMate's own songs win when nothing plays.
//   local: {track, playing}; system / spotify: {active, playing} or null
export function pickSource(local, system, spotify = null) {
  if (local?.playing) return 'local';
  if (system?.active && system.playing) return 'system';
  if (spotify?.active && spotify.playing) return 'spotify';
  if (local?.track) return 'local';
  if (system?.active) return 'system';
  if (spotify?.active) return 'spotify';
  return 'local';
}
