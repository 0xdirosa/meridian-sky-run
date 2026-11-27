// Synthesised sound, no audio files: an engine hum that follows the
// throttle, a chime for a ring, a thud for a hit, a beep for warnings and
// a short fanfare for a landing. Starts on the first user gesture.

export function createAudio() {
  let ctx = null;
  let engine = null;
  let engineGain = null;
  let muted = false;
  let lastBeep = 0;

  function ensure() {
    if (ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      engine = ctx.createOscillator();
      engine.type = 'sawtooth';
      engine.frequency.value = 55;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engine.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engine.start();
    } catch {
      ctx = null;
    }
  }

  function tone(freq, dur, type, vol, when = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    setMuted(value) {
      muted = value;
      if (engineGain) engineGain.gain.value = muted ? 0 : 0.05;
    },
    isMuted() {
      return muted;
    },
    engine(state, flying) {
      if (!ctx || muted) return;
      const target = flying ? 0.035 + state.throttle * 0.05 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engine.frequency.setTargetAtTime(42 + state.throttle * 68 + state.speed * 0.08, ctx.currentTime, 0.1);
    },
    ring() {
      tone(880, 0.18, 'sine', 0.16);
      tone(1318, 0.28, 'sine', 0.14, 0.07);
    },
    crate() {
      tone(523, 0.15, 'triangle', 0.16);
      tone(784, 0.22, 'triangle', 0.14, 0.06);
    },
    hit() {
      tone(90, 0.3, 'square', 0.2);
      tone(55, 0.4, 'sawtooth', 0.16, 0.02);
    },
    warning(now) {
      if (now - lastBeep < 0.9) return;
      lastBeep = now;
      tone(1046, 0.12, 'square', 0.08);
    },
    land() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'triangle', 0.15, i * 0.11));
    },
    crash() {
      tone(160, 0.5, 'sawtooth', 0.2);
      tone(70, 0.9, 'square', 0.18, 0.1);
    },
  };
}
