**Downloads:** `DashMate.apk` for Android · `DashMate.ipa` for iPad/iPhone (sideload with SideStore or iloader; see [docs/INSTALL.md](https://github.com/superclearice97-droid/DashMate/blob/main/docs/INSTALL.md)).

### New in 0.10.0
- **Speed camera warnings** from OpenStreetMap (fixed, red-light, average-speed zones), about 20 seconds ahead, on your road or route. The card counts down, shows the limit and turns red if you're faster; in average-speed zones it shows your average. Voice, tone or banner (Controls › Navigation). **Not offered where the law forbids it** (Germany, France, Switzerland, Austria, Belgium, Luxembourg, Liechtenstein, Cyprus, North Macedonia, Turkey, Kuwait)
- **Road hazard warnings**: speed bumps, railway crossings and hazard signs, each switchable
- **Following distance** from road reading: distance and seconds to the car ahead, "Too close", and a chime when traffic ahead moves off
- **3D tab** in phone Drive Mode
- **Home, Work and recent destinations** when you tap Navigate
- All **experimental**: checked with unit tests and the demo drive (which has made-up cameras and hazards), not yet on real roads. You'll be asked to accept the updated terms once.

### New in 0.9.0
- **Fix:** the paired phone now really keeps sending GPS to the iPad **with its screen off or while you use other apps** (in 0.8.0 it stopped as soon as you left DashMate). Positions go straight to the iPad over the hotspot, encrypted (**experimental**, not yet tried on real phones). Install 0.9.0 on **both** devices and pair again. If the phone asks about your local network, tap Allow.
- The iPad tells you if it stops hearing from the phone

### New in 0.8.0
- The GPS chip warns **Wi-Fi location only** on Wi-Fi-only iPads; tap it for fixes (Bluetooth GPS receiver, cellular iPad, or pair your phone)

### New in 0.7.0
- **Connect Spotify** (**experimental**, not yet tried with a real account): control Spotify on any of your devices and play your Spotify playlists from DashMate. Needs Spotify Premium and a one-time owner setup (docs/SPOTIFY-SETUP.md); until then the Music panel says it isn't set up. DashMate's own player keeps working alongside.

### New in 0.6.0
- Control your music apps from the media card (**experimental**, not yet tried on real devices): Android works with Spotify, Apple Music, YouTube Music and more (turn on notification access once); iPad/iPhone controls Apple Music and plays your playlists
- Pairing fix: scan the iPad's code with the phone's normal camera and DashMate opens on the phone (install DashMate on the phone too)

### New in 0.5.0
- Controls screen modelled on an EV's: settings search, quick-control tiles, categories, all over the map with the car view still showing
- Trip A / Trip B that keep counting across drives
- Speed limit warning Off / Display / Chime; green traffic light chime on/off
- Avoid highways / tolls / ferries (falls back to the normal route if the server can't; not yet tried against the live server)
- 12/24-hour clock; reset all settings

### New in 0.4.0
- Road reading **Detail** switch: Fast, or Detailed (larger built-in model that spots smaller, farther things; about one update a second). Checked with street video fed in as the camera; not yet tried on real phones (**experimental**)
- "Green · go" alert now also works when updates are slow

### New in 0.3.0
- Road reading now identifies and labels cars, trucks, buses, motorcycles, bicycles, trams/trains, people, dogs, cats, horses, traffic lights (with colour) and stop signs, and draws each in the 3D view (**experimental**: checked on street-video frames, not yet on real devices; misses small or distant objects)

### New in 0.2.0
- Layout and car view closer to a modern EV dashboard: full-height car view, Navigate bar, turn card with turn list, media card on the map, bottom bar with volume
- Cars, people and traffic lights seen by the camera drawn around your car (**experimental**, part of road reading)
- P R N D strip (a guess from movement; DashMate can't read your car)
- Day/night look switches at sunrise and sunset; trip numbers moved to the car button › Controls

### Everything in DashMate
- Speed, speed-limit sign (OpenStreetMap) and "Slow down" alert
- 3D view of your car; lane lines move with your speed
- Turn-by-turn directions with voice, arrival time and rerouting
- Music player for songs on your device, plus shortcuts to music apps
- Trip distance, average and top speed
- Phone Drive Mode, upright or sideways; light and dark looks
- Demo drive (car button › Controls › Software)
- **Experimental:** phone-as-GPS pairing for Wi-Fi-only iPads (not yet tried on real devices)
- **Experimental:** road reading with the camera: identifies vehicles, bikes, people, animals, traffic lights and stop signs; "Green · go" (not yet tried on real devices; not a safety system)

Set up while parked. Posted signs always beat the app. See TERMS.md and PRIVACY.md.
