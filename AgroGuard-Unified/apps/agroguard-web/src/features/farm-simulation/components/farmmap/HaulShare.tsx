import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check, Clock, CloudRain, MapPin, Package, Star, Sun, Truck, Users } from 'lucide-react';
import { pickupStep, type Pickup, type Produce, type Trip } from '../../lib/farmmap/market.ts';
import { useT, type Key } from '../../lib/i18n.ts';
import { AqButton } from '../aq/aqPrimitives.tsx';
import { DetailSection } from './detailParts.tsx';
import { useWeight } from './TownOutlook.tsx';

const STEP_KEY: Key[] = [
  'farmMap.haul.step.requested',
  'farmMap.haul.step.matched',
  'farmMap.haul.step.enRoute',
  'farmMap.haul.step.pickedUp',
  'farmMap.haul.step.delivered',
];

const vehicleKey = (name: string) => `farmMap.haul.vehicle.${name.replace(/ /g, '-')}` as Key;

const TripPlan: React.FC<{ trip: Trip; produce: Produce; buyer: string }> = ({ trip, produce, buyer }) => {
  const t = useT();
  const weight = useWeight();
  const crop = t(`farmMap.produce.${produce}` as Key);
  const { freshness, pool, delivery, when } = trip;
  const fresh =
    freshness.max_hours === null
      ? t('farmMap.haul.trip.freshStore', { crop })
      : t(freshness.ok ? 'farmMap.haul.trip.fresh' : 'farmMap.haul.trip.freshLate', { hours: freshness.hours, max: freshness.max_hours, crop });
  return (
    <DetailSection>
      <p className="aq-fm-mk-subhead">{t('farmMap.haul.trip.title')}</p>
      <ul className="aq-fm-mk-trip">
        <li>
          <Truck size={15} aria-hidden="true" />
          {trip.vehicle ? t('farmMap.haul.trip.vehicle', { vehicle: t(vehicleKey(trip.vehicle)), weight: weight(trip.qty_kg) }) : t('farmMap.haul.trip.split')}
        </li>
        {when ? (
          <li>
            {when.action === 'pick-early' ? <Sun size={15} aria-hidden="true" /> : <CloudRain size={15} aria-hidden="true" />}
            {when.action === 'pick-early' ? t('farmMap.haul.trip.pickEarly', { time: when.before ?? '' }) : t('farmMap.haul.trip.moveEarlier')}
          </li>
        ) : null}
        <li className={freshness.ok ? '' : 'is-warn'}><Clock size={15} aria-hidden="true" />{fresh}</li>
        {pool && pool.vehicle ? (
          <li><Users size={15} aria-hidden="true" />{t('farmMap.haul.trip.share', { n: pool.members, buyer, vehicle: t(vehicleKey(pool.vehicle)), weight: weight(pool.total_kg) })}</li>
        ) : null}
        <li><MapPin size={15} aria-hidden="true" />{t('farmMap.haul.trip.buyer', { buyer, kind: t(`farmMap.market.kind.${trip.buyer.kind}` as Key), town: trip.buyer.town, km: trip.km })}</li>
        <li><Package size={15} aria-hidden="true" />{t(`farmMap.haul.trip.pack.${trip.pack}` as Key)}</li>
        {delivery ? (
          <li className="is-done">
            <Check size={15} aria-hidden="true" />
            {t('farmMap.haul.trip.received', { buyer, got: weight(delivery.received_kg), sent: weight(trip.qty_kg) })}
            {delivery.rejected_kg ? ` ${delivery.reason ? t('farmMap.haul.trip.rejected', { weight: weight(delivery.rejected_kg), reason: delivery.reason }) : t('farmMap.haul.trip.rejectedNoReason', { weight: weight(delivery.rejected_kg) })}` : ''}
          </li>
        ) : null}
      </ul>
      <p className="aq-fm-mk-quiet">{t('farmMap.haul.trip.verify')}</p>
    </DetailSection>
  );
};

export const HaulShare: React.FC<{ pickup: Pickup; trip: Trip | null; produce: Produce; buyer: string; onBack: () => void }> = ({ pickup, trip, produce, buyer, onBack }) => {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  const step = pickupStep(pickup.created_at, now);
  useEffect(() => {
    if (step >= STEP_KEY.length - 1) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, [step]);
  return (
    <>
      <DetailSection className="is-head">
        <div className="aq-fm-mk-head">
          <Truck size={18} aria-hidden="true" />
          <h2 className="aq-title">{t('farmMap.haul.title')}</h2>
        </div>
        <p className="aq-fm-mk-beta" role="note">{t('farmMap.haul.beta')}</p>
        <p className="aq-fm-mk-quiet">{t('farmMap.haul.distance', { km: pickup.km })}</p>
      </DetailSection>
      {trip ? <TripPlan trip={trip} produce={produce} buyer={buyer} /> : null}
      <DetailSection>
        <p className="aq-fm-mk-subhead">{t('farmMap.haul.drivers')}</p>
        {pickup.drivers.map((d) => (
          <div key={d.name} className="aq-fm-mk-driver">
            <Truck size={15} aria-hidden="true" />
            <span className="aq-fm-mk-driver-name">{d.name}</span>
            <span className="aq-fm-mk-quiet">{d.vehicle}</span>
            <span className="aq-fm-mk-quiet">{t('farmMap.haul.eta', { min: d.eta_min })}</span>
            <span className="aq-fm-mk-quiet" aria-label={t('farmMap.haul.rating', { r: d.rating })}><Star size={12} aria-hidden="true" /> {d.rating}</span>
          </div>
        ))}
      </DetailSection>
      <DetailSection>
        <ol className="aq-fm-mk-steps" aria-live="polite">
          {STEP_KEY.map((key, i) => (
            <li key={key} className={i < step ? 'is-done' : i === step ? 'is-now' : ''}>
              <span className="aq-fm-mk-step-dot" aria-hidden="true">{i < step ? <Check size={11} /> : i + 1}</span>
              {t(key)}
            </li>
          ))}
        </ol>
      </DetailSection>
      <DetailSection className="is-actions">
        <AqButton onClick={onBack}><ArrowLeft size={14} aria-hidden="true" />{t('farmMap.haul.back')}</AqButton>
      </DetailSection>
    </>
  );
};
