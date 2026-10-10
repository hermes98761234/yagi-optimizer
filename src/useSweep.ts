import { useEffect, useState } from 'react'
import type { Design, Env, Metrics } from './lib/analysis'
import type { SweepRequest, SweepResponse } from './sweep.worker'

export type SweepPoint = { freqHz: number; m: Metrics }

const SPAN = 0.1
const POINTS = 25

/** Frequency sweep of the design (centre ±5 %) computed in a worker; stale requests are dropped. */
export function useSweep(design: Design, env: Env, enabled: boolean): SweepPoint[] | null {
  const [result, setResult] = useState<{ points: SweepPoint[] } | null>(null)
  const key = JSON.stringify({ design, env })

  useEffect(() => {
    if (!enabled) return
    const w = new Worker(new URL('./sweep.worker.ts', import.meta.url), { type: 'module' })
    const req = JSON.parse(key) as { design: Design; env: Env }
    const timer = window.setTimeout(() => {
      const msg: SweepRequest = { id: 1, design: req.design, env: req.env, span: SPAN, points: POINTS }
      w.postMessage(msg)
    }, 350)
    w.onmessage = (e: MessageEvent<SweepResponse>) => {
      if ('points' in e.data) setResult({ points: e.data.points })
    }
    return () => {
      window.clearTimeout(timer)
      w.terminate()
    }
  }, [key, enabled])

  // Keep showing the previous sweep until the new one arrives (and while the optimizer runs).
  return result ? result.points : null
}
