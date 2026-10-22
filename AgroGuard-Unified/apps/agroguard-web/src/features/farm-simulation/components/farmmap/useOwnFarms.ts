import { useCallback, useEffect, useState } from 'react';
import { fieldStatus, type FieldStatus } from '../../lib/agroguard.ts';
import { getContract, getMonitoring, listContracts, type FarmMonitoring, type HarvestReference } from '../../lib/api.ts';
import type { ContractSpec } from '../../lib/contractFarm.ts';
import type { FarmMapEngine } from '../../lib/farmmap/engine/engineTypes.ts';
import {
  contractFeatures,
  linkedField,
  paddyInputs,
  parcelStatuses,
  replicaStatus,
  setLinkedField,
  type OwnFeatures,
  type OwnStatus,
} from '../../lib/farmmap/ownFarms.ts';
import { browserStorage } from '../../lib/paddySettingsBoot.ts';

const POLL_MS = 20000;
const harvests = new Map<string, HarvestReference>();

export const loadedHarvests: ReadonlyMap<string, HarvestReference> = harvests;

export function rememberHarvest(farmId: string, ref: HarvestReference): void {
  harvests.set(farmId, ref);
}

export interface OwnFarmLive {
  id: string;
  seed: boolean;
  spec: ContractSpec;
  sha256: string;
  monitoring: FarmMonitoring | null;
  monitoringError: string | null;
  fieldId: number | null;
  field: FieldStatus | null;
  fieldError: string | null;
  status: OwnStatus;
  reasons: string[];
  checkedAt: string;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function loadFarm(id: string, seed: boolean): Promise<OwnFarmLive | null> {
  const contract = await getContract(id);
  if (!contract.contract) return null;
  const spec = contract.contract;
  const storage = browserStorage();
  const fieldId = storage ? linkedField(storage, id) : null;
  const [monitoring, field] = await Promise.allSettled([
    getMonitoring(id),
    fieldId === null ? Promise.resolve(null) : fieldStatus(fieldId),
  ]);
  const mon = monitoring.status === 'fulfilled' ? monitoring.value : null;
  const fs = field.status === 'fulfilled' ? field.value : null;
  const now = new Date();
  const assessment = fs?.latestAssessment ? { status: fs.latestAssessment.status, createdAt: fs.latestAssessment.createdAt } : null;
  const verdict = replicaStatus({ assessment, activeDevices: fs ? fs.activeDevices : null, paddies: paddyInputs(mon), now });
  return {
    id,
    seed,
    spec,
    sha256: contract.sha256,
    monitoring: mon,
    monitoringError: monitoring.status === 'rejected' ? message(monitoring.reason) : null,
    fieldId,
    field: fs,
    fieldError: field.status === 'rejected' ? message(field.reason) : null,
    status: verdict.status,
    reasons: verdict.reasons,
    checkedAt: now.toISOString(),
  };
}

function features(farms: OwnFarmLive[]): OwnFeatures {
  const out: OwnFeatures = { polygons: [], points: [] };
  for (const farm of farms) {
    const a = farm.field?.latestAssessment;
    const base = {
      assessment: a ? { status: a.status, createdAt: a.createdAt } : null,
      activeDevices: farm.field ? farm.field.activeDevices : null,
      now: new Date(farm.checkedAt),
    };
    const one = contractFeatures(farm.id, farm.spec, parcelStatuses(farm.spec, base, paddyInputs(farm.monitoring)), farm.seed);
    out.polygons.push(...one.polygons);
    out.points.push(...one.points);
  }
  return out;
}

export function useOwnFarms(engine: FarmMapEngine | null) {
  const [farms, setFarms] = useState<OwnFarmLive[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const { contracts } = await listContracts();
        const loaded = await Promise.all(contracts.filter((c) => c.valid).map((c) => loadFarm(c.farm_id, c.seed === true).catch(() => null)));
        if (!alive) return;
        setFarms(loaded.filter((f): f is OwnFarmLive => f !== null));
        setError(null);
      } catch (err) {
        if (alive) setError(message(err));
      }
    };
    void run();
    const timer = window.setInterval(() => void run(), POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [tick]);

  useEffect(() => {
    engine?.setOwnFarms(features(farms));
  }, [engine, farms]);

  const link = useCallback((farmId: string, fieldId: number | null) => {
    const storage = browserStorage();
    if (storage) setLinkedField(storage, farmId, fieldId);
    reload();
  }, [reload]);

  return { farms, error, reload, link };
}
