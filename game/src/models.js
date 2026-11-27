// Every mesh in the game is built here, in code, from triangles — no
// loaded model files, so the authorship gate sees the game's own writing
// and nothing else. All meshes use flat shading: one colour per face,
// normals from the face itself.

import { hexRgb } from './gl.js';

class Builder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.colours = [];
    this.indices = [];
  }

  get count() {
    return this.positions.length / 3;
  }

  tri(a, b, c, colour) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const base = this.count;
    for (const p of [a, b, c]) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(nx, ny, nz);
      this.colours.push(colour[0], colour[1], colour[2]);
    }
    this.indices.push(base, base + 1, base + 2);
    return base;
  }

  quad(a, b, c, d, colour) {
    this.tri(a, b, c, colour);
    this.tri(a, c, d, colour);
  }

  /** Axis-aligned box, centred at (cx, cy, cz), with a top colour and a side colour. */
  box(cx, cy, cz, sx, sy, sz, top, side, bottom) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2;
    const y0 = cy - sy / 2, y1 = cy + sy / 2;
    const z0 = cz - sz / 2, z1 = cz + sz / 2;
    const bot = bottom || side;
    this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], top);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], bot);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], side);
    this.quad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], side);
    this.quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], side);
    this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], side);
  }

  /** Tapered prism along Z: sections are { z, y, r } rings of `sides` points. */
  prism(sections, sides, colourTop, colourSide) {
    for (let s = 0; s < sections.length - 1; s += 1) {
      const a = sections[s];
      const b = sections[s + 1];
      for (let i = 0; i < sides; i += 1) {
        const a0 = (i / sides) * Math.PI * 2;
        const a1 = ((i + 1) / sides) * Math.PI * 2;
        const p = (sec, ang) => [Math.cos(ang) * sec.r, sec.y + Math.sin(ang) * sec.r, sec.z];
        const mid = (a0 + a1) / 2;
        const up = Math.sin(mid) > 0.3;
        const col = up ? colourTop : colourSide;
        this.quad(p(a, a0), p(b, a0), p(b, a1), p(a, a1), col);
      }
    }
    // Nose cap and tail cap.
    const nose = sections[sections.length - 1];
    const tail = sections[0];
    for (let i = 0; i < sides; i += 1) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const pn = (ang) => [Math.cos(ang) * nose.r, nose.y + Math.sin(ang) * nose.r, nose.z];
      this.tri([0, nose.y, nose.z - 0.6], pn(a1), pn(a0), colourTop);
      const pt = (ang) => [Math.cos(ang) * tail.r, tail.y + Math.sin(ang) * tail.r, tail.z];
      this.tri([0, tail.y, tail.z + 0.6], pt(a0), pt(a1), colourSide);
    }
  }

  sphere(cx, cy, cz, r, colour, latSegs = 8, lonSegs = 12, squashY = 1) {
    for (let la = 0; la < latSegs; la += 1) {
      const t0 = (la / latSegs) * Math.PI;
      const t1 = ((la + 1) / latSegs) * Math.PI;
      for (let lo = 0; lo < lonSegs; lo += 1) {
        const p0 = (lo / lonSegs) * Math.PI * 2;
        const p1 = ((lo + 1) / lonSegs) * Math.PI * 2;
        const pt = (t, p) => [
          cx + r * Math.sin(t) * Math.cos(p),
          cy + r * Math.cos(t) * squashY,
          cz + r * Math.sin(t) * Math.sin(p),
        ];
        this.quad(pt(t0, p0), pt(t1, p0), pt(t1, p1), pt(t0, p1), colour);
      }
    }
  }

  /** Torus in the XY plane (axis along Z): the goal ring, facing the course. */
  torus(cx, cy, cz, R, r, colour, segs = 20, tube = 8) {
    for (let i = 0; i < segs; i += 1) {
      const u0 = (i / segs) * Math.PI * 2;
      const u1 = ((i + 1) / segs) * Math.PI * 2;
      for (let j = 0; j < tube; j += 1) {
        const v0 = (j / tube) * Math.PI * 2;
        const v1 = ((j + 1) / tube) * Math.PI * 2;
        const pt = (u, v) => [
          cx + (R + r * Math.cos(v)) * Math.cos(u),
          cy + (R + r * Math.cos(v)) * Math.sin(u),
          cz + r * Math.sin(v),
        ];
        this.quad(pt(u0, v0), pt(u1, v0), pt(u1, v1), pt(u0, v1), colour);
      }
    }
  }

  mesh() {
    return { positions: this.positions, normals: this.normals, colours: this.colours, indices: this.indices };
  }
}

