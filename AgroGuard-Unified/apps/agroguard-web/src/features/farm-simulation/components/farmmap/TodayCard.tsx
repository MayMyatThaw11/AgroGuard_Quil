import React, { useEffect, useMemo, useState } from 'react';
import { decide, decisionKeys, decisionVars, type Decision } from '../../lib/farmmap/farmDecisions.ts';
import { useFarmWeather } from '../../lib/farmmap/farmLive.ts';
import { CROPS } from '../../lib/farmmap/farmMapTheme.ts';
import type { Farm } from '../../lib/farmmap/farmMapTypes.ts';
import { cueText, getCues, loadCueState, showCue, type Cue } from '../../lib/farmmap/marketCues.ts';
import { getOutlook, produceForCrop, type Produce } from '../../lib/farmmap/market.ts';
import { rankToday, type AdviceItem, type TodayItem } from '../../lib/farmmap/today.ts';
import { activeLocale, useT, type Key } from '../../lib/i18n.ts';
import { browserStorage } from '../../lib/paddySettingsBoot.ts';
import { loadActiveProducer, myProducers } from '../../lib/farmmap/producers.ts';
import { usePaddySettingsStore } from '../../store/paddySettingsStore.ts';
import { AqButton } from '../aq/aqPrimitives.tsx';
import { DetailSection } from './detailParts.tsx';
import { ADVICE_KEY, useWeight } from './TownOutlook.tsx';

const AHEAD_DAYS = 21;
const produceKey = (p: Produce) => `farmMap.produce.${p}` as Key;

function useMarketSignals(farm: Farm | null): { advice: AdviceItem[]; cues: Cue[] } {
  const [state, setState] = useState<{ advice: AdviceItem[]; cues: Cue[] }>({ advice: [], cues: [] });
  useEffect(() => {
    if (!farm) {
      setState({ advice: [], cues: [] });
      return undefined;
    }
    let live = true;
    const on = new Date(Date.now() + AHEAD_DAYS * 86400000).toISOString().slice(0, 10);
    const outlook = getOutlook(farm.town, produceForCrop(farm.crop)[0], on).then((o) => o.advice, () => []);
    const cues = myProducers()
      .then(async (rows) => {
        const id = loadActiveProducer(browserStorage());
        const mine = rows.find((p) => p.id === id) ?? (rows.length === 1 ? rows[0] : null);
        const saved = loadCueState(browserStorage());
        return mine ? (await getCues(mine.id, saved.seenAt)).filter((c) => showCue(c, saved)) : [];
      })
      .catch(() => []);
    void Promise.all([outlook, cues]).then(([advice, found]) => live && setState({ advice, cues: found }));
    return () => {
      live = false;
    };
  }, [farm]);
  return state;
}

export const TodayCard: React.FC<{ farm: Farm | null; onSell: () => void }> = ({ farm, onSell }) => {
  const t = useT();
  const weight = useWeight();
  const safeDepthCm = usePaddySettingsStore((s) => s.applied.awd_safe_depth_cm);
  const weather = useFarmWeather(farm?.lat ?? Number.NaN, farm?.lon ?? Number.NaN);
  const { advice, cues } = useMarketSignals(farm);
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());

  const decisions = useMemo<Decision[]>(
    () => (farm
      ? decide({
        crop: farm.crop, status: farm.status, stageI: farm.stageI, water: farm.water, safeDepthCm, moisture: farm.moisture, ndvi: farm.ndvi,
        areaHa: farm.area, yieldPerHa: farm.yieldF, yieldUnit: CROPS[farm.crop].unit,
        rainDays: weather.status === 'ready' ? weather.value.days.map((d) => ({ date: d.date, mm: d.mm })) : null,
        marketKm: null,
      })
      : []),
    [farm, safeDepthCm, weather],
  );
  const items = useMemo(() => rankToday(decisions, advice, cues), [decisions, advice, cues]);
  const open = items.filter((i) => !done.has(i.key));
  const current = open[0];

  const sentence = (item: TodayItem): string => {
    if (item.decision) {
      const keys = decisionKeys(item.decision);
      return t(keys.title, decisionVars(item.decision.params, activeLocale()));
    }
    if (item.cue) return cueText(item.cue, t, (p) => t(produceKey(p)), weight);
    const a = item.advice as AdviceItem;
    if (a.id === 'pickup-rain') return t('farmMap.today.pickupRain');
    const w = typeof a.params.unmet_kg === 'number' ? weight(a.params.unmet_kg) : '';
    return t(ADVICE_KEY[a.id], { ...a.params, w, produce: farm ? t(produceKey(produceForCrop(farm.crop)[0])) : '' });
  };

  return (
    <DetailSection className="aq-fm-today">
      <p className="aq-fm-mk-subhead">{t('farmMap.today.title')}</p>
      {!farm ? <p className="aq-fm-mk-quiet">{t('farmMap.today.noFarm')}</p> : null}
      {farm && !current ? <p className="aq-fm-today-text" role="status">{t('farmMap.today.allGood')}</p> : null}
      {current ? (
        <div key={current.key} className={`aq-fm-today-item is-${current.level}`}>
          <p className="aq-fm-today-text" role="status">{sentence(current)}</p>
          <div className="aq-fm-mk-offer-actions">
            {current.source !== 'decision' ? <AqButton variant="primary" large onClick={onSell}>{t('farmMap.today.openMarket')}</AqButton> : null}
            <AqButton variant={current.source === 'decision' ? 'primary' : 'ghost'} large onClick={() => setDone(new Set([...done, current.key]))}>{t('farmMap.today.done')}</AqButton>
          </div>
          {open.length > 1 ? <p className="aq-fm-mk-quiet">{t('farmMap.today.more', { n: open.length - 1 })}</p> : null}
        </div>
      ) : null}
    </DetailSection>
  );
};
