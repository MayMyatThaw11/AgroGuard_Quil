import React from 'react';
import { Check, RefreshCw, Sprout, WifiOff } from 'lucide-react';
import { getFarmMap } from '../../lib/farmmap/farmMapData.ts';
import { useT } from '../../lib/i18n.ts';
import { AqButton } from '../aq/aqPrimitives.tsx';
import { AqProgress } from '../aq/aqLayout.tsx';

export type BootStep = 'style' | 'icons' | 'ready';

interface BootScreenProps {
  step: BootStep;
  failed: boolean;
}

export const BootScreen: React.FC<BootScreenProps> = ({ step, failed }) => {
  const t = useT();
  const steps: readonly (readonly [BootStep, string])[] = [
    ['style', t('farmMap.boot.style')],
    ['icons', t('farmMap.boot.icons')],
    ['ready', t('farmMap.boot.index', { n: getFarmMap().farms.length })],
  ];
  const index = steps.findIndex((s) => s[0] === step);
  const done = step === 'ready';
  return (
    <div className={`aq-fm-boot ${done ? 'is-leaving' : ''}`} role="status" aria-live="polite">
      <div className="aq-fm-boot-card">
        <div className="aq-fm-brand">
          <span className="aq-icon-tile" aria-hidden="true"><Sprout size={18} strokeWidth={2} /></span>
          <span className="aq-fm-brand-name">{t('farmMap.brand')}</span>
        </div>
        <div>
          <h2 className="aq-title">{t('farmMap.title')}</h2>
          <p className="aq-meta">{t('farmMap.boot.lead')}</p>
        </div>
        {failed ? (
          <div className="aq-alert is-alert" role="alert">
            <WifiOff size={15} aria-hidden="true" />
            <div>
              <p className="aq-fm-boot-fail">{t('farmMap.boot.fail')}</p>
              <p className="aq-meta">{t('farmMap.boot.failHint')}</p>
              <AqButton variant="primary" onClick={() => window.location.reload()}>
                <RefreshCw size={14} aria-hidden="true" />
                {t('farmMap.common.tryAgain')}
              </AqButton>
            </div>
          </div>
        ) : (
          <>
            <AqProgress label={t('farmMap.boot.loading')} value={(index + 1) / steps.length} />
            <ul className="aq-fm-boot-steps">
              {steps.map(([key, label], j) => (
                <li key={key} className={j <= index ? 'is-reached' : ''}>
                  {j < index || done ? <Check size={13} aria-hidden="true" /> : j === index ? <span className="aq-fm-spin is-small" aria-hidden="true" /> : <i className="aq-fm-pending" aria-hidden="true" />}
                  {label}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
};
