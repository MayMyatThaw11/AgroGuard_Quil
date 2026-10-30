import React, { useState } from 'react';
import { ArrowLeft, Check, Crosshair, Home, MapPin, Plus, User, Users } from 'lucide-react';
import { ApiError } from '../../lib/apiError.ts';
import { CROPS } from '../../lib/farmmap/farmMapTheme.ts';
import type { CropId } from '../../lib/farmmap/farmMapTypes.ts';
import { PRODUCE, produceForCrop, type Produce } from '../../lib/farmmap/market.ts';
import {
  acresToHa,
  CONSENT_VERSION,
  canFinish,
  joinGroup,
  MONTHS,
  nearbyFrom,
  SIZE_CHIPS,
  type NearbyProfile,
  type Producer,
  type ProducerDraft,
  type ProducerKind,
} from '../../lib/farmmap/producers.ts';
import { activeLocale, useT, type Key } from '../../lib/i18n.ts';
import { AqButton } from '../aq/aqPrimitives.tsx';
import { DetailSection } from './detailParts.tsx';
import { Glyph } from './Glyph.tsx';

export interface Consent {
  read_aloud: boolean;
  text_version: string;
  by: string;
}

interface Props {
  assisted: boolean;
  point: { lat: number; lon: number } | null;
  by: string;
  onFinish: (draft: ProducerDraft, pin: string, consent?: Consent) => Promise<void>;
  onQueue?: (draft: ProducerDraft) => void;
  onJoined: (profile: Producer) => void;
  onCancel: () => void;
}

