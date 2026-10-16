import assert from 'node:assert/strict';
import test from 'node:test';
import { contractToOpsFarm, farmSpan, project, type ContractSpec } from '../src/lib/contractFarm.ts';

const LAT0 = 16.72834;
const LON0 = 95.59059;

const SPEC: ContractSpec = {
  farm: { id: 'coop', name: 'Delta coop', country: 'MM', location: [LAT0, LON0], standard: 'ASOA_ORGANIC' },
  parcels: [
    {
      id: 'PD-01',
      area_ha: 0.35,
      crop_id: 'rice_paw_san',
      stage: 'Flowering',
      planted: '2026-08-01',
      osm: 'way/1',
      boundary: [
        [LAT0, LON0],
        [LAT0, LON0 + 0.001],
        [LAT0 + 0.001, LON0 + 0.001],
        [LAT0 + 0.001, LON0],
        [LAT0, LON0],
      ],
    },
    { id: 'PD-02', area_ha: null, stage: 'Booting' },
  ],
  assets: [
    { id: 'P-01', kind: 'pump', label: 'Pump', status: 'online', serves: ['PD-01'] },
    { id: 'D-01', kind: 'drone', label: 'Drone', status: 'online', serves: [] },
    { id: 'X-01', kind: 'boat', label: 'Boat', status: 'online', serves: [] },
    { id: 'G-02', kind: 'gate', label: 'Gate', status: 'online', serves: ['PD-02'] },
    { id: 'P-02', kind: 'pump', label: 'Pump 2', status: 'online', serves: ['PD-01'] },
  ],
};

test('north maps to negative z and east to positive x at 3 m per unit', () => {
  const [x, z] = project(LAT0 + 0.001, LON0 + 0.001, LAT0, LON0);
  assert.ok(Math.abs(x - (111.32 * Math.cos((LAT0 * Math.PI) / 180)) / 3) < 0.02);
  assert.ok(Math.abs(z + 111.32 / 3) < 0.02);
  assert.deepEqual(project(LAT0, LON0, LAT0, LON0), [0, 0]);
});

test('parcel boundaries become rings and unknown stages stay Unknown', () => {
  const farm = contractToOpsFarm(SPEC, 'coop', new Date('2026-10-14T00:00:00Z'));
  assert.ok(farm);
  const [pd1, pd2] = farm.paddies;
  assert.equal(pd1.ring?.length, 5);
  assert.equal(pd1.osm, 'way/1');
  assert.equal(pd1.stage, 'Flowering');
  assert.equal(pd1.daysSincePlanting, 74);
  assert.equal(pd2.ring, undefined);
  assert.equal(pd2.stage, 'Unknown');
  assert.equal(pd2.areaHa, 0);
});

test('served assets sit on their paddy and unknown kinds are dropped', () => {
  const farm = contractToOpsFarm(SPEC, 'coop');
  assert.ok(farm);
  assert.deepEqual(farm.assets.map((a) => a.id), ['P-01', 'D-01', 'G-02', 'P-02']);
  const [pump, drone, gate, pump2] = farm.assets;
  const ring = farm.paddies[0].ring ?? [];
  assert.deepEqual([pump.position[0], pump.position[2]], ring[0]);
  assert.equal(drone.position[1], 22);
  assert.notDeepEqual([pump2.position[0], pump2.position[2]], ring[0]);
  assert.ok(ring.some(([x, z]) => x === pump2.position[0] && z === pump2.position[2]));
  assert.ok(!ring.some(([x, z]) => x === gate.position[0] && z === gate.position[2]));
  assert.notDeepEqual([gate.position[0], gate.position[2]], [farm.paddies[1].rect.x, farm.paddies[1].rect.z]);
});

test('a contract without a location gives no farm, and the span covers every ring', () => {
  assert.equal(contractToOpsFarm({ ...SPEC, farm: { ...SPEC.farm, location: null } }, 'coop'), null);
  const farm = contractToOpsFarm(SPEC, 'coop');
  assert.ok(farm);
  const span = farmSpan(farm);
  assert.ok(span);
  assert.equal(span.span, 60);
  assert.ok(span.cx > 0 && span.cz < 0);
});
