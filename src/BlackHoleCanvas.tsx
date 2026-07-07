import { useEffect, useRef } from 'react'

/** Build-spine step 2: per-pixel Schwarzschild null geodesics. Each ray is
 * integrated in its orbital plane in Binet form u(φ) = 1/r (units rₛ = 1):
 *
 *   u″ = −u(1 − 1.5u)
 *
 * RK4, fixed dφ step. Capture (u > 1) → black; escape → sky along the exit
 * direction −u′·r̂ + u·θ̂. The shadow and photon ring are not drawn — they
 * emerge from rays with impact parameter under b_crit = 3√3/2 rₛ never
 * reaching the sky. Written from scratch; the Binet-form initial conditions
 * follow the approach in oseiskar/black-hole (MIT) — see
 * docs/PRIOR_ART_NOTES.md (their integrand has a typo we don't inherit).
 *
 * Skybox: NASA SVS "Deep Star Maps 2020" (public domain), tonemapped from
 * the source EXR (exposure ×2, sRGB gamma). https://svs.gsfc.nasa.gov/4851
 */

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vPos;
void main() {
  vPos = aPos;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uSky;
uniform float uYaw, uPitch, uFov, uAspect, uCamDist;
in vec2 vPos;
out vec4 outColor;

const float PI = 3.14159265358979;

vec3 skyColor(vec3 d) {
  float u = atan(d.z, d.x) / (2.0 * PI) + 0.5;
  float v = acos(clamp(d.y, -1.0, 1.0)) / PI;
  // atan wraps 1 -> 0 across the seam, which poisons the mip-level
  // derivative and draws a blurry column. Sample whichever of the two
  // equivalent parameterizations is continuous at this pixel.
  vec2 uvA = vec2(u, v);
  vec2 uvB = vec2(fract(u + 0.5) - 0.5, v); // continuous where uvA wraps
  vec2 uv = fwidth(uvA.x) < fwidth(uvB.x) ? uvA : uvB;
  // The map is a carpet of near-texel stars; quintic-smoothed texel
  // interpolation hides the bilinear diamond footprint under magnification.
  vec2 res = vec2(textureSize(uSky, 0));
  vec2 t = uv * res + 0.5;
  vec2 f = fract(t);
  uv = (floor(t) + f * f * (3.0 - 2.0 * f) - 0.5) / res;
  return texture(uSky, uv).rgb;
}

// Binet system: y = (u, du/dphi), y' = (u', -u(1 - 1.5u))
vec2 geodesicRHS(vec2 y) {
  return vec2(y.y, -y.x * (1.0 - 1.5 * y.x));
}

const int MAX_STEPS = 400;
const float DPHI = 0.025;

void main() {
  // Orbit camera: on a sphere of radius uCamDist (units of r_s), looking at
  // the hole at the origin.
  float cy = cos(uYaw), sy = sin(uYaw);
  float cp = cos(uPitch), sp = sin(uPitch);
  vec3 camPos = uCamDist * vec3(cp * cy, sp, cp * sy);
  vec3 forward = -normalize(camPos);
  vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, forward);

  float t = tan(uFov * 0.5);
  vec3 d = normalize(forward + vPos.x * t * uAspect * right + vPos.y * t * up);

  // The geodesic stays in the plane spanned by the radial direction e1 and
  // the tangential part e2 of the ray; phi is the angle from e1.
  float r0 = uCamDist;
  vec3 e1 = camPos / r0;
  float ddotr = dot(d, e1);
  vec3 dperp = d - ddotr * e1;
  float dtan = length(dperp);
  if (dtan < 1e-5) { // purely radial ray: outward sees sky, inward the hole
    outColor = ddotr > 0.0 ? vec4(skyColor(d), 1.0) : vec4(vec3(0.0), 1.0);
    return;
  }
  vec3 e2 = dperp / dtan;

  vec2 y = vec2(1.0 / r0, -(1.0 / r0) * ddotr / dtan);
  float phi = 0.0;
  bool escaped = false;
  for (int i = 0; i < MAX_STEPS; i++) {
    vec2 k1 = geodesicRHS(y);
    vec2 k2 = geodesicRHS(y + 0.5 * DPHI * k1);
    vec2 k3 = geodesicRHS(y + 0.5 * DPHI * k2);
    vec2 k4 = geodesicRHS(y + DPHI * k3);
    y += (DPHI / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
    phi += DPHI;
    if (y.x > 1.0) break;                        // r < r_s: captured
    if (y.x < 0.0 || (y.y < 0.0 && y.x < 0.01)) { // outbound and far: escaped
      escaped = true;
      break;
    }
  }
  // Rays that exhaust the step budget are winding at the photon sphere;
  // painting them black merges them into the shadow edge.
  if (!escaped) {
    outColor = vec4(vec3(0.0), 1.0);
    return;
  }
  // Instantaneous travel direction: dx/dphi ∝ -u' r_hat + u theta_hat
  vec3 rhat = cos(phi) * e1 + sin(phi) * e2;
  vec3 that = -sin(phi) * e1 + cos(phi) * e2;
  vec3 outDir = normalize(-y.y * rhat + max(y.x, 0.0) * that);
  outColor = vec4(skyColor(outDir), 1.0);
}`

export default function BlackHoleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const gl = canvas.getContext('webgl2')
    if (!gl) return

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(s) ?? 'shader error')
      return s
    }
    const program = gl.createProgram()!
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(program)
    gl.useProgram(program)

    const quad = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(program, 'aPos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const uni = (name: string) => gl.getUniformLocation(program, name)
    const uYaw = uni('uYaw'), uPitch = uni('uPitch')
    const uFov = uni('uFov'), uAspect = uni('uAspect')
    const uCamDist = uni('uCamDist')

    // Camera state (mutated by input handlers, read by the render loop).
    // dist is in units of r_s.
    const cam = { yaw: 0.3, pitch: 0.1, dist: 12, fov: (60 * Math.PI) / 180 }

    let skyReady = false
    const sky = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, sky)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB,
      gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0]))
    const img = new Image()
    img.src = `${import.meta.env.BASE_URL}assets/starmap_2020_4k.png`
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, sky)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img)
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      skyReady = true
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2)
      canvas.width = Math.round(canvas.clientWidth * dpr)
      canvas.height = Math.round(canvas.clientHeight * dpr)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const ctrl = new AbortController()
    const { signal } = ctrl
    let dragging = false
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true
      canvas.setPointerCapture(e.pointerId)
    }, { signal })
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return
      const scale = cam.fov / canvas.clientHeight // constant apparent speed at any zoom
      cam.yaw += e.movementX * scale
      cam.pitch = Math.max(-1.55, Math.min(1.55, cam.pitch + e.movementY * scale))
    }, { signal })
    canvas.addEventListener('pointerup', () => { dragging = false }, { signal })
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault()
      // 2.5 r_s floor keeps the camera outside the photon sphere (1.5 r_s)
      cam.dist = Math.max(2.5, Math.min(40, cam.dist * Math.exp(e.deltaY * 0.001)))
    }, { signal, passive: false })

    let raf = 0
    const frame = () => {
      raf = requestAnimationFrame(frame)
      if (!skyReady) return
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform1f(uYaw, cam.yaw)
      gl.uniform1f(uPitch, cam.pitch)
      gl.uniform1f(uFov, cam.fov)
      gl.uniform1f(uAspect, canvas.width / canvas.height)
      gl.uniform1f(uCamDist, cam.dist)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      ctrl.abort()
      img.onload = null
      // Don't loseContext() here: StrictMode remounts the effect on the same
      // canvas, and getContext() would hand back the dead context.
    }
  }, [])

  return <canvas ref={canvasRef} className="bh-canvas" />
}