const LIGHT = hexRgb('#dbe5f2');
const MID = hexRgb('#9fb0c8');
const DARK = hexRgb('#7e93b5');
const RED = hexRgb('#d64541');
const CANOPY = hexRgb('#0e2438');

/** The aircraft, model space: nose toward -Z, wingspan 16 m, length 14 m. */
export function buildAircraft() {
  const b = new Builder();
  // Fuselage: tapered 8-sided prism, light on top, dark belly.
  b.prism(
    [
      { z: 7, y: 0, r: 0.45 },
      { z: 3, y: 0, r: 1.0 },
      { z: -1, y: 0, r: 1.15 },
      { z: -5, y: 0, r: 0.8 },
      { z: -7, y: 0, r: 0.15 },
    ],
    8,
    LIGHT,
    DARK,
  );
  // Red cheatline stripe along both flanks.
  for (const side of [-1, 1]) {
    b.box(side * 1.05, 0.1, -1, 0.12, 0.3, 9, RED, RED);
  }
  // Wings: tapered trapezoids with a slight dihedral, light top, dark bottom.
  for (const side of [-1, 1]) {
    const s = side;
    const root = 1.0;
    const tip = 8.0;
    const y = 0.15 + Math.abs(s) * 0;
    // Top face.
    b.quad([s * root, y + 0.1, -1.2], [s * tip, y + 0.55, -0.2], [s * tip, y + 0.55, 1.4], [s * root, y + 0.1, 2.4], LIGHT);
    // Bottom face.
    b.quad([s * root, y - 0.1, 2.4], [s * tip, y + 0.35, 1.4], [s * tip, y + 0.35, -0.2], [s * root, y - 0.1, -1.2], MID);
    // Leading edge.
    b.quad([s * root, y - 0.1, -1.2], [s * tip, y + 0.35, -0.2], [s * tip, y + 0.55, -0.2], [s * root, y + 0.1, -1.2], MID);
    // Trailing edge.
    b.quad([s * root, y - 0.1, 2.4], [s * root, y + 0.1, 2.4], [s * tip, y + 0.55, 1.4], [s * tip, y + 0.35, 1.4], MID);
    // Wingtip: red cap + nav light.
    b.quad([s * tip, y + 0.35, -0.2], [s * tip, y + 0.35, 1.4], [s * tip, y + 0.55, 1.4], [s * tip, y + 0.55, -0.2], RED);
    const nav = s < 0 ? hexRgb('#ff3b30') : hexRgb('#37d67a');
    b.box(s * tip, y + 0.45, 0.6, 0.5, 0.5, 0.5, nav, nav);
  }
  // Horizontal stabilizers.
  for (const side of [-1, 1]) {
    const s = side;
    b.quad([s * 0.4, 0.3, 5.2], [s * 3.2, 0.3, 6.0], [s * 3.2, 0.3, 7.0], [s * 0.4, 0.3, 6.6], MID);
    b.quad([s * 0.4, 0.1, 6.6], [s * 3.2, 0.1, 7.0], [s * 3.2, 0.1, 6.0], [s * 0.4, 0.1, 5.2], DARK);
  }
  // Vertical fin, red, swept back, with the white 77 left to the paint:
  // at this scale the fin reads as a red tail fin on its own.
  b.quad([-0.12, 0.4, 5.0], [0.12, 0.4, 5.0], [0.12, 2.6, 6.8], [-0.12, 2.6, 6.8], RED);
  b.quad([-0.12, 2.6, 6.8], [0.12, 2.6, 6.8], [0.12, 0.4, 7.0], [-0.12, 0.4, 7.0], RED);
  // Canopy: dark tinted half-dome.
  b.sphere(0, 0.55, -2.6, 0.95, CANOPY, 6, 10, 0.75);
  // Intake scoops.
  for (const side of [-1, 1]) {
    b.box(side * 0.95, -0.25, -1.5, 0.3, 0.7, 1.4, hexRgb('#20242e'), hexRgb('#20242e'));
  }
  return b.mesh();
}

