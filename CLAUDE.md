# DashMate: notes for the next session

DashMate is a car dashboard app in the style of an EV's centre screen. It runs on iPad, iPhone and Android, built from one web app with Capacitor. The owner uses it on a **Wi-Fi-only iPad** (the screen), with a **phone as the GPS**. The phone is on the hotspot and should stay **locked in a pocket**.

Read README.md for the feature list and CHANGELOG.md for the history. This file covers what the code doesn't say: how things fit together, the owner's standing rules, and the open problem.

## The open problem (start here)

**Update (0.13.0, 2026-11-05):** the owner sent a video of the iPad driving at 62 mph with the chip on "Wi-Fi location only" (the iPad's own guess, so the phone link wasn't feeding it) and said the app "does not work at all how it is intended" and that they shouldn't have to plug the phone in for us to fix it. Root causes found in the 0.12.0 design: pairing was in-memory only (new key and random port each time, a full two-QR pairing every drive), and the phone sent only to the iPad's IPs from pairing time, so any address change or restart broke it with no recovery. 0.13.0 fixes that: pairing is stored (`beacon.js`/`core/gps.js loadPairing`), the iPad listens on fixed port 47231, and the phone sweeps its own hotspot subnet (`BeaconPacket.sweepHosts` / Swift `sweepHosts`; hotspot interfaces only: `ap/swlan/wlan1+/rndis` on Android, `bridge*` on iOS). Still **unconfirmed on real devices**; the Swift code was never compiled locally. Don't ask the owner for screenshots first; build things so they diagnose themselves.

**Update (0.13.1, 2026-11-06):** the owner tried 0.13.0: the link still drops when the phone's screen is off and returns when it is unlocked (so resume works, background sending doesn't), and the speedometer was wrong (a stale last speed held forever; fixed with `gpsStale`/`ignoreWifiGuess`). Root cause of the drop is **still unknown** and can't be found by reading the code (manifest, foreground service, UIBackgroundModes and Info.plist keys all look right). 0.13.1 makes the phone report it itself after a lock (`core/gps.js lockReport`, wired in `app.js` visibilitychange: sender counters before/after) — ask the owner for that message (a screenshot is enough), not for cables. Also still unknown: iPhone or Android.

**The iPad loses the phone when the phone's screen turns off.** The owner has reported this several times. Versions 0.8.0 and 0.9.0 were attempted fixes that didn't work. 0.12.0 (current) is the latest attempt and **has not been confirmed on real devices**.

What's known about the problem:

- **Pairing link:** WebRTC data channel between the two devices' web views (`www/js/link.js`). It can't survive the phone being backgrounded, because the web view is paused.
- **0.8.0:** used a background-location plugin. Location kept coming in natively, but the paused web code never sent it. It was removed in 0.9.0.
- **0.9.0+ background link:** native code on both sides (`plugins/dashmate-media`, plugin name `DashLink`).
  - Phone: sends AES-256-GCM encrypted UDP packets about once a second.
    - Android: `BeaconService.java`, a foreground service of type location, with a notification.
    - iPhone: `DashLinkPlugin.swift`, using CLLocationManager with background updates.
  - Screen: listens on a UDP port (`listen()`) and emits a `fix` event to JS.
  - Pairing: the screen sends the phone a fresh key, its port and its private IPv4 addresses over the WebRTC channel.
  - Packet format: `BeaconPacket.java` / `Beacon.swift`. It's cross-checked against Node in `test/beacon.test.mjs`.
- **0.12.0 changes:**
  - **iPhone local network permission:** iPhone sends to the hotspot need iOS "Local Network" permission. Without it, iOS blocks sends from the background *silently* (Apple TN3179). The iPhone now triggers the permission alert during pairing (`BeaconSender.askForLocalNetwork`). Receiving UDP unicast on the iPad needs no permission.
  - **Confirmation before "you can lock it":** the phone only says "you can lock this phone" after the screen acknowledges receiving background packets (`beacon-ack` over WebRTC).
  - **Diagnosis on the phone:** if there's no acknowledgement within 8 s, the phone shows the reason, built from native counters (`isSending()` returns fixes/sent/failed/lastError; mapping in `core/gps.js linkProblem`).
  - **Version check:** both sides exchange their version (`hello`) and warn if they differ.

**Not yet known:**

- Whether the owner's phone is an **iPhone or Android**.
- Which message the 0.12.0 phone shows after pairing.

Ask for that screenshot first.

### Debugging with the devices plugged into the PC (CachyOS)

- **Android:** `adb` (package `android-tools`).
  - Install builds: `adb install -r DashMate.apk`.
  - Native logs: `adb logcat -s DashMateBeacon`.
  - JS console logs don't appear in release builds (Capacitor `loggingBehavior` defaults to debug only). Set `"loggingBehavior": "production"` in `capacitor.config.json` temporarily to see `[beacon]`/`[streets]` warnings in logcat.
