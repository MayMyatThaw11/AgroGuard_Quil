import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import test from 'node:test';
import { MODEL_FILES, TEXTURE_FILES } from '../../src/features/farm-simulation/lib/fieldsim/models.ts';

const PUBLIC = new URL('../../public/', import.meta.url);
const MAX_BYTES = 2 * 1024 * 1024;

function gltfJson(bytes: Buffer): { extensionsUsed?: string[]; meshes?: unknown[] } {
  const length = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + length).toString('utf8'));
}

for (const file of MODEL_FILES) {
  test(`${file} is a Draco-compressed glTF 2 binary under 2 MB`, () => {
    const path = new URL(file, PUBLIC);
    assert.ok(existsSync(path), `${file} missing`);
    const bytes = readFileSync(path);
    assert.ok(bytes.length <= MAX_BYTES, `${file} is ${bytes.length} bytes`);
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'glTF');
    assert.equal(bytes.readUInt32LE(4), 2);
    const json = gltfJson(bytes);
    assert.ok(json.extensionsUsed?.includes('KHR_draco_mesh_compression'), `${file} is not Draco-compressed`);
    assert.ok((json.meshes?.length ?? 0) > 0);
  });
}

test('ground textures exist and stay small', () => {
  for (const file of TEXTURE_FILES) {
    const path = new URL(file, PUBLIC);
    assert.ok(existsSync(path), `${file} missing`);
    assert.ok(statSync(path).size <= MAX_BYTES);
  }
});

test('the Draco decoder is served next to the app', () => {
  assert.ok(existsSync(new URL('draco/draco_decoder.wasm', PUBLIC)));
  assert.ok(existsSync(new URL('draco/draco_wasm_wrapper.js', PUBLIC)));
});
