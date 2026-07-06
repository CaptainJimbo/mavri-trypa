# Μαύρη Τρύπα 🕳️

**An interactive general-relativistic black hole in your browser.**
Real geodesic ray tracing in a WebGL fragment shader — every pixel's light ray
bent through curved spacetime, not a lens-blur fake. Physics with sliders.

## What you can do

- **Orbit a Schwarzschild black hole** with an accretion disc rendered with
  the real effects: gravitational lensing (you see the *back* of the disc bent
  above and below the hole), Doppler beaming (the approaching side blazes,
  the receding side dims), gravitational + Doppler redshift (color shifts,
  computed, not painted).
- **Drop a clock toward the horizon** ⏰ — watch it tick slower and slower
  next to your own clock (real time-dilation factor √(1−rₛ/r)), redden, dim,
  and freeze forever at the horizon. The classic "wait... WHAT?!" of GR, live.
- **Put things behind the hole** — drag a star, a galaxy image, or a checker
  grid behind it and watch Einstein rings and double images form; cross the
  caustic and see images split and merge.
- **Toggle each effect separately** — lensing / beaming / redshift on-off
  switches, so you can *see what each one contributes* instead of one
  undifferentiated "cool shader".
- **Physics-honest parameter panel** — mass in M☉ (sets the scale bar),
  disc inner edge snapped to the ISCO (3 rₛ), the photon sphere (1.5 rₛ)
  highlightable, camera inclination, disc temperature.

Everything is computed from the Schwarzschild metric — the README of every
slider says which equation it turns.

## Status

✅ v1 feature-complete: lensed skybox, turbulent accretion disc with
independent beaming/redshift toggles, droppable clocks (static + free-fall),
lensing sandbox with Einstein rings, and the physics parameter panel.
GitHub Pages deploy + demo GIF coming next.

## Stack

React + Vite + WebGL2 (raw fragment shader — the ray tracer), TypeScript UI.
Static site; deploys to GitHub Pages. No backend, no build-time physics —
everything runs on your GPU.

## Prior art & credits

This has been done before, beautifully — this project is a from-scratch
implementation written for the joy of it and for the interactive extras
(clocks, lensing playground, per-effect toggles). Standing on the shoulders of:

| Project | Author | License | What it is |
|---|---|---|---|
| [black_hole_shader](https://github.com/ebruneton/black_hole_shader) | Eric Bruneton | BSD-3-Clause | The gold-standard physically-based WebGL2 black hole ([demo](https://ebruneton.github.io/black_hole_shader/demo/demo.html)) |
| [black-hole](https://github.com/oseiskar/black-hole) | Otto Seiskari | MIT | Clean WebGL Schwarzschild ray tracer ([demo](https://oseiskar.github.io/black-hole/)) |
| [starless](https://github.com/rantonels/starless) | Riccardo Antonelli | GPL-3.0 | The classic CPU/numpy black hole ray tracer (**reference only — no code reused**, GPL) |
| [DNGR paper](https://arxiv.org/abs/1502.03808) | James, von Tunzelmann, Franklin & Thorne | — | The *Interstellar*/Gargantua renderer that started it all |

All shader code here is original unless a file header says otherwise; any
adapted snippet carries the upstream attribution + license notice (BSD/MIT
sources only — never from GPL code).

## License

MIT © 2026 Dimitris Kogias

---

*Built by [Dimitris Kogias](https://captainjimbo.github.io) — physicist &
AI/ML systems engineer.*
