import 'maplibre-gl/dist/maplibre-gl.css';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AttributionControl, LngLatBounds, Map as MapLibreMap, setWorkerUrl, type GeoJSONSource, type LayerSpecification, type MapGeoJSONFeature, type MapMouseEvent } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { basemapImage } from '../../lib/farmmap/basemapImagesTheme.ts';
import { basemapStyle } from '../../lib/farmmap/basemapTheme.ts';
import { applyBasemapView } from '../../lib/farmmap/basemapView.ts';
import { MAP_COLOR } from '../../lib/farmmap/farmMapTheme.ts';
import { ex, getProp } from '../../lib/farmmap/mapExpr.ts';
import { statusOf } from '../../lib/livetwin/twinFilter.ts';
import { farmFeatures, machineFeatures, MACHINE_COLOR, STATUS_COLOR } from '../../lib/livetwin/twinMapData.ts';
import type { FarmModel } from '../../lib/livetwin/twinModels.ts';
import type { MachineWhere } from '../../lib/livetwin/twinStore.ts';
import type { Farm } from '../../lib/livetwin/twinTypes.ts';
import { WMO, compass, type WeatherNow } from '../../lib/livetwin/twinWeather.ts';
import { FIELDS_BOTTOM_PAD, FIELDS_COLLAPSED_W, FIELDS_LEFT_W, FIELDS_MAP_PAD, FIELDS_RIGHT_W, FIELDS_TOP_PAD } from './twinLayout.ts';

setWorkerUrl(workerUrl);

export type FieldsView = 'map' | 'sat';

export interface FocusRequest {
  ids: readonly string[];
  token: number;
}

interface TwinFieldsMapProps {
  farms: readonly Farm[];
  models: Readonly<Record<string, FarmModel>>;
  selected: ReadonlySet<string>;
  visible: ReadonlySet<string>;
  view: FieldsView;
  dataVersion: number;
  focus: FocusRequest | null;
  leftOpen: boolean;
  rightOpen: boolean;
  weatherOf: (farmId: string) => WeatherNow | null;
  getMachines: () => MachineWhere[];
  onSelect: (ids: string[] | null, add: boolean) => void;
  onOpen: (farmId: string) => void;
}

interface Hover {
  x: number;
  y: number;
  farmId: string | null;
  cluster: { count: number; alert: number; watch: number } | null;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  n: number;
}

const FARMS = 'twin-farms';
const MACHINES = 'twin-machines';
const ROUTES = 'twin-routes';
const MACHINE_TICK_MS = 500;
const PARKED_MIN_ZOOM = 10;
const PIN_LAYERS = ['twin-pin', 'twin-pin-status'];
const FONT = ['Noto Sans Bold'];
const WORST = ex('case', ex('>', getProp('alert'), 0), STATUS_COLOR.alert, ex('>', getProp('watch'), 0), STATUS_COLOR.watch, STATUS_COLOR.ok);

function machineLayers(id: string, parked: number, minzoom: number, offset: [number, number]): LayerSpecification[] {
  const filter = ex('==', getProp('parked'), parked);
  return [
    { id, type: 'circle', source: MACHINES, minzoom, filter, paint: { 'circle-radius': 9, 'circle-color': MAP_COLOR.white, 'circle-stroke-width': 2, 'circle-stroke-color': getProp('color'), 'circle-translate': offset } },
    { id: `${id}-letter`, type: 'symbol', source: MACHINES, minzoom, filter, layout: { 'text-field': getProp('letter'), 'text-font': FONT, 'text-size': 10, 'text-allow-overlap': true }, paint: { 'text-color': MAP_COLOR.ink, 'text-translate': offset } },
  ];
}

