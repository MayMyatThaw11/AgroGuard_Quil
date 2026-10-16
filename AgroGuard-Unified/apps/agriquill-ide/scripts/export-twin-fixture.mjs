import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildFixture } from '../src/lib/livetwin/twinFixture.ts';

const out = resolve(process.argv[2] ?? '../../../../backend/tests/data/twin_fixture_ts.json');
const today = process.argv[3] ?? '2026-10-12';
const { farms, fleet } = buildFixture(100, new Date(`${today}T12:00:00Z`));
writeFileSync(out, `${JSON.stringify({ today, farms, fleet })}\n`);
console.log(`${farms.length} farms, ${fleet.length} machines -> ${out}`);
