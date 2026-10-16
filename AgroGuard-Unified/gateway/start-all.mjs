// Starts both applications (frontend + backend each) plus the landing page.
// Unlike the pre-merge two-repo layout, AgroGuard's frontend and backend now
// live in separate top-level directories (apps/agroguard-web,
// backend/agroguard), so each needs its own process instead of one combined
// root "npm run dev". AgriQill's API runs on :8010 (not its :8000 default)
// because AgroGuard's frontend proxy is fixed to :8000; AGRIQUILL_API_TARGET
// carries that to AgriQill's Vite proxy.
import { existsSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { here, loadConfig } from './config.mjs'

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

const processes = [
  {
    name: 'agroguard-web',
    command: 'npm', args: ['run', 'dev'], cwd: apps.agroguard.frontendDir, shell: win,
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
  },
  {
    name: 'agriquill-ide',
    command: 'npm', args: ['run', 'dev'], cwd: apps.agriquill.frontendDir, shell: win,
    env: { AGRIQUILL_API_TARGET: agriquillApiTarget },
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
