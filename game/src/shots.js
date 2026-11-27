// The screenshot scenes behind ?shot=cover|ring|storm|land. Each one plays
// the real rules forward from a fresh world, steered by the world's own
// autopilot, so the frame is what a short game really looks like and the
// same seed always gives the same frame. No shot is hand-drawn.

import { STEP } from './config.js';
import { SCREEN_CRASHED, SCREEN_LANDED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

function simulate(world, maxSeconds, stopWhen) {
  const steps = Math.floor(maxSeconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const events = world.step(world.autopilotControl());
    if (events & 16) break; // crashed
    if (events & 8) break; // landed
    if (stopWhen && stopWhen(world.state)) break;
  }
  return world.state;
}

export function stageShot(name, world) {
  if (name === 'storm') {
    world.reset(2, 7);
    const state = simulate(world, 46, (s) => s.distance > 3600);
    state.lightning = 0.18;
    return { screen: SCREEN_PLAY, best: 0, mission: 2 };
  }
  if (name === 'land') {
    world.reset(0, 7);
    const state = simulate(world, 160, (s) => s.distance > 8650 && s.alt < 0.14);
    return { screen: SCREEN_PLAY, best: 0, mission: 0 };
  }
  if (name === 'ring') {
    world.reset(0, 7);
    const state = simulate(world, 60, (s) => {
      for (const obj of s.objects) {
        const d = obj.coursePos - s.distance;
        if (obj.kind === 'ring' && !obj.done && d > 90 && d < 220 && Math.abs(obj.x - s.x) < 0.22) return true;
      }
      return false;
    });
    return { screen: SCREEN_PLAY, best: 0, mission: 0 };
  }
  if (name === 'cover') {
    world.reset(0, 7);
    simulate(world, 60, (s) => s.distance > 3800);
    return { screen: SCREEN_PLAY, best: 0, mission: 0 };
  }
  // Any other name stages the title screen.
  world.reset(0, 7);
  for (let i = 0; i < 5 / STEP; i += 1) world.step({ pitch: 0, roll: 0, throttleUp: false, throttleDown: false, gear: false });
  return { screen: SCREEN_TITLE, best: 0, mission: 0 };
}

export { SCREEN_CRASHED, SCREEN_LANDED };
