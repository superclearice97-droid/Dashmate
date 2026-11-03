// The real streets and buildings around you, drawn behind the 3D car (like an EV's car
// view). A second MapLibre map with the same OpenFreeMap tiles as the main map, no labels,
// buildings raised in 3D, and its camera placed exactly where the 3D view's camera is
// (a few metres up, behind your car), so the car and what road reading sees line up with
// the streets. Between GPS fixes it glides forward at your speed so the view stays smooth.
import { STYLES } from './map.js';

const R = 6371008.8;
const smoothAngle = (from, to, k) => from + ((((to - from) % 360) + 540) % 360 - 180) * k;

// pos [lon, lat] moved `m` metres towards `bearing` degrees.
export function offset(pos, bearing, m) {
  const b = (bearing * Math.PI) / 180;
  const dLat = (m * Math.cos(b)) / R;
  const dLon = (m * Math.sin(b)) / (R * Math.cos((pos[1] * Math.PI) / 180));
  return [pos[0] + (dLon * 180) / Math.PI, pos[1] + (dLat * 180) / Math.PI];
}

const PAINT = {
  light: { bg: '#e6e8ec', building: '#d3d6dc', route: '#3b82f6' },
  dark: { bg: '#0e1014', building: '#2b2f39', route: '#3b82f6' },
};

// container: element behind the 3D canvas. camera(): {fov, height, back, pitch} from car3d.
// onReady(on): called with true once streets are showing (and false if they go away).
export function createStreetView(container, { theme = 'light', camera, onReady }) {
  if (!window.maplibregl) return null;
  let t = theme;
  let fix = null;          // last {pos, heading, speed, at}
  let view = null;         // what is drawn now {pos, heading}
  let routeGeo = { type: 'FeatureCollection', features: [] };
  let running = false;
  let lastFrame = 0;
  let ready = false;

  const map = new maplibregl.Map({
    container,
    style: STYLES[t],
    interactive: false,
    attributionControl: false,
    maxPitch: 85,
    fadeDuration: 0,
    center: [-87.6298, 41.8781],
    zoom: 17,
    pitch: 80,
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
  map.on('error', (e) => console.warn('[streets]', e?.error?.message || e));

  // Keep only the ground: roads, water, parks. No labels or icons; buildings in 3D.
  map.on('style.load', () => {
    const p = PAINT[t];
    for (const layer of map.getStyle().layers) {
      if (layer.type === 'symbol' || layer.type === 'fill-extrusion') map.removeLayer(layer.id);
      else if (layer.type === 'background') map.setPaintProperty(layer.id, 'background-color', p.bg);
    }
    if (map.getStyle().sources?.openmaptiles) {
      map.addLayer({
        id: 'dm-sv-buildings', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 13,
        paint: {
          'fill-extrusion-color': p.building,
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.92,
        },
      });
    }
    map.addSource('dm-sv-route', { type: 'geojson', data: routeGeo });
    // About one lane (3.5 m) wide at any zoom: MapLibre widths are in pixels, which halve per zoom level.
    map.addLayer({ id: 'dm-sv-route', type: 'line', source: 'dm-sv-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': p.route, 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 15, 1, 22, 128], 'line-opacity': 0.6 } });
    place(true);
  });
  map.once('load', () => {
    // Only the (i) button here; the main map next to it shows the full credits.
    container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
    ready = true;
    onReady?.(true);
  });

  // Put the map camera where the 3D view's camera is.
  function place(force = false) {
    if (!view) return;
    const c = camera();
    if (force || Math.abs(map.getVerticalFieldOfView() - c.fov) > 0.01) map.setVerticalFieldOfView(c.fov);
    const eye = offset(view.pos, view.heading, -c.back);
    try {
      map.jumpTo(map.calculateCameraOptionsFromCameraLngLatAltRotation(eye, c.height, view.heading, c.pitch, 0));
    } catch (e) {
      console.warn('[streets]', e.message);
    }
  }

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (now - lastFrame < 33 || document.hidden || !fix || !container.clientWidth) return;
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    // Glide ahead at the current speed for up to 1.5 s after a fix, then wait for the next.
    const since = Math.min(1.5, (performance.now() - fix.at) / 1000);
    const target = { pos: offset(fix.pos, fix.heading, (fix.speed || 0) * since), heading: fix.heading };
    if (!view) view = target;
    else if (Math.abs(target.pos[0] - view.pos[0]) + Math.abs(target.pos[1] - view.pos[1]) < 1e-7
      && Math.abs(((target.heading - view.heading + 540) % 360) - 180) < 0.05) {
      return; // standing still: nothing to redraw (saves battery)
    } else {
      const k = Math.min(1, dt * 6);
      view = {
        pos: [view.pos[0] + (target.pos[0] - view.pos[0]) * k, view.pos[1] + (target.pos[1] - view.pos[1]) * k],
        heading: (smoothAngle(view.heading, target.heading, k) + 360) % 360,
      };
    }
    place();
  }

  new ResizeObserver(() => { map.resize(); place(true); }).observe(container);

  return {
    update(pos, heading, speed) {
      if (!pos) return;
      const h = heading ?? fix?.heading ?? 0;
      // A big jump (new GPS source, demo start): don't glide across town.
      if (view && Math.abs(view.pos[1] - pos[1]) + Math.abs(view.pos[0] - pos[0]) > 0.005) view = null;
      fix = { pos, heading: h, speed, at: performance.now() };
    },
    showRoute(coords) {
      routeGeo = coords ? { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} } : { type: 'FeatureCollection', features: [] };
      map.getSource('dm-sv-route')?.setData(routeGeo);
    },
    setTheme(next) {
      if (next === t) return;
      t = next;
      map.setStyle(STYLES[t]);
    },
    start() {
      if (running) return;
      running = true;
      requestAnimationFrame(frame);
    },
    stop() { running = false; },
    ready: () => ready,
    destroy() {
      running = false;
      if (ready) onReady?.(false);
      map.remove();
    },
  };
}
