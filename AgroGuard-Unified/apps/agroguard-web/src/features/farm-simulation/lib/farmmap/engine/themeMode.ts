import type { LayerSpecification } from 'maplibre-gl';
import { toDarkValue } from '../darkColors.ts';
import { MAP_COLOR } from '../farmMapTheme.ts';
import { setView } from './viewModes.ts';
import type { EngineContext } from './engineTypes.ts';

const BASE_PROPS = ['background-color', 'fill-color', 'fill-outline-color', 'line-color', 'text-color', 'text-halo-color', 'hillshade-shadow-color', 'hillshade-highlight-color', 'hillshade-accent-color'];
const LABEL_PROPS = ['text-color', 'text-halo-color'];
const ROAD_LINES: Record<string, string> = {
  'road-minor': '#2f3a35',
  'road-minor-case': '#161c19',
  'road-mid': '#3d4943',
  'road-mid-case': '#181e1b',
  'road-major': '#85693a',
  'road-major-case': '#4f3f1f',
  'road-motorway': '#a3642c',
  'road-motorway-case': '#6a4019',
  rail: '#58615b',
};

const onPill = (layer: LayerSpecification) => layer.type === 'symbol' && layer.layout?.['icon-image'] === 'aq-pill';

export function setTheme(ctx: EngineContext, dark: boolean) {
  ctx.state.dark = dark;
  if (!ctx.state.ready) return;
  const { map, state } = ctx;
  map.getStyle().layers.forEach((layer) => {
    const base = state.baseIds.includes(layer.id);
    const props = base ? BASE_PROPS : layer.type === 'symbol' && !onPill(layer) ? LABEL_PROPS : [];
    props.forEach((prop) => {
      const key = `${layer.id}|${prop}`;
      const painted = (layer.paint as Record<string, unknown> | undefined)?.[prop];
      if (!(key in state.lightPaint) && painted !== undefined) state.lightPaint[key] = painted;
      if (!(key in state.lightPaint)) return;
      const light = state.lightPaint[key];
      const road = prop === 'line-color' ? ROAD_LINES[layer.id] : undefined;
      map.setPaintProperty(layer.id, prop as 'fill-color', (dark ? road ?? toDarkValue(light) : light) as string);
    });
  });
  map.setPaintProperty('own-line', 'line-color', dark ? MAP_COLOR.satText : MAP_COLOR.ownLine);
  state.savedPaint = {};
  setView(ctx, state.view);
}
