// Driver alerts: "Slow down" (over the limit) and "Green · go" (light turned green while stopped).

// What a Speed Limit Warning setting does: 'off' (nothing), 'display' (banner), 'chime' (banner + sound).
export function warningEffects(mode) {
  return { show: mode === 'display' || mode === 'chime', chime: mode === 'chime' };
}

// Over the posted limit by more than `toleranceKmh` for at least 2 s.
export class SpeedWatcher {
  constructor() {
    this.overSince = null;
    this.active = false;
  }

  // Returns {active, entered}. entered is true only on the update where the alert starts.
  update(speedKmh, limitKmh, toleranceKmh, t) {
    if (limitKmh == null) {
      this.overSince = null;
      this.active = false;
      return { active: false, entered: false };
    }
    const threshold = limitKmh + toleranceKmh;
    let entered = false;
    if (speedKmh > threshold) {
      this.overSince ??= t;
      if (!this.active && t - this.overSince >= 2000) {
        this.active = true;
        entered = true;
      }
    } else if (speedKmh <= threshold - 2) {
      this.overSince = null;
      this.active = false;
    }
    return { active: this.active, entered };
  }
}

const STOPPED_MPS = 1.3;  // ~3 mph
const MOVING_MPS = 2.5;   // ~5.6 mph

// Watches the traffic light in front while the car is stopped. Fires once when a light
// that was red for at least 1 s turns green (seen in two frames in a row).
export class GreenLightWatcher {
  constructor() {
    this.reset();
  }

  reset() {
    this.redSince = null;
    this.lastRed = null;
    this.greens = 0;
    this.firstGreen = null;
  }

  // light: 'red' | 'yellow' | 'green' | null. Returns 'go' or null.
  update(light, speedMps, t) {
    if (speedMps > MOVING_MPS) {
      this.reset();
      return null;
    }
    if (speedMps > STOPPED_MPS) return null;
    if (light === 'red') {
      this.redSince ??= t;
      this.lastRed = t;
      this.greens = 0;
      return null;
    }
    // The first green must come soon after the red; the next just has to follow it
    // (frames can be seconds apart in Detailed mode).
    const fresh = this.greens === 0 ? t - this.lastRed < 4000 : t - this.firstGreen < 10000;
    if (light === 'green' && this.redSince != null && this.lastRed - this.redSince >= 1000 && fresh) {
      if (this.greens === 0) this.firstGreen = t;
      this.greens++;
      if (this.greens >= 2) {
        this.reset();
        return 'go';
      }
      return null;
    }
    if (light == null && this.lastRed != null && t - this.lastRed > 5000) this.reset();
    return null;
  }
}
