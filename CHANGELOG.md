# Changelog

## 0.10.0 — 2026-11-03

- **Speed camera warnings** (experimental): fixed, red-light and average-speed cameras from OpenStreetMap, about 20 seconds ahead (300 m in town, up to 1 km on motorways), only on your road or route and in your direction where the map records it. A card counts down the distance, shows the limit and turns red when you're faster; in an average-speed zone it shows your average speed and the distance to the end. Alert: Voice, Tone or Banner only (Controls › Navigation), with a Listen button. Red-light cameras can be switched off separately.
- **Only where it's legal:** camera warnings are not offered in Germany, France, Switzerland, Austria, Belgium, Luxembourg, Liechtenstein, Cyprus, North Macedonia, Turkey or Kuwait, and stay off until DashMate knows the country (looked up from your position with the speed-limit service about every 25 km).
- **Road hazard warnings** (experimental): speed bumps (bumps, humps, cushions, raised crossings), railway crossings and hazard signs (animals, dangerous bends and junctions, school zones, falling rocks…) from OpenStreetMap, as a yellow card with a soft ding; each kind can be switched off; Voice, Tone or Banner only.
- **Following distance** (road reading, experimental): a chip under the car view shows the distance and time gap to the car ahead in your lane; **Too close** when you're under 1 second behind above 30 km/h for 2 seconds; **Traffic is moving** chime when the car ahead pulls away while you're stopped. Both can be switched off (Speed & alerts).
- **Phone Drive Mode 3D tab**: the car view with what road reading sees, under the map.
- **Home, Work and recent destinations**: set Home/Work to your current location in Controls › Navigation; they and your last five destinations appear before you search. Kept only on the device, with Clear buttons.
- The demo drive has made-up cameras and hazards, and the car ahead pulls away at the red light.
- Terms (version 2) and privacy policy updated for camera and hazard warnings and saved places; you'll be asked to accept the terms once more.

## 0.9.0 — 2026-11-02

- **The paired phone really keeps sending GPS with its screen off or another app open** (experimental). In 0.8.0 the phone kept reading its location but the app's web code was paused in the background, so nothing reached the iPad. Now native code on both devices does it:
  - Phone: Android runs a location service with a "DashMate is sharing GPS" notification (with a Stop sharing button); iPhone uses background location (the location arrow shows). Either reads GPS about once a second and sends each position straight to the screen over the hotspot.
  - Screen: listens for those positions and ignores anything else.
  - Each position is encrypted and signed with AES-256-GCM using a fresh random key that the screen hands over through the encrypted pairing link; old positions can't be replayed, and positions only go to private local-network addresses.
- The screen no longer says "Pairing lost" while positions keep arriving, and says **Not hearing from the phone** if they stop.
- Stop sharing (in DashMate or the Android notification) and Disconnect no longer also show "Pairing lost".
- Removed the `@capacitor-community/background-geolocation` plugin that 0.8.0 used.
- iOS asks for local network access (needed to reach the other device). Privacy policy updated.

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
