import React, { useEffect, useState } from 'react';
import { Check, WifiOff } from 'lucide-react';
import type { EngineStats } from '../../lib/farmmap/engine/engineTypes.ts';
import { AqSwitch } from '../aq/aqLayout.tsx';

export const CURSOR_EVENT = 'aq-farmmap-cursor';

export interface CursorDetail {
  lat: number;
  lng: number;
}

interface StatusStripProps {
  stats: EngineStats;
  offline: boolean;
  onOffline: (offline: boolean) => void;
  onRetry: () => void;
}

const formatCursor = (c: CursorDetail) => `${c.lat >= 0 ? `${c.lat.toFixed(4)}° N` : `${(-c.lat).toFixed(4)}° S`}, ${c.lng.toFixed(4)}° E`;

export const StatusStrip: React.FC<StatusStripProps> = ({ stats, offline, onOffline, onRetry }) => {
  const [cursor, setCursor] = useState<CursorDetail | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const onCursor = (event: Event) => setCursor((event as CustomEvent<CursorDetail>).detail);
    window.addEventListener(CURSOR_EVENT, onCursor);
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      window.removeEventListener(CURSOR_EVENT, onCursor);
      clearInterval(timer);
    };
  }, []);

  const { chunks, inView } = stats;
  const busy = chunks.loading + chunks.queued;
  const message = stats.overview ? 'Overview · zoom in to stream regions' : busy ? `Loading ${busy} region${busy > 1 ? 's' : ''}` : 'All regions in view loaded';
  return (
    <footer className="aq-fm-status">
      <span className="aq-fm-status-lead">
        {busy ? <span className="aq-fm-spin is-small" aria-hidden="true" /> : offline ? <WifiOff size={12} aria-hidden="true" /> : <Check size={12} aria-hidden="true" />}
        {message}
      </span>
      {chunks.error ? <button type="button" className="aq-fm-retry" onClick={onRetry}>{chunks.error} failed · Retry</button> : null}
      <span><b>{inView.farms}</b> farms · <b>{inView.fields.toLocaleString()}</b> fields · {inView.market} markets in view</span>
      <span className="aq-spacer" />
      <span className="aq-mono">{cursor ? formatCursor(cursor) : '—'}</span>
      <span className="aq-mono">z {stats.zoom.toFixed(1)}</span>
      <span>UTC {new Date(now).toISOString().slice(11, 16)} · map layer illustrative, farm panels live</span>
      <AqSwitch checked={offline} label="Simulate offline" onChange={onOffline} />
    </footer>
  );
};
