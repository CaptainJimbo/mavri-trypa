import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import BlackHoleCanvas, { type SandMode } from './BlackHoleCanvas'
import { ClockCard, FarClock } from './ClockPanel'
import type { ClockInfo, SimState } from './clocks'

let nextId = 1

/** rₛ = 2GM/c² = 2.953 km per solar mass. */
function scaleLegend(logM: number) {
  const M = 10 ** logM
  const km = 2.953 * M
  const ms = (km / 299792.458) * 1000
  const mass = logM < 4 ? `${Math.round(M)} M☉` : `10^${logM.toFixed(1)} M☉`
  const size = km < 1e4 ? `${km.toFixed(1)} km`
    : km < 1e7 ? `${(km / 1e6).toFixed(2)}M km`
    : `${(km / 1.496e8).toFixed(2)} AU`
  const time = ms < 1000 ? `${ms.toPrecision(2)} light-ms` : `${(ms / 1000).toPrecision(2)} light-s`
  return { mass, size, time }
}

export default function App() {
  const [disc, setDisc] = useState(true)
  const [beaming, setBeaming] = useState(true)
  const [shift, setShift] = useState(true)
  const [overlays, setOverlays] = useState(false)
  const [discTemp, setDiscTemp] = useState(9000)
  const [discOut, setDiscOut] = useState(12)
  const [exposure, setExposure] = useState(1)
  const [timeRate, setTimeRate] = useState(1)
  // Fixed at half internal resolution: full-res ray tracing is smooth on
  // Apple Silicon but laggy on typical hardware hitting the public page.
  const quality = 0.5
  const [logM, setLogM] = useState(1)
  const [clocks, setClocks] = useState<ClockInfo[]>([])
  const [sandMode, setSandMode] = useState<SandMode>('none')
  const [showTrue, setShowTrue] = useState(true)
  const [showCaption, setShowCaption] = useState(true)
  const [rackOpen, setRackOpen] = useState(true)
  const simRef = useRef<SimState>({ t: 0, m: {} })
  const rackRef = useRef<HTMLElement>(null)

  // Left-edge grip: the rack is pinned right, so dragging LEFT widens it
  const gripDown = (e: ReactPointerEvent) => {
    e.preventDefault()
    const rack = rackRef.current!
    const startW = rack.offsetWidth
    const startX = e.clientX
    const move = (ev: PointerEvent) => {
      const w = Math.min(420, Math.max(210, startW + (startX - ev.clientX)))
      rack.style.width = `${w}px`
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const placeClock = useCallback((dir: [number, number, number], r: number) => {
    setClocks((cs) => {
      if (cs.length >= 3) return cs
      const id = nextId++
      simRef.current.m[id] = { r, tau: 0, t0: simRef.current.t, falling: false, E: 0, vr: 0 }
      return [...cs, { id, dir, r0: r }]
    })
  }, [])

  const releaseClock = (id: number) => {
    const e = simRef.current.m[id]
    if (e && !e.falling) {
      e.falling = true
      e.E = Math.sqrt(1 - 1 / e.r)
    }
    setClocks((cs) => [...cs]) // re-render the card's buttons
  }

  const removeClock = (id: number) => {
    delete simRef.current.m[id]
    setClocks((cs) => cs.filter((c) => c.id !== id))
  }

  const caption = (() => {
    if (clocks.some((c) => simRef.current.m[c.id]?.falling))
      return 'From out here, the falling clock never crosses — its last tick takes forever.'
    if (clocks.length > 0)
      return 'The lower clock ticks slower. Not the mechanism — time itself.'
    if (sandMode === 'star')
      return 'One star, several images. Line it up behind the hole and they fuse into a ring.'
    if (sandMode === 'grid')
      return "The checkerboard is flat and its lines are straight. Space isn't."
    if (overlays)
      return "Three radii nothing ignores: the horizon, light's last orbit, matter's last stable orbit."
    if (!disc)
      return 'Every star here is real catalog light, bent — near the edge it wraps the hole more than once.'
    if (!beaming)
      return 'Beaming off: both sides equally bright. The lopsidedness you removed was special relativity.'
    if (!shift)
      return 'Shift off: true local colors. Turn it on to see gravity redden the light climbing out.'
    return "That arch over the shadow is the disc's far side — you're seeing behind the hole."
  })()

  const legend = scaleLegend(logM)

  return (
    <>
      <BlackHoleCanvas
        view={{ disc, beaming, shift, overlays, discTemp, discOut, exposure, timeRate, quality }}
        clocks={clocks} simRef={simRef} onPlace={placeClock}
        sandbox={{ mode: sandMode, showTrue }} />
      <header className="hud">
        <h1>Μαύρη Τρύπα</h1>
        <p className="hint">
          drag to orbit · scroll to approach · click to drop a clock
        </p>
      </header>

      {!rackOpen && (
        <button className="rack-show" onClick={() => setRackOpen(true)}
          aria-label="show controls">«</button>
      )}
      <aside className="rack" ref={rackRef} hidden={!rackOpen}>
        <div className="rack-grip" onPointerDown={gripDown} aria-hidden />
        <button className="rack-hide" onClick={() => setRackOpen(false)}
          aria-label="hide controls">»</button>
        <div className="rack-body">
        <section>
          <h2>spacetime</h2>
          <label className="slider">
            <span>mass</span>
            <input type="range" min={0} max={8} step={0.1} value={logM}
              onChange={(e) => setLogM(+e.target.value)} />
            <output>{legend.mass}</output>
          </label>
          <div className="scalebar" aria-label="scale legend">
            <div className="scalebar-rule" />
            <p>rₛ = {legend.size} ≈ {legend.time}</p>
            <p className="fineprint">the image is mass-invariant — only the scale changes</p>
          </div>
          <label>
            <input type="checkbox" checked={overlays}
              onChange={(e) => setOverlays(e.target.checked)} />
            labeled radii
          </label>
          {overlays && (
            <ul className="legend">
              <li><i style={{ background: '#ff5a47' }} />horizon · 1 rₛ</li>
              <li><i style={{ background: '#55c8ff' }} />photon sphere · 1.5 rₛ</li>
              <li><i style={{ background: '#ffc24d' }} />ISCO · 3 rₛ</li>
            </ul>
          )}
        </section>

        <section>
          <h2>accretion disc</h2>
          <label>
            <input type="checkbox" checked={disc}
              onChange={(e) => setDisc(e.target.checked)} />
            disc
          </label>
          <label>
            <input type="checkbox" checked={beaming} disabled={!disc}
              onChange={(e) => setBeaming(e.target.checked)} />
            Doppler beaming
          </label>
          <label>
            <input type="checkbox" checked={shift} disabled={!disc}
              onChange={(e) => setShift(e.target.checked)} />
            grav + Doppler shift
          </label>
          <label className="slider">
            <span>temp</span>
            <input type="range" min={1500} max={20000} step={250} value={discTemp}
              disabled={!disc} onChange={(e) => setDiscTemp(+e.target.value)} />
            <output>{discTemp} K at ISCO</output>
          </label>
          <label className="slider">
            <span>exposure</span>
            <input type="range" min={0} max={6} step={0.5} value={Math.log2(exposure)}
              disabled={!disc} onChange={(e) => setExposure(2 ** +e.target.value)} />
            <output>×{exposure >= 10 ? Math.round(exposure) : +exposure.toFixed(1)}</output>
          </label>
          <label className="slider">
            <span>size</span>
            <input type="range" min={6} max={14} step={0.5} value={discOut}
              disabled={!disc} onChange={(e) => setDiscOut(+e.target.value)} />
            <output>out to {discOut} rₛ</output>
          </label>
        </section>

        <section>
          <h2>lensing sandbox</h2>
          <div className="radio-row">
            {(['none', 'star', 'grid'] as SandMode[]).map((m) => (
              <label key={m}>
                <input type="radio" name="sand" checked={sandMode === m}
                  onChange={() => setSandMode(m)} />
                {m}
              </label>
            ))}
          </div>
          <label>
            <input type="checkbox" checked={showTrue}
              disabled={sandMode !== 'star'}
              onChange={(e) => setShowTrue(e.target.checked)} />
            show true position
          </label>
        </section>

        <section>
          <h2>clocks</h2>
          <label className="slider">
            <span>time</span>
            <input type="range" min={0.25} max={8} step={0.25} value={timeRate}
              onChange={(e) => setTimeRate(+e.target.value)} />
            <output>×{timeRate}</output>
          </label>
        </section>
        </div>
      </aside>

      <footer className="clocks">
        <FarClock simRef={simRef} />
        {clocks.map((c) => (
          <ClockCard key={c.id} info={c} simRef={simRef}
            onRelease={releaseClock} onRemove={removeClock} />
        ))}
      </footer>

      <div className="caption">
        {showCaption && <em>{caption}</em>}
        <button onClick={() => setShowCaption(!showCaption)}
          aria-label={showCaption ? 'hide captions' : 'show captions'}>
          ?!
        </button>
      </div>
    </>
  )
}
