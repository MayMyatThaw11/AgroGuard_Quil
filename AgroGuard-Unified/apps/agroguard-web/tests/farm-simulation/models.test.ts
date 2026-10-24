import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import test from 'node:test';
import { MODEL_FILES, SCENERY, SCENERY_MAX_BYTES, TEXTURE_FILES, TRI_BUDGET, sceneryModel } from '../../src/features/farm-simulation/lib/fieldsim/models.ts';

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

interface Gltf {
  accessors?: { count: number }[];
  meshes?: { primitives: { indices?: number }[] }[];
}

function triangles(bytes: Buffer): number {
  const length = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + length).toString('utf8')) as Gltf;
  let total = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      if (primitive.indices !== undefined) total += (json.accessors?.[primitive.indices]?.count ?? 0) / 3;
    }
  }
  return total;
}

for (const kind of SCENERY) {
  for (const lod of [0, 1] as const) {
    test(`${kind} lod${lod} stays inside its triangle and size budget`, () => {
      const path = new URL(sceneryModel(kind, lod), PUBLIC);
      assert.ok(existsSync(path), `${kind} lod${lod} missing`);
      const bytes = readFileSync(path);
      assert.ok(bytes.length <= SCENERY_MAX_BYTES, `${kind} lod${lod} is ${bytes.length} bytes`);
      const count = triangles(bytes);
      assert.ok(count > 0, `${kind} lod${lod} has no triangles`);
      assert.ok(count <= TRI_BUDGET[kind][lod], `${kind} lod${lod} has ${count} triangles, budget ${TRI_BUDGET[kind][lod]}`);
    });
  }
}

test('each scenery kind has a lower-detail model with fewer triangles than the full one', () => {
  for (const kind of SCENERY) {
    const full = triangles(readFileSync(new URL(sceneryModel(kind, 0), PUBLIC)));
    const lean = triangles(readFileSync(new URL(sceneryModel(kind, 1), PUBLIC)));
    assert.ok(lean < full, `${kind}: lod1 ${lean} is not below lod0 ${full}`);
  }
});

test('the model folder names its generator, Blender version and the licence of every texture', () => {
  const text = readFileSync(new URL('models/farmmap/SOURCE.md', PUBLIC), 'utf8');
  assert.match(text, /build_models\.py/);
  assert.match(text, /build_scenery\.py/);
  assert.match(text, /Blender 5\.2/);
  for (const file of TEXTURE_FILES) assert.ok(text.includes(file.split('/').pop() as string), `${file} not described`);
});

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
