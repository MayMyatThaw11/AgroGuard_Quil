import assert from 'node:assert/strict';
import test from 'node:test';
import type { OnboardResult } from '../src/lib/api.ts';
import {
  MAX_FILE_BYTES,
  OUTLINE_SUFFIXES,
  currentFarmId,
  farmHref,
  farmProblems,
  fileProblem,
  fileProblems,
  geojsonOutlines,
  kmlOutlines,
  missingUnlocks,
  onboardBody,
  onboardErrorText,
  parseCoordinates,
  rejectedRows,
  toBase64,
  type OnboardDraft,
  type XmlLike,
} from '../src/lib/onboardFiles.ts';

const DRAFT: OnboardDraft = {
  farmId: 'farm_kyauktan',
  name: ' Kyauktan Paddies ',
  country: 'mm',
  utcOffset: '+06:30',
  standard: '',
  registeredBy: 'Daw Mya',
  boundaries: null,
  fieldsCsv: 'field,crop\nF1,rice\n',
  readingsCsv: '',
  inputsCsv: '',
  assets: [],
};

interface FakeNode extends XmlLike {
  tag: string;
  kids: FakeNode[];
}

function xml(tag: string, kids: FakeNode[] = [], textContent: string | null = null): FakeNode {
  const node: FakeNode = {
    tag,
    kids,
    textContent,
    getElementsByTagName: (name) => {
      const found: FakeNode[] = [];
      const walk = (n: FakeNode): void =>
        n.kids.forEach((kid) => {
          if (kid.tag === name) found.push(kid);
          walk(kid);
        });
      walk(node);
      return found;
    },
  };
  return node;
}

test('files over 2 MB or with the wrong suffix are refused before upload', () => {
  assert.equal(fileProblem('farm.kml', 1000, OUTLINE_SUFFIXES), null);
  assert.equal(fileProblem('FARM.KMZ', MAX_FILE_BYTES, OUTLINE_SUFFIXES), null);
  assert.match(fileProblem('farm.kml', MAX_FILE_BYTES + 1, OUTLINE_SUFFIXES) ?? '', /over 2 MB/);
  assert.match(fileProblem('farm.shp', 10, OUTLINE_SUFFIXES) ?? '', /not a/);
  assert.match(fileProblem('notes', 10, ['.csv']) ?? '', /not a \.csv file/);
});

test('KML coordinates read as lon, lat and skip the altitude', () => {
  assert.deepEqual(parseCoordinates(' 96.1,16.2,0\n 96.2,16.3 bad 96.3,16.2,5 '), [
    [96.1, 16.2],
    [96.2, 16.3],
    [96.3, 16.2],
  ]);
  assert.deepEqual(parseCoordinates(''), []);
});

test('KML outlines take the outer ring of each polygon and close it', () => {
  const doc = xml('kml', [
    xml('Polygon', [
      xml('outerBoundaryIs', [xml('coordinates', [], '96.1,16.2,0 96.2,16.2,0 96.2,16.3,0')]),
      xml('innerBoundaryIs', [xml('coordinates', [], '1,1 2,2 3,3 1,1')]),
    ]),
    xml('Polygon', [xml('coordinates', [], '96.4,16.2 96.5,16.2 96.5,16.3 96.4,16.2')]),
    xml('Polygon', [xml('coordinates', [], '96.4,16.2 96.5,16.2')]),
  ]);
  const outlines = kmlOutlines(doc);
  assert.equal(outlines.length, 2);
  assert.deepEqual(outlines[0].ring, [
    [96.1, 16.2],
    [96.2, 16.2],
    [96.2, 16.3],
    [96.1, 16.2],
  ]);
  assert.equal(outlines[1].ring.length, 4);
});

test('GeoJSON outlines read polygons and multipolygons from any wrapper', () => {
  const square = [
    [96.1, 16.2],
    [96.2, 16.2],
    [96.2, 16.3],
    [96.1, 16.2],
  ];
  const text = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [square] } },
      { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [[square], [square]] } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [96.1, 16.2] } },
      { type: 'Feature', geometry: null },
    ],
  });
  assert.equal(geojsonOutlines(text).length, 3);
  assert.deepEqual(geojsonOutlines(JSON.stringify({ type: 'Polygon', coordinates: [square] }))[0].ring, square);
  assert.deepEqual(geojsonOutlines('{"type":"Polygon","coordinates":"x"}'), []);
  assert.throws(() => geojsonOutlines('not json'));
});

test('KMZ bytes become base64 the server can unpack', () => {
  assert.equal(toBase64(new Uint8Array([80, 75, 3, 4])), 'UEsDBA==');
  assert.equal(toBase64(new Uint8Array(0x9000).fill(65)).length, Math.ceil(0x9000 / 3) * 4);
});

