/**
 * Server-state hook for parcel scene manifests.
 *
 * Query key carries the parcel id, geometry version and dataset version, so a
 * parcel edit or a new dataset invalidates the cached scene without any
 * manual cache clearing. Cancellation is delegated to the AbortSignal React
 * Query already supplies, which stops the fetch and discards the response if
 * the component unmounts or the selection changes mid-flight. That is separate
 * from cancelling a running simulation job on the server, which the job
 * endpoint owns.
 *
 * There is no default client. A caller must inject one, so this hook cannot
 * accidentally invent a backend route.
 */

import { useQuery } from '@tanstack/react-query';
import type { ParcelScene } from './manifest.ts';

export interface ParcelSceneKey {
  readonly parcelId: string;
  readonly geometryVersion: string;
  readonly datasetVersion: string;
}

export interface SceneClient {
  getScene(key: ParcelSceneKey, options: { signal: AbortSignal }): Promise<ParcelScene>;
}

export const parcelSceneKeys = {
  all: ['parcel-scene'] as const,
  detail: (key: ParcelSceneKey | null) =>
    key === null
      ? [...parcelSceneKeys.all, null]
      : [...parcelSceneKeys.all, key.parcelId, key.geometryVersion, key.datasetVersion] as const
};

export function useParcelScene<TData = ParcelScene>(
  key: ParcelSceneKey | null,
  client: SceneClient,
  options: { readonly staleTimeMs?: number; readonly gcTimeMs?: number } = {}
) {
  return useQuery<TData, Error>({
    queryKey: parcelSceneKeys.detail(key),
    enabled: key !== null,
    queryFn: ({ signal }) => {
      if (key === null) throw new Error('useParcelScene requires a non-null key');
      return client.getScene(key, { signal }) as Promise<TData>;
    },
    // Scene assets are versioned, so a successful fetch stays fresh while the
    // key is unchanged.
    staleTime: options.staleTimeMs ?? 5 * 60_000,
    gcTime: options.gcTimeMs ?? 10 * 60_000,
    // A background window focus must not refetch a versioned scene.
    refetchOnWindowFocus: false,
    // Retries are the injected client's business; it knows whether the failure
    // is transient. Defaulting to a blind retry here would hammer a route that
    // does not exist yet.
    retry: false
  });
}