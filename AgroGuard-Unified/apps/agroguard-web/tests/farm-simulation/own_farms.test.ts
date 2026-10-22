import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContractSpec } from '../../src/features/farm-simulation/lib/contractFarm.ts';
import {
  contractFeatures,
  farmCentroid,
  advisoryLitres,
  linkedField,
  nationalHarvest,
  pawSanHarvest,
  paddyInputs,
  parcelStatuses,
  readAgroguardLocal,
  replicaStatus,
  setLinkedField,
} from '../../src/features/farm-simulation/lib/farmmap/ownFarms.ts';

const NOW = new Date('2026-10-22T06:00:00Z');

function spec(boundaries: ([number, number][] | null)[]): ContractSpec {
  return {
    farm: { id: 'my-farm', name: 'My Farm', country: 'Myanmar', location: [19.75, 96.13], standard: null },
    parcels: boundaries.map((boundary, i) => ({ id: `P${i + 1}`, area_ha: 1.2, boundary })),
    assets: [],
  };
}

const SQUARE: [number, number][] = [[19.75, 96.13], [19.75, 96.14], [19.76, 96.14], [19.76, 96.13], [19.75, 96.13]];

function memory(entries: Record<string, string> = {}) {
  const data = new Map(Object.entries(entries));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

test('a closed [lat, lon] boundary becomes a GeoJSON [lon, lat] polygon per parcel', () => {
  const fc = contractFeatures('my-farm', spec([SQUARE]), { P1: 'watch' });
  assert.equal(fc.polygons.length, 1);
  const ring = fc.polygons[0].geometry.coordinates[0];
  assert.deepEqual(ring[0], [96.13, 19.75]);
  assert.deepEqual(ring[1], [96.14, 19.75]);
  assert.equal(fc.polygons[0].properties.parcel, 'P1');
  assert.equal(fc.polygons[0].properties.status, 'watch');
  assert.equal(fc.polygons[0].properties.kind, 'Your farm');
  assert.equal(contractFeatures('demo', spec([SQUARE]), {}, true).polygons[0].properties.kind, 'Demo farm');
  assert.equal(fc.points.length, 0);
});

test('an open or missing ring is skipped and the farm falls back to its declared location', () => {
  const open = SQUARE.slice(0, 4);
  const fc = contractFeatures('my-farm', spec([open, null]), {});
  assert.equal(fc.polygons.length, 0);
  assert.equal(fc.points.length, 1);
  assert.deepEqual(fc.points[0].geometry.coordinates, [96.13, 19.75]);
  assert.equal(fc.points[0].properties.status, 'unknown');
});

test('the farm centroid comes from the boundary corners, not the closing duplicate', () => {
  const c = farmCentroid(spec([SQUARE]));
  assert.ok(c);
  assert.ok(Math.abs(c.lat - 19.755) < 1e-9 && Math.abs(c.lon - 96.135) < 1e-9);
  assert.deepEqual(farmCentroid({ ...spec([null]), farm: { ...spec([]).farm, location: null } }), null);
});

test('no input at all is unknown with every reason named, never ok', () => {
  const out = replicaStatus({ assessment: null, activeDevices: null, paddies: [], now: NOW });
  assert.equal(out.status, 'unknown');
  assert.ok(out.reasons.some((r) => r.includes('tube reading')));
  assert.ok(out.reasons.some((r) => r.includes('AgroGuard field')));
});

test('a critical linked assessment or a depth below the AWD floor is risk', () => {
  const fresh = '2026-10-22T05:30:00Z';
  assert.equal(replicaStatus({ assessment: { status: 'critical', createdAt: fresh }, activeDevices: 1, paddies: [], now: NOW }).status, 'risk');
  const deep = replicaStatus({ assessment: null, activeDevices: null, paddies: [{ id: 'P1', depthCm: -16, flags: [], conflicting: false }], now: NOW });
  assert.equal(deep.status, 'risk');
  assert.ok(deep.reasons.some((r) => r.includes('-16')));
});

test('a warning, a recent Kalman flag or conflicting readings is watch', () => {
  const fresh = '2026-10-22T05:30:00Z';
  assert.equal(replicaStatus({ assessment: { status: 'warning', createdAt: fresh }, activeDevices: 1, paddies: [], now: NOW }).status, 'watch');
  const flagged = { id: 'P1', depthCm: 2, flags: [{ observed_at: '2026-10-21T10:00:00+00:00' }], conflicting: false };
  assert.equal(replicaStatus({ assessment: null, activeDevices: null, paddies: [flagged], now: NOW }).status, 'watch');
  const oldFlag = { ...flagged, flags: [{ observed_at: '2026-10-10T10:00:00+00:00' }] };
  assert.equal(replicaStatus({ assessment: null, activeDevices: null, paddies: [oldFlag], now: NOW }).status, 'ok');
  const conflict = { id: 'P1', depthCm: null, flags: [], conflicting: true };
  assert.equal(replicaStatus({ assessment: null, activeDevices: null, paddies: [conflict], now: NOW }).status, 'watch');
});

test('a healthy fresh assessment with an active device is ok', () => {
  const out = replicaStatus({ assessment: { status: 'healthy', createdAt: '2026-10-22T05:30:00Z' }, activeDevices: 1, paddies: [], now: NOW });
  assert.equal(out.status, 'ok');
  assert.ok(out.reasons[0].startsWith('Based only on: linked AgroGuard assessment is healthy'));
  assert.ok(out.reasons.some((r) => r === 'Not checked: no tube reading on any parcel'));
});

test('a stale assessment or one with no active device is ignored, not trusted', () => {
  const stale = replicaStatus({ assessment: { status: 'critical', createdAt: '2026-10-15T05:30:00Z' }, activeDevices: 1, paddies: [], now: NOW });
  assert.equal(stale.status, 'unknown');
  assert.ok(stale.reasons.some((r) => r.includes('older than 72 h')));
  const noDevice = replicaStatus({ assessment: { status: 'critical', createdAt: '2026-10-22T05:30:00Z' }, activeDevices: 0, paddies: [], now: NOW });
  assert.equal(noDevice.status, 'unknown');
  assert.ok(noDevice.reasons.some((r) => r.includes('no active device')));
});

test('AgroGuard local results are read back and malformed values become null', () => {
  const store = memory({
    'agroguard.lastCropConditions': JSON.stringify({ soil_pH: 6.1, rainfall_mm: 1300, temperature_c: 27, crop: 'Rice', capturedAt: '2026-10-22T05:00:00Z' }),
    'agroguard.lastWaterAdvisory': JSON.stringify({ status: 'irrigate', netDepthMm: 12.5, capturedAt: '2026-10-22T05:10:00Z' }),
  });
  const out = readAgroguardLocal(store);
  assert.equal(out.crop?.crop, 'Rice');
  assert.equal(out.crop?.soilPh, 6.1);
  assert.equal(out.advisory?.status, 'irrigate');
  assert.equal(out.advisory?.netDepthMm, 12.5);
  const broken = readAgroguardLocal(memory({ 'agroguard.lastCropConditions': '{', 'agroguard.lastWaterAdvisory': JSON.stringify({ status: 3 }) }));
  assert.equal(broken.crop, null);
  assert.equal(broken.advisory, null);
});

test('reading local results never throws when storage is blocked', () => {
  const blocked = { getItem: () => { throw new Error('blocked'); } };
  assert.deepEqual(readAgroguardLocal(blocked), { crop: null, advisory: null });
  assert.equal(linkedField(blocked, 'my-farm'), null);
});

test('the AgroGuard field link is explicit per farm and can be cleared', () => {
  const store = memory();
  assert.equal(linkedField(store, 'my-farm'), null);
  setLinkedField(store, 'my-farm', 1);
  assert.equal(linkedField(store, 'my-farm'), 1);
  assert.equal(linkedField(store, 'other'), null);
  setLinkedField(store, 'my-farm', null);
  assert.equal(linkedField(store, 'my-farm'), null);
});

test('monitoring paddies map to status inputs and conflicting readings are recognised', () => {
  const inputs = paddyInputs({
    farm_id: 'my-farm',
    status: 'OK',
    paddies: [
      { id: 'P1', scout: null, model: { depth_cm: -3, sigma_cm: 0.6, source: 'MEASURED', flags: [], series: [], series_dates: [], band: null, band_dates: [] }, missing: [] },
      { id: 'P2', scout: null, model: null, missing: [{ field: 'water_depth', reason: 'unknown: conflicting readings' }] },
      { id: 'P3', scout: null, model: null, missing: [{ field: 'water_depth', reason: 'no reading from P3-tube' }] },
    ],
  });
  assert.deepEqual(inputs.map((p) => [p.id, p.depthCm, p.conflicting]), [['P1', -3, false], ['P2', null, true], ['P3', null, false]]);
  assert.deepEqual(paddyInputs(null), []);
});

test('each parcel is coloured from its own reading, the farm from all of them', () => {
  const s = spec([SQUARE, SQUARE]);
  const paddies = [{ id: 'P1', depthCm: -20, flags: [], conflicting: false }];
  const out = parcelStatuses(s, { assessment: null, activeDevices: null, now: NOW }, paddies);
  assert.equal(out.P1, 'risk');
  assert.equal(out.P2, 'unknown');
  assert.equal(out[''], 'risk');
});

const advisory = (netDepthMm: number | null, fieldId: number | null) => ({
  status: 'irrigate', reasonCode: null, reason: null, dataQuality: 'high', netDepthMm, mode: 'upland', cropType: 'rice', fieldId, capturedAt: NOW.toISOString(),
});

test('net water to add is the advisory deficit over the boundary area (1 mm on 1 m2 is 1 L)', () => {
  const out = advisoryLitres(advisory(36, 1), 1, 4.26);
  assert.ok(out.litres !== null);
  assert.equal(out.litres, 36 * 42600);
  assert.equal(out.reason, null);
});

test('litres stay null with a reason when the advice was made for another field', () => {
  assert.deepEqual(advisoryLitres(advisory(36, 2), 1, 4.26), { litres: null, reason: 'the water advice was made for AgroGuard field 2, not the linked field 1' });
  assert.equal(advisoryLitres(advisory(36, 1), null, 4.26).reason, 'link the AgroGuard field the water advice was made for');
  assert.equal(advisoryLitres(advisory(null, 1), 1, 4.26).reason, 'the water advice computed no deficit');
  assert.equal(advisoryLitres(null, 1, 4.26).reason, 'no water advice saved in this browser');
  assert.equal(advisoryLitres(advisory(36, 1), 1, 0).reason, 'the boundary has no measured area');
});

test('a harvest range is given only for Paw San, from the plan range 2.6 to 3.37 t/ha', () => {
  const s = spec([SQUARE, SQUARE]);
  s.parcels[0].crop = 'Paw San Hmwe';
  s.parcels[0].area_ha = 2;
  s.parcels[1].crop = 'Sin Thu Kha';
  const out = pawSanHarvest(s);
  assert.ok(out);
  assert.equal(out.areaHa, 2);
  assert.deepEqual([out.lowT, out.highT], [5.2, 6.74]);
  s.parcels[0].crop = null;
  assert.equal(pawSanHarvest(s), null);
});

test('national harvest adds only parcels with a FAOSTAT range and keeps unknown ones out', () => {
  const ref = {
    farm_id: 'f',
    country: 'THA',
    country_name: 'Thailand',
    note: '',
    parcels: [
      { parcel: 'a', crop: 'rice', tonnes: [2.26, 2.38] as [number, number], area_ha: 0.8, yield: { t_ha: 2.98, year: 2024 } },
      { parcel: 'b', crop: 'rice', tonnes: [10, 12] as [number, number], area_ha: 4, yield: { t_ha: 2.98, year: 2024 } },
      { parcel: 'c', crop: 'strawberry', tonnes: null, reason: 'crop not matched to a FAOSTAT item' },
    ],
  };
  assert.deepEqual(nationalHarvest(ref), { areaHa: 4.8, lowT: 12.26, highT: 14.38, year: 2024 });
  assert.equal(nationalHarvest({ ...ref, parcels: [ref.parcels[2]] }), null);
  assert.equal(nationalHarvest(null), null);
});
