import React, { useEffect } from 'react';
import { CircleAlert, Loader, RefreshCw } from 'lucide-react';
import { AqButton } from '../aq/aqPrimitives.tsx';
import { useTwin } from './useTwin.ts';

interface TwinGateProps {
  priority?: string;
  children: React.ReactNode;
}

export const TwinGate: React.FC<TwinGateProps> = ({ priority, children }) => {
  const twin = useTwin();
  const state = twin.store.get();

  useEffect(() => {
    void twin.store.init(priority ? { priority } : {});
  }, [twin, priority]);

  if (state.status === 'ready') return <>{children}</>;
  const failed = state.status === 'error';
  return (
    <div className="aq-root aq-tw-gate">
      <div className="aq-card aq-tw-gate-card" role="status">
        <span className="aq-tw-gate-title">
          {failed ? <CircleAlert size={16} aria-hidden="true" /> : <Loader size={16} className="aq-tw-spin" aria-hidden="true" />}
          {failed ? 'Farm data did not load' : 'Loading farms'}
        </span>
        <p className="aq-meta">
          {failed
            ? `${state.error ?? 'The data source did not answer'}. Nothing is shown in its place.`
            : 'Farm records and fleet, then Open-Meteo weather and season history, then the water and stage models.'}
        </p>
        {failed ? (
          <div className="aq-tw-row">
            <AqButton variant="primary" onClick={() => window.location.reload()}>
              <RefreshCw size={14} aria-hidden="true" />
              Retry
            </AqButton>
            <AqButton
              variant="ghost"
              onClick={() => {
                twin.adapter.configure({ mode: 'fixture' });
                window.location.reload();
              }}
            >
              Use demo fixture
            </AqButton>
          </div>
        ) : null}
      </div>
    </div>
  );
};
