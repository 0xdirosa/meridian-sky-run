// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, and the two canvases paint what is there — the WebGL
// canvas draws the 3D world, the HUD canvas draws the panel, the HUD and
// the screens on top of it. The game moves between title, brief, play,
// paused, landed and crashed screens.
//
// ?seed=N fixes the course. ?shot=cover|ring|storm|land (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, PROGRESS_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CRASH, EVENT_CRATE, EVENT_HIT, EVENT_LANDED, EVENT_OBJECTIVE, EVENT_RING } from './world3d.js';
import {
  ACTION_CONFIRM,
  ACTION_GEAR,
  ACTION_MISSION_1,
  ACTION_MISSION_2,
  ACTION_MISSION_3,
  ACTION_MUTE,
  ACTION_PAUSE,
  createInput,
} from './input.js';
import { createAudio } from './audio.js';
import { createRenderer3D } from './render3d.js';
import { createHud, SCREEN_BRIEF, SCREEN_CRASHED, SCREEN_LANDED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './hud.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const hudCanvas = document.getElementById('hud');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
let renderer;
let hud;
try {
  renderer = createRenderer3D(canvas);
  hud = createHud(hudCanvas);
} catch (err) {
  status.textContent = `Meridian Sky Run needs WebGL: ${err.message}`;
  throw err;
}
const audio = createAudio();

function readNumber(key) {
  try {
    return Number.parseInt(window.localStorage.getItem(key) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveNumber(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state);
    hud.draw(world.state, scene.screen, scene.best, 3);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  document.title = `Meridian Sky Run — shot ${name}`;
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readNumber(BEST_KEY);
  let unlocked = Math.max(0, readNumber(PROGRESS_KEY));
  let missionId = 0;
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startMission(id) {
    missionId = id;
    world.reset(id, seed);
    screen = SCREEN_BRIEF;
    announce(`${world.state.mission.name}. ${world.state.mission.brief}`);
  }

  function takeOff() {
    screen = SCREEN_PLAY;
    audio.unlock();
    announce(`Flying ${world.state.mission.name}.`);
  }

  function finishFlight() {
    if (world.state.score > best) {
      best = world.state.score;
      saveNumber(BEST_KEY, best);
    }
    if (world.state.phase === 'landed' && world.state.objectiveComplete && missionId + 1 > unlocked) {
      unlocked = missionId + 1;
      saveNumber(PROGRESS_KEY, unlocked);
    }
  }

  function stepWorld(gearPressed) {
    const ctl = input.control();
    if (gearPressed) ctl.gear = true;
    const events = world.step(ctl);
    if (events & EVENT_RING) {
      audio.ring();
      announce(`Ring! ${world.state.ringsHit} of ${world.state.mission.goalCount}. Score ${world.state.score}.`);
    }
    if (events & EVENT_CRATE) {
      audio.crate();
      announce(`Supply crate! Fuel topped up. Score ${world.state.score}.`);
    }
    if (events & EVENT_HIT) audio.hit();
    if (events & EVENT_OBJECTIVE) announce('Objective complete — land on runway 09.');
    if (events & EVENT_LANDED) {
      audio.land();
      finishFlight();
      screen = SCREEN_LANDED;
      announce(`Landed. Score ${world.state.score}. Best ${best}.`);
    }
    if (events & EVENT_CRASH) {
      audio.crash();
      finishFlight();
      screen = SCREEN_CRASHED;
      announce(`Crashed. ${world.state.crashReason} Score ${world.state.score}.`);
    }
    return events;
  }

  function handleActions() {
    const actions = input.takeActions();
    const gearPressed = Boolean(actions & ACTION_GEAR);
    if (actions & ACTION_MUTE) audio.setMuted(!audio.isMuted());
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_MISSION_1) startMission(0);
      else if (actions & ACTION_MISSION_2 && unlocked >= 1) startMission(1);
      else if (actions & ACTION_MISSION_3 && unlocked >= 2) startMission(2);
      else if (actions & ACTION_CONFIRM) startMission(0);
    } else if (screen === SCREEN_BRIEF) {
      if (actions & ACTION_CONFIRM) takeOff();
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Flying.');
      }
    } else if (screen === SCREEN_LANDED) {
      if (actions & ACTION_CONFIRM) {
        if (world.state.objectiveComplete && missionId < 2) startMission(missionId + 1);
        else startMission(missionId);
      }
    } else if (screen === SCREEN_CRASHED) {
      if (actions & ACTION_CONFIRM) startMission(missionId);
    }
    return gearPressed;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // Actions are read once per frame on every screen: the title screen
    // must answer Enter too, and the gear key must toggle exactly once
    // even when a frame catches up on two simulation steps.
    const gearPressed = handleActions();
    if (screen === SCREEN_TITLE) {
      // Attract mode: the valley flies itself behind the title.
      while (accumulator >= STEP) {
        world.step(world.autopilotControl());
        accumulator -= STEP;
        if (world.state.phase !== 'fly' || world.state.distance > 5000) world.reset(0, seed);
      }
    } else if (screen === SCREEN_PLAY) {
      let gearUsed = false;
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        stepWorld(gearPressed && !gearUsed);
        gearUsed = true;
        accumulator -= STEP;
      }
      if (screen === SCREEN_PLAY) {
        audio.engine(world.state, true);
        if (world.state.fuel < 20 || world.state.damage > 70) audio.warning(now / 1000);
      }
    } else {
      accumulator = 0;
      audio.engine(world.state, false);
    }
    renderer.draw(world.state);
    hud.draw(world.state, screen, best, unlocked);
  }

  world.reset(0, seed);
  announce('Meridian Sky Run. Press Enter or click to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
