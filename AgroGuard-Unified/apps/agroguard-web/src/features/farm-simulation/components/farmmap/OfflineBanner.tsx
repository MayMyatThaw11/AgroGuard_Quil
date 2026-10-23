import React from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useT } from '../../lib/i18n.ts';
import { AqButton } from '../aq/aqPrimitives.tsx';

export const OfflineBanner: React.FC<{ cached: number; onReconnect: () => void }> = ({ cached, onReconnect }) => {
  const t = useT();
  return (
  <div className="aq-fm-offline aq-fm-drop" role="status">
    <WifiOff size={14} aria-hidden="true" />
    <span>{t('farmMap.offline.banner', { n: cached })}</span>
    <AqButton variant="secondary" onClick={onReconnect}>
      <Wifi size={13} aria-hidden="true" />
      {t('farmMap.offline.reconnect')}
    </AqButton>
  </div>
  );
};
