import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Navigation, Plus } from 'lucide-react';
import { buyerKind as savedBuyerKind } from '../../../../lib/account.js';
import type { RouteStop } from '../../lib/farmmap/engine/engineTypes.ts';
import {
  getOutlook,
  kgStep,
  myPreorders,
  postPreorder,
  preorderOffers,
  PRODUCE,
  selectOffer,
  type Candidate,
  type MyPreorder,
  type Outlook,
  type Produce,
} from '../../lib/farmmap/market.ts';
import { activeLocale, useT, type Key } from '../../lib/i18n.ts';
import { AqButton } from '../aq/aqPrimitives.tsx';
import { DetailSection } from './detailParts.tsx';
import { TownOutlook, useWeight } from './TownOutlook.tsx';

export interface BuyerPlace {
  town: string;
  lat: number;
  lon: number;
}

const produceKey = (p: Produce) => `farmMap.produce.${p}` as Key;
const kindKey = (kind: string) => `farmMap.market.kind.${kind}` as Key;
const day = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' }) : '');
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const Candidates: React.FC<{ order: MyPreorder; place: BuyerPlace; onDirections: (from: RouteStop, to: RouteStop) => void }> = ({ order, place, onDirections }) => {
  const t = useT();
  const weight = useWeight();
  const [rows, setRows] = useState<Candidate[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    preorderOffers(order.id).then(setRows, (e) => setError(message(e)));
  }, [order.id]);
  useEffect(load, [load]);
  if (error) return <p className="aq-fm-mk-error" role="alert">{t('farmMap.market.error', { error })}</p>;
  if (rows === null) return <p className="aq-fm-mk-quiet">…</p>;
  if (!rows.length) return <p className="aq-fm-mk-quiet">{t('farmMap.buyer.noOffers')}</p>;
  return (
    <div className="aq-fm-mk-candidates" role="table" aria-label={t('farmMap.buyer.candidates')}>
      {rows.map((row) => (
        <div key={row.id} role="row" className={`aq-fm-mk-candidate ${row.status === 'selected' ? 'is-selected' : ''}`}>
          <span role="cell" className="aq-fm-mk-buyer-kind">{row.farmer_name ?? t('farmMap.buyer.farm')}</span>
          <span role="cell">{weight(row.qty_kg)}</span>
          <span role="cell" className="aq-fm-mk-quiet">{t('farmMap.buyer.ready', { date: day(row.ready_on) })}, {t('farmMap.market.away', { km: row.km })}</span>
          <span role="cell">
            {row.status === 'selected' ? (
              row.farm_lat !== undefined && row.farm_lon !== undefined ? (
                <AqButton variant="primary" onClick={() => onDirections({ id: 'buyer', label: place.town, lat: place.lat, lon: place.lon }, { id: row.id, label: row.farmer_name ?? row.farm_town ?? '', lat: row.farm_lat as number, lon: row.farm_lon as number })}>
                  <Navigation size={14} aria-hidden="true" />{t('farmMap.market.directions')}
                </AqButton>
              ) : null
            ) : (
              <AqButton onClick={() => void selectOffer(order.id, row.id).then(load, (e) => setError(message(e)))}>
                <CheckCircle2 size={14} aria-hidden="true" />{t('farmMap.buyer.select')}
              </AqButton>
            )}
          </span>
        </div>
      ))}
    </div>
  );
};

export const BuyerBoard: React.FC<{ place: BuyerPlace; onDirections: (from: RouteStop, to: RouteStop) => void }> = ({ place, onDirections }) => {
  const t = useT();
  const weight = useWeight();
  const kind = savedBuyerKind() ?? 'cooperative';
  const [open, setOpen] = useState(false);
  const [produce, setProduce] = useState<Produce>('tomato');
  const [kg, setKg] = useState(() => (kgStep(kind) === 1 ? 10 : 1000));
  const [needed, setNeeded] = useState(() => inDays(21));
  const [town, setTown] = useState(place.town);
  const [price, setPrice] = useState('');
  const [orders, setOrders] = useState<MyPreorder[]>([]);
  const [outlook, setOutlook] = useState<Outlook | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');

  const loadOrders = useCallback(() => {
    myPreorders().then(setOrders, (e) => setError(message(e)));
  }, []);
  useEffect(loadOrders, [loadOrders]);
  useEffect(() => setTown(place.town), [place.town]);
  useEffect(() => {
    getOutlook(town, produce, needed).then(setOutlook, () => setOutlook(null));
  }, [town, produce, needed]);

  const post = async () => {
    setError('');
    try {
      await postPreorder({ produce, qty_kg: kg, needed_by: needed, town, lat: place.lat, lon: place.lon, ...(price ? { price_offer_mmk_kg: Number(price) } : {}) });
      setFlash(t('farmMap.buyer.posted'));
      setOpen(false);
      loadOrders();
    } catch (e) {
      setError(message(e));
    }
  };

  return (
    <div className="aq-fm-mk" data-ui-panel="buyer">
      <DetailSection className="is-head">
        <h2 className="aq-title">{t('farmMap.buyer.title')}</h2>
        <p className="aq-meta">{t(kindKey(kind))}, {place.town}</p>
        <AqButton variant="primary" large onClick={() => setOpen((v) => !v)}><Plus size={15} aria-hidden="true" />{t('farmMap.buyer.post')}</AqButton>
        {flash ? <p className="aq-fm-mk-flash" role="status">{flash}</p> : null}
      </DetailSection>

      {open ? (
        <DetailSection className="aq-fm-mk-form">
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
              <span>{t('farmMap.buyer.neededBy')}</span>
              <input className="aq-fm-input" type="date" value={needed} onChange={(e) => setNeeded(e.target.value)} />
            </label>
            <label>
              <span>{t('farmMap.buyer.town')}</span>
              <input className="aq-fm-input" value={town} maxLength={80} onChange={(e) => setTown(e.target.value)} />
            </label>
            <label>
              <span>{t('farmMap.buyer.price')}</span>
              <input className="aq-fm-input" type="number" min={1} inputMode="numeric" value={price} placeholder={t('farmMap.market.noOfferPrice')} onChange={(e) => setPrice(e.target.value)} />
            </label>
          </div>
          <AqButton variant="primary" large onClick={() => void post()}>{t('farmMap.buyer.postNow')}</AqButton>
        </DetailSection>
      ) : null}

      {outlook ? <TownOutlook outlook={outlook} crop="veg" produceWord={t(produceKey(produce))} /> : null}

      <DetailSection>
        <p className="aq-fm-mk-subhead">{t('farmMap.buyer.mine')}</p>
        {error ? <p className="aq-fm-mk-error" role="alert">{t('farmMap.market.error', { error })}</p> : null}
        {!orders.length ? <p className="aq-fm-mk-quiet">{t('farmMap.buyer.none')}</p> : null}
        {orders.map((order) => (
          <div key={order.id} className="aq-fm-mk-offer">
            <button type="button" className="aq-fm-mk-order-head" aria-expanded={expanded === order.id} onClick={() => setExpanded(expanded === order.id ? null : order.id)}>
              <span>
                <strong>{t(produceKey(order.produce))}</strong>, {t('farmMap.market.needs', { w: weight(order.qty_kg), date: day(order.needed_by) })}
                <span className="aq-fm-mk-quiet"> {t('farmMap.buyer.offers', { n: order.offers })}</span>
              </span>
              {expanded === order.id ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
            </button>
            {expanded === order.id ? <Candidates order={order} place={place} onDirections={onDirections} /> : null}
          </div>
        ))}
      </DetailSection>
    </div>
  );
};
