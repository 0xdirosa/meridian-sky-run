// Flight physics, the course, and the rules: rings, crates, hazards, fuel,
// damage, and the landing that ends every sortie. One fixed step at a time.

import { COURSE_LENGTH, LANDING, PLANE, RING, SCORE, STEP } from './config.js';
import { missionById } from './missions.js';
import { createRandom } from './random.js';

export const EVENT_RING = 1;
export const EVENT_CRATE = 2;
export const EVENT_HIT = 4;
export const EVENT_LANDED = 8;
export const EVENT_CRASH = 16;
export const EVENT_OBJECTIVE = 32;
export const EVENT_FUEL_LOW = 64;

const RUNWAY_START = COURSE_LENGTH - 700;
const RUNWAY_END = COURSE_LENGTH + 260;
const RUNWAY_HALF = 0.13;

function buildCourse(random, mission) {
  const objects = [];
  const goalSpacing = (COURSE_LENGTH - 1600) / mission.goalCount;
  for (let i = 0; i < mission.goalCount; i += 1) {
    const pos = 900 + i * goalSpacing + random.range(-80, 80);
    const x = Math.sin(i * 1.7 + mission.id * 2.1) * 0.55 + random.range(-0.1, 0.1);
    const alt = 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(i * 2.3 + mission.id));
    objects.push({
      kind: mission.goal === 'rings' ? 'ring' : 'crate',
      coursePos: pos,
      x: Math.max(-0.8, Math.min(0.8, x)),
      alt: Math.max(0.18, Math.min(0.82, alt)),
      done: false,
      passed: false,
    });
  }
  for (let i = 0; i < mission.peaks; i += 1) {
    objects.push({
      kind: 'peak',
      coursePos: random.range(1400, COURSE_LENGTH - 1200),
      x: random.range(-0.85, 0.85),
      alt: 0,
      top: random.range(0.38, 0.78),
      halfWidth: random.range(0.13, 0.24),
      done: false,
    });
  }
  for (let i = 0; i < mission.balloons; i += 1) {
    objects.push({
      kind: 'balloon',
      coursePos: random.range(1200, COURSE_LENGTH - 900),
      x: random.range(-0.8, 0.8),
      alt: random.range(0.3, 0.65),
      done: false,
    });
  }
  for (let i = 0; i < mission.birds; i += 1) {
    objects.push({
      kind: 'bird',
      coursePos: random.range(1500, COURSE_LENGTH - 900),
      x: random.range(-0.7, 0.7),
      alt: random.range(0.25, 0.55),
      done: false,
    });
  }
  if (mission.storm) {
    for (let i = 0; i < 6; i += 1) {
      objects.push({
        kind: 'storm',
        coursePos: random.range(1200, COURSE_LENGTH - 900),
        x: random.range(-0.8, 0.8),
        alt: random.range(0.4, 0.8),
        done: false,
      });
    }
  }
  objects.sort((a, b) => a.coursePos - b.coursePos);
  return objects;
}

