import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EvidenceContractError,
  assertEvidenceValue,
  isGap,
  type EvidenceValue
} from '../src/lib/agriquill/contracts.ts';
import {
  DEMO_ENGINE,
  buildDemoSnapshot,
  computeInputHash,
  presentZones
} from '../src/lib/agriquill/snapshotAdapter.ts';
import { AYEYARWADY_DELTA_PARCEL, MAWLAMYINE_SHRIMP_PARCEL } from '../src/data/seedParcels.ts';
import { SEASON_DAYS } from '../src/lib/metrics.ts';

/* ---------------------------------------------------------------- determinism */

test('identical inputs produce a byte-identical snapshot', () => {
  const a = buildDemoSnapshot(AYEYARWADY_DELTA_PARCEL, 42);
  const b = buildDemoSnapshot(AYEYARWADY_DELTA_PARCEL, 42);
  assert.deepEqual(a, b, 'replay must reproduce the same snapshot, not a close one');
  assert.equal(a.runId, b.runId);
  assert.equal(a.inputHash, b.inputHash);
  assert.equal(a.timestamp, b.timestamp);
});

test('different days produce different input hashes', () => {
  const d42 = buildDemoSnapshot(AYEYARWADY_DELTA_PARCEL, 42);
  const d43 = buildDemoSnapshot(AYEYARWADY_DELTA_PARCEL, 43);
  assert.notEqual(d42.inputHash, d43.inputHash);
  assert.notEqual(d42.runId, d43.runId);
});

test('a different parcel produces a different input hash', () => {
  const delta = buildDemoSnapshot(AYEYARWADY_DELTA_PARCEL, 42);
  const shrimp = buildDemoSnapshot(MAWLAMYINE_SHRIMP_PARCEL, 42);
  assert.notEqual(delta.inputHash, shrimp.inputHash);
});

test('changing a zone stress reading changes the input hash', () => {
  const base = AYEYARWADY_DELTA_PARCEL;
  const perturbed = {
    ...base,
    zones: base.zones.map((z, i) => (i === 0 ? { ...z, stress: (z.stress ?? 0) + 0.01 } : z))
  };
  assert.notEqual(
    computeInputHash(base, 42, SEASON_DAYS),
    computeInputHash(perturbed, 42, SEASON_DAYS)
  );
});

test('the engine string matches the backend, so the two halves never disagree', () => {
  const snapshot = buildDemoSnapshot(AYEYARWADY_DELTA_PARCEL, 42);
  // backend/agriquill/sim.py:48 returns this exact string.
  assert.equal(snapshot.modelVersion, 'analytic-logistic-fixture');
  assert.equal(DEMO_ENGINE, 'analytic-logistic-fixture');
});

/* ------------------------------------------------------------------ day range */

test('day index is clamped to the season rather than accepted out of range', () => {
  assert.equal(buildDemoSnapshot(AYEYARWADY_DELTA_PARCEL, 0).dayIndex, 1);
  assert.equal(buildDemoSnapshot(AYEYARWADY_DELTA_PARCEL, -99).dayIndex, 1);
  assert.equal(buildDemoSnapshot(AYEYARWADY_DELTA_PARCEL, 9999).dayIndex, SEASON_DAYS);
});

/* ----------------------------------------------------------------- provenance */

test('every evidence value carries a unit, provenance, source and retrieval time', () => {
  const snapshot = buildDemoSnapshot(AYEYARWADY_DELTA_PARCEL, 42);
  const collect = (): EvidenceValue<number>[] => [
    snapshot.weatherState.airTempC as EvidenceValue<number>,
    snapshot.weatherState.rainfallMm as EvidenceValue<number>,
    snapshot.weatherState.windSpeedMs as EvidenceValue<number>,
    ...snapshot.zoneStates.flatMap((z) => [
      z.canopyFraction as EvidenceValue<number>,
      z.stressEvidence as EvidenceValue<number>,
      z.biomassTPerHa as EvidenceValue<number>,
      z.areaHa as EvidenceValue<number>
    ])
  ];

  for (const value of collect()) {
    assert.ok(value.unit.length > 0, 'every operational number needs a unit');
    assert.ok(value.provenance.length > 0, 'every operational number needs provenance');
    assert.ok(value.sourceId.length > 0, 'every operational number needs a traceable source');
    assert.ok(!Number.isNaN(Date.parse(value.retrievedAt)), 'retrieval time must be a real date');
    assert.equal(value.provenance, 'SIMULATED', 'the demo engine must not claim to be measured');
  }
});

test('the snapshot is marked uncalibrated', () => {
  assert.equal(buildDemoSnapshot(AYEYARWADY_DELTA_PARCEL, 42).calibrationStatus, 'UNCALIBRATED');
});

test('biomass uncertainty bounds are ordered and name their method', () => {
  for (const zone of buildDemoSnapshot(AYEYARWADY_DELTA_PARCEL, 42).zoneStates) {
    const band = (zone.biomassTPerHa as EvidenceValue<number>).uncertainty;
    assert.ok(band, 'biomass must state an uncertainty band');
    assert.ok(band.lower <= band.upper, 'uncertainty lower bound must not exceed upper');
    assert.ok(band.method.length > 0, 'an uncertainty band must say how it was produced');
  }
});

