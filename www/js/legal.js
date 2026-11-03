// In-app legal texts. Keep in sync with PRIVACY.md, TERMS.md and THIRD_PARTY_NOTICES.md.

export const PRIVACY = `
<h2>Privacy</h2>
<p class="muted small">Effective 3 November 2026</p>
<p>DashMate has no accounts, no ads, no analytics and no tracking. The developer never receives any of your data.</p>
<h4>Stays on your device</h4>
<ul>
  <li>Your location, speed and trip numbers.</li>
  <li>Camera images for road reading. They are analysed on the device and never saved or sent anywhere.</li>
  <li>Songs you add, and your settings.</li>
  <li>Home, Work and your last five destinations, if you save or navigate to them. Clear them in Controls › Navigation.</li>
</ul>
<h4>Phone ⇄ screen pairing</h4>
<p>A direct, encrypted connection between your own two devices. No server is involved; the QR codes you scan contain everything needed.</p>
<h4>Online features (each can be switched off in Controls)</h4>
<ul>
  <li><b>Map</b>: map pieces come from OpenFreeMap (tiles.openfreemap.org), which sees which area you are looking at. The car view's streets and buildings use the same map pieces for the area around you, and go off with this switch.</li>
  <li><b>Directions &amp; search</b>: your search text and approximate area (about 1 km) go to Photon by komoot (photon.komoot.io); your start and destination go to the OSRM route server run by FOSSGIS (routing.openstreetmap.de).</li>
  <li><b>Speed limits, street names, speed cameras &amp; road hazards</b>: your current position is sent to the Overpass API (overpass-api.de) every few hundred metres (for the road you're on) and about every 500 m (for cameras, speed bumps, railway crossings and hazard signs within about 1.5 km). With speed camera warnings on, your position is also used now and then (about every 25 km) to look up which country you are in, so camera warnings are only offered where they are legal. The country is kept in memory only.</li>
  <li><b>Spotify</b> (off until you tap Connect Spotify): you sign in on Spotify's own page; DashMate never sees your password. While DashMate is open and connected, it asks Spotify what's playing every few seconds and sends your play/pause/skip and playlist taps. Your Spotify access keys are kept only on this device; Disconnect Spotify deletes them. Spotify's privacy policy applies to what Spotify receives.</li>
  <li><b>Weather</b> (off by default): your position rounded to about 10 km goes to Open-Meteo (api.open-meteo.com).</li>
</ul>
<p>Like any website, these services also see your device's IP address. Their own privacy policies apply. DashMate sends them no name, account or device identifier.</p>
<h4>Permissions</h4>
<p>Location (speed, map, directions), camera (road reading and scanning pairing codes). You can refuse either; the rest of the app keeps working.</p>
<p><b>Background location (phone pairing only).</b> When a phone is paired as the GPS for your DashMate screen, it keeps reading its location about once a second while locked or while you use other apps, so it can stay in your pocket. Each position goes straight to your paired screen over your local network (the phone's hotspot), encrypted and signed with a random key made for that pairing (AES-256-GCM). DashMate only sends it to private local-network addresses, never to the internet or anyone else, and the screen ignores anything not signed with that key. It stops when you tap Stop sharing (in DashMate, or in the Android notification) or Disconnect. On Android a notification shows the whole time; on iPhone the location arrow shows in the status bar. iPhone and iPad may ask to allow DashMate to find devices on your local network; that is used only for this link.</p>
<p><b>Music control (optional).</b> On Android, controlling Spotify and other music apps needs <b>notification access</b>, because Android ties media controls to that permission. DashMate only uses it to see and control what's playing (song, artist, album art) and never reads your notifications. On iPad and iPhone, <b>Apple Music access</b> lets DashMate show and control what's playing and list your playlists. Nothing is sent anywhere; you can turn either off in the system settings.</p>
<h4>Children</h4>
<p>DashMate is meant for drivers and is not directed at children.</p>
<h4>Deleting your data</h4>
<p>Controls (car button) › Forget my songs removes stored music. Uninstalling the app removes everything.</p>
<h4>Questions</h4>
<p>Open an issue on the DashMate GitHub page.</p>
`;

