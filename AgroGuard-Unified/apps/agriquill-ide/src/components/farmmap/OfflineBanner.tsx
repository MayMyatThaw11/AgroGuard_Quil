import React from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { AqButton } from '../aq/aqPrimitives.tsx';

export const OfflineBanner: React.FC<{ cached: number; onReconnect: () => void }> = ({ cached, onReconnect }) => (
  <div className="aq-fm-offline aq-fm-drop" role="status">
    <WifiOff size={14} aria-hidden="true" />
    <span>Offline · {cached} cached regions still work. New regions load when the connection returns.</span>
    <AqButton variant="secondary" onClick={onReconnect}>
      <Wifi size={13} aria-hidden="true" />
      Reconnect
    </AqButton>
  </div>
);
