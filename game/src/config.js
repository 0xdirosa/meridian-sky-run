// Every tuning number and colour in one place. The playfield is a fixed
// 1280x720 logical area; the renderer scales it to the window, so no rule
// below depends on the screen size. Distances are metres along the course,
// altitude is 0..1 (0 = ground, 1 = 9000 ft), speed is knots.

export const FIELD = { width: 1280, height: 720, horizonY: 296 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

/** Course length in metres for one sortie. */
export const COURSE_LENGTH = 9000;

export const PLANE = {
  /** Lateral position range, -1..1. */
  xLimit: 1,
  /** Altitude range, 0..1. */
  altLimit: 1,
  bankMaxDeg: 38,
  /** Lateral drift per second at full bank. */
  bankDrift: 0.55,
  /** Vertical speed at full pitch, altitude units per second. */
  climbRate: 0.22,
  /** Knots per second the speed chases its throttle target. */
  accelRate: 26,
  /** Speed (knots) at throttle 0 and at throttle 1. */
  speedMin: 62,
  speedMax: 330,
  /** Stall speed: below it the nose drops on its own. */
  stallSpeed: 88,
  /** Fuel units; 100 is a full tank. */
  fuelMax: 100,
  /** Fuel drain per second: base + throttle * perThrottle. */
  fuelBase: 0.32,
  fuelPerThrottle: 0.85,
  damageMax: 100,
};

export const SCORE = {
  ring: 100,
  crate: 150,
  landingBase: 300,
  landingSmoothMax: 200,
  fuelBonusPerUnit: 2,
};

export const RING = { radius: 0.16, collectRadius: 0.19 };
export const CRATE = { radius: 0.13 };

/** Landing window at touchdown: centreline, speed and descent rate. */
export const LANDING = {
  centreline: 0.16,
  speedMax: 178,
  speedMin: 96,
  descentMax: 0.30,
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'meridian-sky-run.best';
export const PROGRESS_KEY = 'meridian-sky-run.unlocked';

export const PALETTE = {
  panel: '#141a26',
  panelEdge: '#2c3a52',
  text: '#eef2f8',
  muted: '#9aa7bd',
  amber: '#ffb02e',
  green: '#37d67a',
  red: '#ff5a4e',
  cyan: '#4fd2ff',
};
