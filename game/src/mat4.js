// 4x4 matrices, column-major Float32Array(16), written for this game.
// Only the operations the renderer needs: perspective, lookAt, multiply,
// translation, rotations, and a yaw-pitch-roll rotation.

export function identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

export function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

export function lookAt(eye, center, up) {
  const zx = eye[0] - center[0];
  const zy = eye[1] - center[1];
  const zz = eye[2] - center[2];
  let len = Math.hypot(zx, zy, zz);
  const z0 = zx / len, z1 = zy / len, z2 = zz / len;
  let xx = up[1] * z2 - up[2] * z1;
  let xy = up[2] * z0 - up[0] * z2;
  let xz = up[0] * z1 - up[1] * z0;
  len = Math.hypot(xx, xy, xz);
  xx /= len; xy /= len; xz /= len;
  const yx = z1 * xz - z2 * xy;
  const yy = z2 * xx - z0 * xz;
  const yz = z0 * xy - z1 * xx;
  const out = new Float32Array(16);
  out[0] = xx; out[1] = yx; out[2] = z0; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = z1; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = z2; out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
  out[15] = 1;
  return out;
}

export function multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      let s = 0;
      for (let k = 0; k < 4; k += 1) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}

export function translation(x, y, z) {
  const out = identity();
  out[12] = x; out[13] = y; out[14] = z;
  return out;
}

export function rotationX(a) {
  const c = Math.cos(a), s = Math.sin(a);
  const out = identity();
  out[5] = c; out[6] = s; out[9] = -s; out[10] = c;
  return out;
}

export function rotationY(a) {
  const c = Math.cos(a), s = Math.sin(a);
  const out = identity();
  out[0] = c; out[2] = -s; out[8] = s; out[10] = c;
  return out;
}

export function rotationZ(a) {
  const c = Math.cos(a), s = Math.sin(a);
  const out = identity();
  out[0] = c; out[1] = s; out[4] = -s; out[5] = c;
  return out;
}

/** Rotation from yaw (around Y), pitch (around X), roll (around Z), applied Y then X then Z. */
export function eulerYXZ(yaw, pitch, roll) {
  return multiply(multiply(rotationY(yaw), rotationX(pitch)), rotationZ(roll));
}

export function scaling(x, y, z) {
  const out = identity();
  out[0] = x; out[5] = y; out[10] = z;
  return out;
}
