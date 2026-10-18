import React, { useEffect, useState } from 'react';
import { getFleet } from '../../data/fleet/fleetFields.ts';
import { getFleetFields } from '../../lib/api.ts';
import { compareWithBackend } from '../../lib/fleetSync.ts';
import { AqBadge } from '../aq/aqPrimitives.tsx';

type SyncState = { kind: 'checking' } | { kind: 'offline' } | { kind: 'done'; checked: number; matched: number };

export const FleetSyncBadge: React.FC<{ safeDepthCm: number }> = ({ safeDepthCm }) => {
  const [state, setState] = useState<SyncState>({ kind: 'checking' });

  useEffect(() => {
    let live = true;
    setState({ kind: 'checking' });
    getFleetFields(100, safeDepthCm)
      .then((remote) => {
        if (!live) return;
        const result = compareWithBackend(getFleet().fields, remote.fields, safeDepthCm);
        setState({ kind: 'done', checked: result.checked, matched: result.matched });
      })
      .catch(() => {
        if (live) setState({ kind: 'offline' });
      });
    return () => {
      live = false;
    };
  }, [safeDepthCm]);

  if (state.kind === 'checking') return <AqBadge>Checking backend</AqBadge>;
  if (state.kind === 'offline') return <AqBadge tone="warning">Backend offline, local fixture</AqBadge>;
  const ok = state.matched === state.checked;
  return (
    <AqBadge tone={ok ? 'accent' : 'warning'}>
      {ok ? `Backend in sync: ${state.matched} fields` : `Backend differs: ${state.matched} of ${state.checked} match`}
    </AqBadge>
  );
};
