import React, { useState } from 'react';
import { ChevronDown, ChevronUp, KeyRound, UserPlus } from 'lucide-react';
import {
  claimProducer,
  producerActivity,
  revokeManager,
  verifyPin,
  type ActivityEntry,
  type Producer,
} from '../../lib/farmmap/producers.ts';
import { useT, type Key } from '../../lib/i18n.ts';
import { AqButton } from '../aq/aqPrimitives.tsx';
import { DetailSection } from './detailParts.tsx';

interface Props {
  producers: Producer[];
  activeId: string | null;
  onPick: (id: string) => void;
  onSetup: () => void;
  onChanged: () => void;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const when = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');

const ClaimForm: React.FC<{ onClaimed: (p: Producer) => void }> = ({ onClaimed }) => {
  const t = useT();
  const [id, setId] = useState('');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const go = () => {
    setError('');
    claimProducer(id.trim(), code.trim(), pin).then(onClaimed, (e) => setError(message(e)));
  };
  return (
    <div className="aq-fm-pr-claim-form">
      <p className="aq-fm-mk-subhead">{t('farmMap.producer.takeControl')}</p>
      <label className="aq-fm-pr-field"><span>{t('farmMap.producer.claimId')}</span><input className="aq-fm-input" value={id} onChange={(e) => setId(e.target.value)} /></label>
      <label className="aq-fm-pr-field"><span>{t('farmMap.producer.claimCode')}</span><input className="aq-fm-input" value={code} maxLength={6} autoCapitalize="characters" onChange={(e) => setCode(e.target.value.toUpperCase())} /></label>
      <label className="aq-fm-pr-field"><span>{t('farmMap.producer.claimPin')}</span><input className="aq-fm-input" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} /></label>
      {error ? <p className="aq-fm-mk-error" role="alert">{t('farmMap.market.error', { error })}</p> : null}
      <AqButton variant="primary" disabled={!id.trim() || code.length !== 6 || pin.length !== 4} onClick={go}><KeyRound size={14} aria-hidden="true" />{t('farmMap.producer.takeControl')}</AqButton>
    </div>
  );
};

export const ProducerSwitch: React.FC<Props> = ({ producers, activeId, onPick, onSetup, onChanged }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<Producer | null>(null);
  const [pin, setPin] = useState('');
  const [log, setLog] = useState<ActivityEntry[] | null>(null);
  const [error, setError] = useState('');
  const active = producers.find((p) => p.id === activeId) ?? null;

  const pick = (p: Producer) => {
    if (p.id === activeId) return;
    if (p.has_pin && producers.length > 1) {
      setAsking(p);
      setPin('');
      return;
    }
    onPick(p.id);
    setOpen(false);
  };
  const confirm = () => {
    if (!asking) return;
    setError('');
    verifyPin(asking.id, pin).then(() => {
      onPick(asking.id);
      setAsking(null);
      setOpen(false);
    }, (e) => setError(message(e)));
  };
  const showLog = () => {
    if (!active) return;
    setError('');
    producerActivity(active.id).then(setLog, (e) => setError(message(e)));
  };
  const removeCoop = () => {
    if (!active) return;
    setError('');
    revokeManager(active.id).then(onChanged, (e) => setError(message(e)));
  };

  if (!active && !producers.length) {
    return (
      <DetailSection className="aq-fm-pr-chip">
        <p className="aq-fm-mk-quiet">{t('farmMap.producer.setupHint')}</p>
        <AqButton onClick={onSetup}><UserPlus size={14} aria-hidden="true" />{t('farmMap.producer.setup')}</AqButton>
        <ClaimForm onClaimed={() => onChanged()} />
      </DetailSection>
    );
  }

  return (
    <DetailSection className="aq-fm-pr-chip">
      <button type="button" className="aq-fm-pr-switch" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{active ? t(active.owner === null ? 'farmMap.producer.actingFor' : 'farmMap.producer.sellingAs', { name: active.name }) : t('farmMap.producer.choose')}</span>
        {open ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
      </button>
      {open ? (
        <div className="aq-fm-pr-list">
          {producers.map((p) => (
            <button key={p.id} type="button" className={p.id === activeId ? 'is-on' : ''} onClick={() => pick(p)}>
              {p.name}
              <small>{t(`farmMap.producer.kind.${p.kind}` as Key)}</small>
            </button>
          ))}
          {asking ? (
            <div className="aq-fm-pr-pin">
              <label className="aq-fm-pr-field"><span>{t('farmMap.producer.pinAsk', { name: asking.name })}</span><input className="aq-fm-input" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} /></label>
              <AqButton variant="primary" disabled={pin.length !== 4} onClick={confirm}>{t('farmMap.producer.switch')}</AqButton>
            </div>
          ) : null}
          <AqButton onClick={onSetup}><UserPlus size={14} aria-hidden="true" />{t('farmMap.producer.setup')}</AqButton>
          {active ? <AqButton variant="ghost" onClick={showLog}>{t('farmMap.producer.activity')}</AqButton> : null}
          {active && active.owner !== null && active.manager !== null && !active.manager_revoked ? <AqButton variant="ghost" onClick={removeCoop}>{t('farmMap.producer.removeCoop')}</AqButton> : null}
          {active && active.owner === null ? <ClaimForm onClaimed={() => onChanged()} /> : null}
        </div>
      ) : null}
      {error ? <p className="aq-fm-mk-error" role="alert">{t('farmMap.market.error', { error })}</p> : null}
      {log ? (
        <ul className="aq-fm-pr-log" aria-label={t('farmMap.producer.activity')}>
          {!log.length ? <li className="aq-fm-mk-quiet">{t('farmMap.producer.activityNone')}</li> : null}
          {log.map((e, i) => <li key={`${e.kind}-${i}`}>{t(`farmMap.producer.activity.${e.kind}` as Key)} <span className="aq-fm-mk-quiet">{when(e.timestamp)}</span></li>)}
        </ul>
      ) : null}
    </DetailSection>
  );
};
