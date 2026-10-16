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

let stoppedAny = false
for (const [port, name] of Object.entries(PORTS)) {
  for (const pid of pidsOnPort(port)) {
    console.log(`[stop] ${name}: killing PID ${pid} (port ${port})`)
    stoppedAny = true
    if (win) spawnSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'inherit' })
    else spawnSync('kill', ['-9', pid], { stdio: 'inherit' })
  }
}

console.log(stoppedAny ? '[stop] done' : '[stop] nothing was running on ports 3000/4000/5173/8000/8010')
