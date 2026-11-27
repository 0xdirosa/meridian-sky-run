// The thin WebGL layer: context, shader compile, programs, and the one
// interleaved vertex format every mesh in the game shares:
//   position xyz, normal xyz, colour rgb  (9 floats per vertex)
// Nothing here knows about the game; the game builds meshes and hands
// them over.

export function createGL(canvas) {
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  return gl;
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`shader compile failed: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

export function createProgram(gl, vsSource, fsSource) {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vsSource));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fsSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`program link failed: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

/** Upload an interleaved mesh. `mesh` is { positions, normals, colours, indices } (flat arrays). */
export function uploadMesh(gl, mesh) {
  const n = mesh.positions.length / 3;
  const interleaved = new Float32Array(n * 9);
  for (let i = 0; i < n; i += 1) {
    interleaved[i * 9 + 0] = mesh.positions[i * 3 + 0];
    interleaved[i * 9 + 1] = mesh.positions[i * 3 + 1];
    interleaved[i * 9 + 2] = mesh.positions[i * 3 + 2];
    interleaved[i * 9 + 3] = mesh.normals[i * 3 + 0];
    interleaved[i * 9 + 4] = mesh.normals[i * 3 + 1];
    interleaved[i * 9 + 5] = mesh.normals[i * 3 + 2];
    interleaved[i * 9 + 6] = mesh.colours[i * 3 + 0];
    interleaved[i * 9 + 7] = mesh.colours[i * 3 + 1];
    interleaved[i * 9 + 8] = mesh.colours[i * 3 + 2];
  }
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.indices), gl.STATIC_DRAW);
  return { vbo, ibo, count: mesh.indices.length };
}

/** Bind a mesh to the given attribute locations and draw it. */
export function drawMesh(gl, uploaded, attribPos, attribNormal, attribColour) {
  gl.bindBuffer(gl.ARRAY_BUFFER, uploaded.vbo);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, uploaded.ibo);
  gl.enableVertexAttribArray(attribPos);
  gl.vertexAttribPointer(attribPos, 3, gl.FLOAT, false, 36, 0);
  gl.enableVertexAttribArray(attribNormal);
  gl.vertexAttribPointer(attribNormal, 3, gl.FLOAT, false, 36, 12);
  gl.enableVertexAttribArray(attribColour);
  gl.vertexAttribPointer(attribColour, 3, gl.FLOAT, false, 36, 24);
  gl.drawElements(gl.TRIANGLES, uploaded.count, gl.UNSIGNED_SHORT, 0);
}

export function createTexture(gl, canvas) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/** Parse #rrggbb into [r, g, b] floats 0..1. */
export function hexRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}