const KINDS: { kind: ProducerKind; icon: typeof User }[] = [
  { kind: 'individual', icon: User },
  { kind: 'household', icon: Home },
  { kind: 'group', icon: Users },
];
const produceKey = (p: Produce) => `farmMap.produce.${p}` as Key;
const cropOf = (p: Produce): CropId => (['rice', 'maize', 'fruit'] as const).find((c) => produceForCrop(c).includes(p)) ?? 'veg';
const monthName = (m: number) => new Date(2026, m - 1, 1).toLocaleDateString(activeLocale(), { month: 'short' });
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const ProducerSetup: React.FC<Props> = ({ assisted, point, by, onFinish, onQueue, onJoined, onCancel }) => {
  const t = useT();
  const total = assisted ? 4 : 3;
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<ProducerDraft>({ kind: null, name: '', members: [], lat: point?.lat ?? null, lon: point?.lon ?? null, crops: [] });
  const [member, setMember] = useState('');
  const [active, setActive] = useState<Produce | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [nearby, setNearby] = useState<NearbyProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');

  const patch = (next: Partial<ProducerDraft>) => setDraft((d) => ({ ...d, ...next }));
  const toggle = (p: Produce) => {
    const has = draft.crops.some((c) => c.produce === p);
    patch({ crops: has ? draft.crops.filter((c) => c.produce !== p) : [...draft.crops, { produce: p, harvest_month: 0 }] });
    setActive(has ? null : p);
  };
  const setMonth = (month: number) => active && patch({ crops: draft.crops.map((c) => (c.produce === active ? { ...c, harvest_month: month } : c)) });
  const locate = () => {
    setError('');
    navigator.geolocation?.getCurrentPosition(
      (pos) => patch({ lat: Number(pos.coords.latitude.toFixed(5)), lon: Number(pos.coords.longitude.toFixed(5)) }),
      () => setError(t('farmMap.producer.noLocation')),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const finish = async () => {
    const chip = SIZE_CHIPS.find((c) => c.id === size);
    const crops = draft.crops.map((c, i) => (i === 0 && chip ? { ...c, area_ha: Number(acresToHa(chip.acres).toFixed(2)) } : c));
    const ready = { ...draft, crops };
    setBusy(true);
    setError('');
    try {
      await onFinish(ready, pin, assisted ? { read_aloud: agreed, text_version: CONSENT_VERSION, by } : undefined);
    } catch (e) {
      const hit = nearbyFrom(e);
      if (hit) {
        setNearby(hit);
        setStep(2);
      } else if (!assisted && onQueue && !(e instanceof ApiError)) {
        onQueue(ready);
        setFlash(t('farmMap.producer.queued'));
      } else {
        setError(message(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    if (!nearby) return;
    setBusy(true);
    try {
      onJoined(await joinGroup(nearby.id, draft.name.trim()));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const ok = [draft.kind !== null && draft.name.trim().length > 0, draft.lat !== null && draft.lon !== null, canFinish(draft), agreed][step - 1];
  const last = step === total;

  return (
    <>
      <DetailSection className="is-head">
        <div className="aq-fm-mk-head">
          <button type="button" className="aq-icon-btn" aria-label={t('farmMap.producer.cancel')} onClick={step === 1 ? onCancel : () => setStep(step - 1)}><ArrowLeft size={16} aria-hidden="true" /></button>
          <div>
            <h2 className="aq-title">{t(assisted ? 'farmMap.producer.registerTitle' : 'farmMap.producer.title')}</h2>
            <p className="aq-meta">{t('farmMap.producer.step', { n: step, total })}</p>
          </div>
        </div>
      </DetailSection>

      <DetailSection className="aq-fm-pr">
        {step === 1 ? (
          <>
            <p className="aq-fm-mk-subhead">{t('farmMap.producer.who')}</p>
            <div className="aq-fm-pr-choices" role="radiogroup" aria-label={t('farmMap.producer.who')}>
              {KINDS.map(({ kind, icon: Icon }) => (
                <button key={kind} type="button" role="radio" aria-checked={draft.kind === kind} className={draft.kind === kind ? 'is-on' : ''} onClick={() => patch({ kind })}>
                  <Icon size={22} aria-hidden="true" />
                  {t(`farmMap.producer.kind.${kind}` as Key)}
                </button>
              ))}
            </div>
            <label className="aq-fm-pr-field">
              <span>{t('farmMap.producer.name')}</span>
              <input className="aq-fm-input" value={draft.name} maxLength={80} onChange={(e) => patch({ name: e.target.value })} />
            </label>
            {draft.kind === 'group' ? (
              <div className="aq-fm-pr-field">
                <span>{t('farmMap.producer.members')}</span>
                <ul className="aq-fm-pr-members">{draft.members.map((m) => <li key={m.name}>{m.name}</li>)}</ul>
                <div className="aq-fm-pr-inline">
                  <input className="aq-fm-input" value={member} maxLength={80} aria-label={t('farmMap.producer.memberName')} onChange={(e) => setMember(e.target.value)} />
                  <AqButton disabled={!member.trim()} onClick={() => { patch({ members: [...draft.members, { name: member.trim() }] }); setMember(''); }}><Plus size={14} aria-hidden="true" />{t('farmMap.producer.addMember')}</AqButton>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {step === 2 ? (
          <>
            <p className="aq-fm-mk-subhead">{t('farmMap.producer.where')}</p>
            <div className="aq-fm-pr-inline">
              <AqButton onClick={locate}><Crosshair size={14} aria-hidden="true" />{t('farmMap.producer.useLocation')}</AqButton>
              {point ? <AqButton onClick={() => patch({ lat: point.lat, lon: point.lon })}><MapPin size={14} aria-hidden="true" />{t('farmMap.producer.usePoint')}</AqButton> : null}
            </div>
            {draft.lat !== null && draft.lon !== null ? <p className="aq-fm-mk-flash" role="status"><Check size={13} aria-hidden="true" /> {t('farmMap.producer.located')}</p> : null}
            {nearby ? (
              <div className="aq-fm-pr-nearby" role="alert">
                <p>{t('farmMap.producer.nearby', { name: nearby.name })}</p>
                <AqButton variant="primary" disabled={busy} onClick={() => void join()}>{t('farmMap.producer.join')}</AqButton>
              </div>
            ) : null}
          </>
        ) : null}

        {step === 3 ? (
          <>
            <p className="aq-fm-mk-subhead">{t('farmMap.producer.grow')}</p>
            <div className="aq-fm-pr-crops">
              {PRODUCE.map((p) => {
                const crop = draft.crops.find((c) => c.produce === p);
                return (
                  <button key={p} type="button" aria-pressed={!!crop} className={`${crop ? 'is-on' : ''} ${active === p ? 'is-active' : ''}`} onClick={() => (crop ? setActive(p) : toggle(p))}>
                    <Glyph name={CROPS[cropOf(p)].icon} size={22} />
                    {t(produceKey(p))}
                    {crop?.harvest_month ? <small>{monthName(crop.harvest_month)}</small> : null}
                  </button>
                );
              })}
            </div>
            {active ? (
              <>
                <p className="aq-fm-mk-subhead">{t('farmMap.producer.harvestMonth', { crop: t(produceKey(active)) })}</p>
                <div className="aq-fm-pr-months">
                  {MONTHS.map((m) => (
                    <button key={m} type="button" aria-pressed={draft.crops.find((c) => c.produce === active)?.harvest_month === m} onClick={() => setMonth(m)}>{monthName(m)}</button>
                  ))}
                </div>
                <AqButton variant="ghost" onClick={() => toggle(active)}>{t('farmMap.producer.dropCrop')}</AqButton>
              </>
            ) : null}
            <p className="aq-fm-mk-subhead">{t('farmMap.producer.size')}</p>
            <div className="aq-fm-pr-months is-wide">
              {SIZE_CHIPS.map((chip) => (
                <button key={chip.id} type="button" aria-pressed={size === chip.id} onClick={() => setSize(size === chip.id ? null : chip.id)}>{t(`farmMap.producer.size.${chip.id}` as Key)}</button>
              ))}
            </div>
            <label className="aq-fm-pr-field">
              <span>{t('farmMap.producer.pin')}</span>
              <input className="aq-fm-input" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
            </label>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <p className="aq-fm-mk-subhead">{t('farmMap.producer.consentTitle')}</p>
            <p className="aq-fm-pr-consent">{t('farmMap.producer.consentText')}</p>
            <label className="aq-fm-pr-check">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              {t('farmMap.producer.consentCheck')}
            </label>
          </>
        ) : null}

        {flash ? <p className="aq-fm-mk-flash" role="status">{flash}</p> : null}
        {error ? <p className="aq-fm-mk-error" role="alert">{t('farmMap.market.error', { error })}</p> : null}
        {last ? (
          <AqButton variant="primary" large disabled={!ok || busy || (pin.length > 0 && pin.length !== 4) || !!flash} onClick={() => void finish()}>{t('farmMap.producer.save')}</AqButton>
        ) : (
          <AqButton variant="primary" large disabled={!ok} onClick={() => setStep(step + 1)}>{t('farmMap.producer.next')}</AqButton>
        )}
      </DetailSection>
    </>
  );
};
