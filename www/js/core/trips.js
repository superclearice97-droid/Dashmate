// Trip A and Trip B: odometers that keep counting across drives until you reset them.
// Stored only on this device.

const blank = (now) => ({ distance: 0, movingTime: 0, maxSpeed: 0, since: now });

export class TripLog {
  constructor(saved = null, now = Date.now()) {
    this.trips = { A: blank(now), B: blank(now) };
    for (const id of ['A', 'B']) {
      const t = saved?.[id];
      if (t && [t.distance, t.movingTime, t.maxSpeed, t.since].every(Number.isFinite)) this.trips[id] = { ...t };
    }
  }

  // Add the distance (m) and moving time (s) driven since the last update, at speed (m/s).
  add(distance, movingTime, speed) {
    if (!(distance >= 0) || !(movingTime >= 0)) return;
    for (const t of Object.values(this.trips)) {
      t.distance += distance;
      t.movingTime += movingTime;
      if (speed > t.maxSpeed) t.maxSpeed = speed;
    }
  }

  reset(id, now = Date.now()) {
    if (id in this.trips) this.trips[id] = blank(now);
  }

  // {distance, movingTime, avgSpeed, maxSpeed, since}
  get(id) {
    const t = this.trips[id];
    return { ...t, avgSpeed: t.movingTime > 0 ? t.distance / t.movingTime : 0 };
  }

  toJSON() {
    return this.trips;
  }
}

export function formatDriveTime(sec) {
  const m = Math.floor(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
