import { useEffect, useMemo, useRef, useState } from 'react'
import { analyze, classicDesign, designValid, fromGenes, resizeDesign, toGenes, wavelength, type Analysis, type Design } from './lib/analysis'
import {
  boundsOf,
  DEFAULT_SETTINGS,
  DISPLAY_SEGMENTS,
  envOf,
  GENERATIONS,
  invalidFields,
  loadState,
  PRESETS,
  saveState,
  SEGMENTS,
  SWEEP_SEGMENTS,
  weightsOf,
  type AppState,
  type Lang,
  type Settings,
  type Theme,
  type Unit,
} from './lib/model'
import { tr, type T } from './i18n'
import { useOptimizer } from './useOptimizer'
import { useSweep } from './useSweep'
import SettingsPanel from './components/SettingsPanel'
import MetricsPanel from './components/MetricsPanel'
import BoomView from './components/BoomView'
import PolarPlot from './components/PolarPlot'
import LineChart from './components/LineChart'
import ElementTable from './components/ElementTable'

const START_COLOR = '#9aa1ad'
const BEST_COLOR = '#2563eb'
const ACCENT2 = '#d97706'

function useAnalysis(design: Design, valid: boolean, settings: Settings, segs: number): Analysis | null {
  const { freqMHz, diameterMm, z0, zRatio } = settings
  return useMemo(() => {
    if (!valid) return null
    try {
      return analyze(design, envOf({ ...DEFAULT_SETTINGS, freqMHz, diameterMm, z0, zRatio }, segs))
    } catch {
      return null
    }
  }, [design, valid, freqMHz, diameterMm, z0, zRatio, segs])
}