- **iPhone / iPad:** `libimobiledevice` (`idevicesyslog`). `usbmuxd` is already installed for iloader.
  - The Swift side has no `os_log` yet. Add some to `DashLinkPlugin.swift` if needed.
  - The `.ipa` must be re-sideloaded with iloader/SideStore after each build.
- **Things to watch when the phone locks:**
  - The sender's `sent`/`failed` counters and `lastError`.
  - Whether the Android service survives (some OEMs kill foreground services; check battery optimisation).
  - Whether iOS keeps delivering `didUpdateLocations` in the background.

## How it's built

- **Web app:** `www/`. Plain ES modules, no bundler, no framework. `www/js/app.js` wires everything together.
  - Pure, tested logic lives in `www/js/core/`.
  - Everything that touches the internet is in `www/js/services.js`, each call behind its own switch in Controls.
- **Native shell:** Capacitor 8.5.3. Native projects are **not committed**. CI runs `npx cap add android|ios`, then `scripts/patch-native.mjs` (permissions, Info.plist keys, icons, version numbers). Its `edit()` helper throws if a patch doesn't apply.
- **Our native plugin:** `plugins/dashmate-media` (a `file:` dependency).
  - Plugins: `DashMedia` (music control) and `DashLink` (background GPS link).
  - The Capacitor CLI finds iOS plugin classes by the first `@objc(Name)` in each `.swift` file. So keep one plugin class per file, and no other `@objc(` before it.
- **Third-party code:** pinned in `package.json`, copied into `www/vendor` by `scripts/vendor.mjs`. The YOLOX models are downloaded there and SHA-256 checked. Nothing vendored is committed.
- **CI:** `.github/workflows/build.yml` runs on every push to `main`.
  - `test` job: needs Java for the beacon tests.
  - `android` job: signed with the repo secrets `ANDROID_KEYSTORE_B64` / `ANDROID_KEYSTORE_PASSWORD`, alias `dashmate`.
  - `ios` job: unsigned `.ipa`.
  - `release` job: publishes `v<version>-build.<run>` with `DashMate.apk` and `DashMate.ipa`.
- **Version:** bump it in **two places**: `package.json` and `const VERSION` in `www/js/app.js`. Add a CHANGELOG.md entry and a `docs/RELEASE_NOTES.md` section (that file is the release body).

### Local commands

```bash
npm install && npm run vendor   # vendor needs network for the models
npm run serve                   # http://localhost:8080 — car button › Controls › Software › Demo drive
npm test                        # node --test test/*.test.mjs (beacon tests need javac)
```

The demo drive (Chicago loop) simulates GPS, road-reading traffic, a red light, made-up speed cameras and hazards, so most screens can be checked at home. In past sessions, browser checks were done with Playwright and simulated Capacitor plugins (`window.Capacitor = { isNativePlatform, getPlatform, registerPlugin }`). Map tiles were faked with locally generated vector tiles when OpenFreeMap was unreachable.

## The owner's standing rules (apply to every change)

- **Legal is part of the job.**
  - Keep PRIVACY.md, TERMS.md, THIRD_PARTY_NOTICES.md and their in-app copies in `www/js/legal.js` in sync with what the app does.
  - Bump `TERMS_VERSION` in `www/js/settings.js` for material terms changes.
  - Speed camera warnings are switched off in countries that ban or restrict them (`core/roadside.js NO_CAMERA_WARNINGS`), and stay off until the country is known.
- **Maximum privacy.**
  - No accounts, analytics or tracking.
  - Every feature that sends data elsewhere is optional, has its own switch, and is described in the privacy policy.
  - Network streams are encrypted and authenticated.
- **Delivery and audience.** Deliver as an APK / `.ipa` download. The owner shares apps with family who aren't tech-savvy, so the wording must stay plain and the app accessible.
- **Karpathy-style coding.** Think first, keep it simple, make surgical changes, and set goals that can be checked. Add real unit and regression tests proportional to the change.
- **Commits.** Clean, descriptive commits in logical steps. Never rewrite pushed history.
- **No binaries.** No committed binaries without source and provenance.
- **Honest docs.** README, CHANGELOG and release notes must match reality. Anything untested on real devices is labelled **experimental**, and the README's "What's tested" table says how each feature was checked.
- **No new repos.** Don't create new GitHub repos; this repo is `superclearice97-droid/Dashmate`.

## Other loose ends

- **Spotify:** "Connect Spotify" is waiting on the owner. They need to enable GitHub Pages (main branch, `/docs`) and register a Spotify developer app. Their Client ID then goes into `www/js/spotify-config.js`. See `docs/SPOTIFY-SETUP.md`.
- **Untested against the live services:**
  - The speed-camera/hazard and country Overpass queries.
  - The real-streets car view (`www/js/streetview.js`). It runs a second MapLibre map behind the 3D car, and may be slow on older iPads. "Car view › Simple road" is the fallback.
- **Ideas declined so far:**
  - Hard-braking / obstacle warnings, because one camera isn't reliable enough for a safety alert.
  - Dashcam recording, because it's restricted in some countries and would need country rules like the camera warnings.
