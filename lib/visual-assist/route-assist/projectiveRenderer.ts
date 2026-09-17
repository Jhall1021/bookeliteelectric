import { type RouteAssistTransformMatrixV1 } from "./imageRegistration";

/**
 * TRUE PROJECTIVE RENDERING (product correction: a HOMOGRAPHY-composed
 * frame must never be approximated with a CSS `matrix()` -- that is a
 * pure 2D affine transform and has no perspective-divide term, so it
 * cannot exactly represent a homography's nonlinear warp. This module
 * draws a frame's ORIGINAL, uncropped photo into a canvas using its full
 * 3x3 workspace transform via WebGL, which can represent the perspective
 * term exactly).
 *
 * Approach: inverse-mapping rasterization, not a textured quad + vertex-
 * warp. A plain rectangle covering the frame's own transformed bounding
 * box is drawn as two triangles; each VERTEX carries its own WORKSPACE
 * position (a linear/affine parameterization of that rectangle, which is
 * exact regardless of how the frame itself is warped -- the canvas is
 * always a plain axis-aligned rectangle). The fragment shader then maps
 * each pixel's interpolated workspace position back into the frame's own
 * normalized [0,1] local space via `transformFromWorkspace` (WITH a real
 * perspective divide) and samples the source texture there, discarding
 * any pixel that lands outside [0,1] -- the bounding box is generally
 * larger than the frame's actual (possibly non-rectangular) footprint for
 * a true projective warp, so those corners must render as transparent,
 * never as stretched image content or a black fill.
 *
 * This module assumes the caller (stitchedWorkspace.ts's
 * isTransformSaneV1, enforced before a frame is ever added to the
 * workspace) has already rejected non-finite/degenerate transforms --
 * it does not re-validate that here, but a WebGL context failure (very
 * old/locked-down browser) is reported via the boolean return so the
 * caller can fall back rather than show nothing.
 */

export type RouteAssistProjectiveDrawArgsV1 = {
  canvas: HTMLCanvasElement;
  image: HTMLImageElement;
  /** Maps a WORKSPACE point to this frame's own normalized [0,1] local point, with perspective divide. */
  transformFromWorkspace: RouteAssistTransformMatrixV1;
  /** This frame's own transformed bounding box, in workspace units (e.g. from frameWorkspaceBoundsV1). */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  widthPx: number;
  heightPx: number;
};

const VERTEX_SHADER_SOURCE = `
  attribute vec2 a_clip;
  attribute vec2 a_workspace;
  varying vec2 v_workspace;
  void main() {
    v_workspace = a_workspace;
    gl_Position = vec4(a_clip, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER_SOURCE = `
  precision highp float;
  varying vec2 v_workspace;
  uniform mat3 u_transformFromWorkspace;
  uniform sampler2D u_texture;
  void main() {
    vec3 local = u_transformFromWorkspace * vec3(v_workspace, 1.0);
    vec2 uv = local.xy / local.z;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      discard;
    }
    gl_FragColor = texture2D(u_texture, uv);
  }
`;

/** GLSL's mat3 constructor/uniformMatrix3fv expects COLUMN-major data; this codebase's RouteAssistTransformMatrixV1 is row-major. Transposing here is what makes `u_transformFromWorkspace * vec3(x, y, 1)` in the shader compute the same result as this codebase's own applyTransformV1. */
function toColumnMajorMat3V1(m: RouteAssistTransformMatrixV1): Float32Array {
  return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
}

function compileShaderV1(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * Draws `image` into `canvas` using the frame's full projective transform.
 * Returns false (no partial/garbled draw attempted) if WebGL is
 * unavailable or shader setup fails, so the caller can fall back to a
 * best-effort approximation rather than leave a torn frame on screen.
 */
export function drawRouteAssistProjectiveFrameV1(args: RouteAssistProjectiveDrawArgsV1): boolean {
  const { canvas, image, transformFromWorkspace, bounds, widthPx, heightPx } = args;
  canvas.width = Math.max(1, Math.round(widthPx));
  canvas.height = Math.max(1, Math.round(heightPx));

  const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl") as WebGLRenderingContext | null;
  if (!gl) return false;

  const vertexShader = compileShaderV1(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
  const fragmentShader = compileShaderV1(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
  if (!vertexShader || !fragmentShader) return false;

  const program = gl.createProgram();
  if (!program) return false;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);

  // Two triangles covering the whole canvas. Clip-space Y is flipped
  // relative to workspace/image Y (clip +1 = top, workspace/canvas-pixel
  // 0 = top) so top-left canvas pixel <-> clip(-1, 1) <-> workspace(minX, minY).
  const { minX, minY, maxX, maxY } = bounds;
  // prettier-ignore
  const clipAndWorkspace = new Float32Array([
    // clip.x, clip.y,  workspace.x, workspace.y
    -1,  1,  minX, minY, // top-left
     1,  1,  maxX, minY, // top-right
     1, -1,  maxX, maxY, // bottom-right
    -1,  1,  minX, minY, // top-left
     1, -1,  maxX, maxY, // bottom-right
    -1, -1,  minX, maxY, // bottom-left
  ]);

  const vertexBuffer = gl.createBuffer();
  if (!vertexBuffer) return false;
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, clipAndWorkspace, gl.STATIC_DRAW);

  const STRIDE = 4 * Float32Array.BYTES_PER_ELEMENT;
  const clipLocation = gl.getAttribLocation(program, "a_clip");
  const workspaceLocation = gl.getAttribLocation(program, "a_workspace");
  gl.enableVertexAttribArray(clipLocation);
  gl.vertexAttribPointer(clipLocation, 2, gl.FLOAT, false, STRIDE, 0);
  gl.enableVertexAttribArray(workspaceLocation);
  gl.vertexAttribPointer(workspaceLocation, 2, gl.FLOAT, false, STRIDE, 2 * Float32Array.BYTES_PER_ELEMENT);

  const texture = gl.createTexture();
  if (!texture) return false;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // makes texture V=0 correspond to the image's TOP row, matching this codebase's y-down [0,1] local-coordinate convention directly -- no manual flip needed in the shader.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  } catch {
    return false;
  }

  const transformUniform = gl.getUniformLocation(program, "u_transformFromWorkspace");
  gl.uniformMatrix3fv(transformUniform, false, toColumnMajorMat3V1(transformFromWorkspace));
  const textureUniform = gl.getUniformLocation(program, "u_texture");
  gl.uniform1i(textureUniform, 0);
  gl.activeTexture(gl.TEXTURE0);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
  return true;
}

/** Loads a data URL into a decoded HTMLImageElement, ready for gl.texImage2D. */
export function loadRouteAssistImageV1(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("failed to decode captured photo"));
    image.src = dataUrl;
  });
}
