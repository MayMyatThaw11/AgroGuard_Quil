import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check, Star, Truck } from 'lucide-react';
import { pickupStep, type Pickup } from '../../lib/farmmap/market.ts';
import { useT, type Key } from '../../lib/i18n.ts';
import { AqButton } from '../aq/aqPrimitives.tsx';
import { DetailSection } from './detailParts.tsx';

const STEP_KEY: Key[] = [
  'farmMap.haul.step.requested',
  'farmMap.haul.step.matched',
  'farmMap.haul.step.enRoute',
  'farmMap.haul.step.pickedUp',
  'farmMap.haul.step.delivered',
];

export const HaulShare: React.FC<{ pickup: Pickup; onBack: () => void }> = ({ pickup, onBack }) => {
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
