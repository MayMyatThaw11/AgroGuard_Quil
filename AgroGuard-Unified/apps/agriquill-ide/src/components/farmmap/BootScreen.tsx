import React from 'react';
import { Check, RefreshCw, Sprout, WifiOff } from 'lucide-react';
import { getFarmMap } from '../../lib/farmmap/farmMapData.ts';
import { AqButton } from '../aq/aqPrimitives.tsx';
import { AqProgress } from '../aq/aqLayout.tsx';

export type BootStep = 'style' | 'icons' | 'ready';

interface BootScreenProps {
  step: BootStep;
  failed: boolean;
}

export const BootScreen: React.FC<BootScreenProps> = ({ step, failed }) => {
  const steps: readonly (readonly [BootStep, string])[] = [
    ['style', 'Map style, fonts and relief'],
    ['icons', 'Farm icons and pins'],
    ['ready', `Farm index · ${getFarmMap().farms.length} farms in 1° regions`],
  ];
  const index = steps.findIndex((s) => s[0] === step);
  const done = step === 'ready';
  return (
    <div className={`aq-fm-boot ${done ? 'is-leaving' : ''}`} role="status" aria-live="polite">
      <div className="aq-fm-boot-card">
        <div className="aq-fm-brand">
          <span className="aq-icon-tile" aria-hidden="true"><Sprout size={18} strokeWidth={2} /></span>
          <span className="aq-fm-brand-name">AgriQuill</span>
        </div>
        <div>
          <h2 className="aq-title">ASEAN Farm Map</h2>
          <p className="aq-meta">Only the area you look at is loaded. Nearby regions stream in as you explore.</p>
        </div>
        {failed ? (
          <div className="aq-alert is-alert" role="alert">
            <WifiOff size={15} aria-hidden="true" />
            <div>
              <p className="aq-fm-boot-fail">The map could not start</p>
              <p className="aq-meta">The basemap service did not answer within 20 s. Check the connection or try again.</p>
              <AqButton variant="primary" onClick={() => window.location.reload()}>
                <RefreshCw size={14} aria-hidden="true" />
                Try again
              </AqButton>
            </div>
          </div>
        ) : (
          <>
            <AqProgress label="Map loading" value={(index + 1) / steps.length} />
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
