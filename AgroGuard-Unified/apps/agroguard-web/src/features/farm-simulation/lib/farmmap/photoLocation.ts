export type PhotoLocation = { ok: true; lat: number; lon: number } | { ok: false; reason: 'not-jpeg' | 'no-gps' };

const TYPE_BYTES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8 };

/** Reads the GPS position from a JPEG's EXIF block. Only the first 128 KB of the file is needed. */
export function readPhotoLocation(buffer: ArrayBufferLike): PhotoLocation {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return { ok: false, reason: 'not-jpeg' };
  let at = 2;
  while (at + 4 <= view.byteLength) {
    if (view.getUint8(at) !== 0xff) break;
    const marker = view.getUint8(at + 1);
    if (marker === 0xd9 || marker === 0xda) break;
    const size = view.getUint16(at + 2);
    if (marker === 0xe1 && at + 10 <= view.byteLength && view.getUint32(at + 4) === 0x45786966) {
      const found = fromTiff(view, at + 10);
      if (found) return found;
    }
    at += 2 + size;
  }
  return { ok: false, reason: 'no-gps' };
}

function fromTiff(view: DataView, base: number): PhotoLocation | null {
  if (base + 8 > view.byteLength) return null;
  const little = view.getUint16(base) === 0x4949;
  const u16 = (o: number) => view.getUint16(base + o, little);
  const u32 = (o: number) => view.getUint32(base + o, little);
  const inside = (o: number, n: number) => base + o + n <= view.byteLength;
  const entries = (ifd: number) => {
    if (!inside(ifd, 2)) return [];
    const n = u16(ifd);
    return Array.from({ length: n }, (_, i) => ifd + 2 + i * 12).filter((e) => inside(e, 12));
  };
  const valueAt = (entry: number): number => {
    const bytes = (TYPE_BYTES[u16(entry + 2)] ?? 1) * u32(entry + 4);
    return bytes > 4 ? u32(entry + 8) : entry + 8;
  };
  const gpsEntry = entries(u32(4)).find((e) => u16(e) === 0x8825);
  if (gpsEntry === undefined) return null;
  const tags = new Map(entries(u32(gpsEntry + 8)).map((e) => [u16(e), e] as const));
  const ref = (tag: number) => {
    const e = tags.get(tag);
    return e === undefined ? null : String.fromCharCode(view.getUint8(base + e + 8));
  };
  const degrees = (tag: number) => {
    const e = tags.get(tag);
    if (e === undefined) return null;
    const o = valueAt(e);
    if (!inside(o, 24)) return null;
    const part = (i: number) => (u32(o + i * 8 + 4) === 0 ? NaN : u32(o + i * 8) / u32(o + i * 8 + 4));
    const value = part(0) + part(1) / 60 + part(2) / 3600;
    return Number.isFinite(value) ? value : null;
  };
  const lat = degrees(2);
  const lon = degrees(4);
  const latRef = ref(1);
  const lonRef = ref(3);
  if (lat === null || lon === null || !latRef || !lonRef) return null;
  const out = { ok: true as const, lat: latRef.toUpperCase() === 'S' ? -lat : lat, lon: lonRef.toUpperCase() === 'W' ? -lon : lon };
  return Math.abs(out.lat) <= 90 && Math.abs(out.lon) <= 180 ? out : null;
}
