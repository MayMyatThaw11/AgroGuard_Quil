import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { buyerKind as savedBuyerKind } from '../../../../lib/account.js';
import { kgStep, postPreorder, PRODUCE, type Produce } from '../../lib/farmmap/market.ts';
import { askFarmsBody } from '../../lib/farmmap/supplyAsk.ts';
import { bandTone, basisText, getSurplus, landedText, saveSearch, searchSupply, type SearchQuery, type SupplyResult, type SurplusTown } from '../../lib/farmmap/supplySearch.ts';
import { buySteps } from '../../lib/farmmap/steps.ts';
import { farmerRecordText } from '../../lib/farmmap/seasonMatch.ts';
import { activeLocale, useT, type Key } from '../../lib/i18n.ts';
import { AqBadge, AqButton } from '../aq/aqPrimitives.tsx';
import { DetailSection } from './detailParts.tsx';
import { useWeight } from './TownOutlook.tsx';
import { MoreRows, StepsStrip } from './uxParts.tsx';

export interface SearchPlace {
  town: string;
  lat: number;
  lon: number;
}

const FOOD_BUSINESS = ['processor', 'restaurant', 'cooperative'];
const produceKey = (p: Produce) => `farmMap.produce.${p}` as Key;
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' });

export const SupplySearch: React.FC<{ place: SearchPlace }> = ({ place }) => {
  const t = useT();
  const weight = useWeight();
  const kind = savedBuyerKind() ?? 'cooperative';
  const [produce, setProduce] = useState<Produce>('tomato');
  const [kg, setKg] = useState(() => (kgStep(kind) === 1 ? 10 : 1000));
  const [by, setBy] = useState(() => inDays(21));
  const [more, setMore] = useState(false);
  const [budget, setBudget] = useState('');
  const [radius, setRadius] = useState(50);
  const [result, setResult] = useState<SupplyResult | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [surplus, setSurplus] = useState<SurplusTown[]>([]);
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');
  const [asked, setAsked] = useState(false);
  const query: SearchQuery = { produce, lat: place.lat, lon: place.lon, kg, budget, radius, by };

  useEffect(() => {
    if (!FOOD_BUSINESS.includes(kind)) return undefined;
    let live = true;
    getSurplus(produce, place.lat, place.lon, by).then((rows) => live && setSurplus(rows), () => live && setSurplus([]));
    return () => {
      live = false;
    };
  }, [kind, produce, place.lat, place.lon, by]);

  const run = async () => {
    setError('');
    setFlash('');
    setPicked(new Set());
    try {
      setResult(await searchSupply(query));
    } catch (e) {
      setError(message(e));
    }
  };

  const ask = async () => {
    setError('');
    try {
      await postPreorder(askFarmsBody(query, place.town, [...picked]));
      setFlash(t('farmMap.supply.asked', { n: picked.size }));
      setAsked(true);
      setPicked(new Set());
    } catch (e) {
      setError(message(e));
    }
  };

  const toggle = (id: string) => setPicked((now) => new Set(now.has(id) ? [...now].filter((x) => x !== id) : [...now, id]));
  const reference = result?.reference_price?.mmk_kg;

  return (
    <>
      <StepsStrip title={t('farmMap.steps.buyTitle')} steps={buySteps({ searched: result !== null, asked, selected: false, received: false })} />
      <DetailSection className="aq-fm-mk-form">
        <p className="aq-fm-mk-subhead">{t('farmMap.supply.title')}</p>
        <div className="aq-fm-group">
          <div className="aq-fm-mk-fields">
            <label>
              <span>{t('farmMap.market.produce')}</span>
              <select className="aq-fm-select" value={produce} onChange={(e) => setProduce(e.target.value as Produce)}>
                {PRODUCE.map((p) => <option key={p} value={p}>{t(produceKey(p))}</option>)}
              </select>
            </label>
            <label>
              <span>{t('farmMap.market.kg')}</span>
              <input className="aq-fm-input" type="number" min={1} step={kgStep(kind)} inputMode="numeric" value={kg} onChange={(e) => setKg(Math.max(1, Number(e.target.value) || 1))} />
            </label>
            <label>
              <span>{t('farmMap.supply.by')}</span>
              <input className="aq-fm-input" type="date" value={by} onChange={(e) => setBy(e.target.value)} />
            </label>
          </div>
        </div>
        <details className="aq-fm-group" open={more} onToggle={(e) => setMore((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>{t('farmMap.supply.more')}</summary>
          <div className="aq-fm-mk-fields">
            <label>
              <span>{t('farmMap.supply.budget')}</span>
              <input className="aq-fm-input" type="number" min={1} inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </label>
            <label>
              <span>{t('farmMap.supply.radius')}</span>
              <input className="aq-fm-input" type="number" min={1} max={500} inputMode="numeric" value={radius} onChange={(e) => setRadius(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} />
            </label>
          </div>
        </details>
        <AqButton variant="primary" large onClick={() => void run()}><Search size={15} aria-hidden="true" />{t('farmMap.supply.search')}</AqButton>
        {error ? <p className="aq-fm-mk-error" role="alert">{t('farmMap.market.error', { error })}</p> : null}
      </DetailSection>

      {result ? (
        <DetailSection>
          {!result.groups.length ? <p className="aq-fm-mk-quiet">{t('farmMap.supply.none')}</p> : <p className="aq-fm-mk-quiet">{t('farmMap.supply.pick')}</p>}
          <MoreRows rows={result.groups}>
            {(groups) => groups.map((g) => (
              <div key={g.town} className="aq-fm-group">
                <p className="aq-fm-mk-subhead">{t('farmMap.supply.group', { town: g.town, km: g.km, w: weight(g.kg_ready) })}</p>
                <MoreRows rows={g.listings}>
                  {(rows) => rows.map((r) => (
                    <label key={r.id} className="aq-fm-supply-row">
                      <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} />
                      <span className="aq-fm-supply-main">
                        <strong>{r.farm ?? t('farmMap.buyer.farm')}</strong>
                        <span>{weight(r.qty_kg)}, {t('farmMap.supply.ready', { date: day(r.ready_on) })}</span>
                        <span>{landedText(r, t, activeLocale())}</span>
                        {basisText(r, t, activeLocale(), reference) ? <span className="aq-fm-mk-quiet">{basisText(r, t, activeLocale(), reference)}</span> : null}
                        {r.reliability ? <span className="aq-fm-mk-quiet">{farmerRecordText(r.reliability, t)}</span> : null}
                      </span>
                      {r.band ? <AqBadge tone={bandTone(r.band)}>{t(`farmMap.supply.band.${r.band}` as Key)}</AqBadge> : null}
                    </label>
                  ))}
                </MoreRows>
              </div>
            ))}
          </MoreRows>
          <div className="aq-fm-group">
            <AqButton variant="primary" large disabled={!picked.size} onClick={() => void ask()}>{t('farmMap.supply.ask', { n: picked.size })}</AqButton>
            <AqButton variant="secondary" onClick={() => void saveSearch(query).then(() => setFlash(t('farmMap.supply.saved')), (e) => setError(message(e)))}>{t('farmMap.supply.save')}</AqButton>
          </div>
          {flash ? <p className="aq-fm-mk-flash" role="status">{flash}</p> : null}
        </DetailSection>
      ) : null}

      {surplus.length ? (
        <DetailSection>
          <p className="aq-fm-mk-subhead">{t('farmMap.supply.surplus')}</p>
          <MoreRows rows={surplus}>
            {(rows) => rows.map((s) => <p key={s.town} className="aq-fm-note">{t('farmMap.supply.surplusRow', { town: s.town, w: weight(s.supply_kg), km: s.km })}</p>)}
          </MoreRows>
        </DetailSection>
      ) : null}
    </>
  );
};
