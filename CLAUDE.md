# Μαύρη Τρύπα (mavri-trypa) — Project Spec

**Interactive general-relativistic black hole in WebGL** — geodesic ray tracing
in a fragment shader + interactive GR playground (droppable clocks, lensing
sandbox, per-effect toggles). Public since 7/7/2026 (steps 1–6 done; GitHub
Pages deploy + portfolio card still pending).

## Why this project exists

The differentiator vs existing black-hole demos is the **physics-honest
interactivity** — every slider maps to an equation, every effect can be
isolated, and every visual claim is validated numerically against theory.

**Scope guard:** this is a *bounded* project. v1 = Schwarzschild only (no Kerr
spin — that's a possible v2 and a big jump in geodesic complexity). No backend.

(Personal/portfolio context lives in `CLAUDE.local.md`, gitignored.)

## Licensing rules (checked 7/7/2026 — IMPORTANT)

Our license: **MIT**. Prior art and what we may take from it:

- `ebruneton/black_hole_shader` — **BSD-3-Clause** → may adapt snippets WITH
  attribution + license notice in the file header.
- `oseiskar/black-hole` — **MIT** (see their COPYRIGHT.md) → same, attribution
  required. ⚠️ Their Milky Way sky image is **CC-BY-NC** (Stellarium/Risinger)
  — do NOT reuse it; source our own skybox (e.g. ESO/ESA public imagery with
  attribution, or NASA SVS deep star maps which are public domain).
- `rantonels/starless` — **GPL-3.0** → **read for physics insight only, copy
  NOTHING** (would force our repo to GPL).
- Default: write the shader from scratch; the physics is public domain.
- Credit all prior art in README (table already there).

## What we're building (v1 feature list)

1. **Core renderer** — WebGL2 fragment-shader ray tracer, Schwarzschild metric.
   Per-pixel: integrate null geodesics (numeric RK4 in u(φ)=1/r form, or the
   standard impact-parameter deflection approach) from camera through curved
   spacetime to (a) accretion disc hit, (b) horizon capture, (c) escape to
   skybox. Photon ring should emerge naturally (b_crit = 3√3 GM/c² ≈ 2.6 rₛ).
2. **Accretion disc** — geometrically thin, inner edge at ISCO (3 rₛ),
   blackbody color from a temperature profile T(r) ∝ r^(−3/4) (Shakura–Sunyaev
   scaling is fine), Keplerian orbital velocity → **Doppler beaming**
   (relativistic intensity boost δ³–δ⁴) + **combined gravitational & Doppler
   shift** applied to the blackbody color. Both toggleable independently.
3. **Interactive: droppable clocks ⏰ (the signature demo)** — click to place
   a clock at radius r (hovering/static observer): its face ticks at
   √(1−rₛ/r) relative to the UI's far-away clock, side by side. "Release"
   mode: clock free-falls, ticks slow, light from it redshifts & dims
   (exponential fade as it asymptotes to the horizon — it never quite crosses,
   from our view). Show elapsed proper time vs coordinate time counters.
4. **Interactive: lensing sandbox** — place/drag light sources BEHIND the hole
   (point star, small galaxy sprite, checkerboard grid plane): see Einstein
   ring when aligned, double/multiple images off-axis, image merging at the
   caustic. A "show true position" ghost toggle.
5. **Per-effect toggles** — lensing / beaming / redshift / disc / skybox each
   on-off. The pedagogical killer feature: isolate what each effect does.
6. **Physics-honest parameter panel** — mass M☉ (scale bar in km + light-ms),
   disc temperature & size, camera inclination & distance, time-rate slider.
   Overlays: photon sphere (1.5 rₛ), ISCO (3 rₛ), horizon rₛ — labeled rings.
7. **"wait... WHAT?!" captions** (Dimitris's brand) — one-liner physics
   explainers per feature, hideable.

**v2 candidates (parking lot only):** Kerr spin (frame dragging, asymmetric
photon ring), infalling-observer camera mode ("cross the horizon"), starfield
aberration flight mode, spectroscopy panel (see the iron line skew), Hα
line-emission region (the only honest way to render *vivid* red — thermal
red is always dim, i.e. brown; discovered live with Dimitris 7/7/2026).

## Performance strategy

- Ray march at reduced internal resolution with TAA-style accumulation when
  camera is still; upscale. Target 60fps on Apple Silicon / decent laptop,
  degrade gracefully (quality slider).
- Precompute deflection lookup textures if per-pixel RK4 is too slow (this is
  Bruneton's approach — BSD, may adapt with credit) — but try brute force
  first; modern GPUs likely handle Schwarzschild RK4 fine.
- No physics on CPU per-frame; UI state → uniforms only.

## Build spine (each step visible in the browser)

1. **Skybox + camera orbit** — WebGL2 scaffold, star background (public-domain
   NASA SVS starmap), orbit controls. Boring but proves the pipeline.
2. **Lensed skybox** — geodesic integration in shader; stars warp around the
   hole; photon ring appears. First "whoa" moment; screenshot it.
3. **Accretion disc** — geometry + lensing of the disc (back visible over/under
   the hole), then beaming + redshift with toggles.
4. **Clocks demo** — static clocks at radius r + release/free-fall mode.
5. **Lensing sandbox** — draggable background objects, Einstein rings.
6. **Polish + captions + params panel** — frontend-design plugin pass.
7. **Publish** — repo public, GitHub Pages, portfolio card + a short demo GIF.

## Plugins for this repo (recommend at session start)

```
claude plugin enable frontend-design   # the UI polish pass (step 6)
```

Already at user scope: playwright, chrome-devtools (use for visual iteration —
screenshot the canvas after every physics change), context7 (Three.js/WebGL2
docs), firecrawl.

## Working conventions (house rules)

- Batch edits, then one commit. Ask before slow deploys.
- Visual check via playwright/chrome-devtools screenshots after each render
  change — shader bugs are silent; eyes are the test suite here.
- New ideas → v2 parking lot above. This project is bounded BY DESIGN.

## Related repos / docs

- See `CLAUDE.local.md` (gitignored) for sibling-repo and portfolio context.
