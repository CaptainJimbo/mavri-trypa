import { useEffect, useRef } from 'react'

/** Build-spine step 1: fullscreen-quad WebGL2 renderer showing the star
 * skybox with an orbit camera. The geodesic ray tracer will replace the
 * straight-line ray in this shader in step 2 — the camera model, equirect
 * sampling, and render loop are already the final ones.
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
uniform float uYaw, uPitch, uFov, uAspect;
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

void main() {
  float cy = cos(uYaw), sy = sin(uYaw);
  float cp = cos(uPitch), sp = sin(uPitch);
  vec3 forward = vec3(cp * cy, sp, cp * sy);
  vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, forward);

  float t = tan(uFov * 0.5);
  vec3 dir = normalize(forward + vPos.x * t * uAspect * right + vPos.y * t * up);
  outColor = vec4(skyColor(dir), 1.0);
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

    // Camera state (mutated by input handlers, read by the render loop)
    const cam = { yaw: 0.3, pitch: 0.1, fov: (60 * Math.PI) / 180 }

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
      cam.fov = Math.max(0.26, Math.min(1.75, cam.fov * Math.exp(e.deltaY * 0.001)))
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
