import { useEffect, useState } from 'react';
import { hasLocation, type GroundView } from './groundSpan.ts';

export type GroundStatus = 'none' | 'loading' | 'ready' | 'error';

export interface GroundState {
  status: GroundStatus;
  image: HTMLCanvasElement | null;
  view: GroundView | null;
  error: string | null;
}

export function useGround(place: { lat?: number; lon?: number }, view: GroundView): GroundState {
  const located = hasLocation(place);
  const lat = located ? place.lat : null;
  const lon = located ? place.lon : null;
  const [state, setState] = useState<GroundState>({ status: located ? 'loading' : 'none', image: null, view: null, error: null });

  useEffect(() => {
    if (lat === null || lon === null) {
      setState({ status: 'none', image: null, view: null, error: null });
      return undefined;
    }
    let live = true;
    setState((current) => ({ ...current, status: 'loading', error: null }));
    import('./groundSnapshot.ts')
      .then(({ snapshotGround }) => snapshotGround({ lat, lon, view }))
      .then((image) => {
        if (live) setState({ status: 'ready', image, view, error: null });
      })
      .catch((error: unknown) => {
        if (live) setState({ status: 'error', image: null, view: null, error: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      live = false;
    };
  }, [lat, lon, view]);

  return state;
}
