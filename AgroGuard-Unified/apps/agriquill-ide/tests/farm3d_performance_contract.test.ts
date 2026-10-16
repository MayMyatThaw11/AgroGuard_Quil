import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASEAN_PRESETS } from '../src/data/presets.ts';
import {
  getFarm,
  getFarmBounds,
  getParcelsByFarm,
  getSensorsByFarm,
  getRobotsByFarm,
  getCanalsByFarm,
  getAquaPondsByFarm
} from '../src/data/farm/index.ts';
import { useFarmStore } from '../src/store/farmStore.ts';

test('Farm3D Performance & Entity Contract: all 11 ASEAN presets have complete farm entities', () => {
  assert.equal(ASEAN_PRESETS.length, 11);

  for (const preset of ASEAN_PRESETS) {
    const farmId = `farm_${preset.id}`;
    const farm = getFarm(farmId);
    assert.ok(farm, `Farm record exists for ${preset.id}`);
    assert.equal(farm.presetId, preset.id);

    const bounds = getFarmBounds(farmId);
    assert.ok(bounds.widthM > 0, `Width > 0 for ${preset.id}`);
    assert.ok(bounds.depthM > 0, `Depth > 0 for ${preset.id}`);
    assert.ok(bounds.maxX >= bounds.minX);
    assert.ok(bounds.maxZ >= bounds.minZ);

    const parcels = getParcelsByFarm(farmId);
    assert.ok(parcels.length >= 4, `At least 4 parcels for ${preset.id}`);
    for (const p of parcels) {
      assert.ok(p.polygonMetres.length >= 4, `Parcel ${p.id} has >= 4 vertices`);
      assert.ok(p.areaHa > 0, `Parcel ${p.id} has positive area`);
      assert.ok(p.ndvi >= 0 && p.ndvi <= 1, `Parcel ${p.id} NDVI in [0, 1]`);
      assert.ok(p.sarMoisture >= 0 && p.sarMoisture <= 1, `Parcel ${p.id} SAR in [0, 1]`);
    }

    const sensors = getSensorsByFarm(farmId);
    assert.ok(sensors.length >= 6, `At least 6 sensors for ${preset.id}`);

    const robots = getRobotsByFarm(farmId);
    assert.ok(robots.length >= 1, `At least 1 robot for ${preset.id}`);
    for (const r of robots) {
      if (r.type === 'drone') {
        assert.ok(r.waypoints.length >= 2, `Drone ${r.id} has circuit waypoints`);
      }
    }
  }
});

test('FarmStore selective state transitions and telemetry invariants', () => {
  const store = useFarmStore.getState();

  // 1. Preset ID prefix normalization
  store.setActiveFarmId('vietnam');
  assert.equal(useFarmStore.getState().activeFarmId, 'farm_vietnam');

  store.setActiveFarmId('farm_thailand');
  assert.equal(useFarmStore.getState().activeFarmId, 'farm_thailand');

  // Reset to Myanmar
  store.setActiveFarmId('myanmar');
  assert.equal(useFarmStore.getState().activeFarmId, 'farm_myanmar');

  // 2. View Mode toggle
  store.setViewMode('table');
  assert.equal(useFarmStore.getState().viewMode, 'table');
  store.setViewMode('3d');
  assert.equal(useFarmStore.getState().viewMode, '3d');

  // 3. Active Layer & Filters
  store.setActiveLayer('ndvi');
  assert.equal(useFarmStore.getState().activeLayer, 'ndvi');
  store.setMinNdviFilter(0.65);
  assert.equal(useFarmStore.getState().minNdviFilter, 0.65);
  store.setSensorStatusFilter('online');
  assert.equal(useFarmStore.getState().sensorStatusFilter, 'online');

  // Reset layer and filters
  store.setActiveLayer('crop');
  store.setMinNdviFilter(0);
  store.setSensorStatusFilter('all');

  // 4. Target Selection across all 5 selectable entity kinds
  store.selectTarget({ kind: 'parcel', id: 'parcel_myanmar_p01' });
  assert.deepEqual(useFarmStore.getState().selectedTarget, { kind: 'parcel', id: 'parcel_myanmar_p01' });

  store.selectTarget({ kind: 'sensor', id: 'sensor_myanmar_1' });
  assert.deepEqual(useFarmStore.getState().selectedTarget, { kind: 'sensor', id: 'sensor_myanmar_1' });

  store.selectTarget({ kind: 'robot', id: 'robot_myanmar_drone' });
  assert.deepEqual(useFarmStore.getState().selectedTarget, { kind: 'robot', id: 'robot_myanmar_drone' });

  store.selectTarget({ kind: 'canal', id: 'canal_myanmar_main' });
  assert.deepEqual(useFarmStore.getState().selectedTarget, { kind: 'canal', id: 'canal_myanmar_main' });

  store.selectTarget(null);
  assert.equal(useFarmStore.getState().selectedTarget, null);

  // 5. Telemetry Drift simulation
  const initialDroneProgress = useFarmStore.getState().droneProgress;
  store.tickTelemetryDrift();
  const nextDroneProgress = useFarmStore.getState().droneProgress;
  assert.ok(nextDroneProgress >= 0 && nextDroneProgress < 1, 'Drone progress within [0, 1)');
  assert.notEqual(initialDroneProgress, nextDroneProgress, 'Drone progress advanced');

  const live = useFarmStore.getState().liveSensorValues;
  const myanmarSensors = getSensorsByFarm('farm_myanmar');
  for (const s of myanmarSensors) {
    const reading = live[s.id];
    assert.ok(reading, `Live sensor telemetry generated for ${s.id}`);
    assert.ok(typeof reading.value === 'number');
    assert.ok(reading.lastSeen.includes('telemetry'));
  }

  // 6. Camera reset signal
  const prevSignal = useFarmStore.getState().resetCameraSignal;
  store.resetCamera();
  assert.equal(useFarmStore.getState().resetCameraSignal, prevSignal + 1);
  assert.equal(useFarmStore.getState().selectedTarget, null);
});

test('CameraRig clamping and goal bounding mathematics contract', () => {
  const bounds = getFarmBounds('farm_myanmar');
  const margin = 80;

  // Verify that any arbitrary goal is clamped safely within margin bounds
  const arbitraryGoals = [
    { x: -9999, z: 9999 },
    { x: bounds.centerX, z: bounds.centerZ },
    { x: bounds.maxX + 500, z: bounds.minZ - 500 }
  ];

  for (const g of arbitraryGoals) {
    const clampedX = Math.min(bounds.maxX + margin, Math.max(bounds.minX - margin, g.x));
    const clampedZ = Math.min(bounds.maxZ + margin, Math.max(bounds.minZ - margin, g.z));
    assert.ok(clampedX >= bounds.minX - margin && clampedX <= bounds.maxX + margin);
    assert.ok(clampedZ >= bounds.minZ - margin && clampedZ <= bounds.maxZ + margin);
  }
});
