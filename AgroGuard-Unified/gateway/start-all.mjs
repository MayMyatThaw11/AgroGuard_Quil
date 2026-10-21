// Starts AgroGuard's frontend, both backends and the landing page.
// AgroGuard's frontend and backend live in separate top-level directories
// (apps/agroguard-web, backend/agroguard), so each needs its own process.
// Farm Simulation (formerly the separate AgriQill IDE) is a page inside
// AgroGuard's frontend, so it has no frontend process of its own; only its
// API runs here, on :8010 (not its :8000 default) because AgroGuard's API
// already uses :8000. AGRIQUILL_API_TARGET carries that port to AgroGuard's
// Vite proxy (see apps/agroguard-web/vite.farm-simulation.js).
import { existsSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { connect } from 'node:net'
import { join, resolve } from 'node:path'
import { here, loadConfig, probe } from './config.mjs'

const { apps } = loadConfig()
const win = process.platform === 'win32'

// Never falls back to a bare "python" on PATH — that silently runs whatever
// global interpreter happens to be installed, missing this backend's
// dependencies (e.g. paramiko), and fails confusingly deep inside uvicorn
// instead of here. Resolution order: an explicit env var (settable in
// gateway/.env, gitignored — see .env.example) wins if set, but it must
// point at a real interpreter or this fails loudly; otherwise this backend's
// own local .venv is used; if neither exists, this fails loudly too.
function resolvePython(name, envVar, backendDir) {
  const configured = process.env[envVar]
  if (configured) {
    if (!existsSync(configured)) {
      console.error(
        `[setup] ${envVar}="${configured}" (from gateway/.env or your shell) does not exist.\n` +
          `        Fix the path, or remove it to fall back to ${backendDir}'s own .venv.`,
      )
      process.exit(1)
    }
    return configured
  }
  const venvPython = resolve(backendDir, '.venv', win ? 'Scripts/python.exe' : 'bin/python')
  if (existsSync(venvPython)) return venvPython
  console.error(
    `[setup] No Python interpreter found for ${name}.\n` +
      `        Expected a venv at ${venvPython} (see README "One-time setup"),\n` +
      `        or set ${envVar} in gateway/.env to an existing interpreter (see gateway/.env.example).`,
  )
  process.exit(1)
}

const agroguardPython = resolvePython('agroguard', 'AGROGUARD_PYTHON', apps.agroguard.backendDir)
const agriquillPython = resolvePython('agriquill', 'AGRIQUILL_PYTHON', apps.agriquill.backendDir)
console.log(`[setup] agroguard interpreter: ${agroguardPython}`)
console.log(`[setup] agriquill interpreter: ${agriquillPython}`)
const agriquillApiTarget = `http://127.0.0.1:${apps.agriquill.apiPort}`

// Plant disease detection is its own service (the 5-group classifier in the
// AgroGuard repo's plant_disease_detection/), started separately on :8001.
// This workspace only proxies to it, so warn rather than fail when it's down:
// everything else still works, only disease detection reports it unreachable.
const disease = await probe(apps.agroguard.diseaseApiUrl)
console.log(
  disease.up
    ? `[setup] disease detection service: ${apps.agroguard.diseaseApiUrl} is up`
    : `[setup] WARNING disease detection service not reachable at ${apps.agroguard.diseaseApiUrl}.\n` +
        '        Start it from AgroGuard/plant_disease_detection: uvicorn app.main:app --port 8001 --reload',
)

function portOpen(port, host = '127.0.0.1') {
  return new Promise((done) => {
    const socket = connect({ host, port, timeout: 1500 })
    socket.once('connect', () => { socket.destroy(); done(true) })
    socket.once('timeout', () => { socket.destroy(); done(false) })
    socket.once('error', () => done(false))
  })
}

// Fail fast, with the fix, if a previous run is still holding one of our
// ports — otherwise one child dies with a raw EADDRINUSE stack trace and
// takes the rest down with it. Vite's "localhost" may bind IPv6 only, so
// check both loopback addresses.
const OWN_PORTS = { 5173: 'agroguard-web', 8000: 'agroguard-api', [apps.agriquill.apiPort]: 'agriquill-api', 4000: 'gateway' }
const busy = []
for (const [port, name] of Object.entries(OWN_PORTS)) {
  if ((await portOpen(Number(port))) || (await portOpen(Number(port), '::1'))) busy.push(`${port} (${name})`)
}
if (busy.length) {
  console.error(
    `[setup] Already in use: ${busy.join(', ')}.\n` +
      '        Another copy of this workspace (or another app) is still running.\n' +
      '        Stop it with `npm run stop`, then run `npm run start` again.',
  )
  process.exit(1)
}

// Health updates (photos + K-means masks) live in MongoDB. Like the disease
// service it runs outside these processes, so warn instead of failing.
const mongoUp = await portOpen(27017)
console.log(
  mongoUp
    ? '[setup] MongoDB (health updates): 127.0.0.1:27017 is up'
    : '[setup] WARNING MongoDB not reachable on 127.0.0.1:27017 — Health Updates will not save.\n' +
        '        Start it from the workspace root: docker compose up -d mongo',
)

const processes = [
  {
    name: 'agroguard-web',
    command: 'npm', args: ['run', 'dev'], cwd: apps.agroguard.frontendDir, shell: win,
    env: { AGRIQUILL_API_TARGET: agriquillApiTarget },
  },
  {
    name: 'agroguard-api',
    command: agroguardPython,
    args: ['-m', 'uvicorn', 'app.main:app', '--reload', '--host', '127.0.0.1', '--port', '8000'],
    cwd: apps.agroguard.backendDir,
  },
  {
    name: 'agriquill-api',
    command: agriquillPython,
    args: ['-m', 'uvicorn', 'agriquill.api.main:app', '--host', '127.0.0.1', '--port', String(apps.agriquill.apiPort)],
    cwd: apps.agriquill.backendDir,
    // The API defaults to production, which has no built-in demo sign-in and
    // refuses to start with no users configured. This launcher is local
    // development, so say so unless the shell or gateway/.env already sets it.
    env: { AGRIQUILL_ENVIRONMENT: process.env.AGRIQUILL_ENVIRONMENT ?? 'development' },
  },
  { name: 'gateway', command: process.execPath, args: [join(here, 'server.mjs')], cwd: here },
]

const children = []
let stopping = false

function prefix(name, stream, target) {
  let buffer = ''
  stream.on('data', (chunk) => {
    buffer += chunk
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop()
    for (const line of lines) target.write(`[${name}] ${line}\n`)
  })
}

function stopAll(code) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (child.exitCode !== null) continue
    // With a shell on Windows, kill() would only end cmd.exe; end the whole tree.
    if (win) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else child.kill('SIGTERM')
  }
  process.exit(code)
}

for (const spec of processes) {
  const child = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    shell: spec.shell ?? false,
    env: { ...process.env, ...spec.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  prefix(spec.name, child.stdout, process.stdout)
  prefix(spec.name, child.stderr, process.stderr)
  child.on('error', (error) => console.error(`[${spec.name}] failed to start: ${error.message}`))
  child.on('exit', (code) => {
    console.error(`[${spec.name}] exited with code ${code}`)
    stopAll(code ?? 1)
  })
  children.push(child)
}

process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))