/** Landing gear, drawn only when the gear is down. */
export function buildGear() {
  const b = new Builder();
  const dark = hexRgb('#20242e');
  for (const side of [-1, 1]) {
    b.box(side * 0.9, -1.6, -0.5, 0.25, 1.6, 0.25, dark, dark);
    b.box(side * 0.9, -2.5, -0.5, 0.7, 0.7, 0.5, dark, dark);
  }
  b.box(0, -1.8, -4.5, 0.25, 1.8, 0.25, dark, dark);
  b.box(0, -2.7, -4.5, 0.7, 0.7, 0.5, dark, dark);
  return b.mesh();
}

/** Engine exhaust glow, drawn additively behind the tail at high throttle. */
export function buildExhaust() {
  const b = new Builder();
  const glow = hexRgb('#ffb43c');
  b.sphere(0, 0, 8.2, 0.9, glow, 6, 8, 1);
  return b.mesh();
}

export function buildRing() {
  const b = new Builder();
  b.torus(0, 0, 0, 55, 4, hexRgb('#ffd23e'));
  return b.mesh();
}

export function buildCrate() {
  const b = new Builder();
  b.box(0, 0, 0, 22, 22, 22, hexRgb('#f2a45e'), hexRgb('#e8823c'), hexRgb('#8a4a1c'));
  // Straps across the faces.
  const strap = hexRgb('#7a3c14');
  b.box(0, 0, 11.2, 22, 3, 0.6, strap, strap);
  b.box(0, 0, -11.2, 22, 3, 0.6, strap, strap);
  b.box(11.2, 0, 0, 0.6, 3, 22, strap, strap);
  b.box(-11.2, 0, 0, 0.6, 3, 22, strap, strap);
  return b.mesh();
}

export function buildBalloon() {
  const b = new Builder();
  b.sphere(0, 0, 0, 14, hexRgb('#e5534b'), 8, 12);
  b.sphere(0, -1, 0, 14.6, hexRgb('#f2c94c'), 3, 12, 0.5);
  b.box(0, -19, 0, 6, 5, 6, hexRgb('#5a3a22'), hexRgb('#5a3a22'));
  return b.mesh();
}

export function buildBird() {
  const b = new Builder();
  const dark = hexRgb('#20242e');
  b.quad([-6, 0, 0], [0, 1.2, 1], [0, 1.2, -1], [-6, 0, 0], dark);
  b.quad([6, 0, 0], [0, 1.2, -1], [0, 1.2, 1], [6, 0, 0], dark);
  b.box(0, 0, 0, 1.2, 1, 4, dark, dark);
  return b.mesh();
}

export function buildStormCell() {
  // A dark thunderhead. Near-round (squash 0.9 / 1.05) so it reads as a
  // cloud mass from the side, not a floating disc.
  const b = new Builder();
  b.sphere(0, 0, 0, 60, hexRgb('#262c42'), 8, 12, 0.9);
  return b.mesh();
}

/** Runway markings: threshold keys, centreline dashes, edge + approach lights. */
export function buildRunwayMarkings() {
  const b = new Builder();
  const white = hexRgb('#f5f7fa');
  const amber = hexRgb('#ffb02e');
  const green = hexRgb('#37d67a');
  const y = 0.7;
  // Threshold piano keys at the 8300 m end (z = -8300).
  for (let k = -2; k <= 2; k += 1) {
    b.quad([k * 17 - 7, y, -8300], [k * 17 + 7, y, -8300], [k * 17 + 7, y, -8342], [k * 17 - 7, y, -8342], white);
  }
  // Centreline dashes every 90 m.
  for (let d = 8340; d < 9220; d += 90) {
    b.quad([-4, y, -d], [4, y, -d], [4, y, -d - 46], [-4, y, -d - 46], white);
  }
  // Edge lights every 150 m, both sides.
  for (let d = 8300; d < 9260; d += 150) {
    for (const side of [-1, 1]) {
      b.box(side * 52, y + 1, -d, 2.5, 2.5, 2.5, amber, amber);
    }
  }
  // Green approach lights before the threshold.
  for (let d = 8000; d < 8300; d += 100) {
    for (const side of [-1, 1]) {
      b.box(side * 34, y + 1, -d, 2.5, 2.5, 2.5, green, green);
    }
  }
  return b.mesh();
}
