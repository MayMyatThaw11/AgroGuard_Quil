import { useEffect, useMemo, useState } from 'react';
import { resolveOpsFarm } from '../../data/fleet/farmToOps.ts';
import { getContract } from '../../lib/api.ts';
import { chooseOpsFarm, contractToOpsFarm, type ContractLoad, type OpsFarmChoice } from '../../lib/contractFarm.ts';

export function useOpsFarm(farmId: string, live: boolean): OpsFarmChoice & { retry: () => void } {
  const fixture = useMemo(() => resolveOpsFarm(farmId), [farmId]);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; load: ContractLoad } | null>(null);
  const key = `${farmId}#${attempt}`;

  useEffect(() => {
    if (!live) return;
    let current = true;
    getContract(farmId)
      .then((out) => {
        if (current) setLoaded({ key, load: { state: 'ready', farm: out.contract ? contractToOpsFarm(out.contract, farmId) : null } });
      })
      .catch((error: unknown) => {
        if (current) setLoaded({ key, load: { state: 'failed', error } });
      });
    return () => {
      current = false;
    };
  }, [live, farmId, key]);

  const load: ContractLoad = loaded?.key === key ? loaded.load : { state: 'loading' };
  return { ...chooseOpsFarm(farmId, live, fixture, load), retry: () => setAttempt((n) => n + 1) };
}
