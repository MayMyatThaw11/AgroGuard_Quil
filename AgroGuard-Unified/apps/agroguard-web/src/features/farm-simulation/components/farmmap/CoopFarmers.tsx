import React, { useCallback, useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { createProducer, myProducers, type Producer } from '../../lib/farmmap/producers.ts';
import { useT, type Key } from '../../lib/i18n.ts';
import { AqButton } from '../aq/aqPrimitives.tsx';
import { DetailSection } from './detailParts.tsx';
import { ProducerSetup } from './ProducerSetup.tsx';

type Registered = Producer & { claim_code: string };

export const CoopFarmers: React.FC<{ by: string; point: { lat: number; lon: number }; onRegistering: (on: boolean) => void }> = ({ by, point, onRegistering }) => {
  const t = useT();
  const [rows, setRows] = useState<Producer[]>([]);
  const [registering, setRegistering] = useState(false);
  const [card, setCard] = useState<Registered | null>(null);
  const mode = (on: boolean) => {
    setRegistering(on);
    onRegistering(on);
  };
  const load = useCallback(() => {
    myProducers().then(setRows, () => setRows([]));
  }, []);
  useEffect(load, [load]);

  if (registering) {
    return (
      <ProducerSetup
        assisted
        point={point}
        by={by}
        onCancel={() => mode(false)}
        onJoined={() => { mode(false); load(); }}
        onFinish={async (draft, pin, consent) => {
          setCard(await createProducer(draft, { on_behalf: true, ...(pin ? { pin } : {}), ...(consent ? { consent } : {}) }));
          mode(false);
          load();
        }}
      />
    );
  }

  return (
    <DetailSection className="aq-fm-pr-coop">
      <p className="aq-fm-mk-subhead">{t('farmMap.producer.coopTitle')}</p>
      {card ? (
        <div className="aq-fm-pr-card" role="status">
          <p className="aq-fm-mk-quiet">{t('farmMap.producer.cardHint', { name: card.name })}</p>
          <p className="aq-fm-pr-card-label">{t('farmMap.producer.claimId')}</p>
          <p className="aq-fm-pr-card-id">{card.id}</p>
          <p className="aq-fm-pr-card-label">{t('farmMap.producer.claimCode')}</p>
          <p className="aq-fm-pr-card-code" aria-label={card.claim_code.split('').join(' ')}>{card.claim_code}</p>
          <AqButton variant="primary" large onClick={() => { setCard(null); mode(true); }}>{t('farmMap.producer.registerNext')}</AqButton>
        </div>
      ) : null}
      {!rows.length && !card ? <p className="aq-fm-mk-quiet">{t('farmMap.producer.coopNone')}</p> : null}
      {rows.map((p) => (
        <p key={p.id} className="aq-fm-pr-row">
          <strong>{p.name}</strong>
          <span className="aq-fm-mk-quiet">{t(`farmMap.producer.kind.${p.kind}` as Key)}{p.owner !== null ? `, ${t('farmMap.producer.claimed')}` : ''}</span>
        </p>
      ))}
      {!card ? <AqButton onClick={() => mode(true)}><UserPlus size={14} aria-hidden="true" />{t('farmMap.producer.register')}</AqButton> : null}
    </DetailSection>
  );
};
