// Starts both existing applications, each with its own unchanged start command,
// plus the landing page. Only the AgriQill API port differs from its dev:full
// default (8010 instead of 8000), because AgroGuard's frontend proxy is fixed to
// localhost:8000. AgriQill's Vite proxy reads AGRIQUILL_API_TARGET for this.
import { existsSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { here, loadConfig } from './config.mjs'

const { apps } = loadConfig()
const win = process.platform === 'win32'
const agriquillBackend = join(apps.agriquill.projectDir, 'backend')
const venvPython = resolve(here, '.venv-agriquill', win ? 'Scripts/python.exe' : 'bin/python')
const agriquillPython = process.env.AGRIQUILL_PYTHON || (existsSync(venvPython) ? venvPython : 'python')
const agriquillApiTarget = `http://127.0.0.1:${apps.agriquill.apiPort}`

const processes = [
  {
    name: 'agroguard',
    // AgroGuard's own root script: FastAPI on :8000 and Vite on :5173.
    command: 'npm', args: ['run', 'dev'], cwd: apps.agroguard.projectDir, shell: win,
  },
  {
    name: 'agriquill-api',
    command: agriquillPython,
    args: ['-m', 'uvicorn', 'agriquill.api.main:app', '--host', '127.0.0.1', '--port', String(apps.agriquill.apiPort)],
    cwd: agriquillBackend,
  },
  {
    name: 'agriquill-ide',
    // AgriQill's own IDE script: Vite on :3000 (strictPort).
    command: 'npm', args: ['run', 'dev', '--workspace=agriquill-ide'], cwd: apps.agriquill.projectDir, shell: win,
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