export default function App() {
  const [state, setState] = useState<AppState>(loadState)
  const [view, setView] = useState<'start' | 'best'>('best')
  const { run, start, stop } = useOptimizer()
  const { settings, design } = state
  const t: T = (s, ...a) => tr(settings.lang, s, ...a)
  const bad = useMemo(() => invalidFields(settings), [settings])
  const running = run.status === 'running'
  const lam = wavelength(settings.freqMHz * 1e6)

  const patchSettings = (patch: Partial<Settings>) =>
    setState((s) => {
      const settings = { ...s.settings, ...patch }
      let design = s.design
      if (patch.nEl !== undefined && patch.nEl !== s.design.len.length && Number.isInteger(patch.nEl)) design = resizeDesign(s.design, patch.nEl)
      return { settings, design }
    })
  const setDesign = (d: Design) => setState((s) => ({ ...s, design: d }))

  useEffect(() => saveState(state), [state])
  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'auto') delete root.dataset.theme
    else root.dataset.theme = settings.theme
    root.lang = settings.lang
  }, [settings.theme, settings.lang])

  const bestDesign = useMemo(() => (run.bestGenes && run.bestGenes.length === 2 * design.len.length - 1 ? fromGenes(run.bestGenes) : null), [run.bestGenes, design.len.length])
  const showBest = view === 'best' && bestDesign !== null
  const shown = showBest ? bestDesign : design
  const shownValid = designValid(shown) && bad.size === 0
  const startValid = designValid(design) && bad.size === 0

  const dispSegs = running ? 16 : DISPLAY_SEGMENTS
  const analysis = useAnalysis(shown, shownValid, settings, dispSegs)
  const startAnalysis = useAnalysis(design, startValid && showBest, settings, dispSegs)
  const sweep = useSweep(shown, envOf(settings, SWEEP_SEGMENTS), shownValid && !running)

  const optimize = () => {
    if (bad.size > 0) return
    const n = design.len.length
    const seeds = [classicDesign(n), ...(designValid(design) ? [design] : [])].map(toGenes)
    start(
      {
        env: envOf(settings, SEGMENTS[settings.detail]),
        weights: weightsOf(settings),
        bounds: boundsOf(settings),
        n,
        popSize: settings.popSize,
        generations: GENERATIONS[settings.effort],
        seeds,
      },
      settings.islands,
    )
    setView('best')
  }

  // The optimizer's best is only meaningful for the element count it ran with.
  const prevN = useRef(design.len.length)
  useEffect(() => {
    if (prevN.current !== design.len.length) {
      prevN.current = design.len.length
      stop()
    }
  }, [design.len.length, stop])

  const unitLabel = settings.unit === 'mm' ? 'm' : 'ft'
  const boomM = shown.pos[shown.pos.length - 1] * lam
  const boomValue = (settings.unit === 'mm' ? boomM : boomM / 0.3048).toFixed(2)
  const labels = shown.len.map((_, i) => (i === 0 ? t('R') : i === 1 ? t('DE') : `D${i - 1}`))
  const mhz = (f: number) => (f / 1e6).toFixed(1)
  const pct = running || run.status === 'done' ? Math.round((100 * run.gen) / Math.max(1, run.totalGen)) : 0
  const sw = sweep ?? []
  const fMid = settings.freqMHz * 1e6

  const preset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)
    if (!p) return
    stop()
    setState((s) => ({ settings: { ...s.settings, freqMHz: p.freqMHz, nEl: p.nEl, diameterMm: p.diameterMm }, design: classicDesign(p.nEl) }))
    setView('start')
  }

  const hSeries = analysis
    ? [
        ...(showBest && startAnalysis ? [{ label: t('Start design'), color: START_COLOR, cut: startAnalysis.h, dashed: true }] : []),
        { label: showBest ? t('Optimized') : t('Design'), color: BEST_COLOR, cut: analysis.h },
      ]
    : []
  const eSeries = analysis
    ? [
        ...(showBest && startAnalysis ? [{ label: t('Start design'), color: START_COLOR, cut: startAnalysis.e, dashed: true }] : []),
        { label: showBest ? t('Optimized') : t('Design'), color: BEST_COLOR, cut: analysis.e },
      ]
    : []

  return (
    <div className="app">
      <header className="toolbar">
        <span className="brand">{t('Yagi optimizer')}</span>
        <span className="hint tagline">{t('Design a Yagi-Uda antenna with a method-of-moments solver and a genetic algorithm.')}</span>
        <span className="spacer" />
        <label className="inline">
          {t('Units')}{' '}
          <select value={settings.unit} onChange={(e) => patchSettings({ unit: e.target.value as Unit })}>
            <option value="mm">{t('Metric')}</option>
            <option value="in">{t('Imperial')}</option>
          </select>
        </label>
        <label className="inline">
          {t('Theme')}{' '}
          <select value={settings.theme} onChange={(e) => patchSettings({ theme: e.target.value as Theme })}>
            <option value="auto">{t('System')}</option>
            <option value="light">{t('Light')}</option>
            <option value="dark">{t('Dark')}</option>
          </select>
        </label>
        <label className="inline">
          {t('Language')}{' '}
          <select value={settings.lang} onChange={(e) => patchSettings({ lang: e.target.value as Lang })}>
            <option value="en">English</option>
            <option value="uk">Українська</option>
          </select>
        </label>
      </header>
      <div className="body">
        <aside className="side">
          <div className="panel">
            <SettingsPanel s={settings} bad={bad} locked={running} t={t} onChange={patchSettings} onPreset={preset} />
          </div>
        </aside>
        <main className="main">
          <div className="box runbar">
            <div className="row">
              {running ? (
                <button className="primary" onClick={stop}>
                  {t('Stop')}
                </button>
              ) : (
                <button className="primary" onClick={optimize} disabled={bad.size > 0}>
                  {run.status === 'done' ? t('Optimize again') : t('Optimize')}
                </button>
              )}
              <button
                disabled={running}
                onClick={() => {
                  setDesign(classicDesign(design.len.length))
                  setView('start')
                }}
              >
                {t('Reset start design')}
              </button>
              {bestDesign && (
                <div className="seg" role="group" aria-label={t('Design shown')}>
                  <button aria-pressed={view === 'start'} className={view === 'start' ? 'on' : undefined} onClick={() => setView('start')}>
                    {t('Start design')}
                  </button>
                  <button aria-pressed={view === 'best'} className={view === 'best' ? 'on' : undefined} onClick={() => setView('best')}>
                    {t('Optimized')}
                  </button>
                </div>
              )}
              {bestDesign && view === 'best' && !running && (
                <button
                  onClick={() => {
                    setDesign(bestDesign)
                    setView('start')
                  }}
                >
                  {t('Use as start design')}
                </button>
              )}
            </div>
            {run.status !== 'idle' && (
              <>
                <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div style={{ width: `${pct}%` }} />
                </div>
                <p className="hint" aria-live="polite">
                  {running ? t('Generation {0} of {1}', run.gen, run.totalGen) : t('Finished after {0} generations', run.gen)} ·{' '}
                  {t('{0} evaluations', run.evals.toLocaleString())} · {t('{0} workers', run.workers)} · {run.elapsed.toFixed(1)} s
                  {run.error && <span className="err-text"> · {t('Error: {0}', run.error)}</span>}
                </p>
              </>
            )}
            {run.status === 'idle' && <p className="hint">{t('Press Optimize to search for a better design. The classic start design below is analysed already.')}</p>}
          </div>

          {bad.size > 0 && <p className="box err-text">{t('Fix the highlighted fields.')}</p>}
          {!shownValid && bad.size === 0 && <p className="box err-text">{t('The element table has an invalid length or spacing.')}</p>}

          {analysis && (
            <>
              <div className="box">
                <MetricsPanel a={analysis} boomValue={boomValue} boomUnit={unitLabel} t={t} />
                <BoomView design={shown} labels={labels} aria={t('Side view of the antenna, boom to scale')} />
                <p className="hint">
                  {t('Forward is to the right. The driven element has the dot; elements and boom are drawn to scale.')}
                </p>
              </div>
              <div className="box">
                <div className="polars">
                  <PolarPlot title={t('H-plane (horizontal, along the boom)')} series={hSeries} front={t('front')} up="" hpbw={analysis.hpbwH} hpbwLabel={t('3 dB')} />
                  <PolarPlot title={t('E-plane (vertical, along the elements)')} series={eSeries} front={t('front')} up={t('elements')} hpbw={analysis.hpbwE} hpbwLabel={t('3 dB')} />
                </div>
                <p className="hint">{t('Gain in dBi, rings every 10 dB. Free space: no ground or boom effects.')}</p>
              </div>
            </>
          )}

          <div className="box">
            <h3>{t('Optimizer progress and frequency response')}</h3>
            <div className="charts">
              <div>
                <LineChart
                  series={[
                    { label: t('Best'), color: BEST_COLOR, points: run.history.map((h) => [h.gen, h.best]) },
                    { label: t('Mean'), color: ACCENT2, points: run.history.map((h) => [h.gen, h.mean]), dashed: true },
                  ]}
                  xLabel={t('Generation')}
                  yLabel={t('Fitness')}
                  yFmt={(v) => v.toFixed(1)}
                  empty={t('Run the optimizer to see its progress.')}
                />
              </div>
              <div>
                <LineChart
                  series={[
                    { label: t('Gain (dBi)'), color: BEST_COLOR, points: sw.map((p) => [p.freqHz, p.m.gain]) },
                    { label: t('F/B (dB)'), color: ACCENT2, points: sw.map((p) => [p.freqHz, Math.min(p.m.fb, 40)]), dashed: true },
                  ]}
                  xLabel={t('Frequency (MHz)')}
                  yLabel={t('dB')}
                  xFmt={(v) => mhz(v)}
                  yFmt={(v) => v.toFixed(0)}
                  markX={fMid}
                  empty={running ? t('Sweep is computed when the run ends.') : t('Computing…')}
                />
              </div>
              <div>
                <LineChart
                  series={[{ label: 'SWR', color: BEST_COLOR, points: sw.map((p) => [p.freqHz, Math.min(p.m.swr, 6)]) }]}
                  xLabel={t('Frequency (MHz)')}
                  yLabel="SWR"
                  yMin={1}
                  yMax={6}
                  xFmt={(v) => mhz(v)}
                  yFmt={(v) => v.toFixed(0)}
                  markX={fMid}
                  empty={running ? t('Sweep is computed when the run ends.') : t('Computing…')}
                />
              </div>
            </div>
            <p className="hint">{t('The sweep keeps the element sizes fixed and varies the frequency by ±5 %.')}</p>
          </div>

          <ElementTable
            design={shown}
            freqHz={fMid}
            diameterM={settings.diameterMm / 1000}
            unit={settings.unit}
            editable={!showBest && !running}
            t={t}
            onChange={setDesign}
          />
          {showBest && <p className="hint">{t('Switch to the start design to edit the table by hand.')}</p>}
        </main>
      </div>
      <p className="hint foot">
        {t('A thin-wire free-space model. Real antennas differ: boom, mounting, ground and nearby objects shift the optimum. Treat the result as a starting point.')}{' '}
        <a href="https://github.com/hermes98761234/yagi-optimizer">{t('Source on GitHub')}</a>
      </p>
    </div>
  )
}

