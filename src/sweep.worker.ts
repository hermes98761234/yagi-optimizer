import { sweep, type Design, type Env, type Metrics } from './lib/analysis'

export interface SweepRequest {
  id: number
  design: Design
  env: Env
  span: number
  points: number
}
export type SweepResponse = { id: number; points: { freqHz: number; m: Metrics }[] } | { id: number; error: string }

self.onmessage = (e: MessageEvent<SweepRequest>) => {
  const { id, design, env, span, points } = e.data
  let msg: SweepResponse
  try {
    msg = { id, points: sweep(design, env, span, points) }
  } catch (err) {
    msg = { id, error: err instanceof Error ? err.message : String(err) }
  }
  self.postMessage(msg)
}
