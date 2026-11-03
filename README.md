# DashMate

A car dashboard for the device you already have. Mount an iPad, iPhone or Android phone/tablet in the car and get:

- **Your speed, big**, with the **speed limit** sign next to it (from OpenStreetMap), and a **"Slow down"** alert when you're over it.
- **A modern EV-style layout**: car view on the left, full map on the right, media card on the map, and a bottom bar with apps and volume.
- **Your car in 3D on the real streets around you**: the streets and buildings from the map, seen from just behind your car, with your route as a blue lane (or a simple drawn road with lane lines, if you prefer or the map is off). With road reading on, the **cars, people and traffic lights the camera sees appear around your car** where they are.
- **P R N D gear strip**: DashMate can't read your car, so it guesses from movement (D while driving or briefly stopped, P after two minutes parked).
- **Day and night look** that switches at sunrise and sunset where you are (worked out on the device, no internet).
- **Turn-by-turn directions** on a 3D map, with spoken instructions, arrival time and automatic rerouting.
- **Your music**: play songs stored on the device, and **control the music app that's playing** from DashMate's media card (song, artist, album art, play/pause/skip):
  - **Android**: works with Spotify, Apple Music, YouTube Music and other apps, after you turn on notification access for DashMate once.
  - **iPad/iPhone**: Apple Music, including your library playlists. Apple doesn't let apps control other music apps on iOS, so Spotify works through **Connect Spotify** instead.
  - **Connect Spotify** (any device, optional): sign in once and control Spotify on any of your devices, and play your Spotify playlists. Needs Spotify Premium and a one-time setup by the DashMate owner: see [docs/SPOTIFY-SETUP.md](docs/SPOTIFY-SETUP.md). DashMate's own player for songs on the device keeps working alongside.
- **Controls screen** modelled on an EV's: search box, quick-control tiles and categories (Display, Navigation, Speed & alerts, Road reading, Trips, Sound & media, Phone pairing, Privacy, Software). Only settings DashMate can really act on are shown; nothing controls the car itself.
- **Trips**: current drive plus **Trip A and Trip B**, which keep counting across drives until you reset them (distance, driving time, average and top speed).
- **Speed limit warning**: Off, Display or Chime, with an offset; **green traffic light chime** on/off.
- **Speed camera warnings** (fixed, red-light and average-speed cameras from OpenStreetMap): announced about 20 seconds ahead (300 m in town, up to 1 km on motorways), only on your road or route and, where the map says, in your direction. The card counts down, shows the limit and turns red when you're faster; in an **average-speed zone** it shows your average and the distance to the end. Voice, tone or banner only, or off. **Only where it's legal:** in Germany, France, Switzerland, Austria, Belgium, Luxembourg, Liechtenstein, Cyprus, North Macedonia, Turkey and Kuwait the feature isn't there at all, and it stays off until DashMate knows which country you're in.
- **Road hazard warnings**: speed bumps, railway crossings and hazard signs (animals, dangerous bends and junctions, school zones, falling rocks) from OpenStreetMap, as a yellow card and a soft ding. Each kind can be switched off.
- **Home, Work and recent destinations** for quick navigation, kept only on the device.
- **Avoid highways, tolls or ferries** when routing; **12/24-hour clock**.
- **Drive Mode on phones**: works upright or sideways, with a **3D tab** showing the car view (and whatever road reading sees) under the map.
- **Phone as the GPS** for a Wi-Fi-only iPad (experimental): DashMate goes on both devices; point the phone's normal camera at the iPad's code (it opens DashMate), then show the phone's code to the iPad. The phone then **keeps sending with its screen off or while you use other apps**, straight to the iPad over the hotspot, encrypted (AES-256-GCM, a fresh key for each pairing, local network only). (For a fully independent iPad, use a Bluetooth GPS receiver; DashMate warns when it only has Wi-Fi location.)
- **Road reading** (experimental): the phone's camera identifies street objects on the device and labels them: **cars, trucks, buses, motorcycles, bicycles, trams/trains, people, dogs, cats, horses, traffic lights (with their colour) and stop signs**. It tells you when a red light turns green while you're stopped, shows **how far behind the car ahead you are** (metres/feet and seconds), says **Too close** when you're less than a second behind, chimes when **the queue ahead moves off**, and draws everything it sees around your car in the 3D view. Choose **Fast** (updates several times a second) or **Detailed** (a larger model that spots smaller, farther things but updates about once a second).
- **Demo drive** (car button › Controls › Software › Demo drive) to see everything at home.

It is free and open source, has no accounts, ads or analytics, and every online feature can be switched off. See [PRIVACY.md](PRIVACY.md).

## Download

Get the newest **DashMate.apk** (Android) and **DashMate.ipa** (iPad/iPhone) from the [Releases](../../releases/latest) page.
Step-by-step install instructions: [docs/INSTALL.md](docs/INSTALL.md).

## What's tested and what isn't

