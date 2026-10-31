# DashMate

A car dashboard for the device you already have. Mount an iPad, iPhone or Android phone/tablet in the car and get:

- **Your speed, big**, with the **speed limit** sign next to it (from OpenStreetMap), and a **"Slow down"** alert when you're over it.
- **Your car in 3D** on a road whose lane lines move with your real speed.
- **Turn-by-turn directions** on a 3D map, with spoken instructions, arrival time and automatic rerouting.
- **Your music**: play songs stored on the device, or jump to your music app.
- **Trip numbers**: distance, average and top speed.
- **Drive Mode on phones**: works upright or sideways.
- **Phone as the GPS** for a Wi-Fi-only iPad (experimental): pair once with two QR codes and the iPad uses the phone's location.
- **Road reading** (experimental): the phone's camera spots cars, people and traffic lights on the device, tells you when a red light turns green while you're stopped, and shows the car ahead in the 3D view.
- **Demo drive** (Settings › Try it) to see everything at home.

It is free and open source, has no accounts, ads or analytics, and every online feature can be switched off. See [PRIVACY.md](PRIVACY.md).

## Download

Get the newest **DashMate.apk** (Android) and **DashMate.ipa** (iPad/iPhone) from the [Releases](../../releases/latest) page.
Step-by-step install instructions: [docs/INSTALL.md](docs/INSTALL.md).

## What's tested and what isn't

| Feature | Status |
|---|---|
| Speed, trip numbers, speed-limit parsing, "Slow down" logic, navigation progress, rerouting trigger, spoken cue timing, detection maths, pairing codes | Covered by unit tests (`npm test`) |
| iPad and phone layouts, light/dark, demo drive, settings, music panel, pairing screens | Checked in a desktop browser at iPad and iPhone sizes |
| Live map tiles, routing, search, speed limits from the internet | Built to each service's public API; not tried on a real drive yet |
| **Phone ⇄ iPad pairing** | **Experimental**: not yet tried on real devices |
| **Road reading (camera)** | **Experimental**: not yet tried on real devices; not a safety system |

## How it's built

One web app (`www/`) wrapped as native apps with [Capacitor](https://capacitorjs.com/). GitHub Actions builds both apps on every push to `main` (`.github/workflows/build.yml`):

- Android: `npx cap add android`, patched by `scripts/patch-native.mjs`, built with Gradle and signed.
- iOS: `npx cap add ios`, patched, built unsigned with Xcode on a macOS runner, packaged as an `.ipa` for sideloading.

Third-party libraries are installed from npm at the pinned versions in `package.json` and copied in by `scripts/vendor.mjs`; the YOLOX-Nano model is downloaded from the official YOLOX release and checked against a SHA-256 hash. None of these are committed. The icon PNGs in `resources/` are generated from `resources/icon.svg` by `scripts/make-icons.cjs`.

### Run it on a computer

```bash
npm install
npm run vendor
npm run serve     # http://localhost:8080 (use Settings › Try it › Start demo drive)
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

DashMate is an independent project, not affiliated with Apple, Google, any car maker or any music service.
