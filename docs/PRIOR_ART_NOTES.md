# Prior-art survey (2026-07-07)

Working notes from reading the three reference implementations before writing
our own shader. Licensing recap: **Bruneton = BSD-3** (adapt with header
attribution), **oseiskar = MIT** (adapt with attribution; their skybox image is
CC-BY-NC, do not reuse), **starless = GPL-3** — physics described in our own
words only, zero code excerpts, copy nothing.

---

## 1. ebruneton/black_hole_shader (BSD-3-Clause)

**Geodesic approach — precomputed lookup, NOT per-pixel integration.** Rays are
characterized by conserved energy-like quantity `e² = u̇² + u²(1−u)` (u = rₛ/r;
capture threshold `kMu = 4/27`, i.e. b_crit = √(27/4) = 3√3/2). Two textures
precomputed on CPU by brute-force first-order integration of the Binet system
`u̇' = 1.5u² − u` at dφ = 1e-5 (`black_hole/preprocess/functions.cc:91-196`,
note the update at lines 129-134 which also accumulates coordinate time
`t += e/(u²(1−u))·dφ`):

- **Deflection texture 𝔻(e², u)**, 512×512, stores (deflection angle, coord
  time) (`preprocess/definitions.h:58-59`).
- **Inverse-radius texture 𝕌(e², φ)**, 64×32, stores (u, t) at azimuth φ —
  used to find where the ray crosses the disc plane (`definitions.h:61-62`).

In-shader, `TraceRay` is **constant time — two texture lookups, no loop**
(`black_hole/functions.glsl:344-413`). Initial conditions from camera radius
and view angle δ:

```glsl
// functions.glsl:407-409
Real u = 1.0 / p_r;
Real u_dot = -u / tan(delta);
Real e_square = u_dot * u_dot + u * u * (1.0 - u);
```

The hard part is the texture parameterizations that tame divergences at
e² → 4/27 (rays winding near the photon sphere): ad-hoc log/sqrt mappings
`GetRayDeflectionTextureUFromEsquare` (`functions.glsl:99-105`), apsis remap
(`:166-179`), and `GetPhiUbFromEsquare` (`:236-238`). Companion paper:
arXiv:2010.08735.

**Termination:** capture iff `e² > 4/27` (deflection set to −1 → skip skybox);
disc hits = up to 2 equatorial-plane crossings at φ mod π via 𝕌 lookup, tested
against apsis angle (`functions.glsl:365-387`); escape handled analytically by
symmetry (2×apsis deflection, `:361-364`).

**Disc model:** Shakura–Sunyaev-with-inner-boundary profile,
`T(r) ∝ [(1−√(3/r))/r³]^¼` (3 = ISCO in rₛ units), normalized by its max at
r = 49/12 (`model.glsl:227-233`). Disc density is animated by N precessing
elliptical "particles" + noise — cheap fake turbulence (`model.glsl:210-225`).

**Shift/beaming — the elegant trick:** a Doppler-shifted blackbody is still a
blackbody at T′ = δT, and δ³ per-frequency beaming is then *automatically
exact*, so the disc just does
`BlackBodyColor(black_body_texture, temperature * doppler_factor)`
(`model.glsl:235-236`) where the 1D texture stores unnormalized linear-sRGB
blackbody *radiance* at texcoord `log(T/100)/6` (`model.glsl:181-184`,
generator `color_maps/black_body_texture_generator.cc`). The combined
gravitational + orbital Doppler factor is fully general-relativistic, from
4-momentum inner products δ = g(k,l)_receiver / g(k,l)_source, with the
circular-orbit source term:

```glsl
// model.glsl:347-350
float g_k_l_source = e * sqrt(2.0 / (2.0 - 3.0 * u0)) -
                     u0 * sqrt(u0 / (2.0 - 3.0 * u0)) * dot(e_z, e_z_prime);
float doppler_factor = g_k_l_receiver / g_k_l_source;
```

(√(2/(2−3u)) is exactly the combined gravitational + transverse-orbital
dilation 1/√(1−3rₛ/2r) of a circular orbiter.) For *arbitrary* spectra
(stars/galaxy) a precomputed 64×32×64 **3D Doppler texture** maps
(r-chromaticity, g-chromaticity, log δ) → shifted color, built with
I_λ,received = δ⁵ I_λ,emitted(δλ) (δ⁵ because per-wavelength;
`color_maps/doppler_texture_generator.cc:172-182`, shader side
`model.glsl:78-89`).

**Lensing amplification** via screen-space derivatives — ratio of solid angles
of the pixel before/after deflection: `omega / omega_prime` with
`length(cross(dFdx(d), dFdy(d)))`, clamped to 1e6 (`model.glsl:312-319`).

