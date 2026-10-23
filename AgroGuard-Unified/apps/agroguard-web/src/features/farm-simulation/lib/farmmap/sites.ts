import type { Feature, Point, Polygon } from 'geojson';
import type { ProcessingSite } from '../api.ts';

export interface SiteProps {
  id: string;
  name: string;
  kind: 'mill';
}

export function siteFeatures(sites: readonly ProcessingSite[]): Feature<Polygon | Point, SiteProps>[] {
  return sites.flatMap((s) => {
    const properties: SiteProps = { id: s.id, name: s.name, kind: 'mill' };
    return [
      { type: 'Feature', geometry: s.geometry, properties },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [s.centroid[1], s.centroid[0]] }, properties },
    ];
  });
}

export function precisionKey(level: string): 'farmMap.site.simulated' | 'farmMap.site.asUploaded' {
  return level.toLowerCase().includes('simulated') ? 'farmMap.site.simulated' : 'farmMap.site.asUploaded';
}
