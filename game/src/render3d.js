// The 3D scene: sky dome, terrain, runway, objects, the aircraft, clouds,
// rain and lightning — all raw WebGL, no library. The 2D cockpit panel,
// HUD and screens live on a separate overlay canvas (hud.js); this file
// only paints the world.
//
// World mapping from the 2D sim: course runs toward -Z (z = -distance),
// lateral x = state.x * 380 m, altitude y = state.alt * 800 m.

import { FIELD } from './config.js';
import { createGL, createProgram, createTexture, drawMesh, hexRgb, uploadMesh } from './gl.js';
import { eulerYXZ, lookAt, multiply, perspective, rotationY, translation } from './mat4.js';
import { createTerrain, ALT_SCALE, COURSE_HALF_WIDTH } from './terrain.js';
import { createRandom } from './random.js';
import {
  buildAircraft,
  buildBalloon,
  buildBird,
  buildCrate,
  buildExhaust,
  buildGear,
  buildRing,
  buildRunwayMarkings,
  buildStormCell,
} from './models.js';

const W = FIELD.width;
const H = FIELD.height;

const MESH_VS = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColour;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uAmbient;
uniform float uEmissive;
uniform vec3 uCamPos;
varying vec3 vColour;
varying float vDist;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vec3 wn = normalize(mat3(uModel) * aNormal);
  float diff = max(dot(wn, uSunDir), 0.0);
  vec3 lit = aColour * (uAmbient + uSunCol * diff);
  vColour = mix(lit, aColour, uEmissive);
  vDist = distance(wp.xyz, uCamPos);
  gl_Position = uProj * uView * wp;
}`;

const MESH_FS = `
precision mediump float;
varying vec3 vColour;
varying float vDist;
uniform vec3 uFogColour;
uniform float uFogNear;
uniform float uFogFar;
void main() {
  float f = clamp((vDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  gl_FragColor = vec4(mix(vColour, uFogColour, f), 1.0);
}`;

const SKY_VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const SKY_FS = `
precision mediump float;
varying vec2 vUv;
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uLow;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamFwd;
uniform float uFovTan;
uniform float uAspect;
uniform float uNight;
uniform float uFlash;
uniform float uTime;
float hash3(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
}
void main() {
  vec3 ray = normalize(uCamFwd + vUv.x * uFovTan * uAspect * uCamRight + vUv.y * uFovTan * uCamUp);
  float h = clamp(ray.y, -0.05, 1.0);
  vec3 col = mix(uLow, uMid, smoothstep(0.0, 0.25, h));
  col = mix(col, uTop, smoothstep(0.2, 0.7, h));
  if (ray.y < 0.0) col = uLow * 0.9;
  float s = max(dot(ray, uSunDir), 0.0);
  col += uSunCol * (pow(s, 350.0) * 1.2 + pow(s, 8.0) * 0.25);
  if (uNight > 0.5 && ray.y > 0.05) {
    vec3 cell = floor(ray * 220.0);
    float star = step(0.997, hash3(cell));
    star *= 0.6 + 0.4 * sin(uTime * 2.0 + cell.x * 7.0 + cell.y * 3.0);
    col += vec3(star * 0.8);
  }
  col += vec3(uFlash);
  gl_FragColor = vec4(col, 1.0);
}`;

const CLOUD_VS = `
attribute vec3 aPos;
attribute vec2 aUv;
attribute float aAlpha;
uniform mat4 uProj;
uniform mat4 uView;
varying vec2 vUv;
varying float vAlpha;
varying float vDist;
void main() {
  vec4 wp = uView * vec4(aPos, 1.0);
  vDist = -wp.z;
  vUv = aUv;
  vAlpha = aAlpha;
  gl_Position = uProj * wp;
}`;

const CLOUD_FS = `
precision mediump float;
uniform sampler2D uTex;
uniform vec3 uTint;
uniform vec3 uFogColour;
uniform float uFogNear;
uniform float uFogFar;
varying vec2 vUv;
varying float vAlpha;
varying float vDist;
void main() {
  vec4 t = texture2D(uTex, vUv);
  float f = clamp((vDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  vec3 col = mix(uTint, uFogColour, f);
  float a = t.a * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
}`;

const LINE_VS = `
attribute vec3 aPos;
uniform mat4 uProj;
uniform mat4 uView;
void main() {
  gl_Position = uProj * uView * vec4(aPos, 1.0);
}`;

const LINE_FS = `
precision mediump float;
uniform vec4 uColour;
void main() {
  gl_FragColor = uColour;
}`;

function makePuffTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  // A cluster of overlapping radial puffs: lit top, soft base.
  const puffs = [
    [64, 74, 44],
    [38, 84, 30],
    [90, 84, 30],
    [64, 52, 32],
  ];
  for (const [x, y, r] of puffs) {
    const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

export function createRenderer3D(canvas) {
  const gl = createGL(canvas);
  if (!gl) throw new Error('WebGL is not available in this browser.');
  canvas.width = W;
  canvas.height = H;

  const meshProg = createProgram(gl, MESH_VS, MESH_FS);
  const skyProg = createProgram(gl, SKY_VS, SKY_FS);
  const cloudProg = createProgram(gl, CLOUD_VS, CLOUD_FS);
  const lineProg = createProgram(gl, LINE_VS, LINE_FS);

  const loc = (prog, name) => gl.getUniformLocation(prog, name);
  const meshU = {
    proj: loc(meshProg, 'uProj'), view: loc(meshProg, 'uView'), model: loc(meshProg, 'uModel'),
    sunDir: loc(meshProg, 'uSunDir'), sunCol: loc(meshProg, 'uSunCol'), ambient: loc(meshProg, 'uAmbient'),
    emissive: loc(meshProg, 'uEmissive'), camPos: loc(meshProg, 'uCamPos'),
    fogColour: loc(meshProg, 'uFogColour'), fogNear: loc(meshProg, 'uFogNear'), fogFar: loc(meshProg, 'uFogFar'),
  };
  const meshA = {
    pos: gl.getAttribLocation(meshProg, 'aPos'),
    normal: gl.getAttribLocation(meshProg, 'aNormal'),
    colour: gl.getAttribLocation(meshProg, 'aColour'),
  };
  const skyU = {
    top: loc(skyProg, 'uTop'), mid: loc(skyProg, 'uMid'), low: loc(skyProg, 'uLow'),
    sunDir: loc(skyProg, 'uSunDir'), sunCol: loc(skyProg, 'uSunCol'),
    camRight: loc(skyProg, 'uCamRight'), camUp: loc(skyProg, 'uCamUp'), camFwd: loc(skyProg, 'uCamFwd'),
    fovTan: loc(skyProg, 'uFovTan'), aspect: loc(skyProg, 'uAspect'),
    night: loc(skyProg, 'uNight'), flash: loc(skyProg, 'uFlash'), time: loc(skyProg, 'uTime'),
  };
  const cloudU = {
    proj: loc(cloudProg, 'uProj'), view: loc(cloudProg, 'uView'),
    tex: loc(cloudProg, 'uTex'), tint: loc(cloudProg, 'uTint'),
    fogColour: loc(cloudProg, 'uFogColour'), fogNear: loc(cloudProg, 'uFogNear'), fogFar: loc(cloudProg, 'uFogFar'),
  };
  const cloudA = {
    pos: gl.getAttribLocation(cloudProg, 'aPos'),
    uv: gl.getAttribLocation(cloudProg, 'aUv'),
    alpha: gl.getAttribLocation(cloudProg, 'aAlpha'),
  };
  const lineU = {
    proj: loc(lineProg, 'uProj'), view: loc(lineProg, 'uView'), colour: loc(lineProg, 'uColour'),
  };
  const lineA = gl.getAttribLocation(lineProg, 'aPos');

  // Full-screen triangle for the sky.
  const skyVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, skyVbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const puffTex = createTexture(gl, makePuffTexture());

  // Static meshes, uploaded once.
  const aircraft = uploadMesh(gl, buildAircraft());
  const gear = uploadMesh(gl, buildGear());
  const exhaust = uploadMesh(gl, buildExhaust());
  const ring = uploadMesh(gl, buildRing());
  const crate = uploadMesh(gl, buildCrate());
  const balloon = uploadMesh(gl, buildBalloon());
  const bird = uploadMesh(gl, buildBird());
  const stormCell = uploadMesh(gl, buildStormCell());
  const runwayMarks = uploadMesh(gl, buildRunwayMarkings());

  // Cloud field: fixed world positions along the course, so they parallax
  // naturally as the plane flies. Same seed every run.
  const clouds = [];
  {
    const rng = createRandom(99);
    for (let i = 0; i < 44; i += 1) {
      const d = 400 + i * 210 + rng.range(0, 120);
      clouds.push({
        x: rng.range(-900, 900),
        y: rng.range(280, 640),
        z: -d,
        size: rng.range(120, 260),
        puffs: 3 + Math.floor(rng.range(0, 3)),
        drift: rng.range(-8, 8),
      });
    }
  }
  // Dynamic buffers, refilled every frame: clouds, rain, lightning.
  const cloudVbo = gl.createBuffer();
  const cloudIbo = gl.createBuffer();
  const lineVbo = gl.createBuffer();

  let terrainCache = null;
  function terrainFor(state) {
    const peaks = state.objects.filter((o) => o.kind === 'peak');
    const key = `${state.mission.id}:${state.seed}`;
    if (!terrainCache || terrainCache.key !== key) {
      const t = createTerrain(state.mission, peaks, state.seed);
      terrainCache = { key, terrain: t, mesh: uploadMesh(gl, t.mesh), trees: uploadMesh(gl, t.treeMesh) };
    }
    return terrainCache;
  }

  function drawMeshAt(prog, uploaded, model, emissive) {
    gl.useProgram(prog);
    gl.uniformMatrix4fv(meshU.model, false, model);
    gl.uniform1f(meshU.emissive, emissive ? 1 : 0);
    drawMesh(gl, uploaded, meshA.pos, meshA.normal, meshA.colour);
  }

  return { draw, terrainFor };

  function draw(state) {
    const m = state.mission;
    const terr = terrainFor(state);
    gl.viewport(0, 0, W, H);

    // --- Camera: chase, behind and above the plane, rolling with the bank.
    const yaw = ((90 - state.headingDeg) * Math.PI) / 180;
    const pitch = Math.max(-0.45, Math.min(0.45, state.altVel * 2.0));
    const bankRad = (state.bankDeg * Math.PI) / 180;
    const planePos = [state.x * COURSE_HALF_WIDTH, state.alt * ALT_SCALE + 2, -state.distance];
    const fwd = [
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    ];
    const up0 = [0, 1, 0];
    // Roll the up vector around the forward axis by a fraction of the bank.
    const rollA = -bankRad * 0.35;
    const cosR = Math.cos(rollA);
    const sinR = Math.sin(rollA);
    const crossFU = [
      fwd[1] * up0[2] - fwd[2] * up0[1],
      fwd[2] * up0[0] - fwd[0] * up0[2],
      fwd[0] * up0[1] - fwd[1] * up0[0],
    ];
    const dotFU = fwd[0] * up0[0] + fwd[1] * up0[1] + fwd[2] * up0[2];
    const up = [
      up0[0] * cosR + crossFU[0] * sinR + fwd[0] * dotFU * (1 - cosR),
      up0[1] * cosR + crossFU[1] * sinR + fwd[1] * dotFU * (1 - cosR),
      up0[2] * cosR + crossFU[2] * sinR + fwd[2] * dotFU * (1 - cosR),
    ];
    const shake = state.shake > 0 ? state.shake : 0;
    const shX = shake > 0 ? (Math.random() - 0.5) * shake * 3 : 0;
    const shY = shake > 0 ? (Math.random() - 0.5) * shake * 2 : 0;
    let camPos = [
      planePos[0] - fwd[0] * 34 + shX,
      planePos[1] - fwd[1] * 34 + 9 + shY,
      planePos[2] - fwd[2] * 34,
    ];
    const groundBelow = terr.terrain.heightAt(camPos[0], camPos[2]);
    if (camPos[1] < groundBelow + 4) camPos[1] = groundBelow + 4;
    const camTarget = [planePos[0] + fwd[0] * 60, planePos[1] + fwd[1] * 60, planePos[2] + fwd[2] * 60];
    const view = lookAt(camPos, camTarget, up);
    const fov = (68 + Math.max(0, (state.speed - 200) / 130) * 8) * (Math.PI / 180);
    const proj = perspective(fov, W / H, 1, 12000);
    const fovTan = Math.tan(fov / 2);
    const camRight = [
      view[0], view[4], view[8],
    ];
    const camUp = [view[1], view[5], view[9]];
    const camFwd = [-view[2], -view[6], -view[10]];

    // --- Sun / moon and fog, per mission.
    const sunDir = m.night
      ? [-0.3, 0.6, -0.5]
      : m.id === 1
        ? [0.6, 0.35, -0.5]
        : [0.55, 0.55, -0.45];
    const sunLen = Math.hypot(sunDir[0], sunDir[1], sunDir[2]);
    sunDir[0] /= sunLen; sunDir[1] /= sunLen; sunDir[2] /= sunLen;
    const sunCol = m.night ? [0.5, 0.55, 0.7] : m.id === 1 ? [1.0, 0.75, 0.5] : [1.0, 0.95, 0.8];
    const ambient = m.night ? [0.42, 0.46, 0.6] : [0.45, 0.5, 0.55];
    const fogColour = hexRgb(m.skyLow);
    const fogNear = m.storm ? 500 : 900;
    const fogFar = m.storm ? 4200 : 6500;
    const flash = Math.min(0.55, state.lightning * 3);

    // --- Sky: full-screen triangle, depth off.
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(skyProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, skyVbo);
    const skyPos = gl.getAttribLocation(skyProg, 'aPos');
    gl.enableVertexAttribArray(skyPos);
    gl.vertexAttribPointer(skyPos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3fv(skyU.top, hexRgb(m.skyTop));
    gl.uniform3fv(skyU.mid, hexRgb(m.skyMid));
    gl.uniform3fv(skyU.low, hexRgb(m.skyLow));
    gl.uniform3fv(skyU.sunDir, sunDir);
    gl.uniform3fv(skyU.sunCol, hexRgb(m.sun));
    gl.uniform3fv(skyU.camRight, camRight);
    gl.uniform3fv(skyU.camUp, camUp);
    gl.uniform3fv(skyU.camFwd, camFwd);
    gl.uniform1f(skyU.fovTan, fovTan);
    gl.uniform1f(skyU.aspect, W / H);
    gl.uniform1f(skyU.night, m.night ? 1 : 0);
    gl.uniform1f(skyU.flash, flash);
    gl.uniform1f(skyU.time, state.time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    // --- Opaque meshes.
    gl.useProgram(meshProg);
    gl.uniformMatrix4fv(meshU.proj, false, proj);
    gl.uniformMatrix4fv(meshU.view, false, view);
    gl.uniform3fv(meshU.sunDir, sunDir);
    gl.uniform3fv(meshU.sunCol, sunCol);
    gl.uniform3fv(meshU.ambient, ambient);
    gl.uniform3fv(meshU.camPos, camPos);
    gl.uniform3fv(meshU.fogColour, fogColour);
    gl.uniform1f(meshU.fogNear, fogNear);
    gl.uniform1f(meshU.fogFar, fogFar);

    drawMeshAt(meshProg, terr.mesh, translation(0, 0, 0), false);
    drawMeshAt(meshProg, terr.trees, translation(0, 0, 0), false);
    drawMeshAt(meshProg, runwayMarks, translation(0, 0, 0), true);

    // Course objects.
    for (const obj of state.objects) {
      const dist = obj.coursePos - state.distance;
      if (dist < -60 || dist > 2400) continue;
      const ox = obj.x * COURSE_HALF_WIDTH;
      const oy = obj.alt * ALT_SCALE;
      const oz = -obj.coursePos;
      if (obj.kind === 'ring' && !obj.done) {
        drawMeshAt(meshProg, ring, translation(ox, oy, oz), false);
      } else if (obj.kind === 'crate' && !obj.done) {
        const spin = state.time * 0.4;
        drawMeshAt(meshProg, crate, multiply(translation(ox, oy, oz), rotationY(spin)), false);
      } else if (obj.kind === 'balloon' && !obj.done) {
        const bob = Math.sin(state.time * 1.3 + obj.coursePos) * 6;
        drawMeshAt(meshProg, balloon, translation(ox, oy + bob, oz), false);
      } else if (obj.kind === 'bird' && !obj.done) {
        const flap = Math.sin(state.time * 10 + obj.coursePos) * 0.5;
        const birdModel = multiply(translation(ox, oy, oz), eulerYXZ(0, 0, flap));
        drawMeshAt(meshProg, bird, birdModel, false);
      } else if (obj.kind === 'storm' && !obj.done) {
        drawMeshAt(meshProg, stormCell, translation(ox, oy, oz), false);
      }
    }

    // The aircraft.
    const planeModel = multiply(translation(planePos[0], planePos[1], planePos[2]), eulerYXZ(yaw, pitch, -bankRad));
    const flicker = state.invulnerable > 0 && Math.floor(state.time * 12) % 2 === 0;
    if (!flicker) drawMeshAt(meshProg, aircraft, planeModel, false);
    if (state.gearDown) drawMeshAt(meshProg, gear, planeModel, false);
    if (state.throttle > 0.6) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);
      drawMeshAt(meshProg, exhaust, planeModel, true);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // --- Clouds: camera-facing billboards, refilled every frame.
    {
      const tint = m.night ? hexRgb('#5a6a94') : hexRgb('#ffffff');
      const verts = [];
      const pushQuad = (cx, cy, cz, size, alpha, right, upv) => {
        const hw = size / 2;
        const hh = size / 2;
        const corners = [
          [-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1],
        ];
        const idx = [0, 1, 2, 0, 2, 3];
        const base = verts.length / 6;
        for (const [sx, sy, u, v] of corners) {
          verts.push(
            cx + (right[0] * sx * hw + upv[0] * sy * hh),
            cy + (right[1] * sx * hw + upv[1] * sy * hh),
            cz + (right[2] * sx * hw + upv[2] * sy * hh),
            u, v, alpha,
          );
        }
        return idx.map((i) => base + i);
      };
      const indices = [];
      for (const c of clouds) {
        const driftX = c.x + c.drift * state.time * 0.1;
        for (let p = 0; p < c.puffs; p += 1) {
          const px = driftX + (p - c.puffs / 2) * c.size * 0.5;
          const py = c.y - Math.abs(p - c.puffs / 2) * c.size * 0.1;
          const pr = c.size * (0.42 + 0.1 * ((p * 37) % 3));
          const alpha = m.night ? 0.55 : 0.92;
          indices.push(...pushQuad(px, py, c.z, pr * 2, alpha, camRight, camUp));
        }
        // Soft shadow puff underneath, day only.
        if (!m.night) {
          indices.push(...pushQuad(driftX, c.y - c.size * 0.28, c.z - 2, c.size * 1.05, 0.3, camRight, camUp));
        }
      }
      // The shadow quads need the shadow tint; the main puffs need the
      // white tint — two passes would double the work, so the shadow is
      // drawn with the same white tint at low alpha instead.
      gl.useProgram(cloudProg);
      gl.uniformMatrix4fv(cloudU.proj, false, proj);
      gl.uniformMatrix4fv(cloudU.view, false, view);
      gl.uniform3fv(cloudU.tint, tint);
      gl.uniform3fv(cloudU.fogColour, fogColour);
      gl.uniform1f(cloudU.fogNear, fogNear);
      gl.uniform1f(cloudU.fogFar, fogFar);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, puffTex);
      gl.uniform1i(cloudU.tex, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, cloudVbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cloudIbo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(cloudA.pos);
      gl.vertexAttribPointer(cloudA.pos, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(cloudA.uv);
      gl.vertexAttribPointer(cloudA.uv, 2, gl.FLOAT, false, 24, 12);
      gl.enableVertexAttribArray(cloudA.alpha);
      gl.vertexAttribPointer(cloudA.alpha, 1, gl.FLOAT, false, 24, 20);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // --- Rain (storm) and the lightning bolt, as plain lines.
    {
      const lines = [];
      if (m.storm) {
        for (let i = 0; i < 40; i += 1) {
          const rx = camPos[0] + (((i * 173 + state.time * 900) % 700) - 350);
          const ry = camPos[1] + 120 - ((i * 97 + state.time * 1400) % 260);
          const rz = camPos[2] - 80 - ((i * 211) % 240);
          lines.push(rx, ry, rz, rx - 8, ry - 26, rz + 6);
        }
      }
      if (state.lightning > 0) {
        let cell = null;
        for (const obj of state.objects) {
          const dist = obj.coursePos - state.distance;
          if (obj.kind === 'storm' && !obj.done && dist > 0 && dist < 2400) { cell = obj; break; }
        }
        if (cell) {
          const bx = cell.x * COURSE_HALF_WIDTH;
          const by = cell.alt * ALT_SCALE;
          const bz = -cell.coursePos;
          const ground = terr.terrain.heightAt(bx, bz);
          const pts = [[bx, by, bz]];
          let px = bx;
          let py = by;
          let pz = bz;
          for (let s = 0; s < 5; s += 1) {
            px += Math.sin(s * 12.9898 + cell.coursePos) * 18;
            py -= (by - ground) / 5;
            pz += Math.cos(s * 7.233 + cell.coursePos) * 12;
            pts.push([px, py, pz]);
          }
          for (let s = 0; s < pts.length - 1; s += 1) {
            lines.push(pts[s][0], pts[s][1], pts[s][2], pts[s + 1][0], pts[s + 1][1], pts[s + 1][2]);
          }
        }
      }
      if (lines.length > 0) {
        gl.useProgram(lineProg);
        gl.uniformMatrix4fv(lineU.proj, false, proj);
        gl.uniformMatrix4fv(lineU.view, false, view);
        gl.uniform4f(lineU.colour, 0.75, 0.82, 0.95, m.storm ? 0.4 : 0.95);
        gl.bindBuffer(gl.ARRAY_BUFFER, lineVbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(lineA);
        gl.vertexAttribPointer(lineA, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINES, 0, lines.length / 3);
      }
    }
  }
}