| Feature | Status |
|---|---|
| Speed, trip numbers, speed-limit parsing, "Slow down" logic, navigation progress, rerouting trigger, spoken cue timing, detection maths, pairing codes, sunrise/sunset, placing detections on the road, gear guess | Covered by unit tests (`npm test`) |
| iPad and phone layouts, light/dark, demo drive (with simulated traffic), turn list, Controls (tiles, categories, search, trips), music panel, pairing screens | Checked in a desktop browser at iPad and iPhone sizes |
| **Speed cameras and road hazards** | **Experimental**: reading OpenStreetMap tags, which items are ahead on your road or route and in your direction, the 20-second warning distance, countdown, "over the limit", average-speed zones and the country rules covered by unit tests; cards and alerts checked on the demo drive (which has made-up cameras and hazards). The Overpass queries are built to its documented query language but not yet tried against the live server, and how well OpenStreetMap covers cameras varies a lot by country |
| **Following distance, Too close, Traffic is moving** | **Experimental**: the logic is unit-tested and checked on the demo drive; distances come from one camera and are rough; not tried on real roads; not a safety system |
| Home/Work/recent destinations, phone 3D tab | Checked in a desktop browser |
| **Real streets in the car view** | Camera placement unit-tested; checked in a desktop browser on the demo drive with locally made test map tiles (light, dark, phone and tablet, switching to Simple road, map off). Not yet tried with the real OpenFreeMap tiles or on an iPad, where running two maps and the 3D view together may be slow on older models |
| Avoid highways/tolls/ferries | Built to OSRM's `exclude` option with a fallback to the normal route; not yet tried against the live route server |
| Live map tiles, routing, search, speed limits from the internet | Built to each service's public API; not tried on a real drive yet |
| **Background GPS link (phone → iPad)** | **Experimental**: the packet encryption is checked against an independent AES-256-GCM implementation (tampered, replayed, wrong-key and non-local packets rejected) in `npm test`; key handover, sending with the phone's web code stopped, and the "not hearing" warning tested end to end in a browser with the native parts simulated. The Android and iOS native code is compiled by the build but not yet tried on real phones, including how long each phone keeps sending with its screen off |
| **Phone ⇄ iPad pairing** | **Experimental**: the pairing link and reply flow are tested in a browser with simulated app links; the connection itself not yet confirmed on real devices |
| **Connect Spotify** | **Experimental**: sign-in (PKCE), token exchange, playback control and playlists tested in a browser against simulated Spotify servers; the relay page tested for iPad, Android and bad input; not yet tried with a real Spotify account |
| **Music app control** | **Experimental**: screen logic tested in a browser with a simulated native plugin; the Android and iOS native code is compiled by the build but not yet tried on real devices |
| **Road reading (camera)** | **Experimental**: identification, labels, light colour and Fast/Detailed switching checked end to end with street video fed in as the camera (Fast ~0.3 s, Detailed ~1.2 s per update in a desktop browser; phones are likely slower); not yet tried on real devices; misses small or distant objects and sometimes mistakes a sign or shelter for a car; not a safety system |

## How it's built

One web app (`www/`) wrapped as native apps with [Capacitor](https://capacitorjs.com/). GitHub Actions builds both apps on every push to `main` (`.github/workflows/build.yml`):

- Android: `npx cap add android`, patched by `scripts/patch-native.mjs`, built with Gradle and signed.
- iOS: `npx cap add ios`, patched, built unsigned with Xcode on a macOS runner, packaged as an `.ipa` for sideloading.

Third-party libraries are installed from npm at the pinned versions in `package.json` and copied in by `scripts/vendor.mjs`; the YOLOX-Nano and YOLOX-S models are downloaded from the official YOLOX release and checked against SHA-256 hashes. None of these are committed. The icon PNGs in `resources/` are generated from `resources/icon.svg` by `scripts/make-icons.cjs`.

### Run it on a computer

```bash
npm install
npm run vendor
npm run serve     # http://localhost:8080 (car button › Controls › Software › Demo drive)
npm test
```

### Android signing (one-time)

So each new APK installs as an update over the last one, the workflow signs with a key from two repository secrets:
`ANDROID_KEYSTORE_B64` (the keystore file, base64) and `ANDROID_KEYSTORE_PASSWORD`. The key alias must be `dashmate`. Without them, it signs with a one-off key and warns you.

## Data sources and services

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors · tiles by [OpenFreeMap](https://openfreemap.org) · routes by [OSRM](https://project-osrm.org) on the FOSSGIS server · search by [Photon](https://photon.komoot.io) (komoot) · speed limits via the [Overpass API](https://overpass-api.de) · weather by [Open-Meteo](https://open-meteo.com).

## Legal

- [Terms & safety](TERMS.md): set it up while parked; posted signs always beat the app; road reading is not a safety system.
- [Privacy](PRIVACY.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
- DashMate's own code: [MIT License](LICENSE)

DashMate is an independent project, not affiliated with Apple, Google, Tesla or any other car maker, or any music service. Its look follows common in-car dashboard conventions with its own original artwork, icons and sounds.
