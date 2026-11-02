// The vehicle ahead in your lane, from road reading: how far, how many seconds behind it
// you are, a warning when you follow too closely, and a nudge when the queue moves off.
// Distances come from a single camera (see scene.js), so they are rough.

const AHEAD = new Set(['car', 'truck', 'bus', 'motorcycle', 'tram']);
const LANE_HALF_WIDTH = 1.6; // m either side of the centre of your lane

// scene: toScene() output. Returns {kind, z (m)} or null.
export function leadVehicle(scene) {
  let best = null;
  for (const o of scene || []) {
    if (!AHEAD.has(o.kind) || Math.abs(o.x) > LANE_HALF_WIDTH) continue;
    if (!best || o.z < best.z) best = { kind: o.kind, z: o.z };
  }
  return best;
}

// Seconds until you'd reach where the vehicle ahead is now; null when barely moving.
export const timeGap = (z, speedMps) => (speedMps > 2 && z > 0 ? z / speedMps : null);

const CLOSE_S = 1.0;      // warn below this gap...
const CLEAR_S = 1.4;      // ...until it grows past this
const CLOSE_MPS = 8;      // only above ~30 km/h (18 mph)
const STOPPED_MPS = 1;
const MOVING_MPS = 2.5;

export class FollowWatcher {
  constructor() {
    this.closeSince = null;
    this.close = false;
    this.lostAt = null;
    this.queue = null; // {z0, t0} while stopped behind someone
  }

  // lead: leadVehicle() result or null. Returns {close, closeStarted, movedOff}.
  update(lead, speedMps, t) {
    let closeStarted = false;
    let movedOff = false;

    const gap = lead ? timeGap(lead.z, speedMps) : null;
    if (lead) this.lostAt = null;
    else this.lostAt ??= t;
    if (gap != null && gap < CLOSE_S && speedMps > CLOSE_MPS) {
      this.closeSince ??= t;
      if (!this.close && t - this.closeSince >= 2000) {
        this.close = true;
        closeStarted = true;
      }
    } else if (gap == null ? (this.lostAt != null && t - this.lostAt > 2000) || speedMps <= CLOSE_MPS : gap > CLEAR_S) {
      this.closeSince = null;
      this.close = false;
    }

    // Queue: stopped close behind a vehicle, which then pulls away while you're still stopped.
    if (speedMps > MOVING_MPS) this.queue = null;
    else if (speedMps < STOPPED_MPS && lead) {
      if (!this.queue) {
        if (lead.z <= 12) this.queue = { z0: lead.z, t0: t, fired: false };
      } else if (!this.queue.fired) {
        if (lead.z < this.queue.z0) this.queue.z0 = lead.z;
        if (lead.z >= this.queue.z0 + 4 && t - this.queue.t0 > 1500) {
          this.queue.fired = true;
          movedOff = true;
        }
      }
    }
    return { close: this.close, closeStarted, movedOff };
  }
}
