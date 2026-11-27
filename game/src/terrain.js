// The ground: a heightmap mesh along the whole course, built from value
// noise so the same seed always builds the same valley. Peaks are cones
// added into the heightmap itself, so a peak is solid ground — flying
// into one is a terrain hit, not a sprite overlap. The mesh carries its
// colours per vertex (fields, slopes, rock, snow, river, runway), so the
// terrain needs no texture at all.

import { fbm, valueNoise } from './noise.js';
import { createRandom } from './random.js';
import { hexRgb } from './gl.js';

export const COURSE_HALF_WIDTH = 380; // metres either side of the centreline
export const ALT_SCALE = 800; // altitude 0..1 maps to 0..800 m
const Z_START = 400; // metres behind the start line
const Z_END = -9600; // metres past the runway end
const X_HALF = 1200;
const STEP_Z = 60;
const STEP_X = 60;

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function riverXAt(d) {
  return (0.68 * Math.sin(d / 1400) + 0.22 * Math.sin(d / 520 + 2)) * COURSE_HALF_WIDTH;
}

export function createTerrain(mission, peaks, seed) {
  const m = mission;
  const groundA = hexRgb(m.groundA);
  const groundB = hexRgb(m.groundB);
  const fieldA = hexRgb(m.fieldA);
  const fieldB = hexRgb(m.fieldB);
  const mountain = hexRgb(m.mountain);
  const mountainFar = hexRgb(m.mountainFar);
  const river = hexRgb(m.river);
  const runwayCol = hexRgb(m.runway);

  function heightAt(x, z) {
    const d = -z;
    // Rolling hills, strongest away from the course: the valley floor
    // stays gentle so the approach stays flyable. (fbm takes
    // (x, y, octaves, seed) — octaves first, seed last.)
    let h = fbm(x * 0.0016, z * 0.0016, 4, seed) * 130 + fbm(x * 0.006, z * 0.006, 3, seed + 7) * 35;
    const valley = 0.06 + 0.94 * smoothstep(140, 750, Math.abs(x));
    h *= valley;
    if (m.id === 1) h += smoothstep(300, 650, Math.abs(x)) * 260; // canyon walls
    // Peaks: solid cones.
    for (const p of peaks) {
      const r = p.halfWidth * COURSE_HALF_WIDTH * 1.4;
      const dx = x - p.x * COURSE_HALF_WIDTH;
      const dz = z + p.coursePos;
      const dist = Math.hypot(dx, dz);
      if (dist < r) {
        const t = 1 - dist / r;
        h += p.top * ALT_SCALE * t * t * 0.9;
      }
    }
    // The river carves a shallow channel along its S-curve.
    const rx = riverXAt(d);
    const rdx = (x - rx) / 28;
    h -= 7 * Math.exp(-rdx * rdx);
    // The runway strip is flat ground.
    const runwayMask = (1 - smoothstep(40, 90, Math.abs(x)))
      * smoothstep(8200, 8300, d) * (1 - smoothstep(9260, 9360, d));
    h *= 1 - runwayMask;
    return h;
  }

  function colourAt(x, z, h) {
    const d = -z;
    const onRunway = Math.abs(x) < 52 && d > 8300 && d < 9260;
    if (onRunway) return runwayCol;
    const rx = riverXAt(d);
    if (Math.abs(x - rx) < 22 && h < 12) return river;
    const patch = valueNoise(x * 0.008, z * 0.008, seed + 31);
    // Green is the base: tan and brown are patches, not the field.
    const low = patch > 0.6 ? fieldA : patch < -0.7 ? fieldB : groundA;
    const mid = groundB;
    const high = h > 420 ? [0.93, 0.95, 0.97] : mountain;
    const t = smoothstep(60, 200, h);
    const t2 = smoothstep(200, 380, h);
    const c = [0, 0, 0];
    for (let i = 0; i < 3; i += 1) {
      c[i] = low[i] + (mid[i] - low[i]) * t;
      c[i] = c[i] + (high[i] - c[i]) * t2;
    }
    // Far ridges read cooler and paler, like the v5 haze.
    const far = smoothstep(700, 1150, Math.abs(x));
    for (let i = 0; i < 3; i += 1) c[i] += (mountainFar[i] - c[i]) * far * 0.5;
    return c;
  }

  const cols = Math.floor((X_HALF * 2) / STEP_X) + 1;
  const rows = Math.floor((Z_START - Z_END) / STEP_Z) + 1;
  const positions = [];
  const normals = [];
  const colours = [];
  const indices = [];
  const heights = [];
  for (let r = 0; r < rows; r += 1) {
    const z = Z_START - r * STEP_Z;
    for (let c = 0; c < cols; c += 1) {
      const x = -X_HALF + c * STEP_X;
      const h = heightAt(x, z);
      heights.push(h);
      positions.push(x, h, z);
      const col = colourAt(x, z, h);
      colours.push(col[0], col[1], col[2]);
    }
  }
  const hAt = (r, c) => heights[Math.max(0, Math.min(rows - 1, r)) * cols + Math.max(0, Math.min(cols - 1, c))];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const dhdx = (hAt(r, c + 1) - hAt(r, c - 1)) / (2 * STEP_X);
      const dhdz = (hAt(r + 1, c) - hAt(r - 1, c)) / (2 * STEP_Z);
      const inv = 1 / Math.hypot(dhdx, 1, dhdz);
      normals.push(-dhdx * inv, inv, -dhdz * inv);
    }
  }
  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      const a = r * cols + c;
      const b = a + 1;
      const d0 = a + cols;
      const e = d0 + 1;
      indices.push(a, b, d0, b, e, d0);
    }
  }

  // Trees: merged cones, placed where the slope is gentle and the ground
  // is clear of the runway and the river.
  const treePositions = [];
  const treeNormals = [];
  const treeColours = [];
  const treeIndices = [];
  const trng = createRandom(seed * 31 + 5);
  const treeCol = hexRgb(m.night ? '#0c1a10' : '#1c4220');
  const trunkCol = hexRgb('#4a3220');
  let treeBase = 0;
  function addCone(cx, cy, cz, radius, height, colour) {
    const segs = 6;
    const apex = treeBase;
    treePositions.push(cx, cy + height, cz);
    treeNormals.push(0, 1, 0);
    treeColours.push(colour[0], colour[1], colour[2]);
    treeBase += 1;
    const ringStart = treeBase;
    for (let i = 0; i < segs; i += 1) {
      const a = (i / segs) * Math.PI * 2;
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      treePositions.push(cx + nx * radius, cy, cz + nz * radius);
      treeNormals.push(nx * 0.7, 0.5, nz * 0.7);
      treeColours.push(colour[0], colour[1], colour[2]);
      treeBase += 1;
    }
    for (let i = 0; i < segs; i += 1) {
      const next = (i + 1) % segs;
      treeIndices.push(apex, ringStart + next, ringStart + i);
    }
  }
  let placed = 0;
  let tries = 0;
  while (placed < 260 && tries < 4000) {
    tries += 1;
    const x = trng.range(-950, 950);
    const z = -trng.range(200, 9400);
    const d = -z;
    if (Math.abs(x) < 170) continue;
    if (Math.abs(x) < 60 && d > 8200 && d < 9400) continue;
    if (Math.abs(x - riverXAt(d)) < 40) continue;
    const h = heightAt(x, z);
    if (h > 150) continue;
    const s = trng.range(9, 18);
    addCone(x, h - 1, z, s * 0.55, s, treeCol);
    addCone(x, h + s * 0.45, z, s * 0.38, s * 0.8, treeCol);
    placed += 1;
  }

  return {
    mesh: { positions, normals, colours, indices },
    treeMesh: { positions: treePositions, normals: treeNormals, colours: treeColours, indices: treeIndices },
    heightAt,
    riverXAt,
  };
}
