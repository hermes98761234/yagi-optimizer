import type { Bounds, Env, Weights } from './analysis'
import type { GenInfo } from './ga'

export interface Job {
  island: number
  seed: number
  env: Env
  weights: Weights
  bounds: Bounds
  /** Number of elements. */
  n: number
  popSize: number
  generations: number
  /** Initial individuals as genes. */
  seeds: number[][]
}

export type ToWorker = { type: 'start'; job: Job } | { type: 'migrant'; genes: number[] }
export type FromWorker =
  | { type: 'gen'; island: number; info: GenInfo }
  | { type: 'done'; island: number; info: GenInfo }
  | { type: 'error'; island: number; message: string }
