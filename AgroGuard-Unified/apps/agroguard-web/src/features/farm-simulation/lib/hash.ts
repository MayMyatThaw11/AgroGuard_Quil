// Deterministic short hash for demo ledger identifiers.
//
// This is a display fingerprint for in-memory demo records. It is not a
// cryptographic hash and confers no integrity guarantee: the ledger is React
// state and is cleared on reload.

/** FNV-1a, 32-bit. Returns a 7-character lowercase hex string. */
export function shortHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0').slice(-7);
}

export function buildRecordHash(seed: {
  presetId: string;
  day: number;
  commitCount: number;
}): string {
  return shortHash(`${seed.presetId}|${seed.day}|${seed.commitCount}`);
}