export const TERMS = `
<h2>Terms &amp; safety</h2>
<p class="muted small">Version 2 · 3 November 2026</p>
<h4>Drive safely</h4>
<ul>
  <li>Set up routes, music and pairing <b>only while parked</b>. Don't look at or touch the screen in ways that take your attention off the road.</li>
  <li>Mount devices securely where they don't block your view or airbags, and only where your local law allows it. Some places ban handheld or windshield-mounted devices.</li>
  <li>Obey traffic laws and posted signs at all times.</li>
</ul>
<h4>Information can be wrong</h4>
<ul>
  <li>Speed limits and street names come from OpenStreetMap volunteers and can be missing, outdated or wrong. <b>The posted signs always win.</b></li>
  <li>Directions can be wrong or unsafe (closed roads, turn restrictions, construction). Use your own judgement.</li>
  <li>GPS speed can differ from your car's speedometer.</li>
  <li><b>Road reading is experimental and is not a safety system.</b> It can miss or misread traffic lights, people and vehicles, and can alert at the wrong time. Never rely on it to decide when to go or stop.</li>
  <li><b>Speed camera and road hazard warnings</b> come from OpenStreetMap and can be missing, misplaced or out of date; mobile and new cameras are not included. They are information, not permission: <b>always drive at or below the posted limit.</b> DashMate offers camera warnings only where it knows they are legal and switches them off in countries that forbid or restrict them (for example Germany, France, Switzerland and Austria); if you cross a border it can take a moment to notice. Laws change, so it is up to you to follow the rules where you drive.</li>
  <li><b>Following-distance, “Too close” and “Traffic is moving” alerts are part of road reading</b>: rough guesses from one camera, not a safety system. Keep a safe distance yourself.</li>
</ul>
<h4>No warranty</h4>
<p>DashMate is free, open-source software provided "as is", without warranty of any kind, under the MIT License. To the fullest extent the law allows, the authors are not liable for any damages, fines, accidents or losses arising from its use. You use it at your own risk.</p>
<h4>Third-party services</h4>
<p>Online features rely on free public services (OpenFreeMap, OSRM/FOSSGIS, Photon/komoot, Overpass API, Open-Meteo) that may change, limit or stop service at any time. Map data © OpenStreetMap contributors (ODbL).</p>
<h4>Trademarks</h4>
<p>DashMate is an independent project. It is not affiliated with or endorsed by Apple, Google, Spotify, any car maker, or any music service. Names of other apps are used only to describe what DashMate can open or control.</p>
<h4>Spotify</h4>
<p>Spotify content, names and cover art belong to Spotify and its licensors and are shown as Spotify provides them. Using Spotify through DashMate is subject to Spotify's own terms. Controlling playback needs Spotify Premium.</p>
`;

export const LICENSES = `
<h2>Open-source licenses</h2>
<p>DashMate © 2026 its authors, MIT License. It includes:</p>
<ul>
  <li><b>MapLibre GL JS</b> 5.23.0 — BSD-3-Clause, © MapLibre contributors, © Mapbox</li>
  <li><b>three.js</b> r180 — MIT, © three.js authors</li>
  <li><b>ONNX Runtime Web</b> 1.22.0 — MIT, © Microsoft Corporation</li>
  <li><b>YOLOX-Nano and YOLOX-S models</b> — Apache-2.0, © Megvii Inc.</li>
  <li><b>jsQR</b> 1.4.0 — Apache-2.0, © Cosmo Wolfe</li>
  <li><b>QR Code Generator</b> 2.0.4 — MIT, © Kazuhiko Arase. "QR Code" is a registered trademark of DENSO WAVE INCORPORATED.</li>
  <li><b>Capacitor</b> 8.5.3 — MIT, © Ionic</li>
  <li><b>@capacitor-community/keep-awake</b> 8.0.1 — MIT</li>
  <li><b>@capacitor/app</b> 8.1.1 — MIT, © Ionic</li>
</ul>
<h4>Data</h4>
<ul>
  <li>Map data © OpenStreetMap contributors, Open Database License (ODbL)</li>
  <li>Map tiles: OpenFreeMap, © OpenMapTiles</li>
  <li>Routing: OSRM, served by FOSSGIS e.V.</li>
  <li>Search: Photon by komoot</li>
  <li>Speed limits, speed cameras and road hazards: Overpass API</li>
  <li>Weather: Open-Meteo, CC BY 4.0</li>
</ul>
<p class="muted small">Full license texts are in THIRD_PARTY_NOTICES.md in the source code.</p>
`;
