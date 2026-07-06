import BlackHoleCanvas from './BlackHoleCanvas'

export default function App() {
  return (
    <>
      <BlackHoleCanvas />
      <header className="hud">
        <h1>Μαύρη Τρύπα</h1>
        <p className="hint">drag to look around · scroll to zoom</p>
      </header>
    </>
  )
}
