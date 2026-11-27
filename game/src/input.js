// Keyboard and mouse, read every frame. Keys held down steer; single
// presses become one-shot actions (confirm, pause, gear, mute, mission).

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_GEAR = 4;
export const ACTION_MUTE = 8;
export const ACTION_MISSION_1 = 16;
export const ACTION_MISSION_2 = 32;
export const ACTION_MISSION_3 = 64;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouse = { x: 0.5, y: 0.5, active: false, clicked: false };

  function onKeyDown(event) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space') actions |= ACTION_CONFIRM;
    if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    if (event.code === 'KeyG') actions |= ACTION_GEAR;
    if (event.code === 'KeyM') actions |= ACTION_MUTE;
    if (event.code === 'Digit1') actions |= ACTION_MISSION_1;
    if (event.code === 'Digit2') actions |= ACTION_MISSION_2;
    if (event.code === 'Digit3') actions |= ACTION_MISSION_3;
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (event.clientX - rect.left) / rect.width;
    mouse.y = (event.clientY - rect.top) / rect.height;
    mouse.active = true;
  }
  function onMouseDown(event) {
    onMouseMove(event);
    mouse.clicked = true;
    actions |= ACTION_CONFIRM;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);

  function takeActions() {
    const taken = actions;
    actions = 0;
    mouse.clicked = false;
    return taken;
  }

  /** Steering for this frame: keyboard first, mouse as a gentle fallback. */
  function control() {
    const pitch =
      (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0) -
      (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0);
    const roll =
      (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) -
      (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
    let ctl = {
      pitch,
      roll,
      throttleUp: keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyE'),
      throttleDown: keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyQ'),
      gear: false,
    };
    if (pitch === 0 && roll === 0 && mouse.active) {
      // Mouse steers toward the pointer: left/right banks, up/down climbs.
      ctl.roll = Math.max(-1, Math.min(1, (mouse.x - 0.5) * 2.4));
      ctl.pitch = Math.max(-1, Math.min(1, (0.45 - mouse.y) * 2.4));
    }
    return ctl;
  }

  return { takeActions, control };
}