export function createWorld(random) {
  const state = {
    mission: missionById(0),
    seed: 0,
    distance: 0,
    speed: 150,
    throttle: 0.55,
    bankDeg: 0,
    headingDeg: 90,
    x: 0,
    alt: 0.45,
    altVel: 0,
    fuel: 100,
    damage: 0,
    score: 0,
    ringsHit: 0,
    cratesHit: 0,
    goalDone: 0,
    missed: 0,
    phase: 'fly',
    gearDown: false,
    engineOut: false,
    fuelWarned: false,
    objectiveComplete: false,
    crashReason: '',
    landingScore: 0,
    landingDetail: '',
    time: 0,
    message: '',
    messageTimer: 0,
    shake: 0,
    lightning: 0,
    lightningTimer: 4,
    invulnerable: 0,
    objects: [],
  };

  function reset(missionId, seed) {
    const mission = missionById(missionId);
    state.mission = mission;
    state.seed = seed;
    state.distance = 0;
    state.speed = 150;
    state.throttle = 0.55;
    state.bankDeg = 0;
    state.headingDeg = 90;
    state.x = 0;
    state.alt = 0.45;
    state.altVel = 0;
    state.fuel = mission.fuelStart;
    state.damage = 0;
    state.score = 0;
    state.ringsHit = 0;
    state.cratesHit = 0;
    state.goalDone = 0;
    state.missed = 0;
    state.phase = 'fly';
    state.gearDown = false;
    state.engineOut = false;
    state.fuelWarned = false;
    state.objectiveComplete = false;
    state.crashReason = '';
    state.landingScore = 0;
    state.landingDetail = '';
    state.time = 0;
    state.message = mission.name;
    state.messageTimer = 3;
    state.shake = 0;
    state.lightning = 0;
    state.lightningTimer = 4;
    state.invulnerable = 0;
    // Re-seed the course from the mission seed so a seed always builds the
    // same course, whatever ran before it.
    state.objects = buildCourse(createRandom(seed * 7919 + missionId * 104729 + 13), mission);
  }

  function crash(reason) {
    state.phase = 'crashed';
    state.crashReason = reason;
    state.message = reason;
    state.messageTimer = 6;
    return EVENT_CRASH;
  }

  function land() {
    const descent = -state.altVel;
    const centred = Math.abs(state.x);
    if (!state.gearDown) return crash('Belly landing — gear was up.');
    if (state.speed > LANDING.speedMax) return crash('Too fast — ran off the runway end.');
    if (state.speed < LANDING.speedMin) return crash('Too slow — stalled onto the runway.');
    if (descent > LANDING.descentMax) return crash('Hard landing — descent rate too steep.');
    if (centred > LANDING.centreline) return crash('Off the runway — missed the centreline.');
    const smooth = Math.round((1 - descent / LANDING.descentMax) * 100);
    const centre = Math.round((1 - centred / LANDING.centreline) * 100);
    state.landingScore = SCORE.landingBase + smooth + centre;
    state.landingDetail =
      `Smoothness ${smooth} · Centreline ${centre}` +
      (state.objectiveComplete ? '' : ' · job unfinished');
    if (state.objectiveComplete) state.score += state.landingScore;
    state.score += Math.round(state.fuel * SCORE.fuelBonusPerUnit);
    state.phase = 'landed';
    state.message = state.objectiveComplete ? 'Touchdown — sortie complete.' : 'Down, but the job was unfinished.';
    state.messageTimer = 6;
    return EVENT_LANDED;
  }

  function hitObstacle(kind, amount, reason) {
    if (state.invulnerable > 0) return 0;
    state.damage = Math.min(PLANE.damageMax, state.damage + amount);
    state.invulnerable = 1.2;
    state.shake = 0.6;
    state.message = reason;
    state.messageTimer = 2;
    if (state.damage >= PLANE.damageMax) return crash('Aircraft destroyed — damage 100%.');
    return EVENT_HIT;
  }

  /** Advance the world one fixed step. `ctl` is {pitch, roll, throttleUp, throttleDown, gear}. */
  function step(ctl) {
    if (state.phase === 'landed' || state.phase === 'crashed') return 0;
    let events = 0;
    const dt = STEP;
    state.time += dt;

    if (ctl.gear) state.gearDown = !state.gearDown;
    if (!state.engineOut) {
      if (ctl.throttleUp) state.throttle = Math.min(1, state.throttle + 0.5 * dt);
      if (ctl.throttleDown) state.throttle = Math.max(0, state.throttle - 0.6 * dt);
    }
    const targetSpeed = PLANE.speedMin + state.throttle * (PLANE.speedMax - PLANE.speedMin);
    state.speed += Math.max(-PLANE.accelRate * dt, Math.min(PLANE.accelRate * dt, targetSpeed - state.speed));

    const bankTarget = (ctl.roll || 0) * PLANE.bankMaxDeg;
    const bankRate = 110 * dt;
    state.bankDeg += Math.max(-bankRate, Math.min(bankRate, bankTarget - state.bankDeg));
    state.headingDeg = (state.headingDeg + state.bankDeg * 0.085 * dt * (state.speed / 150) + 360) % 360;
    state.x += (Math.sin((state.bankDeg * Math.PI) / 180) * PLANE.bankDrift + state.mission.crosswind) * dt;
    state.x = Math.max(-PLANE.xLimit, Math.min(PLANE.xLimit, state.x));

    const pitchTarget = (ctl.pitch || 0) * PLANE.climbRate;
    state.altVel += Math.max(-0.5 * dt, Math.min(0.5 * dt, pitchTarget - state.altVel));
    if (state.speed < PLANE.stallSpeed && state.alt > 0.02) state.altVel -= 0.22 * dt;
    state.alt += state.altVel * dt;
    if (state.alt > PLANE.altLimit) {
      state.alt = PLANE.altLimit;
      state.altVel = Math.min(0, state.altVel);
    }

    state.fuel = Math.max(0, state.fuel - (PLANE.fuelBase + state.throttle * PLANE.fuelPerThrottle) * dt);
    if (state.fuel <= 0 && !state.engineOut) {
      state.engineOut = true;
      state.throttle = 0;
      state.message = 'FUEL EMPTY — engine out, glide to the runway!';
      state.messageTimer = 4;
      events |= EVENT_FUEL_LOW;
    }
    if (state.fuel < 20 && !state.fuelWarned) {
      state.fuelWarned = true;
      state.message = 'LOW FUEL — ease the throttle.';
      state.messageTimer = 3;
      events |= EVENT_FUEL_LOW;
    }

    state.distance += state.speed * 0.514444 * dt;
    if (state.invulnerable > 0) state.invulnerable -= dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);
    if (state.messageTimer > 0) state.messageTimer -= dt;
    if (state.mission.storm) {
      state.lightningTimer -= dt;
      if (state.lightningTimer <= 0) {
        state.lightning = 0.18;
        state.lightningTimer = 3 + Math.random() * 4;
      }
      if (state.lightning > 0) state.lightning -= dt;
    }

    const goalTotal = state.mission.goalCount;
    for (const obj of state.objects) {
      const dist = obj.coursePos - state.distance;
      if (dist < -60 || dist > 2400) continue;
      const dx = Math.abs(obj.x - state.x);
      const da = Math.abs(obj.alt - state.alt);
      if (obj.kind === 'ring' && !obj.done && Math.abs(dist) < 30) {
        if (dx < RING.collectRadius && da < RING.collectRadius) {
          obj.done = true;
          state.ringsHit += 1;
          state.goalDone += 1;
          state.score += SCORE.ring;
          events |= EVENT_RING;
        } else if (dist < -28) {
          obj.passed = true;
          state.missed += 1;
        }
      } else if (obj.kind === 'crate' && !obj.done && Math.abs(dist) < 30) {
        if (dx < 0.2 && da < 0.2) {
          obj.done = true;
          state.cratesHit += 1;
          state.goalDone += 1;
          state.score += SCORE.crate;
          state.fuel = Math.min(PLANE.fuelMax, state.fuel + 12);
          events |= EVENT_CRATE;
        } else if (dist < -28) {
          obj.passed = true;
          state.missed += 1;
        }
      } else if (obj.kind === 'peak' && Math.abs(dist) < 30) {
        if (dx < obj.halfWidth + 0.04 && state.alt < obj.top) {
          const ev = hitObstacle('peak', 34, 'Clipped a peak — pull up or go around!');
          if (ev === EVENT_CRASH) return EVENT_CRASH;
          events |= ev;
          obj.done = true;
        }
      } else if (obj.kind === 'balloon' && !obj.done && Math.abs(dist) < 26) {
        if (dx < 0.14 && da < 0.14) {
          const ev = hitObstacle('balloon', 22, 'Hit a balloon — watch the sky!');
          if (ev === EVENT_CRASH) return EVENT_CRASH;
          events |= ev;
          obj.done = true;
        }
      } else if (obj.kind === 'bird' && !obj.done && Math.abs(dist) < 24) {
        if (dx < 0.1 && da < 0.1) {
          const ev = hitObstacle('bird', 14, 'Bird strike!');
          if (ev === EVENT_CRASH) return EVENT_CRASH;
          events |= ev;
          obj.done = true;
        }
      } else if (obj.kind === 'storm' && !obj.done && Math.abs(dist) < 30) {
        if (dx < 0.2 && da < 0.2) {
          const ev = hitObstacle('storm', 16, 'Flew through a storm cell — turbulence!');
          if (ev === EVENT_CRASH) return EVENT_CRASH;
          events |= ev;
          obj.done = true;
        }
      }
    }

    if (!state.objectiveComplete && state.goalDone >= goalTotal) {
      state.objectiveComplete = true;
      state.phase = 'approach';
      state.message = 'OBJECTIVE COMPLETE — land on runway 09. Gear down (G).';
      state.messageTimer = 5;
      events |= EVENT_OBJECTIVE;
    }
    if (state.phase === 'fly' && state.distance > RUNWAY_START - 200) {
      state.phase = 'approach';
      state.message = state.objectiveComplete
        ? 'FINAL APPROACH — runway 09 ahead.'
        : 'Runway ahead — but the job is not finished yet.';
      state.messageTimer = 4;
    }

    if (state.alt <= 0.005) {
      state.alt = 0;
      if (state.distance >= RUNWAY_START && state.distance <= RUNWAY_END && Math.abs(state.x) <= 0.22) {
        return events | land();
      }
      if (state.distance >= RUNWAY_START && state.distance <= RUNWAY_END) {
        return events | crash('Touched down beside the runway.');
      }
      return events | crash('Hit the ground short of the runway.');
    }
    if (state.distance > RUNWAY_END + 40 && state.phase !== 'landed') {
      return events | crash('Overshot the runway.');
    }
    return events;
  }

  /** Steer the plane toward the next goal object or the runway centre. Used by the screenshot autopilot. */
  function autopilotControl() {
    const ctl = { pitch: 0, roll: 0, throttleUp: false, throttleDown: false, gear: false };
    let target = null;
    for (const obj of state.objects) {
      const dist = obj.coursePos - state.distance;
      if (dist > 40 && !obj.done && (obj.kind === 'ring' || obj.kind === 'crate')) {
        target = obj;
        break;
      }
    }
    const inApproach = state.phase === 'approach' || state.distance > RUNWAY_START - 400;
    if (inApproach && !state.gearDown && state.alt < 0.35) ctl.gear = true;
    let targetX = target ? target.x : 0;
    // On approach, glide down the slope: ~0.15 at the threshold, 0 at the
    // far end of the runway, so the flare is a real descent, not a hover.
    let targetAlt = inApproach
      ? Math.max(0, Math.min(0.5, ((COURSE_LENGTH - 300 - state.distance) / 1600) * 0.4))
      : target ? target.alt : 0.45;
    // Hazard avoidance: a peak, storm cell or balloon inside 500 m that the
    // plane is lined up with gets steered around (or climbed over, when the
    // peak is low and the side route is off the edge).
    for (const obj of state.objects) {
      const dist = obj.coursePos - state.distance;
      if (dist < 30 || dist > 500 || obj.done) continue;
      const dx = obj.x - state.x;
      if (obj.kind === 'peak' && Math.abs(dx) < obj.halfWidth + 0.18 && state.alt < obj.top + 0.08) {
        const side = state.x <= obj.x ? -1 : 1;
        const around = obj.x + side * (obj.halfWidth + 0.34);
        if (Math.abs(around) <= 0.92) targetX = around;
        else targetAlt = Math.max(targetAlt, obj.top + 0.14);
        break;
      }
      if (obj.kind === 'storm' && Math.abs(dx) < 0.28 && Math.abs(obj.alt - state.alt) < 0.25) {
        targetX = obj.x + (state.x <= obj.x ? -0.42 : 0.42);
        break;
      }
      if (obj.kind === 'balloon' && Math.abs(dx) < 0.2 && Math.abs(obj.alt - state.alt) < 0.2) {
        targetX = obj.x + (state.x <= obj.x ? -0.34 : 0.34);
        break;
      }
    }
    const dx = targetX - state.x;
    // Stronger roll gain on approach: a steady crosswind needs a steady
    // bank to hold, and a weak gain settles off the centreline.
    const rollGain = inApproach ? 3.8 : 2.2;
    ctl.roll = Math.max(-1, Math.min(1, dx * rollGain - Math.sin((state.bankDeg * Math.PI) / 180) * 0.7));
    const dAlt = targetAlt - state.alt;
    ctl.pitch = Math.max(-1, Math.min(1, dAlt * 3.2 - state.altVel * 2.4));
    if (inApproach) {
      ctl.pitch = Math.max(-1, Math.min(1, dAlt * 5 - state.altVel * 4));
      if (state.speed > 165) ctl.throttleDown = true;
      else if (state.speed < 130) ctl.throttleUp = true;
    } else if (state.speed < 195) ctl.throttleUp = true;
    else if (state.speed > 235) ctl.throttleDown = true;
    return ctl;
  }

  return { state, reset, step, autopilotControl, runway: { start: RUNWAY_START, end: RUNWAY_END, half: RUNWAY_HALF } };
}
