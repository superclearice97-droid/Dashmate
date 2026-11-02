# Changelog

## 0.8.0 — 2026-11-01

- **Phone can stay locked while it feeds GPS to the iPad** (experimental): once paired, the phone switches to background location (`@capacitor-community/background-geolocation`), lets its own screen turn off, and shows "You can lock this phone" with a Stop sharing button. Android shows a "DashMate is sharing GPS" notification while it runs. Unpairing stops it and restores the phone's normal keep-awake.
- DashMate no longer keeps a paired phone's screen on.
- **Weak location warning:** the GPS chip says **Wi-Fi location only** when position accuracy is worse than 100 m (Wi-Fi-only iPads), and tapping it explains why the car arrow can't follow the road and what fixes it (Bluetooth GPS receiver, cellular iPad, or pairing the phone).
- Privacy policy and notices updated for background location.

## 0.7.0 — 2026-11-01

- **Connect Spotify** (optional, experimental): control Spotify on any of your devices from DashMate's media card (song, artist, cover art, which device, play/pause/skip) and start your Spotify playlists from the Music panel. Sign-in uses Spotify's own page with PKCE, so DashMate never handles your password and stores no secret; access keys stay on the device. Needs Spotify Premium and a one-time owner setup (docs/SPOTIFY-SETUP.md).
- Sign-in returns through a small static page on GitHub Pages (docs/spotify-callback.html), because Spotify only accepts https return addresses.
- The media card picks what to show in this order: DashMate's own songs while they play, then the music app on this device, then Spotify; DashMate's own player is unchanged.
- Privacy policy and terms updated for Spotify.

## 0.6.0 — 2026-11-01

- **Control your music apps** from DashMate's media card: song, artist, album art, play/pause, next, previous (experimental).
  - Android: Spotify, Apple Music, YouTube Music and others, via the system's media controls. Needs notification access, which DashMate uses only for media controls.
  - iPad/iPhone: Apple Music, plus your library playlists in the Music panel. iOS doesn't let apps control Spotify or other music apps.
- **Pairing fix:** the pairing QR code is now a `dashmate://` link. Scanning it with the phone's normal camera opens DashMate (when installed) straight to the phone's reply code, instead of "no app installed". Clearer pairing steps on screen.
- Privacy policy and notices updated for music control and the `@capacitor/app` plugin.

## 0.5.0 — 2026-10-31

- New **Controls** screen in the style of an EV's settings: it opens over the map so the car view stays visible, with a settings search, quick-control tiles and categories (Display, Navigation, Speed & alerts, Road reading, Trips, Sound & media, Phone pairing, Privacy, Software). Full screen on phones.
- **Trip A / Trip B** odometers that keep counting across drives (stored on the device), alongside the current drive.
- **Speed limit warning**: Off / Display / Chime, plus the offset.
- **Green traffic light chime** can be switched off.
- **Avoid highways, tolls, ferries** for routes; if the route server can't, you're told and get the normal route.
- **12/24-hour clock**; **Reset all settings** (keeps trips and songs).

## 0.4.0 — 2026-10-31

- Road reading has a **Detail** switch: Fast (YOLOX-Nano, as before) or Detailed (YOLOX-S, 640 px), which spots smaller and farther objects but updates about once a second. The panel shows how often it is updating. The app is about 36 MB bigger because the larger model is built in, so it works offline.
- Fixed: the "Green · go" alert could not fire when updates are seconds apart; it now does (regression test added).

## 0.3.0 — 2026-10-31

- Road reading identifies more street objects with the same on-device model: trucks, buses, motorcycles, bicycles, trams/trains, dogs, cats, horses and stop signs, as well as cars, people and traffic lights (experimental).
- Each detection on the camera view is labelled with what it is and how sure the model is (e.g. "Truck 82%", "Red light 75%").
- Count chips show only what is in view ("2 cars · 1 truck · 3 people").
- The 3D view draws trucks, buses, trams, motorcycles and bicycles with riders, animals and stop signs in their own shapes. The demo drive adds a truck and a cyclist.

## 0.2.0 — 2026-10-31

Closer to a modern EV dashboard.

- Car view fills the left panel: multi-lane road that fades into the distance, with the cars, people and traffic lights seen by road reading drawn around your car (experimental, like road reading itself). The demo drive simulates traffic so you can see it at home.
- P R N D gear strip, guessed from movement.
- Auto look now follows sunrise and sunset at your position (computed on the device).
- Navigate bar at the top of the map; turn card with arrival time, minutes and distance; tap it for the full list of turns.
- Media card on the map; bottom bar with car button (Controls), apps and volume ‹ ›.
- New Controls screen with trip distance, average and top speed (and Reset trip), plus a volume setting.
- Quieter grey day map (OpenFreeMap Positron).

## 0.1.0 — 2026-10-31

First version.

- iPad dashboard: speed, speed limit, 3D car view, trip stats, music, map with turn-by-turn directions.
- Phone Drive Mode (upright and sideways).
- Directions: place search (Photon), routes (OSRM/FOSSGIS), spoken cues, rerouting when off route.
- Speed limits and street names from OpenStreetMap (Overpass API); "Slow down" alert.
- Local music player with optional on-device library.
- Demo drive.
- Experimental: phone ⇄ screen pairing over an encrypted, serverless WebRTC link using QR codes.
- Experimental: on-device road reading with YOLOX-Nano (cars, people, traffic lights, "Green · go").
- Settings with a switch for every online feature; first-run terms, safety notice and privacy choices.
- Android APK and unsigned iOS IPA built by GitHub Actions.
