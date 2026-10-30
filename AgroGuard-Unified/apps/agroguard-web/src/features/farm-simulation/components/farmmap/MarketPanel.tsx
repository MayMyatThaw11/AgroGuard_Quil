import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Handshake, Navigation, RefreshCw, Truck } from 'lucide-react';
import type { RouteStop } from '../../lib/farmmap/engine/engineTypes.ts';
import { CROPS } from '../../lib/farmmap/farmMapTheme.ts';
import type { Farm } from '../../lib/farmmap/farmMapTypes.ts';
import {
  applyToPreorder,
  bookPickup,
  getMyOffers,
  getOutlook,
  getPreorders,
  postListing,
  produceForCrop,
  sortByDistance,
  withinReach,
  type Channel,
  type Listing,
  type Offer,
  type Outlook,
  type Pickup,
  type Preorder,
  type Produce,
} from '../../lib/farmmap/market.ts';
import { activeLocale, useT, type Key } from '../../lib/i18n.ts';
import { AqTabs } from '../aq/aqLayout.tsx';
import { AqButton } from '../aq/aqPrimitives.tsx';
import { DetailSection } from './detailParts.tsx';
import { HaulShare } from './HaulShare.tsx';
import { TownOutlook, useWeight } from './TownOutlook.tsx';

const READY_IN_DAYS = 21;
const kindKey = (kind: string) => `farmMap.market.kind.${kind}` as Key;
const produceKey = (p: Produce) => `farmMap.produce.${p}` as Key;
const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' });
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

function expectedKg(farm: Farm): number {
  const meta = CROPS[farm.crop];
  if (!meta || meta.unit !== 't/ha') return 500;
  return Math.max(10, Math.round((farm.area * (meta.yld[0] + meta.yld[1]) * 1000) / 2 / 10) * 10);
}

