import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLEET_CSV_COLUMNS, rowsToCsv } from '../src/lib/fleetExport.ts';
import { withStatus } from '../src/lib/fleetQuery.ts';
import { getFleet } from '../src/data/fleet/fleetFields.ts';

test('Fleet export: the header lists every column in order', () => {
  const csv = rowsToCsv([]);
  assert.equal(csv, `${FLEET_CSV_COLUMNS.map((column) => column.label).join(',')}\n`);
  assert.ok(FLEET_CSV_COLUMNS.some((column) => column.label === 'Lowest ahead (cm)'));
});

test('Fleet export: one line per row with the status and numeric values', () => {
  const rows = withStatus(getFleet().fields.slice(0, 3), -15);
  const lines = rowsToCsv(rows).trimEnd().split('\n');
  assert.equal(lines.length, 4);
  assert.ok(lines[1].startsWith(rows[0].id));
  assert.ok(lines[1].includes(String(rows[0].low)));
  assert.ok(lines[1].includes(rows[0].status));
});

test('Fleet export: values with commas or quotes are quoted and escaped', () => {
  const [row] = withStatus(getFleet().fields.slice(0, 1), -15);
  const tricky = { ...row, coop: 'Maubin, "North" Coop' };
  const line = rowsToCsv([tricky]).trimEnd().split('\n')[1];
  assert.ok(line.includes('"Maubin, ""North"" Coop"'));
});

test('Fleet export: the shared fleet is built once', () => {
  assert.equal(getFleet(), getFleet());
  assert.equal(getFleet().fields.length, 3600);
});