**Performance/quality tricks:** constant-time ray trace (above); disc
anti-aliasing with `fwidth` + a Pixar-style `FilteredPulse` box-filter
(`functions.glsl:337-342, 389-397`); custom star rendering from a Gaia cube
map storing per-texel star intensity + sub-texel position, filtered manually
across LODs so point stars stay point-like under lensing magnification
(`model.glsl:110-171`); bloom pipeline (`bloom/`); renders at
devicePixelRatio, no TAA.

**Skybox:** cube map (2048² Gaia-derived), analytic per-face UV derivatives
instead of `dFdx` of UV to avoid seam discontinuities (`model.glsl:130-136`);
separate "galaxy" (extended radiance) vs "stars" (punctual intensity) maps
with correct radiometric units (`model.glsl:322-329`).

## 2. oseiskar/black-hole (MIT)

**Geodesic approach — per-pixel Binet integration in the orbital plane.**
u(φ) = 1/r, symplectic-Euler ("leapfrog") updates, 40/100/200 steps for
fast/medium/high (`main.js:268-280`), max 2 revolutions:

```glsl
// raytracer.glsl:306-309
// Leapfrog scheme
u += du*step;
float ddu = -u*(1.0 - 1.5*u*u);
du += ddu*step;
```

Initial conditions from camera geometry (`raytracer.glsl:269-276`):
`du = -dot(ray,normal_vec)/dot(ray,tangent_vec) * u`. Adaptive step: baseline
`2π·MAX_REVOLUTIONS/NSTEPS`, shrunk by an ad-hoc
`max_rel_u_change = (1−log(u))·10/NSTEPS` limiter (`raytracer.glsl:291-296`).

**⚠️ Verified physics bug — do not copy that line.** Textbook Schwarzschild
Binet is `u″ = −u(1 − 1.5u)` (i.e. −u + 1.5u²); the shader (and their
physics.pdf eq. 1) has `−u(1 − 1.5u²)` (−u + 1.5u³). Integrating both
numerically: the standard form reproduces b_crit = 3√3/2 rₛ = 2.598 to 10
decimal places; the shader's form gives b_crit = √3 ≈ 1.73, photon sphere at
r ≈ 1.22 rₛ instead of 1.5 rₛ, and ~10× too little weak-field deflection.
Their own coordinate-time equation (`raytracer.glsl:302`,
`dt = sqrt(du·du + u·u·(1−u))/(u²(1−u))·step`) is consistent with the
*correct* invariant, so the u³ is internally inconsistent — almost certainly a
typo that stuck. Their photon ring is quantitatively wrong. Good news for us:
`-u*(1.0 - 1.5*u)` is a one-character-class fix.

**Termination:** horizon `if (u > 1.0) break` and final
`if (u < 1.0) {sky lookup}` (`raytracer.glsl:399-404`); escape when `u < 0`
(u went through zero → ray outbound to infinity, `:311`); disc =
plane-crossing test between consecutive step points
`old_pos.z * pos.z < 0.0` then linear intersection
`acc_isec_t = -old_pos.z / ray.z` (`raytracer.glsl:358-363`); planet via
ray-sphere within the step segment, incl. moving/Lorentz-contracted frame
(`:102-192`).

**Disc:** decorative striped texture, **flat temperature** 3900 K (no T(r)
profile), Keplerian `v = 1/√(2(r−1))` (rₛ=1), SR Doppler factor and δ³
beaming:

```glsl
// raytracer.glsl:377-384
vec3 accretion_v = vec3(-isec.y, isec.x, 0.0) / sqrt(2.0*(r-1.0)) / (r*r);
gamma = 1.0/sqrt(1.0-dot(accretion_v,accretion_v));
float doppler_factor = gamma*(1.0+dot(ray/ray_l,accretion_v));
... accretion_intensity /= doppler_factor*doppler_factor*doppler_factor; // δ³
... temperature /= ray_doppler_factor*doppler_factor;
```