/* -------------------------------------------------------- absent evidence path */

test('a zone with no stress reading yields an INSUFFICIENT_EVIDENCE gap', () => {
  const snapshot = buildDemoSnapshot(MAWLAMYINE_SHRIMP_PARCEL, 42);
  const noData = snapshot.zoneStates.find((z) => z.stressIndex === null);
  assert.ok(noData, 'the shrimp fixture exists to exercise this path');

  assert.equal(isGap(noData.stressEvidence), true);
  const gapValue = noData.stressEvidence;
  if (!isGap(gapValue)) throw new Error('unreachable');
  assert.equal(gapValue.kind, 'INSUFFICIENT_EVIDENCE');
  assert.ok(gapValue.reason.length > 0, 'a gap must explain itself');
  assert.ok(
    gapValue.requestedMethod.length > 0,
    'a gap must say what evidence would close it'
  );
});

test('absence of stress is never replaced with a fabricated zero', () => {
  const snapshot = buildDemoSnapshot(MAWLAMYINE_SHRIMP_PARCEL, 42);
  const noData = snapshot.zoneStates.find((z) => z.stressIndex === null);
  assert.notEqual(noData?.stressIndex, 0, 'null must stay null, not collapse to zero');
});

test('gaps are surfaced in the zone limitations list', () => {
  const snapshot = buildDemoSnapshot(MAWLAMYINE_SHRIMP_PARCEL, 42);
  const noData = snapshot.zoneStates.find((z) => z.stressIndex === null);
  assert.ok(
    (noData?.limitations.length ?? 0) > 0,
    'a zone with missing evidence must say so rather than looking complete'
  );
});

/* ------------------------------------------------------- contract enforcement */

test('evidence without a unit is rejected', () => {
  const base = validEvidence();
  assert.throws(
    () => assertEvidenceValue('stress', { ...base, unit: '' }),
    EvidenceContractError
  );
});

test('evidence with an unknown provenance is rejected', () => {
  assert.throws(
    () => assertEvidenceValue('stress', { ...validEvidence(), provenance: 'GUESSED' }),
    EvidenceContractError
  );
});

test('evidence without a source id is rejected', () => {
  assert.throws(
    () => assertEvidenceValue('stress', { ...validEvidence(), sourceId: '' }),
    EvidenceContractError
  );
});

test('evidence with an unparseable retrieval time is rejected', () => {
  assert.throws(
    () => assertEvidenceValue('stress', { ...validEvidence(), retrievedAt: 'yesterday' }),
    EvidenceContractError
  );
});

test('an inverted uncertainty band is rejected', () => {
  assert.throws(
    () =>
      assertEvidenceValue('stress', {
        ...validEvidence(),
        uncertainty: { lower: 9, upper: 1, method: 'test' }
      }),
    EvidenceContractError,
    'lower above upper is a malformed band, not a wide one'
  );
});

test('a null value is rejected in favour of an explicit gap', () => {
  assert.throws(
    () => assertEvidenceValue('stress', { ...validEvidence(), value: null }),
    EvidenceContractError
  );
});

/* ----------------------------------------------------------- presentation map */

test('presentation values come from the snapshot, not from the day index', () => {
  const d30 = presentZones(buildDemoSnapshot(AYEYARWADY_DELTA_PARCEL, 30));
  const d90 = presentZones(buildDemoSnapshot(AYEYARWADY_DELTA_PARCEL, 90));

  const first = d30[0].canopyFraction;
  const later = d90[0].canopyFraction;
  assert.notEqual(first, later, 'canopy must advance with the snapshot');
  assert.ok(later > first, 'later in the season must not mean smaller canopy');
});

test('presentation preserves null stress instead of defaulting to zero', () => {
  const presented = presentZones(buildDemoSnapshot(MAWLAMYINE_SHRIMP_PARCEL, 42));
  const noData = presented.find((p) => p.stressIndex === null);
  assert.ok(noData, 'a zone with no evidence must stay visible as no-evidence');
});

test('canopy fraction stays inside 0..1 so instance scale cannot invert', () => {
  for (const day of [1, 15, 42, 80, 120]) {
    for (const zone of presentZones(buildDemoSnapshot(AYEYARWADY_DELTA_PARCEL, day))) {
      assert.ok(
        zone.canopyFraction > 0 && zone.canopyFraction <= 1,
        `canopy fraction ${zone.canopyFraction} at day ${day} is out of range`
      );
    }
  }
});

function validEvidence(): EvidenceValue<number> {
  return {
    value: 0.42,
    unit: 'index 0-1',
    provenance: 'SIMULATED',
    sourceId: 'test-fixture',
    retrievedAt: '2026-04-21T00:00:00.000Z',
    quality: 'ESTIMATED'
  };
}