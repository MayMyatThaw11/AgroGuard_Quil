import { useEffect, useMemo, useState } from 'react';
import { createSiteService, type SiteFacts } from './siteFacts.ts';
import { evaluateSite, groupResults, siteCharacter, type FitGroups, type SiteCharacter } from './techniqueFit.ts';

function browserStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const REQUEST_TIMEOUT_MS = 20000;

const service = createSiteService({
  fetcher: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
  storage: browserStorage(),
  now: () => Date.now(),
});

export interface SiteFitState {
  loading: boolean;
  site: SiteFacts | null;
  groups: FitGroups | null;
  character: SiteCharacter[];
  error: string | null;
}

export function useSiteFit(lat: number, lon: number): SiteFitState {
  const [site, setSite] = useState<SiteFacts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    setSite(null);
    service
      .facts(lat, lon)
      .then((facts) => {
        if (live) setSite(facts);
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [lat, lon]);

  return useMemo(
    () => ({ loading, site, error, groups: site ? groupResults(evaluateSite(site)) : null, character: site ? siteCharacter(site) : [] }),
    [loading, site, error],
  );
}
