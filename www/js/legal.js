// In-app legal texts. Keep in sync with PRIVACY.md, TERMS.md and THIRD_PARTY_NOTICES.md.

export const PRIVACY = `
<h2>Privacy</h2>
<p class="muted small">Effective 31 October 2026</p>
<p>DashMate has no accounts, no ads, no analytics and no tracking. The developer never receives any of your data.</p>
<h4>Stays on your device</h4>
<ul>
  <li>Your location, speed and trip numbers.</li>
  <li>Camera images for road reading. They are analysed on the device and never saved or sent anywhere.</li>
  <li>Songs you add, and your settings.</li>
</ul>
<h4>Phone ⇄ screen pairing</h4>
<p>A direct, encrypted connection between your own two devices. No server is involved; the QR codes you scan contain everything needed.</p>
<h4>Online features (each can be switched off in Controls)</h4>
<ul>
  <li><b>Map</b>: map pieces come from OpenFreeMap (tiles.openfreemap.org), which sees which area you are looking at.</li>
  <li><b>Directions &amp; search</b>: your search text and approximate area (about 1 km) go to Photon by komoot (photon.komoot.io); your start and destination go to the OSRM route server run by FOSSGIS (routing.openstreetmap.de).</li>
  <li><b>Speed limits &amp; street names</b>: your current position is sent every few hundred metres to the Overpass API (overpass-api.de).</li>
  <li><b>Weather</b> (off by default): your position rounded to about 10 km goes to Open-Meteo (api.open-meteo.com).</li>
</ul>
<p>Like any website, these services also see your device's IP address. Their own privacy policies apply. DashMate sends them no name, account or device identifier.</p>
<h4>Permissions</h4>
<p>Location (speed, map, directions), camera (road reading and scanning pairing codes). You can refuse either; the rest of the app keeps working.</p>
<h4>Children</h4>
<p>DashMate is meant for drivers and is not directed at children.</p>
<h4>Deleting your data</h4>
<p>Controls (car button) › Forget my songs removes stored music. Uninstalling the app removes everything.</p>
<h4>Questions</h4>
<p>Open an issue on the DashMate GitHub page.</p>
`;

export const TERMS = `
<h2>Terms &amp; safety</h2>
<p class="muted small">Version 1 · 31 October 2026</p>
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
</ul>
<h4>No warranty</h4>
<p>DashMate is free, open-source software provided "as is", without warranty of any kind, under the MIT License. To the fullest extent the law allows, the authors are not liable for any damages, fines, accidents or losses arising from its use. You use it at your own risk.</p>
<h4>Third-party services</h4>
<p>Online features rely on free public services (OpenFreeMap, OSRM/FOSSGIS, Photon/komoot, Overpass API, Open-Meteo) that may change, limit or stop service at any time. Map data © OpenStreetMap contributors (ODbL).</p>
<h4>Trademarks</h4>
<p>DashMate is an independent project. It is not affiliated with or endorsed by Apple, Google, any car maker, or any music service. Names of other apps are used only to describe what DashMate can open.</p>
`;

export const LICENSES = `
<h2>Open-source licenses</h2>
<p>DashMate © 2026 its authors, MIT License. It includes:</p>
<ul>
  <li><b>MapLibre GL JS</b> 5.23.0 — BSD-3-Clause, © MapLibre contributors, © Mapbox</li>
  <li><b>three.js</b> r180 — MIT, © three.js authors</li>
  <li><b>ONNX Runtime Web</b> 1.22.0 — MIT, © Microsoft Corporation</li>
  <li><b>YOLOX-Nano model</b> — Apache-2.0, © Megvii Inc.</li>
  <li><b>jsQR</b> 1.4.0 — Apache-2.0, © Cosmo Wolfe</li>
  <li><b>QR Code Generator</b> 2.0.4 — MIT, © Kazuhiko Arase. "QR Code" is a registered trademark of DENSO WAVE INCORPORATED.</li>
  <li><b>Capacitor</b> 8.5.3 — MIT, © Ionic</li>
  <li><b>@capacitor-community/keep-awake</b> 8.0.1 — MIT</li>
</ul>
<h4>Data</h4>
<ul>
  <li>Map data © OpenStreetMap contributors, Open Database License (ODbL)</li>
  <li>Map tiles: OpenFreeMap, © OpenMapTiles</li>
  <li>Routing: OSRM, served by FOSSGIS e.V.</li>
  <li>Search: Photon by komoot</li>
  <li>Speed limits: Overpass API</li>
  <li>Weather: Open-Meteo, CC BY 4.0</li>
</ul>
<p class="muted small">Full license texts are in THIRD_PARTY_NOTICES.md in the source code.</p>
`;
