/**
 * Rewrites text files as UTF-8 without BOM and with LF endings.
 *
 * Windows PowerShell 5.1 `Set-Content -Encoding utf8` emits a BOM and
 * Get-Content/Set-Content round-trips double-encode non-ASCII, which turned
 * every flag emoji and typographic mark in the source into mojibake. This
 * script is the fix and the guard: it decodes each file as UTF-8 and rewrites
 * it cleanly.
 *
 * Usage: node scripts/normalise-encoding.mjs [dir ...]
 */

import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const BOM = [0xef, 0xbb, 0xbf];
const EXT = new Set(['.ts', '.tsx', '.css', '.html', '.json', '.md', '.mjs', '.svg']);
const SKIP = new Set(['node_modules', 'dist', '.git', 'screenshots', '.opencode']);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (EXT.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Detect mojibake: UTF-8 bytes that were decoded as Latin-1 and re-encoded. */
function countMojibake(text) {
  const patterns = ['Ã¢', 'Ã©', 'Ã¨', 'Ã¤', 'Ã¶', 'Ã¼', 'Ã©', 'ðŸ', 'â€¢', 'â€¢', 'â€"', 'Ã—', 'Â·'];
  let total = 0;
  for (const p of patterns) total += text.split(p).length - 1;
  return total;
}

async function main() {
  const roots = process.argv.slice(2);
  const targets = roots.length ? roots : ['src', 'tests', 'scripts'];
  let fixed = 0;
  let inspected = 0;

  for (const root of targets) {
    let info;
    try {
      info = await stat(root);
    } catch {
      console.log(`skip (absent): ${root}`);
      continue;
    }
    const files = info.isDirectory() ? await walk(root) : [root];

    for (const file of files) {
      inspected += 1;
      const buffer = await readFile(file);
      const hadBom = BOM.every((b, i) => buffer[i] === b);
      let text = buffer.toString('utf8');
      text = stripBom(text);

      const moji = countMojibake(text);
      const crlf = text.includes('\r\n');
      const cleaned = text.replace(/\r\n/g, '\n');

      if (hadBom || crlf || moji > 0) {
        if (moji > 0) console.log(`  mojibake (${moji}) in ${file}`);
        await writeFile(file, cleaned, 'utf8');
        fixed += 1;
      }
    }
  }

  console.log(`\ninspected ${inspected} files, rewrote ${fixed}`);
}

main().catch(err => {
  console.error('encoding normalisation failed:', err);
  process.exit(1);
});