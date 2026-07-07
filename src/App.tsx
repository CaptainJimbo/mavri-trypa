import { useCallback, useRef, useState } from 'react'
import BlackHoleCanvas, { type SandMode } from './BlackHoleCanvas'
import { ClockCard, FarClock } from './ClockPanel'
import type { ClockInfo, SimState } from './clocks'

let nextId = 1

export default function App() {
  const [disc, setDisc] = useState(true)
  const [beaming, setBeaming] = useState(true)
  const [shift, setShift] = useState(true)
  const [clocks, setClocks] = useState<ClockInfo[]>([])
  const [sandMode, setSandMode] = useState<SandMode>('none')
  const [showTrue, setShowTrue] = useState(true)
  const simRef = useRef<SimState>({ t: 0, m: {} })

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

  return (
    <>
      <BlackHoleCanvas view={{ disc, beaming, shift }} clocks={clocks}
        simRef={simRef} onPlace={placeClock}
        sandbox={{ mode: sandMode, showTrue }} />
      <header className="hud">
        <h1>Μαύρη Τρύπα</h1>
        <p className="hint">
          drag to orbit · scroll to approach · click to drop a clock
        </p>
      </header>
      <aside className="panel">
        <label>
          <input type="checkbox" checked={disc}
            onChange={(e) => setDisc(e.target.checked)} />
          accretion disc
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
        <div className="panel-group">
          <span className="panel-title">lensing sandbox</span>
          {(['none', 'star', 'grid'] as SandMode[]).map((m) => (
            <label key={m}>
              <input type="radio" name="sand" checked={sandMode === m}
                onChange={() => setSandMode(m)} />
              {m}
            </label>
          ))}
          <label>
            <input type="checkbox" checked={showTrue}
              disabled={sandMode !== 'star'}
              onChange={(e) => setShowTrue(e.target.checked)} />
            show true position
          </label>
        </div>
      </aside>
      <footer className="clocks">
        <FarClock simRef={simRef} />
        {clocks.map((c) => (
          <ClockCard key={c.id} info={c} simRef={simRef}
            onRelease={releaseClock} onRemove={removeClock} />
        ))}
      </footer>
    </>
  )
}
