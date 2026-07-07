import { useEffect, useRef, type RefObject } from 'react'
import { advanceSim, deltaFor, type ClockInfo, type SimState } from './clocks'

/** Build-spine steps 2–4: Schwarzschild geodesics + thin accretion disc +
 * droppable clocks.
 *
 * Each ray is integrated in its orbital plane in Binet form u(φ) = 1/r
 * (units rₛ = 1):  u″ = −u(1 − 1.5u), RK4, fixed dφ. Capture (u > 1) →
 * black; escape → sky along the exit direction −u′·r̂ + u·θ̂. The shadow
 * and photon ring emerge from rays under b_crit = 3√3/2 rₛ never reaching
 * the sky. Written from scratch; the Binet-form initial conditions follow
 * oseiskar/black-hole (MIT) — see docs/PRIOR_ART_NOTES.md.
 *
 * Disc: opaque, equatorial, ISCO (r = 3) to r = 12, T(r) ∝ r^(−3/4)
 * (Shakura–Sunyaev scaling). Emitters are circular Keplerian orbits; the
 * observed frequency ratio is exact GR for a static camera:
 *
 *   δ = ν_obs/ν_em = √(1 − 3/(2r)) / (√(1 − 1/r_cam) · (1 − Ω b_z))
 *
 * with Ω = 1/√(2r³) and b_z the photon's impact parameter about the disc
 * axis. A Doppler-shifted blackbody is again a blackbody at δT (Bruneton's
 * observation), so: the SHIFT toggle colors the disc with the chromaticity
 * of a blackbody at δT, the BEAMING toggle brightens it with the luminance
 * of a blackbody at δT — both on together is the exact observed spectrum.
 *
 * Clocks: glowing spheres hit-tested against each geodesic segment, so
 * their light is lensed like everything else (a clock behind the hole
 * shows double images). Marker color/brightness = blackbody(6500 K · δ)
 * with δ from src/clocks.ts — a released clock redshifts and dims as it
 * asymptotes to the horizon.
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
uniform sampler2D uBB; // blackbody LUT: rgb = chromaticity, a = log10 luminance
uniform float uYaw, uPitch, uFov, uAspect, uCamDist;
uniform float uDisc, uBeaming, uShift;
uniform int uNClocks;
uniform vec3 uClockPos[3];
uniform float uClockR[3]; // |uClockPos|, for the radial-band early-out
uniform float uClockDelta[3];
in vec2 vPos;
out vec4 outColor;

const float PI = 3.14159265358979;
const float DISC_IN = 3.0;   // ISCO
const float DISC_OUT = 12.0;
const float DISC_TEMP = 9000.0; // K at the inner edge
const float CLOCK_RAD = 0.35;

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

// LUT spans 1000..30000 K, log-spaced (see makeBlackbodyTexture)
vec4 blackbody(float T) {
  float x = (log(T) - log(1000.0)) / (log(30000.0) - log(1000.0));
  vec4 s = texture(uBB, vec2(clamp(x, 0.0, 1.0), 0.5));
  return vec4(s.rgb, pow(10.0, s.a * 8.0 - 4.0)); // a encodes log10(Y) in [-4,4]
}

vec3 shadeDisc(float r, float bz) {
  float T = DISC_TEMP * pow(r / DISC_IN, -0.75);
  float ff = 1.0 - 1.5 / r;          // circular-orbit dilation (grav + transverse)
  float f0 = 1.0 - 1.0 / uCamDist;   // static-camera potential
  float Omega = inversesqrt(2.0 * r * r * r);
  float delta = sqrt(ff) / (sqrt(f0) * (1.0 - Omega * bz));
  float Tc = uShift > 0.5 ? delta * T : T;   // shift owns the color
  float Tb = uBeaming > 0.5 ? delta * T : T; // beaming owns the brightness
  vec3 lin = blackbody(Tc).rgb * blackbody(Tb).a;
  return pow(1.0 - exp(-1.5 * lin), vec3(1.0 / 2.2)); // exposure + gamma
}

vec3 shadeClock(int i, float q) {
  // A 6500 K "white" emitter seen with frequency ratio delta; q = 0 at the
  // marker center, 1 at its rim.
  float delta = uClockDelta[i];
  vec4 s = blackbody(6500.0 * delta);
  float yRef = blackbody(6500.0).a;
  vec3 lin = s.rgb * (s.a / yRef) * 5.0 * (1.0 - 0.6 * q * q);
  return pow(1.0 - exp(-lin), vec3(1.0 / 2.2));
}

// Binet system: y = (u, du/dphi), y' = (u', -u(1 - 1.5u))
vec2 geodesicRHS(vec2 y) {
  return vec2(y.y, -y.x * (1.0 - 1.5 * y.x));
}

const int MAX_STEPS = 400;
const float DPHI = 0.025;

void main() {
  // Orbit camera: on a sphere of radius uCamDist (units of r_s), looking at
  // the hole at the origin. The disc lies in the world y = 0 plane.
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

  // Disc-plane crossing: world height ∝ s(phi) = n1 cos(phi) + n2 sin(phi)
  float n1 = e1.y, n2 = e2.y;
  bool edgeOn = abs(n1) + abs(n2) < 1e-4; // camera in the disc plane: skip disc
  // Photon angular momentum about the disc axis, per unit energy:
  // b_z = b (m·ŷ) with m the geodesic-plane normal and b = 1/e.
  float esq = y.y * y.y + y.x * y.x * (1.0 - y.x);
  float bz = dot(cross(e1, e2), vec3(0.0, 1.0, 0.0)) * inversesqrt(esq);

  float phi = 0.0;
  float sPrev = n1; // s at phi = 0
  float cphPrev = 1.0, sphPrev = 0.0;
  bool escaped = false;
  for (int i = 0; i < MAX_STEPS; i++) {
    float uPrev = y.x;
    vec2 k1 = geodesicRHS(y);
    vec2 k2 = geodesicRHS(y + 0.5 * DPHI * k1);
    vec2 k3 = geodesicRHS(y + 0.5 * DPHI * k2);
    vec2 k4 = geodesicRHS(y + DPHI * k3);
    y += (DPHI / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
    phi += DPHI;
    float cph = cos(phi), sph = sin(phi);

    // Nearest event (disc crossing or clock hit) along this step's segment,
    // both parameterized 0..1 from the step start.
    float bestT = 2.0;
    float bestR = 0.0, bestQ = 0.0;
    int bestClock = -1;

    if (uDisc > 0.5 && !edgeOn) {
      float s = n1 * cph + n2 * sph;
      if (s * sPrev < 0.0) { // crossed the disc plane during this step
        float frac = sPrev / (sPrev - s);
        float rHit = 1.0 / mix(uPrev, y.x, frac);
        if (rHit >= DISC_IN && rHit <= DISC_OUT) {
          bestT = frac;
          bestR = rHit;
        }
      }
      sPrev = s;
    }

    if (uNClocks > 0 && y.x > 1e-4 && uPrev > 1e-4) {
      // Radial-band early-out: the segment can only touch a clock whose
      // shell overlaps [min r, max r] of this step.
      float rNew = 1.0 / y.x, rOld = 1.0 / uPrev;
      float lo = min(rNew, rOld) - CLOCK_RAD, hi = max(rNew, rOld) + CLOCK_RAD;
      for (int c = 0; c < 3; c++) {
        if (c >= uNClocks) break;
        if (uClockR[c] < lo || uClockR[c] > hi) continue;
        vec3 pOld = (cphPrev * e1 + sphPrev * e2) * rOld;
        vec3 pNew = (cph * e1 + sph * e2) * rNew;
        vec3 ab = pNew - pOld;
        float ab2 = max(dot(ab, ab), 1e-12);
        vec3 ac = uClockPos[c] - pOld;
        float tc = clamp(dot(ac, ab) / ab2, 0.0, 1.0);
        float dc = length(pOld + tc * ab - uClockPos[c]);
        if (dc < CLOCK_RAD && tc < bestT) {
          bestT = tc;
          bestClock = c;
          bestQ = dc / CLOCK_RAD;
        }
      }
    }
    cphPrev = cph; sphPrev = sph;

    if (bestT <= 1.0) {
      outColor = bestClock >= 0
        ? vec4(shadeClock(bestClock, bestQ), 1.0)
        : vec4(shadeDisc(bestR, bz), 1.0);
      return;
    }

    if (y.x > 1.0) break;                         // r < r_s: captured
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

export interface View {
  disc: boolean
  beaming: boolean
  shift: boolean
}

/** 512×1 RGBA8 LUT of blackbody color vs temperature, log-spaced
 * 1000..30000 K. rgb = linear-sRGB chromaticity (max component = 1);
 * a = log10 of luminance relative to 6500 K, mapped from [-4, 4].
 * Planck spectrum integrated against the CIE 1931 observer using the
 * piecewise-Gaussian fits of Wyman, Sloan & Shirley (JCGT 2013). */
function makeBlackbodyTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const N = 512
  const gauss = (x: number, m: number, s1: number, s2: number) => {
    const s = x < m ? s1 : s2
    return Math.exp(-0.5 * ((x - m) / s) ** 2)
  }
  const xbar = (l: number) =>
    1.056 * gauss(l, 599.8, 37.9, 31.0) + 0.362 * gauss(l, 442.0, 16.0, 26.7) -
    0.065 * gauss(l, 501.1, 20.4, 26.2)
  const ybar = (l: number) =>
    0.821 * gauss(l, 568.8, 46.9, 40.5) + 0.286 * gauss(l, 530.9, 16.3, 31.1)
  const zbar = (l: number) =>
    1.217 * gauss(l, 437.0, 11.8, 36.0) + 0.681 * gauss(l, 459.0, 26.0, 13.8)

  const xyz = (T: number) => {
    let X = 0, Y = 0, Z = 0
    for (let l = 380; l <= 780; l += 5) {
      const B = 1 / (l / 1e3) ** 5 / (Math.expm1(1.4388e7 / (l * T)))
      X += B * xbar(l)
      Y += B * ybar(l)
      Z += B * zbar(l)
    }
    return [X, Y, Z]
  }

  const Yref = xyz(6500)[1]
  const data = new Uint8Array(N * 4)
  for (let i = 0; i < N; i++) {
    const T = 1000 * Math.exp((i / (N - 1)) * Math.log(30))
    const [X, Y, Z] = xyz(T)
    let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z
    let g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z
    let b = 0.0557 * X - 0.204 * Y + 1.057 * Z
    r = Math.max(r, 0); g = Math.max(g, 0); b = Math.max(b, 0)
    const m = Math.max(r, g, b, 1e-12)
    const q = Math.min(Math.max(Math.log10(Y / Yref), -4), 4)
    data[i * 4] = Math.round((r / m) * 255)
    data[i * 4 + 1] = Math.round((g / m) * 255)
    data[i * 4 + 2] = Math.round((b / m) * 255)
    data[i * 4 + 3] = Math.round(((q + 4) / 8) * 255)
  }

  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  return tex
}

