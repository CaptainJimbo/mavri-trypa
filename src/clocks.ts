/** Clock simulation for the droppable-clocks demo. Units: r_s = 1, c = 1,
 * times in r_s/c. All formulas are exact Schwarzschild results:
 *
 * Static (hovering) observer at r:  dτ/dt = √(1 − 1/r)
 * Radial free-fall from rest at r₀ (conserved energy E = √(1 − 1/r₀)):
 *   dτ/dt = f/E,   d²r/dτ² = −1/(2r²),   f = 1 − 1/r
 * (The second-order form matters: dr/dτ = −√(E² − f) is exactly zero at
 * release, so a first-order integrator never leaves r₀.)
 * Redshift factor seen by a static camera at r_cam (radial-photon
 * approximation for the falling case; dr/dτ = vr ≤ 0):
 *   static:  δ = √f / √f_cam
 *   falling: δ = f / (√f_cam · (E − vr))
 */

export interface ClockInfo {
  id: number
  dir: [number, number, number] // unit vector from the hole
  r0: number
}

export interface SimEntry {
  r: number
  tau: number
  t0: number // sim time at placement
  falling: boolean
  E: number // conserved energy per unit mass (set on release)
  vr: number // dr/dτ (falling only)
}

export interface SimState {
  t: number
  m: Record<number, SimEntry>
}

/** Sim time units (r_s/c) per wall-clock second. */
export const TIME_SCALE = 2.5

export function advanceSim(sim: SimState, dtWall: number) {
  const dt = Math.min(dtWall, 0.1) * TIME_SCALE
  sim.t += dt
  for (const e of Object.values(sim.m)) {
    if (!e.falling) {
      e.tau += dt * Math.sqrt(1 - 1 / e.r)
    } else {
      // semi-implicit Euler on (r, vr) in proper time, two substeps
      for (let i = 0; i < 2; i++) {
        const f = 1 - 1 / e.r
        if (f < 1e-4) break // frozen at the horizon, for us
        const dtau = (f / e.E) * dt / 2
        e.vr -= (1 / (2 * e.r * e.r)) * dtau
        e.r = Math.max(1.0001, e.r + e.vr * dtau)
        e.tau += dtau
      }
    }
  }
}

/** dτ/dt as computed by the far-away bookkeeper. */
export function rateFor(e: SimEntry): number {
  const f = 1 - 1 / e.r
  return e.falling ? f / e.E : Math.sqrt(f)
}

/** Observed frequency ratio at a static camera (marker color/brightness). */
export function deltaFor(e: SimEntry, fCam: number): number {
  const f = 1 - 1 / e.r
  if (!e.falling) return Math.sqrt(f / fCam)
  return f / (Math.sqrt(fCam) * (e.E - e.vr))
}
