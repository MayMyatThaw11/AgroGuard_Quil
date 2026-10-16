import type { Map as MapLibreMap } from 'maplibre-gl';
import { SAT_KEEP_LAYERS } from './basemapTheme.ts';
import { MAP_COLOR } from './farmMapTheme.ts';

export function applyBasemapView(map: MapLibreMap, baseIds: readonly string[], satellite: boolean): void {
  if (!map.getLayer('sat')) return;
  map.setLayoutProperty('sat', 'visibility', satellite ? 'visible' : 'none');
  baseIds.forEach((id) => {
    const layer = map.getLayer(id);
    if (!layer || id === 'sat') return;
    if (layer.type === 'symbol') {
      if (/icons$/.test(id)) map.setLayoutProperty(id, 'visibility', satellite ? 'none' : 'visible');
      map.setPaintProperty(id, 'text-color', satellite ? MAP_COLOR.satText : '#3b4540');
      map.setPaintProperty(id, 'text-halo-color', satellite ? MAP_COLOR.satHalo : 'rgba(255,255,255,.92)');
      return;
    }
    map.setLayoutProperty(id, 'visibility', satellite && !SAT_KEEP_LAYERS.has(id) ? 'none' : 'visible');
  });
}
