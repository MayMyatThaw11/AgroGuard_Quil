import assert from 'node:assert/strict';
import test from 'node:test';
import { mapLinkProblem, parseCoordinates } from '../../src/features/farm-simulation/lib/farmmap/farmMapSearch.ts';
import { readPhotoLocation } from '../../src/features/farm-simulation/lib/farmmap/photoLocation.ts';

const first = (q: string) => {
  const r = parseCoordinates(q);
  assert.ok(r && r.length === 1, `no result for ${q}`);
  return [r[0].lat, r[0].lon];
};

test('a Google Maps viewport link gives its centre', () => {
  assert.deepEqual(first('https://www.google.com/maps/@16.7306,95.5980,18z'), [16.7306, 95.598]);
});

test('a place link prefers the pin over the viewport', () => {
  const url = 'https://www.google.com/maps/place/Mill/@16.7000,95.5000,17z/data=!3m1!4b1!4m6!3m5!8m2!3d16.7306!4d95.598';
  assert.deepEqual(first(url), [16.7306, 95.598]);
});

test('q and ll links give their coordinates', () => {
  assert.deepEqual(first('https://maps.google.com/?q=17.098,95.181'), [17.098, 95.181]);
  assert.deepEqual(first('https://www.google.com/maps?ll=17.098,95.181&z=18'), [17.098, 95.181]);
  assert.deepEqual(first('https://www.google.com/maps/search/?api=1&query=17.098%2C95.181'), [17.098, 95.181]);
});

test('degrees, minutes and seconds as Google Earth shows them', () => {
  const [lat, lon] = first('17°05\'52.8"N 95°10\'51.6"E');
  assert.ok(Math.abs(lat - 17.098) < 1e-6 && Math.abs(lon - 95.181) < 1e-6);
  const [slat, elon] = first('8°30\'0"S 115°15\'0"E');
  assert.ok(slat === -8.5 && elon === 115.25);
  assert.deepEqual(parseCoordinates('3°10\'0"S 72°30\'0"W'), []);
});

test('a short Google link cannot be read and says so', () => {
  assert.deepEqual(parseCoordinates('https://maps.app.goo.gl/AbCdEf123'), []);
  assert.equal(mapLinkProblem('https://maps.app.goo.gl/AbCdEf123'), 'short');
  assert.equal(mapLinkProblem('https://goo.gl/maps/xyz'), 'short');
  assert.equal(mapLinkProblem('16.7, 95.6'), null);
});

test('out of range or unrelated text is handled', () => {
  assert.deepEqual(parseCoordinates('https://www.google.com/maps/@116.7,95.5,18z'), []);
  assert.equal(parseCoordinates('maubin'), null);
});

function jpegWithGps(lat: [number, number, number], latRef: string, lon: [number, number, number], lonRef: string): Uint8Array {
  const gps: number[] = [];
  const u16 = (v: number) => [v & 255, v >> 8];
  const u32 = (v: number) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255];
  const entry = (tag: number, type: number, count: number, value: number[]) => [...u16(tag), ...u16(type), ...u32(count), ...value];
  const rationals = (v: [number, number, number]) => v.flatMap((n) => [...u32(Math.round(n * 100)), ...u32(100)]);
  const ifd0Size = 2 + 12 + 4;
  const gpsOffset = 8 + ifd0Size;
  const gpsEntries = 4;
  const dataStart = gpsOffset + 2 + gpsEntries * 12 + 4;
  const latAt = dataStart;
  const lonAt = dataStart + 24;
  gps.push(...u16(gpsEntries));
  gps.push(...entry(1, 2, 2, [latRef.charCodeAt(0), 0, 0, 0]));
  gps.push(...entry(2, 5, 3, u32(latAt)));
  gps.push(...entry(3, 2, 2, [lonRef.charCodeAt(0), 0, 0, 0]));
  gps.push(...entry(4, 5, 3, u32(lonAt)));
  gps.push(...u32(0));
  const tiff = [0x49, 0x49, 42, 0, ...u32(8), ...u16(1), ...entry(0x8825, 4, 1, u32(gpsOffset)), ...u32(0), ...gps, ...rationals(lat), ...rationals(lon)];
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = exif.length + 2;
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...exif, 0xff, 0xd9]);
}

test('a photo with a GPS tag gives its location', () => {
  const out = readPhotoLocation(jpegWithGps([17, 5, 52.8], 'N', [95, 10, 51.6], 'E').buffer);
  assert.ok(out.ok);
  assert.ok(Math.abs(out.lat - 17.098) < 1e-6 && Math.abs(out.lon - 95.181) < 1e-6);
});

test('southern and western references flip the sign', () => {
  const out = readPhotoLocation(jpegWithGps([3, 10, 0], 'S', [72, 30, 0], 'W').buffer);
  assert.ok(out.ok && out.lat < 0 && out.lon === -72.5);
});

test('a photo without a location tag says why', () => {
  const plain = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]).buffer;
  const out = readPhotoLocation(plain);
  assert.equal(out.ok, false);
  assert.equal(out.ok === false && out.reason, 'no-gps');
  assert.equal((readPhotoLocation(new Uint8Array([1, 2, 3]).buffer) as { reason?: string }).reason, 'not-jpeg');
});

test('a q link may carry a space after the comma', () => {
  assert.deepEqual(first('https://maps.google.com/?q=17.098,%2095.181'), [17.098, 95.181]);
  assert.deepEqual(first('https://maps.google.com/?q=17.098, 95.181'), [17.098, 95.181]);
});

test('a malformed link does not throw', () => {
  assert.doesNotThrow(() => parseCoordinates('https://www.google.com/maps/@16.7,95.5,18z%E0%A4%A'));
  assert.deepEqual(first('https://www.google.com/maps/@16.7,95.5,18z%E0%A4%A'), [16.7, 95.5]);
});