Combined factor = camera δ × source δ (`δ = γ(1 + d·v)` each, per their
physics doc); **no explicit gravitational √(1−rₛ/r) term for the disc** —
only partially captured through γ of the coordinate orbital velocity.
Blackbody→RGB via a single precomputed `img/spectra.png` with 3 rows (macros
`raytracer.glsl:20-22`): blackbody color by T, single-wavelength color
(Hα 656.28 nm re-emission for the galaxy's red channel — cute), and an inverse
temperature-from-color-ratio ramp used to Doppler-shift the *photographic*
Milky Way by estimating T per pixel and re-rendering at T/δ
(`raytracer.glsl:194-229`).

**Architecture gold for our per-effect toggles:** the shader is a **Mustache
template** with compile-time feature flags — `{{#beaming}}`,
`{{#doppler_shift}}`, `{{#gravitational_time_dilation}}`,
`{{#light_travel_time}}`, `{{#aberration}}`, `{{#lorentz_contraction}}` —
recompiled on GUI change (`main.js:75-100, 268-335`). Zero branch cost in the
hot loop.

**Clocks-demo relevant:** observer proper time on a circular orbit,
`main.js:64-66`:
`dt = Math.sqrt((dt*dt * (1.0 - v*v)) / (1-1.0/r))` — exactly the combined
dilation we want for the ⏰ feature.

**Skybox:** equirectangular `sphere_map` (atan/asin) lookups
(`raytracer.glsl:73-75`) — README admits texture-sampling star blinking; no
seam mitigation. Performance = step-count quality presets only.

## 3. rantonels/starless (GPL-3.0 — physics insight only, NO code reuse)

CPU/numpy offline renderer (`tracer.py`, ~1050 lines; disc temperature helpers
in `blackbody.py`).

**Geodesic approach — the famous "Newtonian analog" trick:** null
Schwarzschild geodesics are integrated as ordinary 3D Cartesian motion in flat
space under an attractive central acceleration proportional to
−(3/2)h² r̂/r⁴ (with h = |r×v| conserved per ray, rₛ = 1). This is *exactly*
equivalent to the standard Binet equation (it differentiates to
u″ = −u + 1.5u²), but needs no orbital-plane basis per pixel — very attractive
for a shader because state is just (pos, vel). Integrators: leapfrog
(position-first Euler-Cromer) or classic RK4 on the 6-component state; fixed
step (default scene: 250 iterations, step 0.16); a "step size control" comment
exists but the step is effectively constant.

**Termination:** horizon = |r|² dropping below 1 between consecutive steps,
with linear interpolation between old/new points to get the crossing (used to
draw an optional checkerboard grid on the horizon); disc = sign change of the
vertical coordinate between steps AND radius within [inner, outer],
intersection by solving the linear segment for the plane crossing; escape =
simply exhausting iterations, then sky lookup from the final velocity
direction (equirectangular via atan2/asin).

**Disc:** T(r) ∝ r^(−3/4) anchored at an ISCO temperature (worked in log
space; the 3/4·log 3 shift anchors at r = 3). Redshift combines
multiplicatively as (1+z)_total = (1+z)_Doppler · (1+z)_grav with
(1+z)_Doppler = γ(1 + v_disc·n̂) for Keplerian v = 1/√(2(r−1)) and
(1+z)_grav = (1−1/r)^(−1/2); then T_observed = T/(1+z)_total — the "shifted
blackbody is a blackbody" property again. Visible-band intensity is a fitted
Planck-integral ≈ 1/(exp(29622 K/T) − 1) and color comes from a
temperature-ramp image lookup (1000–30000 K). No separate δ³ beaming factor —
brightness change enters only via the shifted temperature (approximate). Alpha
tapers near ISCO and where T falls below ~1000 K.

**Other notes:** front-to-back alpha compositing so the disc correctly
occludes the lensed sky including higher-order images; optional "fog" ∝ 1/r²
tapered outside the photon sphere for depth cues; post: sRGB handling,
blur/bloom composite, multiprocess chunked rendering with shuffled pixel
schedules for even progress.

## What we take into our build (with attribution where code is adapted)

1. **Integrate the standard Binet form `u″ = −u(1 − 1.5u)` per pixel first**
   (oseiskar-style loop, ~100-200 steps, fixed-φ step with a shrink-near-hole
   limiter) — but with the corrected term; validate against b_crit = 3√3/2 and
   photon sphere 1.5 rₛ (a great unit test).
2. **Temperature-shift trick for all disc shading** (Bruneton
   `model.glsl:235-236`): blackbody at δT = exact shift + δ³ beaming in one
   lookup; to isolate our toggles, apply δ to T (redshift toggle) and δ³ (or
   renormalized) to intensity (beaming toggle) separately.
3. **Bruneton's exact combined factor** for the disc source,
   `g_k_l_source = e·√(2/(2−3u)) − ...` — physics-honest, covers grav +
   orbital Doppler in one invariant; oseiskar's SR-only version silently drops
   the gravitational part.
4. **Compile-time toggles** (oseiskar's Mustache idea, we can use `#define`
   injection) — perfect fit for the per-effect toggle requirement.
5. **Bruneton's lookup textures are the fallback** if per-pixel integration is
   too slow — but they cost most of that repo's complexity (divergence-taming
   mappings); try brute force first as CLAUDE.md already says.
6. Skybox: prefer a **cube map with analytic per-face derivatives** (Bruneton
   `model.glsl:130-136`) over equirectangular if the seam/blinking bothers us.
7. Clock demo formula already exists in MIT code: `main.js:64-66`.