export default function BlackHoleCanvas({ view, clocks, simRef, onPlace }: {
  view: View
  clocks: ClockInfo[]
  simRef: RefObject<SimState>
  onPlace: (dir: [number, number, number], r: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const clocksRef = useRef(clocks)
  clocksRef.current = clocks
  const onPlaceRef = useRef(onPlace)
  onPlaceRef.current = onPlace

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
    const uDisc = uni('uDisc'), uBeaming = uni('uBeaming'), uShift = uni('uShift')
    const uNClocks = uni('uNClocks')
    const uClockPos = uni('uClockPos[0]')
    const uClockR = uni('uClockR[0]')
    const uClockDelta = uni('uClockDelta[0]')

    // Camera state (mutated by input handlers, read by the render loop).
    // dist is in units of r_s.
    const cam = { yaw: 0.3, pitch: 0.35, dist: 17, fov: (60 * Math.PI) / 180 }

    // Shared camera-basis math for the shader and click placement
    const basis = () => {
      const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw)
      const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch)
      const pos = [cp * cy, sp, cp * sy].map((v) => v * cam.dist)
      const fwd = pos.map((v) => -v / cam.dist)
      const rl = Math.hypot(fwd[2], fwd[0])
      const right = [-fwd[2] / rl, 0, fwd[0] / rl]
      const up = [
        right[1] * fwd[2] - right[2] * fwd[1],
        right[2] * fwd[0] - right[0] * fwd[2],
        right[0] * fwd[1] - right[1] * fwd[0],
      ]
      return { pos, fwd, right, up }
    }

    let skyReady = false
    gl.activeTexture(gl.TEXTURE0)
    const sky = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, sky)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB,
      gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0]))
    const img = new Image()
    img.src = `${import.meta.env.BASE_URL}assets/starmap_2020_4k.png`
    img.onload = () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, sky)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img)
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      skyReady = true
    }

    gl.activeTexture(gl.TEXTURE1)
    makeBlackbodyTexture(gl)
    gl.uniform1i(uni('uSky'), 0)
    gl.uniform1i(uni('uBB'), 1)

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
    let downAt: { x: number; y: number } | null = null
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true
      downAt = { x: e.clientX, y: e.clientY }
      canvas.setPointerCapture(e.pointerId)
    }, { signal })
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return
      const scale = cam.fov / canvas.clientHeight // constant apparent speed at any zoom
      cam.yaw += e.movementX * scale
      cam.pitch = Math.max(-1.55, Math.min(1.55, cam.pitch + e.movementY * scale))
    }, { signal })
    canvas.addEventListener('pointerup', (e) => {
      dragging = false
      // A click (no drag) drops a clock where the ray meets the picture
      // plane through the hole (plane ⊥ view axis containing the origin).
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 5) {
        const rect = canvas.getBoundingClientRect()
        const px = ((e.clientX - rect.left) / rect.width) * 2 - 1
        const py = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
        const { pos, fwd, right, up } = basis()
        const t = Math.tan(cam.fov / 2)
        const aspect = canvas.width / canvas.height
        const d = [0, 1, 2].map((i) =>
          fwd[i] + px * t * aspect * right[i] + py * t * up[i])
        const dn = d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2]
        const s = cam.dist / dn
        const P = [0, 1, 2].map((i) => pos[i] + s * d[i])
        const r = Math.hypot(...P)
        const rc = Math.max(2, Math.min(30, r))
        onPlaceRef.current([P[0] / r, P[1] / r, P[2] / r], rc)
      }
      downAt = null
    }, { signal })
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault()
      // 2.5 r_s floor keeps the camera outside the photon sphere (1.5 r_s)
      cam.dist = Math.max(2.5, Math.min(40, cam.dist * Math.exp(e.deltaY * 0.001)))
    }, { signal, passive: false })

    const clockPos = new Float32Array(9)
    const clockR = new Float32Array(3)
    const clockDelta = new Float32Array(3)
    let last = performance.now()
    let raf = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      advanceSim(simRef.current, (now - last) / 1000)
      last = now
      if (!skyReady) return
      const v = viewRef.current
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform1f(uYaw, cam.yaw)
      gl.uniform1f(uPitch, cam.pitch)
      gl.uniform1f(uFov, cam.fov)
      gl.uniform1f(uAspect, canvas.width / canvas.height)
      gl.uniform1f(uCamDist, cam.dist)
      gl.uniform1f(uDisc, v.disc ? 1 : 0)
      gl.uniform1f(uBeaming, v.beaming ? 1 : 0)
      gl.uniform1f(uShift, v.shift ? 1 : 0)
      let n = 0
      const fCam = 1 - 1 / cam.dist
      for (const c of clocksRef.current) {
        const e = simRef.current.m[c.id]
        if (!e || n >= 3) continue
        clockPos.set([c.dir[0] * e.r, c.dir[1] * e.r, c.dir[2] * e.r], n * 3)
        clockR[n] = e.r
        clockDelta[n] = deltaFor(e, fCam)
        n++
      }
      gl.uniform1i(uNClocks, n)
      gl.uniform3fv(uClockPos, clockPos)
      gl.uniform1fv(uClockR, clockR)
      gl.uniform1fv(uClockDelta, clockDelta)
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
  }, [simRef])

  return <canvas ref={canvasRef} className="bh-canvas" />
}
