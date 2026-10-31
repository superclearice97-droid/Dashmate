# Changelog

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
