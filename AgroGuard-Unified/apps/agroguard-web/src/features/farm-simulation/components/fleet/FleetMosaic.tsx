import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatCm, mosaicGrid, mosaicIndexAt, rampColor, type ColorStops, type FleetRow } from '../../lib/fleetQuery.ts';

export type MosaicColor = 'status' | 'water' | 'ndvi';

interface FleetMosaicProps {
  rows: readonly FleetRow[];
  colorBy: MosaicColor;
  selectedId: string | null;
  onSelect: (row: FleetRow) => void;
}

const CELL = 9;
const GAP = 2;

function readTokens(el: HTMLElement) {
  const css = getComputedStyle(el);
  const token = (name: string) => css.getPropertyValue(name).trim();
  const water: ColorStops = [
    [-18, token('--aq-soil-500')],
    [-12, token('--aq-grain-300')],
    [-6, token('--aq-water-300')],
    [0, token('--aq-water-500')],
  ];
  const ndvi: ColorStops = [
    [0.4, token('--aq-soil-300')],
    [0.6, token('--aq-leaf-200')],
    [0.72, token('--aq-leaf-400')],
    [0.85, token('--aq-leaf-800')],
  ];
  return {
    status: { ok: token('--aq-leaf-400'), watch: token('--aq-grain-300'), alert: token('--aq-clay-500'), offline: token('--aq-stone-300') },
    water,
    ndvi,
    ink: token('--aq-stone-900'),
    paper: token('--aq-surface-card'),
  };
}

export const FleetMosaic: React.FC<FleetMosaicProps> = ({ rows, colorBy, selectedId, onSelect }) => {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState(-1);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const measure = () => {
      if (el.clientWidth) setWidth(el.clientWidth);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const grid = mosaicGrid(width, rows.length, CELL, GAP);

  useEffect(() => {
    const el = canvas.current;
    const host = wrap.current;
    if (!el || !host) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(width * dpr);
    el.height = Math.round(grid.height * dpr);
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, grid.height);
    const palette = readTokens(host);
    const radius = Math.min(2, CELL / 4);
    let selectedIndex = -1;
    rows.forEach((row, i) => {
      ctx.fillStyle = colorBy === 'water' ? rampColor(palette.water, row.water) : colorBy === 'ndvi' ? rampColor(palette.ndvi, row.ndvi) : palette.status[row.status];
      const x = (i % grid.cols) * grid.step;
      const y = Math.floor(i / grid.cols) * grid.step;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, CELL, CELL, radius);
      else ctx.rect(x, y, CELL, CELL);
      ctx.fill();
      if (colorBy === 'status' && row.status === 'alert') {
        ctx.strokeStyle = palette.paper;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
      } else if (colorBy === 'status' && row.status === 'offline') {
        ctx.strokeStyle = palette.ink;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 1, y + CELL - 1);
        ctx.lineTo(x + CELL - 1, y + 1);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (row.id === selectedId) selectedIndex = i;
    });
    ctx.strokeStyle = palette.ink;
    [selectedIndex, hover].forEach((index, k) => {
      if (index < 0 || index >= rows.length) return;
      ctx.lineWidth = k === 0 ? 2 : 1.5;
      ctx.globalAlpha = k === 0 ? 1 : 0.55;
      ctx.strokeRect((index % grid.cols) * grid.step - 1.5, Math.floor(index / grid.cols) * grid.step - 1.5, CELL + 3, CELL + 3);
    });
    ctx.globalAlpha = 1;
  }, [rows, colorBy, width, grid.height, grid.cols, grid.step, selectedId, hover]);

  const indexAt = (event: React.MouseEvent) => {
    const box = canvas.current?.getBoundingClientRect();
    return box ? mosaicIndexAt(event.clientX - box.left, event.clientY - box.top, grid, rows.length) : -1;
  };

  const hovered = hover >= 0 ? rows[hover] : null;
  const tipX = hovered ? Math.min(Math.max((hover % grid.cols) * grid.step + CELL / 2, 80), width - 80) : 0;
  const tipY = hovered ? Math.floor(hover / grid.cols) * grid.step - 8 : 0;

  return (
    <div ref={wrap} className="aq-mosaic">
      <canvas
        ref={canvas}
        className="aq-mosaic-canvas"
        role="img"
        aria-label={`${rows.length} fields. Use the table view for keyboard access.`}
        style={{ width, height: grid.height }}
        onMouseMove={(event) => setHover(indexAt(event))}
        onMouseLeave={() => setHover(-1)}
        onClick={(event) => {
          const index = indexAt(event);
          if (index >= 0) onSelect(rows[index]);
        }}
      />
      {hovered ? (
        <span className="aq-tooltip" style={{ left: tipX, top: tipY }}>
          {hovered.id} · {hovered.coop} · {formatCm(hovered.water)}
        </span>
      ) : null}
    </div>
  );
};
