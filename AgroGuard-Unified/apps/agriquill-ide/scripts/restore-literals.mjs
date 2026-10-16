/**
 * Restores two literal classes that were destroyed by the PowerShell
 * encoding round-trip and cannot be recovered by re-decoding, because the
 * original multi-byte sequences were written as single bytes:
 *
 *   1. The 11 regional-indicator flag emoji in src/data/presets.ts
 *   2. The middle dot U+00B7, which appears as a stray latin-1 lead byte
 *
 * Values are written with \\u escapes so this script is itself immune to
 * whatever shell pipeline runs it.
 *
 * Usage: node scripts/restore-literals.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PRESETS = path.resolve('src/data/presets.ts');

// Canonical flags in the order the presets are declared.
const FLAGS = [
  '🇲🇲', // Myanmar
  '🇹🇭', // Thailand
  '🇻🇳', // Vietnam
  '🇮🇩', // Indonesia
  '🇲🇾', // Malaysia
  '🇵🇭', // Philippines
  '🇰🇭', // Cambodia
  '🇱🇦', // Laos
  '🇧🇳', // Brunei
  '🇸🇬', // Singapore
  '🇹🇱' // Timor-Leste
];

// U+00B7 middle dot, the character the handoff used as a separator.
const DOT = '\u00B7';

const TARGETS = [
  'src/components/SpatialCanvas.tsx',
  'src/components/Sidebar.tsx',
  'src/components/Header.tsx',
  'src/components/CodeEditor.tsx',
  'src/components/BrainVault.tsx',
  'src/components/BottomDock.tsx',
  'src/components/CommandPalette.tsx',
  'src/components/WorkflowDAG.tsx',
  'src/components/RightCopilotHUD.tsx',
  'src/components/GitLedger.tsx',
  'src/components/IntuitiveTourModal.tsx',
  'src/App.tsx'
];

async function restoreFlags() {
  const text = await readFile(PRESETS, 'utf8');
  const lines = text.split('\n');
  let index = 0;
  let replaced = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const match = /^(\s*flag:\s*)'(.*)',\s*$/.exec(lines[i]);
    if (!match) continue;
    const flag = FLAGS[index];
    if (!flag) {
      throw new Error(`more flag entries than expected at line ${i + 1}`);
    }
    lines[i] = `${match[1]}'${flag}',`;
    index += 1;
    replaced += 1;
  }

  if (index !== FLAGS.length) {
    throw new Error(`found ${index} flag entries, expected ${FLAGS.length}`);
  }

  await writeFile(PRESETS, lines.join('\n'), 'utf8');
  console.log(`restored ${replaced} flag emoji in src/data/presets.ts`);
}

async function restoreDots() {
  let total = 0;

  for (const rel of TARGETS) {
    let text;
    try {
      text = await readFile(rel, 'utf8');
    } catch {
      continue;
    }

    const original = text;

    // Any run of latin-1 high bytes sitting where a middle dot belongs is
    // a corrupted separator. Collapse each run to a single U+00B7.
    text = text.replace(/[\u0080-\u00ff]{1,3}(?=\s|$|[A-Za-z(])/g, match => {
      // Only substitute when the run is not part of a valid word.
      if (/[\u00c0-\u00ff]/.test(match)) return DOT;
      return match;
    });

    if (text !== original) {
      await writeFile(rel, text, 'utf8');
      const n = text.split(DOT).length - original.split(DOT).length;
      total += n;
      console.log(`  ${rel}: ${n} separator(s) restored`);
    }
  }

  console.log(`restored ${total} middle dots`);
}

async function main() {
  await restoreFlags();
  await restoreDots();
}

main().catch(err => {
  console.error('literal restoration failed:', err);
  process.exit(1);
});