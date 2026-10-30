import React, { useEffect, useState } from 'react';
import { getOutlook, marketEnabled, type Produce } from '../../lib/farmmap/market.ts';
import { loadActiveProducer, myProducers, type Producer } from '../../lib/farmmap/producers.ts';
import { useT, type Key } from '../../lib/i18n.ts';
import { browserStorage } from '../../lib/paddySettingsBoot.ts';
import { DetailSection } from './detailParts.tsx';
import { VERDICT_KEY } from './TownOutlook.tsx';

const AHEAD_DAYS = 21;
const MAX_LINES = 3;
const produceKey = (p: Produce) => `farmMap.produce.${p}` as Key;

type Glance = { enabled: boolean; producer: Producer | null };

function useGlance(): Glance | null {
  const [state, setState] = useState<Glance | null>(null);
  useEffect(() => {
    let live = true;
    marketEnabled()
      .then((r) => (r.enabled ? myProducers() : null))
      .then((rows) => {
        if (!live) return;
        const id = loadActiveProducer(browserStorage());
        setState({ enabled: rows !== null, producer: rows?.find((p) => p.id === id) ?? (rows?.length === 1 ? rows[0] : null) });
      })
      .catch(() => live && setState({ enabled: false, producer: null }));
    return () => {
      live = false;
    };
  }, []);
  return state;
}

function useVerdicts(producer: Producer | null, limit: number): string[] {
  const t = useT();
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    const town = producer?.township || producer?.village;
    if (!producer || !town) {
      setLines([]);
      return undefined;
    }
    let live = true;
    const on = new Date(Date.now() + AHEAD_DAYS * 86400000).toISOString().slice(0, 10);
    const crops = [...new Set(producer.crops.map((c) => c.produce))].slice(0, limit);
    void Promise.allSettled(crops.map((p) => getOutlook(town, p, on))).then((all) => {
      if (!live) return;
      setLines(all.flatMap((r) => (r.status === 'fulfilled' ? [t(VERDICT_KEY[r.value.level], { town: r.value.town, produce: t(produceKey(r.value.produce)) })] : [])));
    });
    return () => {
      live = false;
    };
  }, [producer, limit, t]);
  return lines;
}

export const MarketStrip: React.FC = () => {
  const t = useT();
  const glance = useGlance();
  const lines = useVerdicts(glance?.producer ?? null, MAX_LINES);
  if (!glance?.enabled) return null;
  return (
    <DetailSection>
      <p className="aq-fm-mk-subhead">{t('farmMap.strip.title')}</p>
      {glance.producer ? lines.map((line) => <p key={line} className="aq-fm-note">{line}</p>) : <p className="aq-fm-mk-quiet">{t('farmMap.strip.none')}</p>}
    </DetailSection>
  );
};

export const MarketLine: React.FC = () => {
  const glance = useGlance();
  const [line] = useVerdicts(glance?.producer ?? null, 1);
  return line ? <p className="aq-fm-note aq-fm-wx-market">{line}</p> : null;
};
