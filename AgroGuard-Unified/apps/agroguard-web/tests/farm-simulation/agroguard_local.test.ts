import assert from 'node:assert/strict';
import test from 'node:test';
import { loadWaterAdvisory, saveWaterAdvisory } from '../../src/lib/waterAdvisory.js';
import { readAgroguardLocal } from '../../src/features/farm-simulation/lib/farmmap/ownFarms.ts';

function useStorage(blocked: boolean) {
  const data = new Map<string, string>();
  const store = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (blocked) throw new Error('blocked');
      data.set(k, v);
    },
    removeItem: (k: string) => void data.delete(k),
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: store });
  return store;
}

test('a saved water advisory reaches the farm map reader unchanged', () => {
  const store = useStorage(false);
  saveWaterAdvisory(
    { status: 'irrigate', reasonCode: 'DEFICIT_PRESENT_NO_RAIN_OFFSET', reason: 'r', dataQuality: 'high', deficitEstimate: { netDepthMm: 18.4 } },
    { mode: 'upland', cropType: 'Rice', fieldId: 1 },
  );
  assert.equal(loadWaterAdvisory()?.status, 'irrigate');
  const read = readAgroguardLocal(store).advisory;
  assert.equal(read?.netDepthMm, 18.4);
  assert.equal(read?.reasonCode, 'DEFICIT_PRESENT_NO_RAIN_OFFSET');
  assert.equal(read?.mode, 'upland');
});

test('an advisory without a deficit stores null, never zero', () => {
  const store = useStorage(false);
  saveWaterAdvisory({ status: 'insufficient_data' });
  assert.equal(readAgroguardLocal(store).advisory?.netDepthMm, null);
});

test('blocked storage never throws on save', () => {
  useStorage(true);
  assert.doesNotThrow(() => saveWaterAdvisory({ status: 'wait' }));
  assert.equal(loadWaterAdvisory(), null);
});
