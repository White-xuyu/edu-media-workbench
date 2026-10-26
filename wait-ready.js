// Boot gate: poll all three local services until they actually answer,
// so the launcher never opens the browser before the apps are usable.
const http = require('http')

const TARGETS = [
  { name: 'Platform Backend ', port: 3001, path: '/api/health' },
  { name: 'Platform Frontend', port: 5173, path: '/' },
  { name: 'Media Workbench  ', port: 4000, path: '/' },
]

const TIMEOUT_PER_REQ = 3000
const MAX_WAIT_SEC = 120

function check(t) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port: t.port, path: t.path, method: 'GET', timeout: TIMEOUT_PER_REQ },
      (res) => {
        res.resume()
        resolve(res.statusCode >= 200 && res.statusCode < 500)
      },
    )
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.on('error', () => resolve(false))
    req.end()
  })
}

;(async () => {
  const deadline = Date.now() + MAX_WAIT_SEC * 1000
  const state = new Map(TARGETS.map((t) => [t.name, false]))

  while (Date.now() < deadline) {
    const results = await Promise.all(
      TARGETS.map(async (t) => {
        const ok = await check(t)
        state.set(t.name, ok)
        return { t, ok }
      }),
    )

    const pending = results.filter((r) => !r.ok)
    for (const r of results) {
      if (r.ok) process.stdout.write(`  [OK]   ${r.t.name}  :${r.t.port}\n`)
    }
    if (pending.length === 0) {
      process.stdout.write('\nAll services are ready.\n')
      process.exit(0)
    }
    process.stdout.write(`  ...waiting for ${pending.map((p) => p.t.port).join(', ')}\n`)
    await new Promise((r) => setTimeout(r, 1000))
  }

  process.stdout.write('\nTIMEOUT: some services did not start. Opening browser anyway.\n')
  process.exit(1)
})()
