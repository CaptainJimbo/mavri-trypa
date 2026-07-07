import { useEffect, useRef, type RefObject } from 'react'
import { rateFor, type ClockInfo, type SimState } from './clocks'

/** Clock cards update their DOM directly from a rAF loop (no re-renders):
 * the analog hand turns by 36° per unit of elapsed time, so rate
 * differences between cards are visible side by side. */

function Face({ handRef }: { handRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div className="face">
      <div className="hand" ref={handRef} />
    </div>
  )
}

export function FarClock({ simRef }: { simRef: RefObject<SimState> }) {
  const hand = useRef<HTMLDivElement>(null)
  const tEl = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const t = simRef.current.t
      if (hand.current) hand.current.style.transform = `rotate(${t * 36}deg)`
      if (tEl.current) tEl.current.textContent = t.toFixed(1)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [simRef])
  return (
    <div className="clock-card">
      <Face handRef={hand} />
      <div className="clock-info">
        <strong>far away</strong>
        <span>t = <span ref={tEl}>0.0</span></span>
        <span className="dim">rate 1</span>
      </div>
    </div>
  )
}

export function ClockCard({ info, simRef, onRelease, onRemove }: {
  info: ClockInfo
  simRef: RefObject<SimState>
  onRelease: (id: number) => void
  onRemove: (id: number) => void
}) {
  const hand = useRef<HTMLDivElement>(null)
  const tauEl = useRef<HTMLSpanElement>(null)
  const tEl = useRef<HTMLSpanElement>(null)
  const rateEl = useRef<HTMLSpanElement>(null)
  const rEl = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const e = simRef.current.m[info.id]
      if (!e) return
      if (hand.current) hand.current.style.transform = `rotate(${e.tau * 36}deg)`
      if (tauEl.current) tauEl.current.textContent = e.tau.toFixed(1)
      if (tEl.current) tEl.current.textContent = (simRef.current.t - e.t0).toFixed(1)
      if (rateEl.current) rateEl.current.textContent = rateFor(e).toFixed(3)
      if (rEl.current) rEl.current.textContent = e.r.toFixed(2)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [info.id, simRef])

  const falling = simRef.current.m[info.id]?.falling ?? false
  return (
    <div className="clock-card">
      <Face handRef={hand} />
      <div className="clock-info">
        <strong>r = <span ref={rEl}>{info.r0.toFixed(2)}</span> rₛ</strong>
        <span>τ = <span ref={tauEl}>0.0</span> · t = <span ref={tEl}>0.0</span></span>
        <span className="dim">rate <span ref={rateEl} /></span>
        <span className="clock-actions">
          {falling
            ? <em>falling…</em>
            : <button onClick={() => onRelease(info.id)}>release</button>}
          <button onClick={() => onRemove(info.id)}>×</button>
        </span>
      </div>
    </div>
  )
}
