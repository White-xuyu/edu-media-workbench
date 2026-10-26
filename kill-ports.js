// Make the launcher idempotent: free our ports before starting, so a second
// double-click never leaves the browser pointed at a stale half-dead instance.
const { execSync } = require('child_process')

const PORTS = [3001, 4000, 5173]

function pidsOnPort(port) {
  try {
    const out = execSync(`netstat -ano -p TCP`, { encoding: 'utf8', windowsHide: true })
    const pids = new Set()
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/^\s*TCP\s+(\S+):(\d+)\s+(\S+)\s+LISTENING\s+(\d+)\s*$/i)
      if (m && Number(m[2]) === port) pids.add(Number(m[4]))
    }
    return [...pids]
  } catch {
    return []
  }
}

let killed = 0
for (const port of PORTS) {
  for (const pid of pidsOnPort(port)) {
    if (pid === 0 || pid === process.pid) continue
    try {
      execSync(`taskkill /PID ${pid} /T /F`, { encoding: 'utf8', windowsHide: true })
      process.stdout.write(`  freed port ${port} (pid ${pid})\n`)
      killed++
    } catch {
      // already gone or protected - ignore
    }
  }
}
process.stdout.write(killed ? '' : '  no stale instance found\n')
