import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { FarmMapEngine } from '../../lib/farmmap/engine/engineTypes.ts';
import { getFarmMap } from '../../lib/farmmap/farmMapData.ts';
import { ASEAN_BOUNDS } from '../../lib/farmmap/farmMapRegions.ts';
import { CROPS, MAP_COLOR, miniPending } from '../../lib/farmmap/farmMapTheme.ts';
import type { Position } from '../../lib/farmmap/farmMapTypes.ts';
import { landPolygons, type Topology } from '../../lib/farmmap/topoLand.ts';

const WIDTH = 232;
const HEIGHT = 212;
const LAND_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json';
const px = (lon: number) => ((lon - ASEAN_BOUNDS.w) / (ASEAN_BOUNDS.e - ASEAN_BOUNDS.w)) * WIDTH;
const py = (lat: number) => ((ASEAN_BOUNDS.n - lat) / (ASEAN_BOUNDS.n - ASEAN_BOUNDS.s)) * HEIGHT;

interface MinimapProps {
  engine: FarmMapEngine;
  loaded: number;
  evicted: number;
}

function drawLand(g: CanvasRenderingContext2D, land: Position[][][]) {
  g.fillStyle = MAP_COLOR.land;
  g.strokeStyle = MAP_COLOR.landStroke;
  g.lineWidth = 0.6;
  land.forEach((polygon) => {
    g.beginPath();
    polygon.forEach((ring) => ring.forEach(([x, y], i) => (i ? g.lineTo(px(x), py(y)) : g.moveTo(px(x), py(y)))));
    g.fill('evenodd');
    g.stroke();
  });
}

function drawChunks(g: CanvasRenderingContext2D, engine: FarmMapEngine) {
  const cw = WIDTH / (ASEAN_BOUNDS.e - ASEAN_BOUNDS.w);
  const ch = HEIGHT / (ASEAN_BOUNDS.n - ASEAN_BOUNDS.s);
  const phase = performance.now() / 200;
  engine.chunks.forEach((record, key) => {
    const [la, lo] = key.split(':').map(Number);
    const fills = { loaded: MAP_COLOR.miniLoaded, error: MAP_COLOR.miniError, offline: MAP_COLOR.miniOffline, evicted: MAP_COLOR.miniEvicted };
    g.fillStyle = record.st in fills ? fills[record.st as keyof typeof fills] : miniPending(phase);
    g.fillRect(px(lo) + 0.5, py(la + 1) + 0.5, cw - 1, ch - 1);
  });
}

function drawViewport(g: CanvasRenderingContext2D, engine: FarmMapEngine) {
  const map = engine.map();
  const canvas = map.getCanvas();
  const corners = [[0, 0], [canvas.clientWidth, 0], [canvas.clientWidth, canvas.clientHeight], [0, canvas.clientHeight]].map(([x, y]) => map.unproject([x, y]));
  g.strokeStyle = MAP_COLOR.ink;
  g.lineWidth = 1.5;
  g.fillStyle = MAP_COLOR.viewport;
  g.beginPath();
  corners.forEach((p, i) => (i ? g.lineTo(px(p.lng), py(p.lat)) : g.moveTo(px(p.lng), py(p.lat))));
  g.closePath();
  g.fill();
  g.stroke();
  const center = map.getCenter();
  g.fillStyle = MAP_COLOR.leaf;
  g.beginPath();
  g.arc(px(center.lng), py(center.lat), 3, 0, Math.PI * 2);
  g.fill();
}

export const Minimap: React.FC<MinimapProps> = ({ engine, loaded, evicted }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [land, setLand] = useState<Position[][][]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(LAND_URL, { signal: controller.signal })
      .then((response) => response.json() as Promise<Topology>)
      .then((topology) => setLand(landPolygons(topology, 'countries')))
      .catch(() => setLand([]));
    return () => controller.abort();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== WIDTH * dpr) {
      canvas.width = WIDTH * dpr;
      canvas.height = HEIGHT * dpr;
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = MAP_COLOR.sea;
    g.fillRect(0, 0, WIDTH, HEIGHT);
    drawLand(g, land);
    drawChunks(g, engine);
    getFarmMap().anchors.forEach((a) => {
      g.fillStyle = CROPS[a.crop].color;
      g.beginPath();
      g.arc(px(a.lon), py(a.lat), 1.6 + Math.sqrt(a.farms.length) * 0.45, 0, Math.PI * 2);
      g.fill();
    });
    drawViewport(g, engine);
  }, [engine, land]);

  useEffect(() => {
    draw();
    const timer = setInterval(draw, 120);
    return () => clearInterval(timer);
  }, [draw]);

  const flyTo = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const lon = ASEAN_BOUNDS.w + ((event.clientX - rect.left) / WIDTH) * (ASEAN_BOUNDS.e - ASEAN_BOUNDS.w);
    const lat = ASEAN_BOUNDS.n - ((event.clientY - rect.top) / HEIGHT) * (ASEAN_BOUNDS.n - ASEAN_BOUNDS.s);
    engine.fly({ center: [lon, lat], zoom: Math.max(6.6, engine.map().getZoom()), duration: 2200 });
  };

  return (
    <div className="aq-fm-mini">
      <button type="button" className="aq-fm-mini-btn" onClick={flyTo} aria-label="Minimap of ASEAN. Click to fly to a place.">
        <canvas ref={canvasRef} className="aq-fm-mini-canvas" style={{ width: WIDTH, height: HEIGHT }} />
      </button>
      <p className="aq-fm-mini-foot">
        <span><b>{loaded}</b> regions loaded{evicted ? ` · ${evicted} unloaded` : ''}</span>
        <span>1 cell = 1°</span>
      </p>
    </div>
  );
};
