import { useEffect, useState } from 'react';
import type { OmtCapture } from '../../lib/farmview/captureOmt.ts';
import { buildNeighbourhood, type Neighbourhood, type OmtFeature } from '../../lib/farmview/neighbourhood.ts';
import type { Rings } from '../../lib/farmview/terrain.ts';
import type { LocalFrame } from '../../lib/fieldsim/localFrame.ts';

const MAX_TREES = 8000;

export type Capture = (centre: { lat: number; lon: number }) => Promise<OmtCapture>;

export interface Surroundings {
  status: 'idle' | 'loading' | 'ready' | 'partial';
  data: Neighbourhood | null;
  features: OmtFeature[];
}

const IDLE: Surroundings = { status: 'idle', data: null, features: [] };

export function useNeighbourhood(capture: Capture | undefined, frame: LocalFrame | null, rings: Rings | null, seed: string): Surroundings {
  const [state, setState] = useState<Surroundings>(IDLE);
  const key = frame && rings ? `${seed}:${frame.origin.lat}:${frame.origin.lon}` : '';
  useEffect(() => {
    if (!capture || !frame || !rings) {
      setState(IDLE);
      return undefined;
    }
    let alive = true;
    setState({ status: 'loading', data: null, features: [] });
    capture(frame.origin)
      .then((result) => {
        if (!alive) return;
        const data = buildNeighbourhood(result.features, frame.toLocal, seed, rings.neighbourhood, { maxTrees: MAX_TREES });
        setState({ status: result.partial ? 'partial' : 'ready', data, features: result.features });
      })
      .catch(() => {
        if (alive) setState({ status: 'partial', data: null, features: [] });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, capture]);
  return state;
}
