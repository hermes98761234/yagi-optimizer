import { useCallback, useEffect, useRef, useState } from 'react'
import type { FromWorker, Job, ToWorker } from './lib/job'

export interface HistoryPoint {
  gen: number
  best: number
  mean: number
}

export interface RunState {
  status: 'idle' | 'running' | 'done'
  gen: number
  totalGen: number
  evals: number
  elapsed: number
  workers: number
  bestGenes: number[] | null
  bestFit: number
  history: HistoryPoint[]
  error: string | null
}

export const IDLE: RunState = {
  status: 'idle',
  gen: 0,
  totalGen: 0,
  evals: 0,
  elapsed: 0,
  workers: 0,
  bestGenes: null,
  bestFit: -Infinity,
  history: [],
  error: null,
}

interface Island {
  gen: number
  evals: number
  mean: number
  done: boolean
}

const FLUSH_MS = 200

/**
 * Runs the genetic algorithm in one Web Worker per island. The islands evolve separately and share
 * their best design whenever one of them finds a new overall best (migration).
 */
export function useOptimizer() {
  const [run, setRun] = useState<RunState>(IDLE)
  const workers = useRef<Worker[]>([])
  const timer = useRef<number | null>(null)
  const stopRef = useRef<() => void>(() => {})

  const stop = useCallback(() => stopRef.current(), [])

  const start = useCallback((base: Omit<Job, 'island' | 'seed'>, islands: number) => {
    stopRef.current()
    const t0 = performance.now()
    const state: Island[] = Array.from({ length: islands }, () => ({ gen: 0, evals: 0, mean: 0, done: false }))
    let bestFit = -Infinity
    let bestGenes: number[] | null = null
    let lastGen = -1
    const history: HistoryPoint[] = []
    let error: string | null = null
    let finished = false

    const flush = () => {
      timer.current = null
      const gen = Math.min(...state.map((s) => s.gen))
      const mean = state.reduce((a, s) => a + s.mean, 0) / islands
      if (gen > lastGen && bestGenes) {
        lastGen = gen
        history.push({ gen, best: bestFit, mean })
      }
      const done = state.every((s) => s.done)
      if (done) finished = true
      setRun({
        status: done ? 'done' : 'running',
        gen,
        totalGen: base.generations,
        evals: state.reduce((a, s) => a + s.evals, 0),
        elapsed: (performance.now() - t0) / 1000,
        workers: islands,
        bestGenes,
        bestFit,
        history: [...history],
        error,
      })
      if (done) {
        workers.current.forEach((w) => w.terminate())
        workers.current = []
      }
    }
    const schedule = () => {
      if (timer.current === null) timer.current = window.setTimeout(flush, finished ? 0 : FLUSH_MS)
    }

    stopRef.current = () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = null
      workers.current.forEach((w) => w.terminate())
      workers.current = []
      if (!finished) {
        finished = true
        setRun((r) => (r.status === 'running' ? { ...r, status: 'done', elapsed: (performance.now() - t0) / 1000 } : r))
      }
    }

    const list: Worker[] = []
    for (let i = 0; i < islands; i++) {
      const w = new Worker(new URL('./optimizer.worker.ts', import.meta.url), { type: 'module' })
      list.push(w)
      w.onmessage = (e: MessageEvent<FromWorker>) => {
        const m = e.data
        if (m.type === 'error') {
          error = m.message
          state[m.island].done = true
          schedule()
          return
        }
        const s = state[m.island]
        s.gen = m.info.gen
        s.evals = m.info.evals
        s.mean = m.info.meanFit
        if (m.type === 'done') s.done = true
        if (m.info.bestFit > bestFit + 1e-9) {
          bestFit = m.info.bestFit
          bestGenes = m.info.best
          list.forEach((o, j) => {
            if (j !== m.island) o.postMessage({ type: 'migrant', genes: m.info.best } satisfies ToWorker)
          })
        }
        schedule()
      }
      w.onerror = (e) => {
        error = e.message || 'worker failed'
        state[i].done = true
        schedule()
      }
    }
    workers.current = list
    setRun({ ...IDLE, status: 'running', totalGen: base.generations, workers: islands })
    list.forEach((w, i) => w.postMessage({ type: 'start', job: { ...base, island: i, seed: 1000 + 7919 * i + (Date.now() % 100000) } } satisfies ToWorker))
  }, [])

  useEffect(() => () => stopRef.current(), [])

  return { run, start, stop }
}
