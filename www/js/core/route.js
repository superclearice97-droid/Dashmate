// Turn-by-turn navigation logic on top of an OSRM route response.
import { cumulative, project } from './geo.js';

const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
const MOD_ANGLE = {
  uturn: 180, 'sharp right': 135, right: 90, 'slight right': 45, straight: 0,
  'slight left': -45, left: -90, 'sharp left': -135,
};
const side = (mod) => (mod?.includes('left') ? 'left' : mod?.includes('right') ? 'right' : '');

function roadName(step) {
  if (step.name && step.ref) return `${step.name} (${step.ref})`;
  return step.name || step.ref || '';
}

// Human-readable instruction for an OSRM step.
export function instructionText(step) {
  const m = step.maneuver || {};
  const mod = m.modifier;
  const name = roadName(step);
  const onto = name ? ` onto ${name}` : '';
  const toward = step.destinations ? ` toward ${step.destinations.split(':').pop().trim()}` : '';
  switch (m.type) {
    case 'depart':
      return name ? `Head out on ${name}` : 'Head out';
    case 'arrive':
      return side(mod) ? `Arrive — destination on the ${side(mod)}` : 'Arrive at your destination';
    case 'roundabout':
    case 'rotary': {
      const kind = m.type === 'rotary' ? (step.rotary_name || 'the rotary') : 'the roundabout';
      const exit = m.exit ? `take the ${ORDINALS[m.exit] || m.exit + 'th'} exit` : 'go through';
      return `At ${kind}, ${exit}${onto}`;
    }
    case 'roundabout turn':
      return `At the roundabout, turn ${mod || 'straight'}${onto}`;
    case 'exit roundabout':
    case 'exit rotary':
      return `Exit the roundabout${onto}`;
    case 'merge':
      return `Merge${side(mod) ? ' ' + side(mod) : ''}${onto}`;
    case 'on ramp':
      return `Take the ramp${side(mod) ? ' on the ' + side(mod) : ''}${onto || toward}`;
    case 'off ramp':
      return `Take the exit${side(mod) ? ' on the ' + side(mod) : ''}${toward || onto}`;
    case 'fork':
      return `Keep ${side(mod) || 'straight'} at the fork${onto}`;
    case 'new name':
    case 'notification':
    case 'use lane':
      return name ? `Continue onto ${name}` : 'Continue straight';
    case 'continue':
      if (mod === 'uturn') return `Make a U-turn${onto}`;
      return mod && mod !== 'straight' ? `Keep ${side(mod)}${onto}` : (name ? `Continue onto ${name}` : 'Continue straight');
    case 'turn':
    case 'end of road':
    default:
      if (mod === 'uturn') return `Make a U-turn${onto}`;
      if (!mod || mod === 'straight') return `Continue straight${onto}`;
      return `Turn ${mod}${onto}`;
  }
}

// Which arrow to draw: {kind: 'arrow'|'roundabout'|'arrive', angle}
export function maneuverIcon(step) {
  const m = step.maneuver || {};
  if (m.type === 'arrive') return { kind: 'arrive', angle: 0 };
  if (m.type === 'roundabout' || m.type === 'rotary') return { kind: 'roundabout', angle: 0 };
  return { kind: 'arrow', angle: MOD_ANGLE[m.modifier] ?? 0 };
}

export class NavRoute {
  // osrmRoute: one entry of response.routes (geometries=geojson, steps=true)
  constructor(osrmRoute, destination) {
    this.line = osrmRoute.geometry.coordinates;
    this.cum = cumulative(this.line);
    this.total = this.cum[this.cum.length - 1];
    this.duration = osrmRoute.duration;
    this.destination = destination;
    const raw = osrmRoute.legs.flatMap((l) => l.steps);
    const stepSum = raw.reduce((s, st) => s + st.distance, 0) || 1;
    const scale = this.total / stepSum;
    let along = 0;
    this.steps = raw.map((st) => {
      const step = { ...st, along, text: instructionText(st), icon: maneuverIcon(st) };
      along += st.distance * scale;
      return step;
    });
    this.offCount = 0;
    this.cues = new Set();
  }

  // pos: [lon, lat]; accuracy in metres. Returns everything the UI needs.
  progress(pos, accuracy = 10) {
    const p = project(this.line, this.cum, pos);
    if (p.offset > Math.max(45, accuracy * 1.5)) this.offCount++;
    else if (p.offset < 25) this.offCount = 0;
    const along = p.along;
    let next = this.steps.findIndex((s, i) => i > 0 && s.along > along + 3);
    if (next === -1) next = this.steps.length - 1;
    const remaining = Math.max(0, this.total - along);
    return {
      along,
      offset: p.offset,
      offRoute: this.offCount >= 3,
      next,
      step: this.steps[next],
      then: this.steps[next + 1] || null,
      distToNext: Math.max(0, this.steps[next].along - along),
      remaining,
      remainingTime: this.total ? this.duration * (remaining / this.total) : 0,
      arrived: remaining < 25,
    };
  }

  // Returns text to speak (once per step and stage), or null.
  // Early cue roughly 25 s ahead (at least 300 m), close cue ~7 s ahead (at least 60 m).
  cue(prog, speedMps, spokenDistance) {
    const { next, distToNext, step } = prog;
    if (next <= 0 || !step) return null;
    const far = Math.max(300, speedMps * 25);
    const near = Math.max(60, speedMps * 7);
    if (distToNext <= near && !this.cues.has(`${next}:near`)) {
      this.cues.add(`${next}:near`);
      this.cues.add(`${next}:far`);
      return step.text;
    }
    if (distToNext <= far && distToNext > near * 1.5 && !this.cues.has(`${next}:far`) && step.distance !== 0) {
      this.cues.add(`${next}:far`);
      return `In ${spokenDistance(distToNext)}, ${step.text.charAt(0).toLowerCase()}${step.text.slice(1)}`;
    }
    return null;
  }
}

// avoid: {tolls, highways, ferries} -> OSRM's exclude classes.
export function osrmUrl(from, to, avoid = {}) {
  const c = `${from[0].toFixed(6)},${from[1].toFixed(6)};${to[0].toFixed(6)},${to[1].toFixed(6)}`;
  const exclude = [avoid.tolls && 'toll', avoid.highways && 'motorway', avoid.ferries && 'ferry'].filter(Boolean);
  const ex = exclude.length ? `&exclude=${exclude.join(',')}` : '';
  return `https://routing.openstreetmap.de/routed-car/route/v1/driving/${c}?overview=full&geometries=geojson&steps=true${ex}`;
}