export const MarketPanel: React.FC<{ farm: Farm; onClose: () => void; onDirections: (from: RouteStop, to: RouteStop) => void }> = ({ farm, onClose, onDirections }) => {
  const t = useT();
  const weight = useWeight();
  const choices = produceForCrop(farm.crop);
  const [produce, setProduce] = useState<Produce>(choices[0]);
  const [kg, setKg] = useState(() => expectedKg(farm));
  const [ready, setReady] = useState(() => new Date(Date.now() + READY_IN_DAYS * 86400000).toISOString().slice(0, 10));
  const [listing, setListing] = useState<Listing | null>(null);
  const [channel, setChannel] = useState<Channel>('bulk');
  const [outlook, setOutlook] = useState<Outlook | null>(null);
  const [buyers, setBuyers] = useState<Preorder[] | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [pickup, setPickup] = useState<Pickup | null>(null);
  const [flash, setFlash] = useState('');

  const loadOutlook = useCallback(() => {
    getOutlook(farm.town, produce, ready).then(setOutlook, (e) => setError(message(e)));
  }, [farm.town, produce, ready]);
  const loadBuyers = useCallback(() => {
    setBuyers(null);
    getPreorders(produce, channel, farm.lat, farm.lon).then((rows) => setBuyers(sortByDistance(withinReach(rows, channel))), (e) => setError(message(e)));
  }, [produce, channel, farm.lat, farm.lon]);
  const loadOffers = useCallback(() => {
    getMyOffers().then(setOffers, (e) => setError(message(e)));
  }, []);

  useEffect(loadOutlook, [loadOutlook]);
  useEffect(loadBuyers, [loadBuyers]);
  useEffect(loadOffers, [loadOffers]);

  const save = async () => {
    setBusy('save');
    setError('');
    try {
      setListing(await postListing({ produce, qty_kg: kg, ready_on: ready, town: farm.town, lat: farm.lat, lon: farm.lon, area_ha: farm.area }));
      setFlash(t('farmMap.market.saved'));
      loadOutlook();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy('');
    }
  };

  const offer = async (order: Preorder) => {
    if (!listing) {
      setFlash(t('farmMap.market.needListing'));
      return;
    }
    setBusy(order.id);
    try {
      await applyToPreorder(order.id, listing.id, Math.min(listing.qty_kg, order.qty_kg));
      setFlash(t('farmMap.market.offered'));
      loadOffers();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy('');
    }
  };

  const book = async (row: Offer) => {
    setBusy(row.id);
    try {
      setPickup(row.pickup ?? (await bookPickup(row.id)));
      loadOffers();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy('');
    }
  };

  if (pickup) return <HaulShare pickup={pickup} onBack={() => setPickup(null)} />;

  const offered = new Set(offers.map((o) => o.preorder_id));
  return (
    <div className="aq-fm-mk" data-ui-panel="market">
      <DetailSection className="is-head">
        <div className="aq-fm-mk-head">
          <button type="button" className="aq-icon-btn" aria-label={t('farmMap.market.back')} onClick={onClose}><ArrowLeft size={16} aria-hidden="true" /></button>
          <div>
            <h2 className="aq-title">{t('farmMap.market.title')}</h2>
            <p className="aq-meta">{farm.name}, {farm.town}</p>
          </div>
        </div>
      </DetailSection>

      {outlook ? <TownOutlook outlook={outlook} produceWord={t(produceKey(produce))} onAdvice={(a) => a.id === 'presell-bulk' && setChannel('bulk')} /> : <DetailSection className="is-loading"><span className="aq-fm-spin" aria-hidden="true" /></DetailSection>}

      <DetailSection className="aq-fm-mk-form">
        <p className="aq-fm-mk-subhead">{t('farmMap.market.harvestTitle')}</p>
        <div className="aq-fm-mk-fields">
          <label>
            <span>{t('farmMap.market.produce')}</span>
            <select className="aq-fm-select" value={produce} onChange={(e) => setProduce(e.target.value as Produce)}>
              {choices.map((p) => <option key={p} value={p}>{t(produceKey(p))}</option>)}
            </select>
          </label>
          <label>
            <span>{t('farmMap.market.kg')}</span>
            <input className="aq-fm-input" type="number" min={1} step={10} inputMode="numeric" value={kg} onChange={(e) => setKg(Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <label>
            <span>{t('farmMap.market.ready')}</span>
            <input className="aq-fm-input" type="date" value={ready} onChange={(e) => setReady(e.target.value)} />
          </label>
        </div>
        {!listing ? <p className="aq-fm-mk-quiet">{t('farmMap.market.harvestHint')}</p> : null}
        <AqButton variant={listing ? 'secondary' : 'primary'} large disabled={busy === 'save'} onClick={() => void save()}>{t('farmMap.market.save')}</AqButton>
        {flash ? <p className="aq-fm-mk-flash" role="status">{flash}</p> : null}
        {error ? (
          <p className="aq-fm-mk-error" role="alert">
            {t('farmMap.market.error', { error })}
            <button type="button" className="aq-link" onClick={() => { setError(''); loadOutlook(); loadBuyers(); loadOffers(); }}><RefreshCw size={12} aria-hidden="true" /> {t('farmMap.market.retry')}</button>
          </p>
        ) : null}
      </DetailSection>

      <DetailSection>
        <AqTabs<Channel> value={channel} label={t('farmMap.market.buyersTitle', { produce: t(produceKey(produce)) })} onChange={setChannel} items={[{ value: 'direct', label: t('farmMap.market.direct') }, { value: 'bulk', label: t('farmMap.market.bulk') }]} />
        {buyers === null ? <p className="aq-fm-mk-quiet">…</p> : null}
        {buyers && buyers.length === 0 ? <p className="aq-fm-mk-quiet">{t(channel === 'bulk' ? 'farmMap.market.emptyBulk' : 'farmMap.market.emptyDirect')}</p> : null}
        {buyers?.map((order) => (
          <div key={order.id} className="aq-fm-mk-buyer">
            <div className="aq-fm-mk-buyer-main">
              <span className="aq-fm-mk-buyer-kind">{t(kindKey(order.buyer_kind))}</span>
              <span>{t('farmMap.market.needs', { w: weight(order.qty_kg), date: day(order.needed_by) })}</span>
              <span className="aq-fm-mk-quiet">
                {order.km !== undefined ? t('farmMap.market.away', { km: order.km }) : order.town}
                {', '}
                {order.price_offer_mmk_kg ? t('farmMap.market.offerPrice', { price: order.price_offer_mmk_kg.toLocaleString(activeLocale()) }) : t('farmMap.market.noOfferPrice')}
                {order.demo ? `, ${t('farmMap.market.demo')}` : ''}
              </span>
            </div>
            <AqButton variant={offered.has(order.id) ? 'ghost' : 'secondary'} disabled={offered.has(order.id) || busy === order.id} onClick={() => void offer(order)}>
              <Handshake size={14} aria-hidden="true" />
              {offered.has(order.id) ? t('farmMap.market.offered') : t('farmMap.market.offer')}
            </AqButton>
          </div>
        ))}
      </DetailSection>

      {offers.length ? (
        <DetailSection>
          <p className="aq-fm-mk-subhead">{t('farmMap.market.offersTitle')}</p>
          {offers.map((row) => {
            const buyer = row.buyer_name ?? t(kindKey(row.buyer_kind));
            const chosen = row.status === 'selected';
            return (
              <div key={row.id} className={`aq-fm-mk-offer ${chosen ? 'is-selected' : ''}`}>
                <p>{chosen ? t('farmMap.market.selected', { buyer }) : t('farmMap.market.waiting', { buyer })}</p>
                <p className="aq-fm-mk-quiet">{weight(row.qty_kg)}, {t('farmMap.market.away', { km: row.buyer_km })}</p>
                {chosen && row.buyer_lat !== undefined && row.buyer_lon !== undefined ? (
                  <div className="aq-fm-mk-offer-actions">
                    <AqButton variant="primary" onClick={() => onDirections({ id: farm.id, label: farm.name, lat: farm.lat, lon: farm.lon }, { id: row.preorder_id, label: buyer, lat: row.buyer_lat as number, lon: row.buyer_lon as number })}>
                      <Navigation size={14} aria-hidden="true" />{t('farmMap.market.directions')}
                    </AqButton>
                    <AqButton disabled={busy === row.id} onClick={() => void book(row)}><Truck size={14} aria-hidden="true" />{t('farmMap.market.pickup')}</AqButton>
                  </div>
                ) : null}
              </div>
            );
          })}
        </DetailSection>
      ) : null}
    </div>
  );
};
