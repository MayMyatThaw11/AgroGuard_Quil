import type { FleetField } from '../data/fleet/fleetFields.ts';
import { fieldStatus } from './fleetQuery.ts';

export interface RemoteField {
  id: string;
  water_cm: number;
  lowest_ahead_cm: number;
  ndvi: number;
  offline: boolean;
  status: string;
}

export interface FleetSyncResult {
  checked: number;
  matched: number;
  mismatched: string[];
}

export function compareWithBackend(local: readonly FleetField[], remote: readonly RemoteField[], safeDepthCm: number): FleetSyncResult {
  const byId = new Map(local.map((field) => [field.id, field]));
  const mismatched: string[] = [];
  let matched = 0;
  for (const row of remote) {
    const field = byId.get(row.id);
    const status = field ? fieldStatus(field, safeDepthCm) : null;
    const same =
      field !== undefined &&
      field.water === row.water_cm &&
      field.low === row.lowest_ahead_cm &&
      field.ndvi === row.ndvi &&
      field.offline === row.offline &&
      status === row.status;
    if (same) matched += 1;
    else mismatched.push(row.id);
  }
  return { checked: remote.length, matched, mismatched };
}
