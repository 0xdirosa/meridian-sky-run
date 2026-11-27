// Everything the player sees: the pseudo-3D chase view over the terrain,
// the aircraft, the cockpit panel with its instruments, the HUD, and every
// screen. No images are loaded — all of it is drawn from the world state.

import { FIELD, FONT, PALETTE } from './config.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_BRIEF = 'brief';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_LANDED = 'landed';
export const SCREEN_CRASHED = 'crashed';

const W = FIELD.width;
const H = FIELD.height;

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx, str, x, y, size, color, align = 'left', weight = 700) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(str, x, y);
}

function project(state, distAhead, lateral) {
  const f = Math.max(0, Math.min(1, 1 - distAhead / 1500));
  const y = FIELD.horizonY + (H - FIELD.horizonY) * Math.pow(f, 1.6);
  const x = W / 2 + (lateral - state.x * 0.85) * 640 * Math.pow(f, 1.15);
  return { x, y, f };
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const clouds = [];
  const rng = createRandom(99);
  for (let i = 0; i < 14; i += 1) {
    clouds.push({ x: rng.range(-1.6, 1.6), y: rng.range(30, 230), s: rng.range(46, 130), depth: rng.range(0.3, 1) });
  }
  const stars = [];
  for (let i = 0; i < 70; i += 1) stars.push({ x: rng.range(0, W), y: rng.range(0, 260), r: rng.range(0.6, 1.8) });

  function drawSky(state) {
    const m = state.mission;
    const g = ctx.createLinearGradient(0, 0, 0, FIELD.horizonY + 40);
    g.addColorStop(0, m.skyTop);
    g.addColorStop(0.55, m.skyMid);
    g.addColorStop(1, m.skyLow);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, FIELD.horizonY + 40);
    if (state.lightning > 0) {
      ctx.fillStyle = `rgba(230,240,255,${Math.min(0.55, state.lightning * 3)})`;
      ctx.fillRect(0, 0, W, FIELD.horizonY + 40);
    }
    if (m.night) {
      ctx.fillStyle = '#ffffff';
      for (const s of stars) {
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(state.time * 2 + s.x);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // Sun / moon, drifting with heading so turning moves it.
    const sunX = W * 0.78 - ((state.headingDeg - 90) / 180) * 260;
    ctx.fillStyle = m.sun;
    ctx.beginPath();
    ctx.arc(sunX, 84, m.night ? 26 : 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = m.night ? 'rgba(223,232,255,0.18)' : 'rgba(255,243,176,0.25)';
    ctx.beginPath();
    ctx.arc(sunX, 84, m.night ? 44 : 62, 0, Math.PI * 2);
    ctx.fill();
    // Clouds, parallaxed by heading.
    const headShift = ((state.headingDeg - 90) / 180) * 320;
    for (const c of clouds) {
      const cx = ((c.x * 700 + 640 - headShift * c.depth + state.distance * 0.02 * c.depth) % 1500 + 1500) % 1500 - 110;
      const cy = c.y - state.alt * 40 * c.depth;
      ctx.fillStyle = m.night ? 'rgba(120,135,180,0.55)' : 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, c.s, c.s * 0.36, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + c.s * 0.5, cy + 6, c.s * 0.62, c.s * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function ridge(state, baseY, amp, colour, phase, parallax) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(0, H);
    const shift = ((state.headingDeg - 90) / 180) * parallax;
    for (let x = 0; x <= W; x += 16) {
      const t = (x + shift) / W;
      const y = baseY - amp * (0.55 + 0.45 * Math.sin(t * 9 + phase) * Math.sin(t * 23 + phase * 2));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }

  function drawGround(state) {
    const m = state.mission;
    const g = ctx.createLinearGradient(0, FIELD.horizonY, 0, H);
    g.addColorStop(0, m.groundB);
    g.addColorStop(1, m.groundA);
    ctx.fillStyle = g;
    ctx.fillRect(0, FIELD.horizonY, W, H - FIELD.horizonY);
    // Field bands scrolling toward the plane.
    const band = 130;
    const offset = state.distance % band;
    for (let i = 0; i < 13; i += 1) {
      const dFar = 1500 - i * band - offset;
      const dNear = dFar + band;
      const pFar = project(state, dFar, 0);
      const pNear = project(state, dNear, 0);
      if (pFar.f <= 0.01) continue;
      ctx.fillStyle = i % 2 === 0 ? m.groundA : m.groundB;
      ctx.fillRect(0, pFar.y, W, Math.max(1, pNear.y - pFar.y));
      // Field patches: gold and brown rectangles that converge with distance.
      const patchSeed = Math.floor((state.distance + i * band) / band);
      const prng = createRandom(patchSeed * 31 + 7);
      for (let k = 0; k < 3; k += 1) {
        const lat = prng.range(-1.4, 1.4);
        const wLat = prng.range(0.18, 0.4);
        const a = project(state, dFar, lat - wLat);
        const b = project(state, dFar, lat + wLat);
        const c = project(state, dNear, lat - wLat);
        const d = project(state, dNear, lat + wLat);
        ctx.fillStyle = k % 2 === 0 ? m.fieldA : m.fieldB;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(d.x, d.y);
        ctx.lineTo(c.x, c.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawRunway(state) {
    const m = state.mission;
    const runway = { start: 9000 - 700, end: 9000 + 260 };
    const distStart = runway.start - state.distance;
    const distEnd = runway.end - state.distance;
    if (distEnd < -80 || distStart > 1500) return;
    const near = project(state, Math.max(0, distEnd), -0.13);
    const far = project(state, Math.max(0, distStart), -0.13);
    const nearR = project(state, Math.max(0, distEnd), 0.13);
    const farR = project(state, Math.max(0, distStart), 0.13);
    ctx.fillStyle = m.runway;
    ctx.beginPath();
    ctx.moveTo(far.x, far.y);
    ctx.lineTo(farR.x, farR.y);
    ctx.lineTo(nearR.x, nearR.y);
    ctx.lineTo(near.x, nearR.y);
    ctx.closePath();
    ctx.fill();
    // Centreline dashes.
    ctx.fillStyle = '#f5f7fa';
    for (let d = Math.max(0, distStart); d < distEnd; d += 90) {
      const a = project(state, d, -0.012);
      const b = project(state, d + 46, -0.012);
      const c = project(state, d + 46, 0.012);
      const e = project(state, d, 0.012);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(e.x, e.y);
      ctx.closePath();
      ctx.fill();
    }
    // Threshold + runway number, readable while on approach.
    const th = project(state, Math.max(0, distStart), 0);
    if (th.f > 0.12) {
      text(ctx, '09', th.x, th.y + 26 * th.f + 14, Math.max(14, 44 * th.f), '#f5f7fa', 'center', 800);
    }
    // Edge lights.
    ctx.fillStyle = '#ffb02e';
    for (let d = Math.max(0, distStart); d < distEnd; d += 150) {
      for (const side of [-0.13, 0.13]) {
        const p = project(state, d, side);
        if (p.f > 0.05) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(1.5, 4 * p.f), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawObject(state, obj) {
    const dist = obj.coursePos - state.distance;
    if (dist < -40 || dist > 1500) return;
    const p = project(state, dist, obj.x);
    if (p.f < 0.03) return;
    const s = p.f;
    if (obj.kind === 'ring') {
      if (obj.done || dist < 60) return;
      const rx = 74 * s + 10;
      const ry = 74 * s * 0.62 + 7;
      ctx.save();
      ctx.translate(p.x, FIELD.horizonY + (p.y - FIELD.horizonY) - (obj.alt * 260 * s + 30 * s));
      ctx.strokeStyle = 'rgba(79,210,255,0.35)';
      ctx.lineWidth = 10 * s + 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#ffd23e';
      ctx.lineWidth = 5 * s + 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.arc(0, 0, 4 * s + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (obj.kind === 'crate') {
      if (obj.done || dist < 60) return;
      const cy = FIELD.horizonY + (p.y - FIELD.horizonY) - (obj.alt * 260 * s + 30 * s);
      const w = 44 * s + 8;
      ctx.fillStyle = '#e8823c';
      ctx.fillRect(p.x - w / 2, cy - w / 2, w, w);
      ctx.strokeStyle = '#7a3c14';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x - w / 2, cy - w / 2, w, w);
      ctx.beginPath();
      ctx.moveTo(p.x - w / 2, cy - w / 2);
      ctx.lineTo(p.x + w / 2, cy + w / 2);
      ctx.moveTo(p.x + w / 2, cy - w / 2);
      ctx.lineTo(p.x - w / 2, cy + w / 2);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(p.x, cy - w / 2 - 10 * s, 16 * s + 4, Math.PI, 0);
      ctx.fill();
    } else if (obj.kind === 'peak') {
      const base = project(state, dist, obj.x);
      const topY = base.y - obj.top * 420 * s;
      const halfW = obj.halfWidth * 640 * Math.pow(s, 1.15);
      ctx.fillStyle = state.mission.mountain;
      ctx.beginPath();
      ctx.moveTo(base.x - halfW, base.y);
      ctx.lineTo(base.x, topY);
      ctx.lineTo(base.x + halfW, base.y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#eef2f8';
      ctx.beginPath();
      ctx.moveTo(base.x - halfW * 0.28, topY + (base.y - topY) * 0.28);
      ctx.lineTo(base.x, topY);
      ctx.lineTo(base.x + halfW * 0.28, topY + (base.y - topY) * 0.28);
      ctx.closePath();
      ctx.fill();
    } else if (obj.kind === 'balloon') {
      const cy = FIELD.horizonY + (p.y - FIELD.horizonY) - (obj.alt * 260 * s + 30 * s);
      const r = 26 * s + 6;
      ctx.fillStyle = '#e5534b';
      ctx.beginPath();
      ctx.arc(p.x, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2c94c';
      ctx.beginPath();
      ctx.arc(p.x, cy, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a3a22';
      ctx.fillRect(p.x - 5 * s - 2, cy + r + 2, 10 * s + 4, 8 * s + 3);
    } else if (obj.kind === 'bird') {
      const cy = FIELD.horizonY + (p.y - FIELD.horizonY) - (obj.alt * 260 * s + 30 * s);
      ctx.strokeStyle = '#20242e';
      ctx.lineWidth = 2.5;
      for (let b = 0; b < 3; b += 1) {
        const bx = p.x + (b - 1) * 22 * s;
        const by = cy + (b % 2) * 10 * s;
        ctx.beginPath();
        ctx.moveTo(bx - 8 * s, by);
        ctx.quadraticCurveTo(bx, by - 7 * s, bx + 8 * s, by);
        ctx.stroke();
      }
    } else if (obj.kind === 'storm') {
      const cy = FIELD.horizonY + (p.y - FIELD.horizonY) - (obj.alt * 260 * s + 30 * s);
      ctx.fillStyle = 'rgba(38,44,66,0.9)';
      ctx.beginPath();
      ctx.ellipse(p.x, cy, 70 * s + 12, 34 * s + 8, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x - 40 * s, cy + 8, 44 * s + 8, 24 * s + 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,220,80,0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x, cy + 18 * s);
      ctx.lineTo(p.x - 10 * s, cy + 42 * s);
      ctx.lineTo(p.x + 6 * s, cy + 58 * s);
      ctx.lineTo(p.x - 4 * s, cy + 84 * s);
      ctx.stroke();
    }
  }

  function drawAircraft(state) {
    const cx = W / 2;
    const cy = 452 - state.altVel * 60;
    const bank = (state.bankDeg * Math.PI) / 180;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(bank * 0.9);
    if (state.invulnerable > 0 && Math.floor(state.time * 12) % 2 === 0) ctx.globalAlpha = 0.45;
    // Wings.
    ctx.fillStyle = '#c7d3e6';
    ctx.beginPath();
    ctx.moveTo(-14, -6);
    ctx.lineTo(-168, 26);
    ctx.lineTo(-168, 40);
    ctx.lineTo(-10, 18);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(14, -6);
    ctx.lineTo(168, 26);
    ctx.lineTo(168, 40);
    ctx.lineTo(10, 18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8fa3bd';
    ctx.fillRect(-168, 26, 22, 14);
    ctx.fillRect(146, 26, 22, 14);
    // Tail.
    ctx.fillStyle = '#aebdd2';
    ctx.beginPath();
    ctx.moveTo(-8, -78);
    ctx.lineTo(-52, -118);
    ctx.lineTo(-52, -104);
    ctx.lineTo(-4, -66);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(8, -78);
    ctx.lineTo(52, -118);
    ctx.lineTo(52, -104);
    ctx.lineTo(4, -66);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d64541';
    ctx.beginPath();
    ctx.moveTo(-16, -92);
    ctx.lineTo(16, -92);
    ctx.lineTo(10, -122);
    ctx.lineTo(-10, -122);
    ctx.closePath();
    ctx.fill();
    // Fuselage.
    const body = ctx.createLinearGradient(-26, 0, 26, 0);
    body.addColorStop(0, '#7e93b5');
    body.addColorStop(0.5, '#eef3fa');
    body.addColorStop(1, '#7e93b5');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, -128);
    ctx.quadraticCurveTo(24, -90, 26, -20);
    ctx.quadraticCurveTo(27, 34, 16, 62);
    ctx.quadraticCurveTo(0, 74, -16, 62);
    ctx.quadraticCurveTo(-27, 34, -26, -20);
    ctx.quadraticCurveTo(-24, -90, 0, -128);
    ctx.fill();
    // Canopy.
    ctx.fillStyle = '#17324e';
    ctx.beginPath();
    ctx.ellipse(0, -72, 13, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,215,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(-4, -80, 5, 14, -0.2, 0, Math.PI * 2);
    ctx.fill();
    // Stripe + registration.
    ctx.fillStyle = '#d64541';
    ctx.fillRect(-25, -8, 50, 7);
    ctx.fillStyle = '#20242e';
    ctx.font = `800 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('N-77MS', 0, 52);
    // Nav lights.
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(-168, 33, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#37d67a';
    ctx.beginPath();
    ctx.arc(168, 33, 4, 0, Math.PI * 2);
    ctx.fill();
    // Gear.
    if (state.gearDown) {
      ctx.strokeStyle = '#20242e';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-14, 58);
      ctx.lineTo(-18, 82);
      ctx.moveTo(14, 58);
      ctx.lineTo(18, 82);
      ctx.stroke();
      ctx.fillStyle = '#20242e';
      ctx.beginPath();
      ctx.arc(-18, 84, 6, 0, Math.PI * 2);
      ctx.arc(18, 84, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // Ground shadow when low.
    if (state.alt < 0.3) {
      const p = project(state, 0, state.x);
      ctx.fillStyle = `rgba(0,0,0,${0.28 * (1 - state.alt / 0.3)})`;
      ctx.beginPath();
      ctx.ellipse(W / 2, p.y - 6, 90 * (1 - state.alt), 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function gauge(ctx, x, y, w, h, frac, colour, label) {
    ctx.fillStyle = '#0b0f18';
    rr(ctx, x, y, w, h, 5);
    ctx.fill();
    ctx.fillStyle = colour;
    rr(ctx, x + 2, y + 2 + (1 - frac) * (h - 4), w - 4, frac * (h - 4), 4);
    ctx.fill();
    text(ctx, label, x + w / 2, y + h + 15, 11, PALETTE.muted, 'center', 700);
  }

  function dial(ctx, cx, cy, r, frac, label, value) {
    ctx.fillStyle = '#0b0f18';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
    const a = -Math.PI * 0.75 + frac * Math.PI * 1.5;
    ctx.strokeStyle = '#ffd23e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6));
    ctx.stroke();
    text(ctx, label, cx, cy + r + 15, 11, PALETTE.muted, 'center', 700);
    text(ctx, value, cx, cy + 5, 13, PALETTE.text, 'center', 800);
  }

  function drawPanel(state) {
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(0, 596, W, 124);
    ctx.fillStyle = PALETTE.panelEdge;
    ctx.fillRect(0, 596, W, 3);
    // Artificial horizon.
    const hx = 150;
    const hy = 656;
    ctx.save();
    ctx.beginPath();
    ctx.arc(hx, hy, 42, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(hx, hy);
    ctx.rotate((state.bankDeg * Math.PI) / 180);
    ctx.translate(0, state.altVel * 160);
    ctx.fillStyle = '#2f7fd0';
    ctx.fillRect(-46, -46, 92, 46);
    ctx.fillStyle = '#8a5a2e';
    ctx.fillRect(-46, 0, 92, 46);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-46, -1, 92, 2);
    ctx.restore();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hx, hy, 42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd23e';
    ctx.fillRect(hx - 22, hy - 2, 16, 3);
    ctx.fillRect(hx + 6, hy - 2, 16, 3);
    text(ctx, 'ATTITUDE', hx, hy + 58, 11, PALETTE.muted, 'center', 700);
    // Dials.
    dial(ctx, 300, 656, 40, state.speed / 340, 'AIRSPEED', `${Math.round(state.speed)}`);
    dial(ctx, 420, 656, 40, state.alt, 'ALTITUDE', `${Math.round(state.alt * 9000)}`);
    dial(ctx, 540, 656, 40, state.throttle, 'THROTTLE', `${Math.round(state.throttle * 100)}%`);
    // Fuel + damage gauges.
    gauge(ctx, 640, 618, 26, 76, state.fuel / 100, state.fuel < 20 ? PALETTE.red : PALETTE.amber, 'FUEL');
    gauge(ctx, 690, 618, 26, 76, 1 - state.damage / 100, state.damage > 70 ? PALETTE.red : PALETTE.green, 'HULL');
    text(ctx, `${Math.round(state.fuel)}%`, 653, 612, 12, PALETTE.text, 'center', 800);
    text(ctx, `${Math.round(state.damage)}%`, 703, 612, 12, PALETTE.text, 'center', 800);
    // Warning lights.
    const lights = [
      { label: 'GEAR', on: state.gearDown, colour: PALETTE.green },
      { label: 'FUEL', on: state.fuel < 20, colour: PALETTE.amber },
      { label: 'STALL', on: state.speed < 88 && state.alt > 0.02, colour: PALETTE.red },
      { label: 'DAMAGE', on: state.damage > 70, colour: PALETTE.red },
    ];
    lights.forEach((lamp, i) => {
      const lx = 790 + i * 86;
      ctx.fillStyle = lamp.on ? lamp.colour : '#232b3a';
      rr(ctx, lx, 626, 72, 34, 6);
      ctx.fill();
      text(ctx, lamp.label, lx + 36, 649, 13, lamp.on ? '#0b0f18' : PALETTE.muted, 'center', 800);
    });
    // Objective readout.
    const m = state.mission;
    const done = m.goal === 'rings' ? state.ringsHit : state.cratesHit;
    text(ctx, `${m.short}  ${done}/${m.goalCount}`, 790, 700, 16, PALETTE.text, 'left', 800);
    text(ctx, state.phase === 'approach' ? 'LAND ON RUNWAY 09' : 'NEXT: FLY THE COURSE', 1080, 700, 13, PALETTE.amber, 'left', 700);
  }

  function drawHud(state, best) {
    // Top bar.
    ctx.fillStyle = 'rgba(10,14,24,0.82)';
    ctx.fillRect(0, 0, W, 64);
    text(ctx, `ALT ${Math.round(state.alt * 9000)} FT`, 24, 42, 30, PALETTE.text, 'left', 800);
    text(ctx, `SPD ${Math.round(state.speed)} KT`, 300, 42, 30, PALETTE.text, 'left', 800);
    // Compass tape.
    const hdg = Math.round(state.headingDeg);
    text(ctx, `HDG ${String(hdg).padStart(3, '0')}°`, 560, 42, 30, PALETTE.text, 'left', 800);
    ctx.strokeStyle = PALETTE.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(640, 52);
    ctx.lineTo(640, 64);
    ctx.stroke();
    text(ctx, `SCORE ${state.score}`, 980, 42, 26, '#ffd23e', 'left', 800);
    text(ctx, `BEST ${best}`, 980, 60, 13, PALETTE.muted, 'left', 700);
    // Message banner.
    if (state.messageTimer > 0 && state.message) {
      ctx.fillStyle = 'rgba(10,14,24,0.85)';
      const mw = Math.min(900, 40 + state.message.length * 9);
      rr(ctx, (W - mw) / 2, 76, mw, 40, 8);
      ctx.fill();
      text(ctx, state.message, W / 2, 103, 17, '#ffd23e', 'center', 800);
    }
    // Rain streaks in the storm.
    if (state.mission.storm) {
      ctx.strokeStyle = 'rgba(180,200,240,0.35)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 40; i += 1) {
        const rx = (i * 173 + state.time * 900) % W;
        const ry = (i * 97 + state.time * 1400) % H;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 8, ry + 22);
        ctx.stroke();
      }
    }
  }

  function drawWorld(state) {
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 14 : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 10 : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawSky(state);
    ridge(state, FIELD.horizonY + 6, 46, state.mission.mountainFar, 1.3, 60);
    ridge(state, FIELD.horizonY + 10, 30, state.mission.mountain, 4.1, 140);
    drawGround(state);
    drawRunway(state);
    const sorted = [...state.objects].sort((a, b) => (b.coursePos - state.distance) - (a.coursePos - state.distance));
    for (const obj of sorted) drawObject(state, obj);
    drawAircraft(state);
    ctx.restore();
  }

  function overlay(title, lines, accent) {
    ctx.fillStyle = 'rgba(8,11,20,0.62)';
    ctx.fillRect(0, 0, W, H);
    text(ctx, title, W / 2, 150, 54, accent || PALETTE.text, 'center', 900);
    lines.forEach((line, i) => {
      text(ctx, line.text, W / 2, 210 + i * 34, line.size || 19, line.colour || PALETTE.text, 'center', line.weight || 600);
    });
  }

  function draw(state, screen, best, unlocked) {
    canvas.width = W;
    canvas.height = H;
    ctx.clearRect(0, 0, W, H);
    if (screen === SCREEN_TITLE) {
      drawWorld(state);
      drawHud(state, best);
      ctx.fillStyle = 'rgba(8,11,20,0.55)';
      ctx.fillRect(0, 0, W, H);
      text(ctx, 'MERIDIAN SKY RUN', W / 2, 132, 62, '#ffd23e', 'center', 900);
      text(ctx, 'Three sorties. One runway. Fly it like you mean it.', W / 2, 172, 20, PALETTE.text, 'center', 600);
      const missions = [
        '1  VALLEY RING RUN — thread 12 rings over Green Valley',
        '2  CANYON PASS — collect 6 crates between the peaks',
        '3  STORM RIDGE RESCUE — 8 rings in a night crosswind',
      ];
      missions.forEach((line, i) => {
        const locked = i > 0 && unlocked <= i;
        ctx.fillStyle = locked ? 'rgba(20,26,38,0.85)' : 'rgba(20,26,38,0.85)';
        rr(ctx, 290, 210 + i * 56, 700, 44, 8);
        ctx.fill();
        ctx.strokeStyle = i === 0 || unlocked > i ? '#37d67a' : PALETTE.panelEdge;
        ctx.lineWidth = 2;
        ctx.stroke();
        text(ctx, locked ? `${line}   —  finish the sortie before it` : line, 640, 239 + i * 56, 17, locked ? PALETTE.muted : PALETTE.text, 'center', 700);
      });
      text(ctx, 'ARROWS fly · SHIFT / CTRL throttle · G gear · P pause · M sound', W / 2, 420, 17, PALETTE.muted, 'center', 600);
      text(ctx, 'Press 1, 2 or 3 to pick a sortie — or ENTER to fly', W / 2, 458, 21, '#ffd23e', 'center', 800);
      text(ctx, `BEST SCORE ${best}`, W / 2, 500, 16, PALETTE.text, 'center', 700);
      return;
    }
    if (screen === SCREEN_BRIEF) {
      drawWorld(state);
      const m = state.mission;
      overlay(m.name.toUpperCase(), [
        { text: m.brief, size: 19, colour: PALETTE.text },
        { text: `Goal: ${m.goal === 'rings' ? `thread ${m.goalCount} rings` : `collect ${m.goalCount} supply crates`} — then land on runway 09`, size: 18, colour: '#ffd23e' },
        { text: `Fuel ${m.fuelStart}% · Full throttle burns it fast · Crates top it up`, size: 16, colour: PALETTE.muted },
        { text: 'ENTER — TAKE OFF', size: 24, colour: '#37d67a', weight: 800 },
      ], '#ffd23e');
      return;
    }
    drawWorld(state);
    drawPanel(state);
    drawHud(state, best);
    if (screen === SCREEN_PAUSED) {
      overlay('PAUSED', [{ text: 'P or ENTER — keep flying', size: 20, colour: '#37d67a' }]);
    } else if (screen === SCREEN_LANDED) {
      const complete = state.objectiveComplete;
      overlay(complete ? 'SORTIE COMPLETE' : 'LANDED — JOB UNFINISHED', [
        { text: `${state.mission.name} · Score ${state.score}`, size: 22, colour: '#ffd23e' },
        { text: state.landingDetail || '', size: 18 },
        { text: `Rings ${state.ringsHit} · Crates ${state.cratesHit} · Fuel left ${Math.round(state.fuel)}% · Damage ${Math.round(state.damage)}%`, size: 17, colour: PALETTE.muted },
        { text: complete ? 'ENTER — next sortie' : 'ENTER — fly this sortie again', size: 20, colour: '#37d67a', weight: 800 },
      ], complete ? '#37d67a' : '#ffb02e');
    } else if (screen === SCREEN_CRASHED) {
      overlay('CRASHED', [
        { text: state.crashReason, size: 22, colour: '#ff5a4e' },
        { text: `Score ${state.score} · ${state.mission.name}`, size: 18, colour: PALETTE.muted },
        { text: 'ENTER — try again', size: 20, colour: '#37d67a', weight: 800 },
      ], '#ff5a4e');
    }
  }

  return { draw };
}
