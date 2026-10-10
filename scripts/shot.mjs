// Screenshot the running app via headless Chrome + the DevTools protocol.
// usage: node scripts/shot.mjs URL OUT.png [width] [height] [dark] [optimize] [lang]
//   optimize: "1" clicks Optimize and waits for the run to finish; lang: "uk" switches the language first.
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const PORT = 9324
const [url, out, w = '1440', h = '1000', dark, optimize, lang] = process.argv.slice(2)
const chrome = spawn(process.env.CHROME ?? 'chromium', ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--window-size=${w},${h}`, 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
try {
  let target
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200)
    target = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json()).then((l) => l.find((t) => t.type === 'page')).catch(() => null)
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let id = 0
  const pending = new Map()
  const errors = []
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) pending.get(m.id)(m.result ?? m.error)
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '))
  }
  const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })) })
  const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.value
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: +w < 600 })
  if (dark) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
  await send('Page.navigate', { url })
  const waitFor = async (expr, tries = 240) => {
    for (let i = 0; i < tries; i++) {
      await sleep(500)
      if (await ev(expr)) return true
    }
    return false
  }
  let done = await waitFor("!!document.querySelector('.metrics')", 60)
  if (lang === 'uk') {
    await ev("(()=>{const s=[...document.querySelectorAll('select')].find(x=>[...x.options].some(o=>o.value==='uk')); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(s,'uk'); s.dispatchEvent(new Event('change',{bubbles:true}))})()")
    await sleep(500)
  }
  if (optimize) {
    await ev("document.querySelector('button.primary').click()")
    done = await waitFor("document.querySelector('.runbar')?.textContent.match(/Finished|Завершено/) && !!document.querySelector('svg.chart polyline')", 400)
    await sleep(2500) // sweep worker
  }
  await sleep(600)
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log(done ? 'ready' : 'TIMED OUT', '→', out)
  if (errors.length) console.log('page errors:\n' + errors.join('\n'))
  ws.close()
} finally {
  chrome.kill()
}
