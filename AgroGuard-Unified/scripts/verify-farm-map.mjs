#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const api = join(root, 'backend', 'agriquill')
const web = join(root, 'apps', 'agroguard-web')
const venv = join(api, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
const python = existsSync(venv) ? venv : 'python'

const steps = [
  ['hook self-test', 'node', ['.claude/hooks/block-dangerous-command.mjs', '--self-test'], root],
  ['backend tests', python, ['-m', 'pytest', '-q', '-p', 'no:warnings'], api],
  ['backend lint', python, ['-m', 'ruff', 'check', 'agriquill', 'tests'], api],
  ['frontend typecheck', 'npm', ['run', 'typecheck'], web],
  ['frontend tests', 'npm', ['run', 'test:farm-sim'], web],
]

const failed = []
for (const [name, cmd, args, cwd] of steps) {
  console.log(`\n[verify] ${name}`)
  const run = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (run.status !== 0) failed.push(name)
}

console.log(failed.length ? `\n[verify] failed: ${failed.join(', ')}` : '\n[verify] all passed')
process.exit(failed.length ? 1 : 0)