test('farm id, country, offset and owner are checked like the server does', () => {
  assert.deepEqual(farmProblems(DRAFT), []);
  assert.equal(farmProblems({ ...DRAFT, farmId: '1farm' }).length, 1);
  assert.equal(farmProblems({ ...DRAFT, farmId: 'f' }).length, 1);
  assert.equal(farmProblems({ ...DRAFT, farmId: `f${'a'.repeat(41)}` }).length, 1);
  assert.equal(farmProblems({ ...DRAFT, country: 'MMR' }).length, 1);
  assert.equal(farmProblems({ ...DRAFT, utcOffset: '6:30' }).length, 1);
  assert.equal(farmProblems({ ...DRAFT, registeredBy: ' ' }).length, 1);
});

test('outlines or a field sheet is required and machine ids are checked', () => {
  assert.deepEqual(fileProblems(DRAFT), []);
  assert.equal(fileProblems({ ...DRAFT, fieldsCsv: ' ' }).length, 1);
  assert.deepEqual(fileProblems({ ...DRAFT, fieldsCsv: '', boundaries: { filename: 'a.kmz', base64: 'UEs=' } }), []);
  const pump = { id: 'pump-1', kind: 'pump' as const, label: 'Canal pump', serves: 'F1' };
  assert.deepEqual(fileProblems({ ...DRAFT, assets: [pump] }), []);
  assert.equal(fileProblems({ ...DRAFT, assets: [pump, pump] }).length, 1);
  assert.equal(fileProblems({ ...DRAFT, assets: [{ ...pump, id: 'pump_1', label: '' }] }).length, 2);
});

test('the request body trims, upper-cases and leaves out what is empty', () => {
  const body = onboardBody({
    ...DRAFT,
    boundaries: { filename: 'farm.kml', text: '<kml/>' },
    assets: [{ id: ' pump-1 ', kind: 'pump', label: ' Canal pump ', serves: 'F1, F2 F1' }],
  });
  assert.deepEqual(body, {
    name: 'Kyauktan Paddies',
    country: 'MM',
    registered_by: 'Daw Mya',
    utc_offset: '+06:30',
    boundaries: { filename: 'farm.kml', text: '<kml/>' },
    fields_csv: 'field,crop\nF1,rice\n',
    assets: [{ id: 'pump-1', kind: 'pump', label: 'Canal pump', serves: ['F1', 'F2'] }],
  });
});

test('the review lists what each missing file would unlock', () => {
  const items = missingUnlocks(DRAFT).map((m) => m.item);
  assert.equal(items.length, 4);
  assert.ok(items.some((i) => i.includes('inputs sheet')));
  assert.ok(missingUnlocks(DRAFT).every((m) => m.unlocks.length > 0));
  assert.equal(missingUnlocks({ ...DRAFT, readingsCsv: 'x', inputsCsv: 'x', standard: 'ASOA', assets: [{ id: 'a', kind: 'gate', label: 'g', serves: '' }] }).length, 0);
});

test('rejected rows from both files keep their line numbers', () => {
  const result: OnboardResult = {
    farm_id: 'farm_kyauktan',
    verdict: { is_valid: true, diagnostics: [] },
    to_verify: 2,
    notes: [],
    readings: { stored: 3, duplicate: 0, assumed_time: 0, rejected: [{ line: 4, reason: 'no field F9' }] },
    inputs: null,
  };
  assert.deepEqual(rejectedRows(result), [{ file: 'readings', line: 4, reason: 'no field F9' }]);
});

test('errors read in plain words', () => {
  assert.equal(onboardErrorText(401, 'x', 'farm_a'), 'Sign in first');
  assert.equal(onboardErrorText(403, 'x', 'farm_a'), 'This code has no access to farm farm_a');
  assert.equal(onboardErrorText(413, 'File too large', 'farm_a'), 'File too large');
  assert.equal(onboardErrorText(422, 'country must be two letters', 'farm_a'), 'country must be two letters');
  assert.equal(
    onboardErrorText(422, JSON.stringify([{ code: 'E1', severity: 'ERROR', message: 'bad crop', line: 3 }, { msg: 'field required' }]), 'farm_a'),
    'line 3: bad crop; field required'
  );
  assert.equal(onboardErrorText(null, 'Failed to fetch', 'farm_a'), 'Failed to fetch');
});

test('opening a farm keeps the other query params', () => {
  assert.equal(farmHref('?view=ops&farm=old', 'farm_new'), '?view=ops&farm=farm_new');
  assert.equal(farmHref('', 'farm_new'), '?farm=farm_new');
  assert.equal(currentFarmId('?farm=farm_new'), 'farm_new');
  assert.equal(currentFarmId(''), 'farm_ayeyarwady_demo');
});
