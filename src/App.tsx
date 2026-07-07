import { useState } from 'react'
import BlackHoleCanvas from './BlackHoleCanvas'

export default function App() {
  const [disc, setDisc] = useState(true)
  const [beaming, setBeaming] = useState(true)
  const [shift, setShift] = useState(true)

  return (
    <>
      <BlackHoleCanvas view={{ disc, beaming, shift }} />
      <header className="hud">
        <h1>Μαύρη Τρύπα</h1>
        <p className="hint">drag to orbit · scroll to approach</p>
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
      </aside>
    </>
  )
}
