#!/usr/bin/env node
// One start command for the whole workspace. Thin wrapper around the
// gateway's own start-all.mjs so it can be run from the repo root.
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const gatewayDir = join(here, '..', 'gateway')

const child = spawn(process.execPath, ['start-all.mjs'], {
  cwd: gatewayDir,
  stdio: 'inherit',
})

child.on('exit', (code) => process.exit(code ?? 0))
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
