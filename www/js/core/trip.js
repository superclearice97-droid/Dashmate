// Turns raw GPS fixes into a smooth speed, a heading, and trip stats.
import { bearing, distance } from './geo.js';

const MAX_PLAUSIBLE_MPS = 70; // ~157 mph; anything faster is a GPS jump
const MOVING_MPS = 1.0;       // below this we count as stopped
const GOOD_ACCURACY_M = 35;

export class TripTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.last = null;        // last accepted fix {pos, t}
    this.speed = 0;          // smoothed m/s
    this.heading = null;     // degrees, null until known
    this.distance = 0;       // metres travelled this trip
    this.movingTime = 0;     // seconds spent moving
    this.maxSpeed = 0;       // m/s
  }

  // fix: {lon, lat, accuracy, speed (m/s or null), heading (deg or null), t (ms)}
  update(fix) {
    const pos = [fix.lon, fix.lat];
    const good = !(fix.accuracy > GOOD_ACCURACY_M);
    let measured = Number.isFinite(fix.speed) && fix.speed >= 0 ? fix.speed : null;

    if (this.last) {
      const dt = (fix.t - this.last.t) / 1000;
      if (dt <= 0) return this.snapshot();
      const d = distance(this.last.pos, pos);
      const derived = d / dt;
      if (derived > MAX_PLAUSIBLE_MPS && good) {
        // Ignore this jump but keep it as the new reference so we recover.
        this.last = { pos, t: fix.t };
        return this.snapshot();
      }
      if (measured == null) measured = good ? derived : this.speed;
      const moving = measured >= MOVING_MPS;
      if (moving && good) {
        this.distance += d;
        this.movingTime += dt;
      }
      if (moving && d > 3) this.heading = bearing(this.last.pos, pos);
    }
    if (Number.isFinite(fix.heading) && fix.heading >= 0 && (measured ?? 0) >= MOVING_MPS) this.heading = fix.heading;

    const m = measured ?? 0;
    // Smooth, but react quickly when braking to a stop.
    this.speed = m < 0.5 ? m : this.speed * 0.4 + m * 0.6;
    if (good) this.maxSpeed = Math.max(this.maxSpeed, this.speed);
    this.last = { pos, t: fix.t };
    return this.snapshot();
  }

  snapshot() {
    return {
      pos: this.last?.pos ?? null,
      speed: this.speed,
      heading: this.heading,
      distance: this.distance,
      movingTime: this.movingTime,
      avgSpeed: this.movingTime > 0 ? this.distance / this.movingTime : 0,
      maxSpeed: this.maxSpeed,
    };
  }
}
