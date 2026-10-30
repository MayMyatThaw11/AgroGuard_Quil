import React, { useEffect, useState } from 'react';
import { BellOff, Check } from 'lucide-react';
import { cueText, getCues, getSeason, loadCueState, saveCueState, seasonText, showCue, type Cue, type SeasonRecord } from '../../lib/farmmap/marketCues.ts';
import type { Produce } from '../../lib/farmmap/market.ts';
import { useT, type Key } from '../../lib/i18n.ts';
import { browserStorage } from '../../lib/paddySettingsBoot.ts';
import { AqButton } from '../aq/aqPrimitives.tsx';
import { DetailSection } from './detailParts.tsx';
import { useWeight } from './TownOutlook.tsx';

export const MarketCue: React.FC<{ producerId: string }> = ({ producerId }) => {
  const t = useT();
  const weight = useWeight();
  const [state, setState] = useState(() => loadCueState(browserStorage()));
  const [cue, setCue] = useState<Cue | null>(null);

  useEffect(() => {
    let live = true;
    getCues(producerId, loadCueState(browserStorage()).seenAt).then((rows) => live && setCue(rows[0] ?? null), () => live && setCue(null));
    return () => {
      live = false;
    };
  }, [producerId]);

  const update = (next: typeof state) => {
    setState(next);
    saveCueState(browserStorage(), next);
  };
  if (!cue || !showCue(cue, state)) return null;
  return (
    <DetailSection className="aq-fm-mk-cue">
      <p className="aq-fm-mk-subhead">{t('farmMap.cue.title')}</p>
      <p role="status">{cueText(cue, t, (p: Produce) => t(`farmMap.produce.${p}` as Key), weight)}</p>
      <div className="aq-fm-mk-offer-actions">
        <AqButton variant="secondary" onClick={() => update({ ...state, seenAt: cue.issued_on })}><Check size={14} aria-hidden="true" />{t('farmMap.cue.dismiss')}</AqButton>
        <AqButton variant="ghost" onClick={() => update({ ...state, muted: true })}><BellOff size={14} aria-hidden="true" />{t('farmMap.cue.mute')}</AqButton>
      </div>
    </DetailSection>
  );
};

export const SeasonLine: React.FC<{ producerId: string }> = ({ producerId }) => {
  const t = useT();
  const weight = useWeight();
  const [record, setRecord] = useState<SeasonRecord | null>(null);
  useEffect(() => {
    let live = true;
    getSeason(producerId).then((r) => live && setRecord(r), () => live && setRecord(null));
    return () => {
      live = false;
    };
  }, [producerId]);
  const text = record ? seasonText(record, t, weight) : null;
  return text ? <DetailSection><p className="aq-fm-mk-flash">{text}</p></DetailSection> : null;
};
