import { useCallback, useEffect, useState } from 'react';
import { getSites, type ProcessingSite } from '../../lib/api.ts';
import type { FarmMapEngine } from '../../lib/farmmap/engine/engineTypes.ts';
import { siteFeatures } from '../../lib/farmmap/sites.ts';

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function useSites(engine: FarmMapEngine | null) {
  const [sites, setSites] = useState<ProcessingSite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const stop = new AbortController();
    getSites(stop.signal).then(
      (out) => {
        setSites(out.sites);
        setError(null);
      },
      (err: unknown) => {
        if (!stop.signal.aborted) setError(message(err));
      },
    );
    return () => stop.abort();
  }, [tick]);

  useEffect(() => {
    engine?.setSites({ type: 'FeatureCollection', features: siteFeatures(sites) });
  }, [engine, sites]);

  return { sites, error, reload };
}
