# Privacy
_Effective 31 October 2026_

DashMate has no accounts, no ads, no analytics and no tracking. The developer never receives any of your data.

## Stays on your device

- Your location, speed and trip numbers.
- Camera images for road reading. They are analysed on the device and never saved or sent anywhere.
- Songs you add, and your settings.

## Phone ⇄ screen pairing

A direct, encrypted connection between your own two devices. No server is involved; the QR codes you scan contain everything needed.

## Online features (each can be switched off in Controls)

- **Map**: map pieces come from OpenFreeMap (tiles.openfreemap.org), which sees which area you are looking at.
- **Directions & search**: your search text and approximate area (about 1 km) go to Photon by komoot (photon.komoot.io); your start and destination go to the OSRM route server run by FOSSGIS (routing.openstreetmap.de).
- **Speed limits & street names**: your current position is sent every few hundred metres to the Overpass API (overpass-api.de).
- **Spotify** (off until you tap Connect Spotify): you sign in on Spotify's own page; DashMate never sees your password. While DashMate is open and connected, it asks Spotify what's playing every few seconds and sends your play/pause/skip and playlist taps. Your Spotify access keys are kept only on this device; Disconnect Spotify deletes them. Spotify's privacy policy applies to what Spotify receives.
- **Weather** (off by default): your position rounded to about 10 km goes to Open-Meteo (api.open-meteo.com).

Like any website, these services also see your device's IP address. Their own privacy policies apply. DashMate sends them no name, account or device identifier.

## Permissions

Location (speed, map, directions), camera (road reading and scanning pairing codes). You can refuse either; the rest of the app keeps working.

**Music control (optional).** On Android, controlling Spotify and other music apps needs **notification access**, because Android ties media controls to that permission. DashMate only uses it to see and control what's playing (song, artist, album art) and never reads your notifications. On iPad and iPhone, **Apple Music access** lets DashMate show and control what's playing and list your playlists. Nothing is sent anywhere; you can turn either off in the system settings.

## Children

DashMate is meant for drivers and is not directed at children.

## Deleting your data

Controls (car button) › Forget my songs removes stored music. Uninstalling the app removes everything.

## Questions

Open an issue on this repository's GitHub page.
