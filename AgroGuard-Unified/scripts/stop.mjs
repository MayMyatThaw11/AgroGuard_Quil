#!/usr/bin/env node
// One stop command. Ctrl+C on `start.mjs` already stops everything cleanly;
// this exists for when a terminal was closed instead of Ctrl+C'd and
// processes were orphaned — it finds whatever is listening on this
// workspace's five known ports and stops it, logging what it found.
import { execSync, spawnSync } from 'node:child_process'

const PORTS = {
  4000: 'gateway',
  5173: 'agroguard-web',
  8000: 'agroguard-api',
  3000: 'agriquill-ide',
  8010: 'agriquill-api',
}

const win = process.platform === 'win32'

function pidsOnPort(port) {
  if (!win) {
    try {
      return execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' }).split(/\s+/).filter(Boolean)
    } catch {
      return []
    }
  }
  try {
    const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8' })
    return [...new Set(out.split(/\r?\n/).filter(Boolean).map((line) => line.trim().split(/\s+/).pop()))]
  } catch {
    return []
  }
}

// uvicorn --reload serves from a spawned worker, but Windows reports the
// listening socket under the reloader's PID. If the reloader already died,
// `taskkill /T` on it can't walk the tree any more and the orphaned worker
// keeps serving stale code — so also kill anything whose parent is that PID.
function childPids(pid) {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'ParentProcessId=${pid}' | ForEach-Object ProcessId"`,
      { encoding: 'utf8' },
    )
    return out.split(/\s+/).filter(Boolean)
  } catch {
    return []
  }
}

let stoppedAny = false
for (const [port, name] of Object.entries(PORTS)) {
  for (const pid of pidsOnPort(port)) {
    console.log(`[stop] ${name}: killing PID ${pid} (port ${port})`)
    stoppedAny = true
    if (win) {
      const orphans = childPids(pid)
      spawnSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'inherit' })
      for (const child of orphans) spawnSync('taskkill', ['/PID', child, '/T', '/F'], { stdio: 'ignore' })
    } else {
      spawnSync('kill', ['-9', pid], { stdio: 'inherit' })
    }
  }
}

console.log(stoppedAny ? '[stop] done' : '[stop] nothing was running on ports 3000/4000/5173/8000/8010')
