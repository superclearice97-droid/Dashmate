# Privacy
_Effective 3 November 2026_

DashMate has no accounts, no ads, no analytics and no tracking. The developer never receives any of your data.

## Stays on your device

- Your location, speed and trip numbers.
- Camera images for road reading. They are analysed on the device and never saved or sent anywhere.
- Songs you add, and your settings.
- Home, Work and your last five destinations, if you save or navigate to them. Clear them in Controls › Navigation.

## Phone ⇄ screen pairing

A direct, encrypted connection between your own two devices. No server is involved; the QR codes you scan contain everything needed.

## Online features (each can be switched off in Controls)

- **Map**: map pieces come from OpenFreeMap (tiles.openfreemap.org), which sees which area you are looking at. The car view's streets and buildings use the same map pieces for the area around you, and go off with this switch.
- **Directions & search**: your search text and approximate area (about 1 km) go to Photon by komoot (photon.komoot.io); your start and destination go to the OSRM route server run by FOSSGIS (routing.openstreetmap.de).
- **Speed limits, street names, speed cameras & road hazards**: your current position is sent to the Overpass API (overpass-api.de) every few hundred metres (for the road you're on) and about every 500 m (for cameras, speed bumps, railway crossings and hazard signs within about 1.5 km). With speed camera warnings on, your position is also used now and then (about every 25 km) to look up which country you are in, so camera warnings are only offered where they are legal. The country is kept in memory only.
- **Spotify** (off until you tap Connect Spotify): you sign in on Spotify's own page; DashMate never sees your password. While DashMate is open and connected, it asks Spotify what's playing every few seconds and sends your play/pause/skip and playlist taps. Your Spotify access keys are kept only on this device; Disconnect Spotify deletes them. Spotify's privacy policy applies to what Spotify receives.
- **Weather** (off by default): your position rounded to about 10 km goes to Open-Meteo (api.open-meteo.com).

Like any website, these services also see your device's IP address. Their own privacy policies apply. DashMate sends them no name, account or device identifier.

## Permissions

Location (speed, map, directions), camera (road reading and scanning pairing codes). You can refuse either; the rest of the app keeps working.

**Background location (phone pairing only).** When a phone is paired as the GPS for your DashMate screen, it keeps reading its location about once a second while locked or while you use other apps, so it can stay in your pocket. Each position goes straight to your paired screen over your local network (the phone's hotspot), encrypted and signed with a random key made for that pairing (AES-256-GCM). The pairing (that key and a port number) is remembered on both devices until you tap Disconnect or Stop sharing, so they reconnect by themselves next time. To find your screen without a new pairing, the phone sends to every address on its own hotspot network; those packets are encrypted, only your screen has the key to read them, and every other device just ignores them. DashMate only sends to private local-network addresses, never to the internet, and the screen ignores anything not signed with that key or older than a minute. It stops when you tap Stop sharing (in DashMate, or in the Android notification) or Disconnect. On Android a notification shows the whole time; on iPhone the location arrow shows in the status bar. iPhone and iPad may ask to allow DashMate to find devices on your local network; that is used only for this link.

**Music control (optional).** On Android, controlling Spotify and other music apps needs **notification access**, because Android ties media controls to that permission. DashMate only uses it to see and control what's playing (song, artist, album art) and never reads your notifications. On iPad and iPhone, **Apple Music access** lets DashMate show and control what's playing and list your playlists. Nothing is sent anywhere; you can turn either off in the system settings.

## Children

DashMate is meant for drivers and is not directed at children.

## Deleting your data

Controls (car button) › Forget my songs removes stored music. Uninstalling the app removes everything.

## Questions

Open an issue on this repository's GitHub page.
