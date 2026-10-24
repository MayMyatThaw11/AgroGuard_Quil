import React from 'react';
import { Waves } from 'lucide-react';
import type { FarmRisk } from '../../lib/api.ts';
import type { Loaded } from '../../lib/farmmap/farmLive.ts';
import { FLOOD_WORD, WHAT_IF } from '../../lib/farmview/flood.ts';
import type { Favor } from '../../lib/farmmap/surroundings.ts';
import { useT } from '../../lib/i18n.ts';
import { RollerPicker } from '../inputs/RollerPicker.tsx';

interface FloodPanelProps {
  own: boolean;
  risk: Loaded<FarmRisk | null>;
  notes: readonly Favor[];
  depth: number;
  onDepth: (m: number) => void;
}

export const FloodPanel: React.FC<FloodPanelProps> = ({ own, risk, notes, depth, onDepth }) => {
  const t = useT();
  const flood = risk.status === 'ready' ? risk.value : null;
  return (
    <details className="aq-fm-replica-flood">
      <summary><Waves size={13} aria-hidden="true" /> {t('farmMap.farmView.flood.title')}</summary>
      <div>
        {!own ? <p className="aq-fm-note">{t('farmMap.farmView.flood.example')}</p> : null}
        {own && risk.status === 'error' ? <p className="aq-fm-note">{t('farmMap.farmView.flood.failed')}</p> : null}
        {own && flood ? <p className="aq-fm-note is-strong" data-level={flood.level}>{t('farmMap.farmView.flood.risk', { level: t(FLOOD_WORD[flood.level]) })}</p> : null}
        {own && flood?.elevation?.within_dem_error ? <p className="aq-fm-note">{t('farmMap.farmView.flood.demError')}</p> : null}
        {notes.map((n) => <p key={`${n.kind}-${n.text}`} className="aq-fm-note">{n.text}</p>)}
        <RollerPicker label={t('farmMap.farmView.flood.whatIf')} unit="m" value={depth} min={WHAT_IF.min} max={WHAT_IF.max} step={WHAT_IF.step} onChange={onDepth} hint={t('farmMap.farmView.flood.whatIfNote')} />
      </div>
    </details>
  );
};
