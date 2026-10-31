// The navigation map (MapLibre + OpenFreeMap tiles from OpenStreetMap data).
import { emit } from './bus.js';

const STYLES = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

let map = null;
let marker = null;
let following = true;
let pitched = true;
let routeGeo = null;
let theme = 'light';
let lastFix = null;

export function createMap(container, opts) {
  theme = opts.theme;
  if (!window.maplibregl) throw new Error('Map library missing');
  map = new maplibregl.Map({
    container,
    style: STYLES[theme],
    center: opts.center || [-87.6298, 41.8781],
    zoom: opts.center ? 16 : 11,
    pitch: 55,
    attributionControl: false,
    dragRotate: true,
    pitchWithRotate: true,
  });
  map.addControl(new maplibregl.AttributionControl({
    compact: true,
    customAttribution: 'Routes: OSRM',
  }), 'bottom-right');

  const el = document.createElement('div');
  el.className = 'car-marker';
  el.innerHTML = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 4 L32 34 L20 27 L8 34 Z"/></svg>';
  marker = new maplibregl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' });

  map.on('style.load', () => {
    add3dBuildings();
    addRouteLayers();
  });
  const stopFollow = () => {
    if (following) {
      following = false;
      emit('follow', false);
    }
  };
  map.on('dragstart', stopFollow);
  map.on('wheel', stopFollow);
  map.on('error', (e) => console.warn('[map]', e?.error?.message || e));
  return map;
}

export const hasMap = () => map != null;

export function setMapTheme(t) {
  if (!map || t === theme) return;
  theme = t;
  map.setStyle(STYLES[t]);
}

function add3dBuildings() {
  const style = map.getStyle();
  if (!style?.sources?.openmaptiles || style.layers.some((l) => l.type === 'fill-extrusion')) return;
  const firstSymbol = style.layers.find((l) => l.type === 'symbol')?.id;
  map.addLayer({
    id: 'dm-buildings-3d',
    type: 'fill-extrusion',
    source: 'openmaptiles',
    'source-layer': 'building',
    minzoom: 14,
    paint: {
      'fill-extrusion-color': theme === 'dark' ? '#3a3f55' : '#d9dbe0',
      'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
      'fill-extrusion-opacity': 0.85,
    },
  }, firstSymbol);
}

function addRouteLayers() {
  if (map.getSource('dm-route')) return;
  map.addSource('dm-route', { type: 'geojson', data: routeGeo || emptyLine() });
  map.addLayer({ id: 'dm-route-casing', type: 'line', source: 'dm-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#1e40af', 'line-width': 11 } });
  map.addLayer({ id: 'dm-route-line', type: 'line', source: 'dm-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#3b82f6', 'line-width': 7 } });
}

const emptyLine = () => ({ type: 'FeatureCollection', features: [] });

export function showRoute(coords) {
  routeGeo = coords ? { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} } : emptyLine();
  map?.getSource('dm-route')?.setData(routeGeo);
}

export function overview(coords) {
  if (!map || !coords?.length) return;
  const b = coords.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
  following = false;
  emit('follow', false);
  map.fitBounds(b, { padding: 80, pitch: 0, bearing: 0, duration: 800 });
  setTimeout(recenter, 2500);
}

// Called on each fix with the smoothed speed (m/s) and heading.
export function updatePosition(pos, heading, speed) {
  lastFix = { pos, heading, speed };
  if (!map) return;
  marker.setLngLat(pos).addTo(map);
  if (heading != null) marker.setRotation(heading);
  if (following) {
    const zoom = speed > 22 ? 15.5 : speed > 12 ? 16.3 : 17;
    map.easeTo({
      center: pos,
      bearing: pitched && heading != null ? heading : 0,
      pitch: pitched ? 55 : 0,
      zoom,
      duration: 900,
      offset: [0, pitched ? 120 : 0],
      essential: true,
    });
  }
}

export function recenter() {
  following = true;
  emit('follow', true);
  if (lastFix) updatePosition(lastFix.pos, lastFix.heading, lastFix.speed);
}

export function toggle3d() {
  pitched = !pitched;
  recenter();
  return pitched;
}

export const zoomBy = (d) => map?.zoomTo(map.getZoom() + d, { duration: 250 });
export const resizeMap = () => map?.resize();