function dataLayers(): LayerSpecification[] {
  const single = ex('!', ex('has', 'point_count'));
  return [
    { id: 'twin-route', type: 'line', source: ROUTES, paint: { 'line-color': MACHINE_COLOR.travelling, 'line-width': 1.6, 'line-dasharray': [2, 2] } },
    { id: 'twin-cluster', type: 'circle', source: FARMS, filter: ex('has', 'point_count'), paint: { 'circle-color': MAP_COLOR.white, 'circle-radius': ex('step', ex('get', 'point_count'), 15, 5, 19, 15, 24, 40, 30), 'circle-stroke-width': 4, 'circle-stroke-color': WORST } },
    { id: 'twin-cluster-count', type: 'symbol', source: FARMS, filter: ex('has', 'point_count'), layout: { 'text-field': ex('get', 'point_count_abbreviated'), 'text-font': FONT, 'text-size': 13, 'text-allow-overlap': true }, paint: { 'text-color': MAP_COLOR.ink } },
    { id: 'twin-pin-halo', type: 'circle', source: FARMS, filter: ex('all', single, ex('==', getProp('sel'), 1)), paint: { 'circle-radius': 19, 'circle-color': MAP_COLOR.selectGlow } },
    { id: 'twin-pin', type: 'circle', source: FARMS, filter: single, paint: { 'circle-radius': 10, 'circle-color': getProp('color'), 'circle-stroke-width': 3, 'circle-stroke-color': MAP_COLOR.white } },
    { id: 'twin-pin-status', type: 'circle', source: FARMS, filter: single, paint: { 'circle-radius': 3.6, 'circle-translate': [9, -9], 'circle-stroke-width': 1.5, 'circle-stroke-color': MAP_COLOR.white, 'circle-color': ex('match', getProp('status'), 'alert', STATUS_COLOR.alert, 'watch', STATUS_COLOR.watch, 'ok', STATUS_COLOR.ok, STATUS_COLOR.nodata) } },
    { id: 'twin-pin-ring', type: 'circle', source: FARMS, filter: ex('all', single, ex('==', getProp('sel'), 1)), paint: { 'circle-radius': 14, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-width': 2.5, 'circle-stroke-color': STATUS_COLOR.ok } },
    { id: 'twin-pin-label', type: 'symbol', source: FARMS, minzoom: 8, filter: single, layout: { 'text-field': getProp('id'), 'text-font': FONT, 'text-size': 11, 'text-offset': [0, 1.7], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': MAP_COLOR.ink, 'text-halo-color': MAP_COLOR.haloWhite, 'text-halo-width': 1.6 } },
    ...machineLayers('twin-machine', 0, 0, [0, 0]),
    ...machineLayers('twin-machine-parked', 1, PARKED_MIN_ZOOM, [-22, -12]),
  ];
}


const fmt = (value: number | null | undefined) => (value == null || !Number.isFinite(value) ? '—' : `${value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)}`);

export const TwinFieldsMap: React.FC<TwinFieldsMapProps> = (props) => {
  const { farms, models, selected, visible, view, dataVersion, focus, leftOpen, rightOpen } = props;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const baseIds = useRef<string[]>([]);
  const latest = useRef(props);
  latest.current = props;
  const fitted = useRef(false);
  const boxRef = useRef<Box | null>(null);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const [box, setBox] = useState<Box | null>(null);

  const padding = useMemo(
    () => ({
      left: (leftOpen ? FIELDS_LEFT_W : FIELDS_COLLAPSED_W) + FIELDS_MAP_PAD,
      right: (rightOpen ? FIELDS_RIGHT_W : FIELDS_COLLAPSED_W) + FIELDS_MAP_PAD,
      top: FIELDS_TOP_PAD,
      bottom: FIELDS_BOTTOM_PAD,
    }),
    [leftOpen, rightOpen],
  );
  const paddingRef = useRef(padding);
  paddingRef.current = padding;

  useEffect(() => {
    const el = container.current;
    if (!el) return undefined;
    const map = new MapLibreMap({
      container: el,
      style: basemapStyle(),
      center: [108, 12],
      zoom: 4.4,
      minZoom: 3,
      maxZoom: 17,
      attributionControl: false,
      fadeDuration: 0,
      renderWorldCopies: false,
      maxBounds: [[70, -26], [150, 36]],
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    mapRef.current = map;
    map.addControl(new AttributionControl({ compact: true, customAttribution: 'Demo fixture farms · AgriQuill' }), 'bottom-left');
    map.setMissingStyleImageResolver((id) => {
      const image = basemapImage(id);
      if (image && !map.hasImage(id)) map.addImage(id, image.data, { pixelRatio: image.pixelRatio });
    });
    map.doubleClickZoom.disable();

    map.on('load', () => {
      baseIds.current = map.getStyle().layers.map((layer) => layer.id);
      map.addSource(FARMS, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterRadius: 46,
        clusterMaxZoom: 10,
        clusterProperties: { alert: ['+', getProp('alert')], watch: ['+', getProp('watch')], ok: ['+', getProp('ok')], nodata: ['+', getProp('nodata')] },
      });
      map.addSource(MACHINES, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource(ROUTES, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      dataLayers().forEach((layer) => map.addLayer(layer));
      setReady(true);
    });

    const pins = () => PIN_LAYERS.filter((id) => map.getLayer(id));
    const pick = (event: MapMouseEvent) => {
      const found = map.queryRenderedFeatures(event.point, { layers: [...pins(), 'twin-cluster'].filter((id) => map.getLayer(id)) });
      return found[0] as MapGeoJSONFeature | undefined;
    };

    map.on('click', (event) => {
      if (boxRef.current) return;
      const feature = pick(event);
      const add = event.originalEvent.shiftKey || event.originalEvent.metaKey || event.originalEvent.ctrlKey;
      if (!feature) {
        latest.current.onSelect(null, false);
        return;
      }
      if (feature.properties?.cluster) {
        const source = map.getSource(FARMS) as GeoJSONSource;
        const clusterId = Number(feature.properties.cluster_id);
        if (add) {
          source.getClusterLeaves(clusterId, 500, 0).then((leaves) => latest.current.onSelect(leaves.map((l) => String(l.properties?.id)), true)).catch(() => undefined);
          return;
        }
        source.getClusterExpansionZoom(clusterId).then((zoom) => {
          const geometry = feature.geometry;
          if (geometry.type === 'Point') map.easeTo({ center: geometry.coordinates as [number, number], zoom: zoom + 0.4, duration: 600 });
        }).catch(() => undefined);
        return;
      }
      latest.current.onSelect([String(feature.properties?.id)], add);
    });

    map.on('dblclick', (event) => {
      const feature = pick(event);
      if (feature && !feature.properties?.cluster) latest.current.onOpen(String(feature.properties?.id));
      else map.zoomIn({ duration: 300 });
    });

    map.on('mousemove', (event) => {
      if (boxRef.current) return;
      const feature = pick(event);
      map.getCanvas().style.cursor = feature ? 'pointer' : '';
      if (!feature) {
        setHover(null);
        return;
      }
      const props = feature.properties ?? {};
      setHover(
        props.cluster
          ? { x: event.point.x, y: event.point.y, farmId: null, cluster: { count: Number(props.point_count), alert: Number(props.alert), watch: Number(props.watch) } }
          : { x: event.point.x, y: event.point.y, farmId: String(props.id), cluster: null },
      );
    });
    map.on('mouseout', () => setHover(null));

    const onDown = (event: MouseEvent) => {
      if (!event.shiftKey || event.button !== 0) return;
      const rect = el.getBoundingClientRect();
      const x0 = event.clientX - rect.left;
      const y0 = event.clientY - rect.top;
      map.dragPan.disable();
      boxRef.current = { x0, y0, x1: x0, y1: y0, n: 0 };
      setBox(boxRef.current);
      const inside = (b: Box) => {
        const [xa, xb] = [Math.min(b.x0, b.x1), Math.max(b.x0, b.x1)];
        const [ya, yb] = [Math.min(b.y0, b.y1), Math.max(b.y0, b.y1)];
        return latest.current.farms
          .filter((farm) => latest.current.visible.has(farm.id))
          .filter((farm) => {
            const p = map.project([farm.lon, farm.lat]);
            return p.x >= xa && p.x <= xb && p.y >= ya && p.y <= yb;
          })
          .map((farm) => farm.id);
      };
      const move = (e: MouseEvent) => {
        const current = boxRef.current;
        if (!current) return;
        const next = { ...current, x1: e.clientX - rect.left, y1: e.clientY - rect.top };
        next.n = inside(next).length;
        boxRef.current = next;
        setBox(next);
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        map.dragPan.enable();
        const done = boxRef.current;
        window.setTimeout(() => {
          boxRef.current = null;
        }, 0);
        setBox(null);
        if (done && Math.abs(done.x1 - done.x0) > 6 && Math.abs(done.y1 - done.y0) > 6) latest.current.onSelect(inside(done), true);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      event.preventDefault();
      event.stopPropagation();
    };
    el.addEventListener('mousedown', onDown, true);

    return () => {
      el.removeEventListener('mousedown', onDown, true);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource(FARMS) as GeoJSONSource).setData(farmFeatures(farms, models, selected, visible));
    if (!fitted.current && farms.length) {
      fitted.current = true;
      const bounds = new LngLatBounds();
      farms.forEach((farm) => bounds.extend([farm.lon, farm.lat]));
      map.fitBounds(bounds, { padding: paddingRef.current, duration: 0, maxZoom: 7 });
    }
  }, [ready, farms, models, selected, visible, dataVersion]);

  useEffect(() => {
    const map = mapRef.current;
    if (ready && map) applyBasemapView(map, baseIds.current, view === 'sat');
  }, [ready, view]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return undefined;
    const tick = () => {
      const { points, routes } = machineFeatures(latest.current.getMachines(), latest.current.visible);
      (map.getSource(MACHINES) as GeoJSONSource).setData(points);
      (map.getSource(ROUTES) as GeoJSONSource).setData(routes);
    };
    tick();
    const timer = window.setInterval(tick, MACHINE_TICK_MS);
    return () => window.clearInterval(timer);
  }, [ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !focus) return;
    const targets = farms.filter((farm) => focus.ids.includes(farm.id));
    if (!targets.length) return;
    if (targets.length === 1) {
      map.easeTo({ center: [targets[0].lon, targets[0].lat], zoom: Math.max(map.getZoom(), 12), duration: 900 });
      return;
    }
    const bounds = new LngLatBounds();
    targets.forEach((farm) => bounds.extend([farm.lon, farm.lat]));
    map.fitBounds(bounds, { padding: paddingRef.current, maxZoom: 12, duration: 900 });
  }, [ready, focus, farms]);

  const hoverFarm = hover?.farmId ? farms.find((f) => f.id === hover.farmId) : undefined;
  const hoverModel = hoverFarm ? models[hoverFarm.id] : undefined;
  const hoverWeather = hoverFarm ? props.weatherOf(hoverFarm.id) : null;
  const status = hoverFarm ? statusOf(hoverModel) : 'nodata';

  return (
    <div className="aq-tw-map">
      <div ref={container} className="aq-tw-map-canvas" />
      {box ? (
        <div className="aq-tw-box" style={{ left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0) }}>
          <span>{box.n} farms</span>
        </div>
      ) : null}
      {hover && hoverFarm ? (
        <div className="aq-fm-tip" style={{ left: hover.x + 16, top: hover.y + 12 }}>
          <p className="aq-fm-tip-title">
            {hoverFarm.id} · {hoverFarm.name}
          </p>
          <p className="aq-fm-tip-sub">
            {hoverFarm.town ? `${hoverFarm.town}, ` : ''}
            {hoverFarm.country} · {hoverFarm.lat.toFixed(3)}, {hoverFarm.lon.toFixed(3)}
          </p>
          <p className="aq-fm-tip-sub">{hoverModel && hoverModel.paddies.length ? `Lowest water ahead ${fmt(hoverModel.lowest)} cm · ${hoverModel.alerts ?? 0} paddies at risk (model)` : 'No weather data yet'}</p>
          <p className="aq-fm-tip-sub">
            {hoverWeather
              ? `${WMO[hoverWeather.code] ?? ''} · ${Math.round(hoverWeather.temp)} °C · wind ${Math.round(hoverWeather.wind)} km/h ${compass(hoverWeather.dir)}${hoverWeather.rain > 0 ? ` · ${hoverWeather.rain.toFixed(1)} mm/h` : ''}${hoverWeather.simulated ? ' · simulated' : ''}`
              : '—'}
          </p>
          <p className="aq-fm-tip-extra" data-status={status}>
            Click to select · shift-click to add · double-click to open the plan
          </p>
        </div>
      ) : null}
      {hover?.cluster ? (
        <div className="aq-fm-tip" style={{ left: hover.x + 16, top: hover.y + 12 }}>
          <p className="aq-fm-tip-title">{hover.cluster.count} farms here</p>
          <p className="aq-fm-tip-sub">
            {hover.cluster.alert} at risk · {hover.cluster.watch} watch
          </p>
          <p className="aq-fm-tip-extra">Click to zoom in · shift-click to select all {hover.cluster.count}</p>
        </div>
      ) : null}
    </div>
  );
};
