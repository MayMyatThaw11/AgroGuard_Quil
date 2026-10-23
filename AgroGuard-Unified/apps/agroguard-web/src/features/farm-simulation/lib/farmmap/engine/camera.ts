import type { GeoJSONSource } from 'maplibre-gl';
import { fieldsOf } from '../farmMapGeometry.ts';
import type { Farm } from '../farmMapTypes.ts';
import { clearSource } from './dataAssembly.ts';
import type { EngineContext, FlyTarget } from './engineTypes.ts';
import { applyRelief } from './viewModes.ts';

const PADDING = { left: 300, right: 380, top: 60, bottom: 90 };

export function fly(ctx: EngineContext, target: FlyTarget, flat = false) {
  const cinematic = ctx.state.cinematic && !flat;
  const pitch = cinematic ? (target.zoom >= 12 ? 55 : target.zoom >= 9 ? 35 : 0) : 0;
  const bearing = cinematic && target.zoom >= 9 ? (target.bearing ?? -14) : 0;
  ctx.map.flyTo({ curve: 1.55, speed: 0.85, essential: true, pitch, bearing, padding: PADDING, center: target.center, zoom: target.zoom, duration: target.duration });
}

export function focusFarm(ctx: EngineContext, farm: Farm) {
  const zoom = Math.max(13, Math.min(16.2, 16.4 - Math.log2(Math.sqrt(farm.area * 10000) / 40) * 0.9));
  fly(ctx, { center: [farm.lon, farm.lat], zoom, bearing: ctx.state.cinematic ? farm.bearing * 0.6 - 12 : 0, duration: 3000 });
}

export function select(ctx: EngineContext, farmId: string | null) {
  const farm = farmId ? ctx.data.farmById[farmId] : null;
  const source = ctx.map.getSource('aq-sel') as GeoJSONSource | undefined;
  if (!source) return;
  if (!farm) {
    clearSource(ctx, 'aq-sel');
    return;
  }
  source.setData({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [fieldsOf(farm).bound] } }],
  });
}

export function establishing(ctx: EngineContext) {
  ctx.map.flyTo({ center: [108.5, 9.5], zoom: 4.55, pitch: 0, bearing: 0, duration: 3200, curve: 1.2, essential: true });
}

export function setTerrain(ctx: EngineContext, on: boolean) {
  ctx.state.terrain = on;
  if (!ctx.state.ready) return;
  ctx.map.setTerrain(on ? { source: 'dem3d', exaggeration: 1.35 } : null);
  applyRelief(ctx);
  if (on && ctx.map.getPitch() < 30) ctx.map.easeTo({ pitch: 50, duration: 800 });
}
