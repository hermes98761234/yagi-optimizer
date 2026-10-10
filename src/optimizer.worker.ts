import { evaluate, fitness, fromGenes, geneBounds, repairGenes } from './lib/analysis'
import { Ga, mulberry32 } from './lib/ga'
import type { FromWorker, ToWorker } from './lib/job'

let ga: Ga | null = null
const migrants: number[][] = []

const post = (m: FromWorker) => self.postMessage(m)
const yieldToQueue = () => new Promise<void>((r) => setTimeout(r, 0))

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data
  if (msg.type === 'migrant') {
    migrants.push(msg.genes)
    return
  }
  const job = msg.job
  void (async () => {
    try {
      const { lo, hi } = geneBounds(job.n, job.bounds)
      ga = new Ga({
        lo,
        hi,
        popSize: job.popSize,
        generations: job.generations,
        seeds: job.seeds,
        rng: mulberry32(job.seed),
        evaluate: (g) => fitness(evaluate(fromGenes(g), job.env), job.weights),
        repair: (g) => repairGenes(g, job.n, job.bounds),
      })
      post({ type: 'gen', island: job.island, info: ga.info() })
      for (let gen = 0; gen < job.generations; gen++) {
        await yieldToQueue()
        for (const m of migrants.splice(0)) ga.inject(m)
        post({ type: 'gen', island: job.island, info: ga.step() })
      }
      await yieldToQueue()
      post({ type: 'done', island: job.island, info: ga.polish(40 * lo.length) })
    } catch (err) {
      post({ type: 'error', island: job.island, message: err instanceof Error ? err.message : String(err) })
    }
  })()
}
