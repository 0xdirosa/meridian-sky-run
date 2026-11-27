// The 2D overlay: cockpit panel with its instruments, the HUD, and every
// screen (title, brief, paused, landed, crashed). It paints on a
// transparent canvas stacked over the WebGL canvas, so the 3D world shows
// through wherever this layer draws nothing. Adapted from the v5 2D
// renderer — the panel, dials and screens are unchanged, only the world
// behind them is now real 3D.

import { FIELD, FONT, PALETTE } from './config.js';

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

export function createHud(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = W;
  canvas.height = H;

  function gauge(ctx, x, y, w, h, frac, colour, label) {
    ctx.fillStyle = '#0b0f18';
    rr(ctx, x, y, w, h, 5);
    ctx.fill();
    ctx.fillStyle = colour;
    rr(ctx, x + 2, y + 2 + (1 - frac) * (h - 4), w - 4, frac * (h - 4), 4);
    ctx.fill();
    text(ctx, label, x + w / 2, y + h + 15, 11, PALETTE.muted, 'center', 700);
  }

  function dial(ctx, cx, cy, r, frac, label, value, scale) {
    ctx.fillStyle = '#232b3a';
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4a5a75';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#0b0f18';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
    for (let i = 0; i <= 8; i += 1) {
      const a = -Math.PI * 0.75 + (i / 8) * Math.PI * 1.5;
      const major = i % 4 === 0;
      ctx.strokeStyle = major ? '#c7d3e6' : '#5a6b85';
      ctx.lineWidth = major ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4));
      ctx.lineTo(cx + Math.cos(a) * (r - (major ? 12 : 9)), cy + Math.sin(a) * (r - (major ? 12 : 9)));
      ctx.stroke();
      if (scale && i % 8 === 0) {
        const nx = cx + Math.cos(a) * (r - 16);
        const ny = cy + Math.sin(a) * (r - 16) + 3;
        text(ctx, scale[i / 8], nx, ny, 8, '#8fa3bd', 'center', 700);
      }
    }
    const a = -Math.PI * 0.75 + frac * Math.PI * 1.5;
    ctx.strokeStyle = '#ffd23e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6));
    ctx.stroke();
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 7, Math.PI * 1.05, Math.PI * 1.5);
    ctx.stroke();
    text(ctx, label, cx, cy + r + 15, 11, PALETTE.muted, 'center', 700);
    text(ctx, value, cx, cy + 5, 13, PALETTE.text, 'center', 800);
  }

  function drawPanel(state) {
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(0, 596, W, 124);
    ctx.fillStyle = PALETTE.panelEdge;
    ctx.fillRect(0, 596, W, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, 599, W, 2);
    // Artificial horizon with a pitch ladder.
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
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    for (const dy of [-22, 22]) {
      ctx.beginPath();
      ctx.moveTo(-16, dy);
      ctx.lineTo(16, dy);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.fillRect(-46, -1, 92, 2);
    ctx.restore();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hx, hy, 42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#c7d3e6';
    ctx.lineWidth = 2;
    for (const deg of [-60, -30, 30, 60]) {
      const a = -Math.PI / 2 + (deg * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(hx + Math.cos(a) * 42, hy + Math.sin(a) * 42);
      ctx.lineTo(hx + Math.cos(a) * 36, hy + Math.sin(a) * 36);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.moveTo(hx, hy - 42);
    ctx.lineTo(hx - 4, hy - 34);
    ctx.lineTo(hx + 4, hy - 34);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd23e';
    ctx.fillRect(hx - 22, hy - 2, 16, 3);
    ctx.fillRect(hx + 6, hy - 2, 16, 3);
    text(ctx, 'ATTITUDE', hx, hy + 58, 11, PALETTE.muted, 'center', 700);
    dial(ctx, 300, 656, 40, state.speed / 340, 'AIRSPEED', `${Math.round(state.speed)}`, ['0', '340']);
    dial(ctx, 420, 656, 40, state.alt, 'ALTITUDE', `${Math.round(state.alt * 9000)}`, ['0', '9000']);
    dial(ctx, 540, 656, 40, state.throttle, 'THROTTLE', `${Math.round(state.throttle * 100)}%`, ['0', '100']);
    gauge(ctx, 640, 618, 26, 76, state.fuel / 100, state.fuel < 20 ? PALETTE.red : PALETTE.amber, 'FUEL');
    gauge(ctx, 690, 618, 26, 76, 1 - state.damage / 100, state.damage > 70 ? PALETTE.red : PALETTE.green, 'HULL');
    text(ctx, `${Math.round(state.fuel)}%`, 653, 612, 12, PALETTE.text, 'center', 800);
    text(ctx, `${Math.round(state.damage)}%`, 703, 612, 12, PALETTE.text, 'center', 800);
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
    const m = state.mission;
    const done = m.goal === 'rings' ? state.ringsHit : state.cratesHit;
    text(ctx, `${m.short}  ${done}/${m.goalCount}`, 790, 700, 16, PALETTE.text, 'left', 800);
    text(ctx, state.phase === 'approach' ? 'LAND ON RUNWAY 09' : 'NEXT: FLY THE COURSE', 1080, 700, 13, PALETTE.amber, 'left', 700);
  }

  function drawHud(state, best) {
    ctx.fillStyle = 'rgba(10,14,24,0.94)';
    ctx.fillRect(0, 0, W, 64);
    text(ctx, `ALT ${Math.round(state.alt * 9000)} FT`, 24, 42, 30, PALETTE.text, 'left', 800);
    text(ctx, `SPD ${Math.round(state.speed)} KT`, 300, 42, 30, PALETTE.text, 'left', 800);
    const hdg = Math.round(state.headingDeg);
    text(ctx, `HDG ${String(hdg).padStart(3, '0')}°`, 560, 42, 30, PALETTE.text, 'left', 800);
    const tapeX = 760;
    for (let off = -30; off <= 30; off += 15) {
      const h = ((hdg + off) % 360 + 360) % 360;
      const x = tapeX + off * 3.2;
      const cardinal = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[h];
      ctx.strokeStyle = off === 0 ? PALETTE.cyan : 'rgba(238,242,248,0.5)';
      ctx.lineWidth = off === 0 ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 46);
      ctx.lineTo(x, off === 0 ? 64 : 58);
      ctx.stroke();
      if (cardinal || h % 30 === 0) {
        text(ctx, cardinal || String(h).padStart(3, '0'), x, 40, 11, off === 0 ? PALETTE.cyan : PALETTE.muted, 'center', 700);
      }
    }
    text(ctx, `SCORE ${state.score}`, W - 24, 42, 26, '#ffd23e', 'right', 800);
    text(ctx, `BEST ${best}`, W - 24, 60, 13, PALETTE.muted, 'right', 700);
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
    // Wind streaks at high speed, at the frame edges.
    const streak = Math.max(0, (state.speed - 200) / 130);
    if (streak > 0) {
      const n = Math.floor(streak * 14);
      for (let i = 0; i < n; i += 1) {
        const left = i % 2 === 0;
        const sx = left
          ? ((i * 197 + state.time * 900) % 180)
          : W - ((i * 197 + state.time * 900) % 180);
        const sy = 120 + ((i * 311) % 420);
        ctx.strokeStyle = `rgba(255,255,255,${0.28 * streak})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - (left ? -1 : 1) * (40 + streak * 40), sy + 6);
        ctx.stroke();
      }
    }
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
    ctx.clearRect(0, 0, W, H);
    if (screen === SCREEN_TITLE) {
      const scrim = ctx.createLinearGradient(0, 0, 0, H);
      scrim.addColorStop(0, 'rgba(8,11,20,0.78)');
      scrim.addColorStop(0.55, 'rgba(8,11,20,0.45)');
      scrim.addColorStop(1, 'rgba(8,11,20,0.62)');
      ctx.fillStyle = scrim;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.font = `900 62px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('MERIDIAN SKY RUN', W / 2 + 3, 135);
      text(ctx, 'MERIDIAN SKY RUN', W / 2, 132, 62, '#ffd23e', 'center', 900);
      ctx.fillStyle = '#ffd23e';
      ctx.fillRect(W / 2 - 90, 148, 180, 3);
      text(ctx, 'Three sorties. One runway. Fly it like you mean it.', W / 2, 184, 20, PALETTE.text, 'center', 600);
      const cards = [
        { n: 1, name: 'VALLEY RING RUN', goal: '12 rings over Green Valley' },
        { n: 2, name: 'CANYON PASS', goal: '6 crates, canyon peaks' },
        { n: 3, name: 'STORM RIDGE RESCUE', goal: '8 rings, night crosswind' },
      ];
      cards.forEach((card, i) => {
        const locked = i > 0 && unlocked <= i;
        const y = 214 + i * 58;
        ctx.fillStyle = 'rgba(20,26,38,0.88)';
        rr(ctx, 290, y, 700, 46, 8);
        ctx.fill();
        ctx.strokeStyle = locked ? PALETTE.panelEdge : '#37d67a';
        ctx.lineWidth = 2;
        ctx.stroke();
        text(ctx, `${card.n}  ${card.name} — ${card.goal}`, 310, y + 29, 17, locked ? PALETTE.muted : PALETTE.text, 'left', 700);
        text(ctx, locked ? `LOCKED · FINISH SORTIE ${i} FIRST` : 'READY', 970, y + 28, 13, locked ? '#ff8a80' : '#37d67a', 'right', 800);
      });
      text(ctx, 'ARROWS fly · SHIFT / CTRL throttle · G gear · P pause · M sound', W / 2, 428, 17, PALETTE.muted, 'center', 600);
      text(ctx, 'Press 1, 2 or 3 to pick a sortie — or ENTER to fly', W / 2, 466, 21, '#ffd23e', 'center', 800);
      text(ctx, `BEST SCORE ${best}`, W / 2, 560, 16, PALETTE.text, 'center', 700);
      return;
    }
    if (screen === SCREEN_BRIEF) {
      const m = state.mission;
      overlay(m.name.toUpperCase(), [
        { text: m.brief, size: 19, colour: PALETTE.text },
        { text: `Goal: ${m.goal === 'rings' ? `thread ${m.goalCount} rings` : `collect ${m.goalCount} supply crates`} — then land on runway 09`, size: 18, colour: '#ffd23e' },
        { text: `Fuel ${m.fuelStart}% · Full throttle burns it fast · Crates top it up`, size: 16, colour: PALETTE.muted },
        { text: 'ENTER — TAKE OFF', size: 24, colour: '#37d67a', weight: 800 },
      ], '#ffd23e');
      return;
    }
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
