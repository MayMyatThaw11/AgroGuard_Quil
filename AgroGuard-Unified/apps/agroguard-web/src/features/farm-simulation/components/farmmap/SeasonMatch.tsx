import React, { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { PRODUCE, type Produce } from '../../lib/farmmap/market.ts';
import { getPlantIdeas, plantText, type PlantIdea } from '../../lib/farmmap/marketSignals.ts';
import type { Producer } from '../../lib/farmmap/producers.ts';
import {
  BUYER_NEEDS,
  BUYER_OFFERS,
  CAN_OFFER,
  PRICE_KINDS,
  WANTS,
  buyerRecordText,
  defaultReserveKg,
  farmerRecordText,
  monthsLabel,
  mySeasonOrders,
  postSeasonOrder,
  priceText,
  progressPct,
  reasonText,
  reserveSeason,
  seasonMatches,
  toggle,
  updateWants,
  type BuyerNeed,
  type BuyerOffer,
  type CanOffer,
  type Fit,
  type PriceKind,
  type SeasonMatch as Match,
  type SeasonOrder,
  type Want,
} from '../../lib/farmmap/seasonMatch.ts';
import { activeLocale, useT, type Key } from '../../lib/i18n.ts';
import { AqButton, AqBadge } from '../aq/aqPrimitives.tsx';
import { DetailSection } from './detailParts.tsx';
import { useWeight } from './TownOutlook.tsx';

const FIT_TONE: Record<Fit, 'accent' | 'neutral' | 'warning'> = { strong: 'accent', good: 'neutral', weak: 'warning' };
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const produceKey = (p: Produce) => `farmMap.produce.${p}` as Key;
const kindKey = (kind: string) => `farmMap.market.kind.${kind}` as Key;
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

function Chips<T extends string>({ items, on, label, onToggle }: { items: readonly T[]; on: readonly T[]; label: (id: T) => string; onToggle: (id: T) => void }) {
  return (
    <div className="aq-fm-pr-months is-wide">
      {items.map((id) => <button key={id} type="button" aria-pressed={on.includes(id)} onClick={() => onToggle(id)}>{label(id)}</button>)}
    </div>
  );
}

const MatchCard: React.FC<{ match: Match; producerId: string; onReserved: () => void }> = ({ match, producerId, onReserved }) => {
  const t = useT();
  const weight = useWeight();
  const [kg, setKg] = useState(() => defaultReserveKg(match));
  const [error, setError] = useState('');
  const reserve = async () => {
    setError('');
    try {
      await reserveSeason(match.order_id, producerId, kg);
      onReserved();
    } catch (e) {
      setError(message(e));
    }
  };
  return (
    <div className="aq-fm-ss-card">
      <div className="aq-fm-ss-head">
        <strong>{match.buyer_name ?? t(kindKey(match.buyer_kind))}</strong>
        <AqBadge tone={FIT_TONE[match.fit]}>{t(`farmMap.season.fit.${match.fit}` as Key)}</AqBadge>
      </div>
      <p>{t('farmMap.season.wanted', { w: weight(match.total_kg), months: monthsLabel(match.delivery_months, activeLocale()) })}</p>
      <p className="aq-fm-mk-quiet">{priceText(match.price, t, activeLocale())}, {t(`farmMap.season.grade.${match.grade}` as Key)}</p>
      <ul className="aq-fm-ss-reasons">
        {match.reasons.map((r, i) => <li key={`${r.id}${i}`}>{reasonText(r, t, activeLocale())}</li>)}
      </ul>
      <p className="aq-fm-mk-quiet">{buyerRecordText(match.buyer_reliability, t)}</p>
      {match.my_reserved_kg ? <p className="aq-fm-mk-flash">{t('farmMap.season.reserved', { w: weight(match.my_reserved_kg) })}</p> : null}
      <div className="aq-fm-ss-reserve">
        <label>
          <span>{t('farmMap.season.reserveKg')}</span>
          <input className="aq-fm-input" type="number" min={1} max={match.remaining_kg} step={10} inputMode="numeric" value={kg} onChange={(e) => setKg(Math.max(1, Math.min(match.remaining_kg, Number(e.target.value) || 1)))} />
        </label>
        <AqButton variant="secondary" onClick={() => void reserve()}>{t('farmMap.season.reserve')}</AqButton>
      </div>
      {error ? <p className="aq-fm-mk-error" role="alert">{t('farmMap.market.error', { error })}</p> : null}
    </div>
  );
};

export const SeasonMatchFarmer: React.FC<{ producer: Producer | null }> = ({ producer }) => {
  const t = useT();
  const weight = useWeight();
  const [rows, setRows] = useState<Match[] | null>(null);
  const [ideas, setIdeas] = useState<PlantIdea[] | null>(null);
  const [wants, setWants] = useState<Want[]>([]);
  const [can, setCan] = useState<CanOffer[]>([]);
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');
  const id = producer?.id ?? null;

  const load = useCallback(() => {
    if (!id) return;
    setError('');
    seasonMatches(id).then(setRows, (e) => setError(message(e)));
  }, [id]);
  useEffect(load, [load]);
  useEffect(() => {
    if (!id) return;
    getPlantIdeas(id, ((new Date().getMonth() + 3) % 12) + 1).then(setIdeas, () => setIdeas(null));
  }, [id]);
  useEffect(() => {
    setWants(producer?.wants ?? []);
    setCan(producer?.can_offer ?? []);
  }, [producer?.id, producer?.wants, producer?.can_offer]);

  const save = (next: { wants?: Want[]; can_offer?: CanOffer[] }) => {
    if (!id) return;
    updateWants(id, next).then(load, (e) => setError(message(e)));
  };

  return (
    <DetailSection>
      <p className="aq-fm-mk-subhead">{t('farmMap.season.title')}</p>
      {!id ? <p className="aq-fm-mk-quiet">{t('farmMap.season.needProfile')}</p> : (
        <>
          <p className="aq-fm-mk-quiet">{t('farmMap.season.intro')}</p>
          <p className="aq-fm-mk-quiet">{t('farmMap.season.beta')}</p>
          <p className="aq-fm-mk-subhead">{t('farmMap.season.wants')}</p>
          <Chips items={WANTS} on={wants} label={(w) => t(`farmMap.season.want.${w}` as Key)} onToggle={(w) => { const next = toggle(wants, w); setWants(next); save({ wants: next }); }} />
          <p className="aq-fm-mk-subhead">{t('farmMap.season.canOffer')}</p>
          <Chips items={CAN_OFFER} on={can} label={(c) => t(`farmMap.season.can.${c}` as Key)} onToggle={(c) => { const next = toggle(can, c); setCan(next); save({ can_offer: next }); }} />
          {ideas ? (
            <>
              <p className="aq-fm-mk-subhead">{t('farmMap.signals.plantTitle')}</p>
              {ideas.length ? ideas.map((i) => <p key={i.produce}>{plantText(i, t, weight, t(produceKey(i.produce)))}</p>) : <p className="aq-fm-mk-quiet">{t('farmMap.signals.plantNone')}</p>}
            </>
          ) : null}
          {rows && !rows.length ? <p className="aq-fm-mk-quiet">{t('farmMap.season.empty')}</p> : null}
          {rows?.map((m) => <MatchCard key={`${m.order_id}-${m.remaining_kg}`} match={m} producerId={id} onReserved={() => { setFlash(t('farmMap.season.reservedFlash')); load(); }} />)}
          {flash ? <p className="aq-fm-mk-flash" role="status">{flash}</p> : null}
          {error ? <p className="aq-fm-mk-error" role="alert">{t('farmMap.market.error', { error })}</p> : null}
        </>
      )}
    </DetailSection>
  );
};

export const SeasonOrdersBuyer: React.FC<{ place: { town: string; lat: number; lon: number } }> = ({ place }) => {
  const t = useT();
  const weight = useWeight();
  const [orders, setOrders] = useState<SeasonOrder[]>([]);
  const [open, setOpen] = useState(false);
  const [produce, setProduce] = useState<Produce>('tomato');
  const [kg, setKg] = useState(5000);
  const [months, setMonths] = useState<number[]>([]);
  const [kind, setKind] = useState<PriceKind>('fixed');
  const [value, setValue] = useState('');
  const [sorted, setSorted] = useState(false);
  const [offers, setOffers] = useState<BuyerOffer[]>([]);
  const [needs, setNeeds] = useState<BuyerNeed[]>([]);
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    mySeasonOrders().then(setOrders, (e) => setError(message(e)));
  }, []);
  useEffect(load, [load]);

  const post = async () => {
    setError('');
    const amount = value ? Number(value) : undefined;
    try {
      await postSeasonOrder({
        produce, total_kg: kg, delivery_months: months, ...place,
        price: kind === 'town-plus' ? { kind, plus_pct: amount } : { kind, mmk_kg: amount },
        grade: sorted ? 'sorted' : 'any', offers, needs,
      });
      setFlash(t('farmMap.season.posted'));
      setOpen(false);
      load();
    } catch (e) {
      setError(message(e));
    }
  };

  return (
    <DetailSection>
      <p className="aq-fm-mk-subhead">{t('farmMap.season.buyerTitle')}</p>
      <AqButton variant="secondary" onClick={() => setOpen((v) => !v)}><Plus size={14} aria-hidden="true" />{t('farmMap.season.post')}</AqButton>
      {flash ? <p className="aq-fm-mk-flash" role="status">{flash}</p> : null}
      {open ? (
        <div className="aq-fm-ss-form">
          <div className="aq-fm-mk-fields">
            <label>
              <span>{t('farmMap.market.produce')}</span>
              <select className="aq-fm-select" value={produce} onChange={(e) => setProduce(e.target.value as Produce)}>
                {PRODUCE.map((p) => <option key={p} value={p}>{t(produceKey(p))}</option>)}
              </select>
            </label>
            <label>
              <span>{t('farmMap.season.totalKg')}</span>
              <input className="aq-fm-input" type="number" min={1} step={100} inputMode="numeric" value={kg} onChange={(e) => setKg(Math.max(1, Number(e.target.value) || 1))} />
            </label>
            <label>
              <span>{t('farmMap.season.priceKind')}</span>
              <select className="aq-fm-select" value={kind} onChange={(e) => setKind(e.target.value as PriceKind)}>
                {PRICE_KINDS.map((k) => <option key={k} value={k}>{t(`farmMap.season.kind.${k}` as Key)}</option>)}
              </select>
            </label>
            <label>
              <span>{t('farmMap.season.priceValue')}</span>
              <input className="aq-fm-input" type="number" min={1} inputMode="numeric" value={value} placeholder={t('farmMap.season.price.none')} onChange={(e) => setValue(e.target.value)} />
            </label>
          </div>
          <p className="aq-fm-mk-subhead">{t('farmMap.season.months')}</p>
          <div className="aq-fm-pr-months">
            {MONTHS.map((m) => <button key={m} type="button" aria-pressed={months.includes(m)} onClick={() => setMonths(months.includes(m) ? months.filter((x) => x !== m) : [...months, m].sort((a, b) => a - b))}>{monthsLabel([m], activeLocale())}</button>)}
          </div>
          <label className="aq-fm-ss-check"><input type="checkbox" checked={sorted} onChange={(e) => setSorted(e.target.checked)} /> {t('farmMap.season.grade.sorted')}</label>
          <p className="aq-fm-mk-subhead">{t('farmMap.season.youOffer')}</p>
          <Chips items={BUYER_OFFERS} on={offers} label={(o) => t(`farmMap.season.offer.${o}` as Key)} onToggle={(o) => setOffers(toggle(offers, o))} />
          <p className="aq-fm-mk-subhead">{t('farmMap.season.youNeed')}</p>
          <Chips items={BUYER_NEEDS} on={needs} label={(n) => t(`farmMap.season.need.${n}` as Key)} onToggle={(n) => setNeeds(toggle(needs, n))} />
          <AqButton variant="primary" large disabled={!months.length} onClick={() => void post()}>{t('farmMap.season.postNow')}</AqButton>
        </div>
      ) : null}
      {error ? <p className="aq-fm-mk-error" role="alert">{t('farmMap.market.error', { error })}</p> : null}
      {orders.map((o) => (
        <div key={o.id} className="aq-fm-ss-card">
          <p><strong>{t(produceKey(o.produce))}</strong>, {t('farmMap.season.wanted', { w: weight(o.target_kg), months: monthsLabel(o.delivery_months, activeLocale()) })}</p>
          <div className="aq-fm-ss-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPct(o.reserved_kg, o.target_kg)} aria-label={t('farmMap.season.progress', { reserved: weight(o.reserved_kg), target: weight(o.target_kg) })}>
            <span style={{ width: `${progressPct(o.reserved_kg, o.target_kg)}%` }} />
          </div>
          <p className="aq-fm-mk-quiet">{t('farmMap.season.progress', { reserved: weight(o.reserved_kg), target: weight(o.target_kg) })}</p>
          {!o.farmers.length ? <p className="aq-fm-mk-quiet">{t('farmMap.season.noFarmers')}</p> : null}
          {o.farmers.map((f, i) => (
            <div key={`${f.name}${i}`} className="aq-fm-ss-farmer">
              <p>{t('farmMap.season.farmerRow', { name: f.name, w: weight(f.kg) })}</p>
              <p className="aq-fm-mk-quiet">{farmerRecordText(f.reliability, t)}</p>
              {f.needs_met.map((n) => <p key={n} className="aq-fm-mk-quiet">{t((WANTS.includes(n as Want) ? `farmMap.season.want.${n}` : `farmMap.season.need.${n}`) as Key)}</p>)}
            </div>
          ))}
        </div>
      ))}
    </DetailSection>
  );
};
