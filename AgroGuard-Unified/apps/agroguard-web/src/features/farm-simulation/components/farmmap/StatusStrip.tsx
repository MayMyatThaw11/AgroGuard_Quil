import React, { useEffect, useState } from 'react';
import { Check, WifiOff } from 'lucide-react';
import type { EngineStats } from '../../lib/farmmap/engine/engineTypes.ts';
import { activeLocale, useT } from '../../lib/i18n.ts';
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
  const t = useT();
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
  const message = stats.overview ? t('farmMap.status.overview') : busy === 1 ? t('farmMap.status.loadingOne') : busy ? t('farmMap.status.loading', { n: busy }) : t('farmMap.status.loaded');
  return (
    <footer className="aq-fm-status">
      <span className="aq-fm-status-lead">
        {busy ? <span className="aq-fm-spin is-small" aria-hidden="true" /> : offline ? <WifiOff size={12} aria-hidden="true" /> : <Check size={12} aria-hidden="true" />}
        {message}
      </span>
      {chunks.error ? <button type="button" className="aq-fm-retry" onClick={onRetry}>{t('farmMap.status.failed', { n: chunks.error })}</button> : null}
      <span>{t('farmMap.status.inView', { farms: inView.farms, fields: inView.fields.toLocaleString(activeLocale()), markets: inView.market })}</span>
      <span className="aq-spacer" />
      <span className="aq-mono">{cursor ? formatCursor(cursor) : '—'}</span>
      <span className="aq-mono">z {stats.zoom.toFixed(1)}</span>
      <span>UTC {new Date(now).toISOString().slice(11, 16)} · {t('farmMap.status.note')}</span>
      <AqSwitch checked={offline} label={t('farmMap.keys.offline')} onChange={onOffline} />
    </footer>
  );
};
