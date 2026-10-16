/**
 * Repairs mojibake: text that was UTF-8, wrongly decoded as Latin-1 (or
 * Windows-1252), then re-encoded as UTF-8. Reversing that means mapping the
 * string back through Latin-1 and decoding as UTF-8.
 *
 * Windows PowerShell 5.1 produced this damage across the source tree. The
 * normalise-encoding script detects it; this one fixes it in place.
 *
 * Usage: node scripts/repair-mojibake.mjs [dir ...]
 */

import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const EXT = new Set(['.ts', '.tsx', '.css', '.html', '.json', '.md', '.mjs', '.svg']);
const SKIP = new Set(['node_modules', 'dist', '.git', 'screenshots', '.opencode']);

// Two-character lead sequences produced by mis-decoding UTF-8 through cp1252,
// e.g. U+00C3 U+00A2 is 'â' from a real bullet.
const MARKERS = ['\u00C3', '\u00E2', '\u00F0', '\u00C2'];

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

function looksDamaged(text) {
  // Real source is mostly ASCII. Mojibake shows up as runs of U+0080-U+00FF
  // characters that are not legitimate typographic symbols.
  let suspicious = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    const isLegit =
      code === 0x00b0 || // degree
      code === 0x00b1 || // plus-minus
      code === 0x00b2 || // superscript two
      code === 0x00b7 || // middle dot
      code === 0x00b3 || // superscript three
      code === 0x00a9 || // copyright
      (code >= 0x2190 && code <= 0x21ff) || // arrows
      (code >= 0x2500 && code <= 0x257f) || // box drawing
      (code >= 0x25a0 && code <= 0x25ff) || // geometric
      (code >= 0x2600 && code <= 0x27bf);   // misc symbols incl. flag emoji
    if (code >= 0x00c0 && code <= 0x00ff && !isLegit) suspicious += 1;
  }
  return suspicious >= 2 && MARKERS.some(m => text.includes(m));
}

function repair(text) {
  // Map each code point back to a single byte, then read those bytes as UTF-8.
  const bytes = [];
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code <= 0xff) {
      bytes.push(code);
    } else {
      // Characters outside Latin-1 are already correct (real emoji, dashes).
      return text;
    }
  }
  const buf = Buffer.from(bytes);
  const decoded = buf.toString('utf8');
  // If re-decoding yields replacement characters we did not improve anything.
  return decoded.includes('\ufffd') ? text : decoded;
}

async function main() {
  const roots = process.argv.slice(2);
  const targets = roots.length ? roots : ['src', 'tests'];
  let fixed = 0;

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
      const raw = await readFile(file, 'utf8');
      const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
      if (!looksDamaged(text)) continue;

      const repaired = repair(text);
      if (repaired !== text) {
        await writeFile(file, repaired.replace(/\r\n/g, '\n'), 'utf8');
        console.log(`  repaired ${file}`);
        fixed += 1;
      }
    }
  }

  console.log(`\nrepaired ${fixed} files`);
}

main().catch(err => {
  console.error('mojibake repair failed:', err);
  process.exit(1);
});