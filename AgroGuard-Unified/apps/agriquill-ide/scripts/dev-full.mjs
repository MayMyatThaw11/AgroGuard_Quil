import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ide = resolve(here, '..');
const backend = resolve(ide, '../../../../backend');
const python = process.env.AGRIQUILL_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
const shell = process.platform === 'win32';

const children = [
  spawn(python, ['-m', 'uvicorn', 'agriquill.api.main:app', '--host', '0.0.0.0', '--port', '8000'], {
    cwd: backend,
    stdio: 'inherit',
  }),
  spawn('npx', ['vite', '--host', '0.0.0.0', '--port', '3000'], { cwd: ide, stdio: 'inherit', shell }),
];

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exit(code ?? 0);
}

for (const child of children) child.on('exit', (code) => stop(code ?? 1));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
