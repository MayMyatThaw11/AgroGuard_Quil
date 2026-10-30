import React from 'react';
import { Waves } from 'lucide-react';
import type { FarmRisk } from '../../lib/api.ts';
import type { Loaded } from '../../lib/farmmap/farmLive.ts';
import { FLOOD_WORD, WHAT_IF, type FieldHeights, type FloodBasis, type FloodClass } from '../../lib/farmview/flood.ts';
import type { Favor } from '../../lib/farmmap/surroundings.ts';
import { useT } from '../../lib/i18n.ts';
import { AqTabs } from '../aq/aqLayout.tsx';
import { RollerPicker } from '../inputs/RollerPicker.tsx';

interface FloodPanelProps {
  own: boolean;
  risk: Loaded<FarmRisk | null>;
  notes: readonly Favor[];
  depth: number;
  onDepth: (m: number) => void;
  heights: FieldHeights | null;
  basis: FloodBasis;
  onBasis: (basis: FloodBasis) => void;
  result: FloodClass | null;
  errorM: number;
}

const round = (m: number) => (Math.abs(m) < 10 ? m.toFixed(1) : String(Math.round(m)));
const RESULT_KEY = {
  dry: 'farmMap.farmView.flood.result.dry',
  may: 'farmMap.farmView.flood.result.may',
  likely: 'farmMap.farmView.flood.result.likely',
} as const;

export const FloodPanel: React.FC<FloodPanelProps> = ({ own, risk, notes, depth, onDepth, heights, basis, onBasis, result, errorM }) => {
  const t = useT();
  const flood = risk.status === 'ready' ? risk.value : null;
  return (
    <details className="aq-fm-replica-flood">
      <summary><Waves size={13} aria-hidden="true" /> {t('farmMap.farmView.flood.title')}</summary>
      <div>
        {heights ? (
          <p className="aq-fm-note is-strong">{t('farmMap.farmView.flood.height', { median: round(heights.median), min: round(heights.min), max: round(heights.max), err: errorM })}</p>
        ) : (
          <p className="aq-fm-note">{t('farmMap.farmView.flood.noHeight')}</p>
        )}
        {own && risk.status === 'error' ? <p className="aq-fm-note">{t('farmMap.farmView.flood.failed')}</p> : null}
        {own && flood ? <p className="aq-fm-note" data-level={flood.level}>{t('farmMap.farmView.flood.risk', { level: t(FLOOD_WORD[flood.level]) })}</p> : null}
        {notes.map((n) => <p key={`${n.kind}-${n.text}`} className="aq-fm-note">{n.text}</p>)}
        <AqTabs<FloodBasis>
          value={basis}
          label={t('farmMap.farmView.flood.basis')}
          onChange={onBasis}
          items={[
            { value: 'sea', label: t('farmMap.farmView.flood.basisSea') },
            { value: 'river', label: t('farmMap.farmView.flood.basisRiver') },
          ]}
        />
        <RollerPicker label={t('farmMap.farmView.flood.rise')} unit="m" value={depth} min={WHAT_IF.min} max={WHAT_IF.max} step={WHAT_IF.step} onChange={onDepth} hint={t('farmMap.farmView.flood.riseNote')} />
        {result ? <p className="aq-fm-note is-strong" data-flood={result} role="status">{t(RESULT_KEY[result], { rise: depth })}</p> : null}
      </div>
    </details>
  );
};
