import React, { useState } from 'react';
import { ChevronDown, ChevronUp, PackageCheck } from 'lucide-react';
import { confirmDelivery, type Candidate } from '../../lib/farmmap/market.ts';
import { activeLocale, useT, type Key } from '../../lib/i18n.ts';
import { AqButton } from '../aq/aqPrimitives.tsx';

const mmk = (n: number) => n.toLocaleString(activeLocale());
const vehicleKey = (name: string) => `farmMap.haul.vehicle.${name.replace(/ /g, '-')}` as Key;
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

const DeliveryForm: React.FC<{ row: Candidate; onDone: () => void }> = ({ row, onDone }) => {
  const t = useT();
  const [received, setReceived] = useState(String(row.qty_kg));
  const [rejected, setRejected] = useState('0');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const save = () => {
    setError('');
    confirmDelivery(row.id, { received_kg: Number(received), rejected_kg: Number(rejected), ...(reason.trim() ? { reason: reason.trim() } : {}) }).then(onDone, (e) => setError(message(e)));
  };
  return (
    <div className="aq-fm-mk-delivery">
      <label className="aq-fm-pr-field"><span>{t('farmMap.buyer.received')}</span><input className="aq-fm-input" inputMode="numeric" value={received} onChange={(e) => setReceived(e.target.value.replace(/\D/g, ''))} /></label>
      <label className="aq-fm-pr-field"><span>{t('farmMap.buyer.rejected')}</span><input className="aq-fm-input" inputMode="numeric" value={rejected} onChange={(e) => setRejected(e.target.value.replace(/\D/g, ''))} /></label>
      <label className="aq-fm-pr-field"><span>{t('farmMap.buyer.rejectReason')}</span><input className="aq-fm-input" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      {error ? <p className="aq-fm-mk-error" role="alert">{t('farmMap.market.error', { error })}</p> : null}
      <AqButton variant="primary" disabled={received === ''} onClick={save}>{t('farmMap.buyer.saveDelivery')}</AqButton>
    </div>
  );
};

export const CandidateTransport: React.FC<{ row: Candidate; onChanged: () => void }> = ({ row, onChanged }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const best = row.transport[0];
  if (!best) return null;
  return (
    <div className="aq-fm-mk-transport">
      {row.landed_low !== null && row.landed_high !== null ? (
        <>
          <p className="aq-fm-mk-landed">{t('farmMap.buyer.landed', { low: mmk(row.landed_low), high: mmk(row.landed_high) })}</p>
          <p className="aq-fm-mk-quiet">{t(row.landed_basis === 'ask' ? 'farmMap.buyer.landedAsk' : 'farmMap.buyer.landedOffer', { price: mmk(row.landed_low - best.low_per_kg) })}</p>
        </>
      ) : (
        <p className="aq-fm-mk-quiet">{t('farmMap.buyer.landedNone')}</p>
      )}
      <p className="aq-fm-mk-quiet">
        {t('farmMap.buyer.transport', { low: mmk(best.low_mmk), high: mmk(best.high_mmk) })}
        {best.trips > 1 ? `, ${t('farmMap.buyer.trips', { n: best.trips })}` : ''}
      </p>
      {row.pool && row.pool.members.length > 1 && row.pool.vehicle ? (
        <p className="aq-fm-mk-quiet">{t('farmMap.buyer.pooled', { n: row.pool.members.length, vehicle: t(vehicleKey(row.pool.vehicle)), total: mmk(row.pool.fare_total) })}</p>
      ) : null}
      <button type="button" className="aq-fm-mk-link" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t('farmMap.buyer.transportOptions')}
        {open ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
      </button>
      {open ? (
        <ul className="aq-fm-mk-options">
          {row.transport.map((o) => (
            <li key={o.vehicle} className={o.fits ? '' : 'is-off'}>
              <span>{t('farmMap.buyer.transportRow', { vehicle: t(vehicleKey(o.vehicle)), low: mmk(o.low_mmk), high: mmk(o.high_mmk), lowKg: mmk(o.low_per_kg), highKg: mmk(o.high_per_kg) })}{o.trips > 1 ? `, ${t('farmMap.buyer.trips', { n: o.trips })}` : ''}</span>
              <span className="aq-fm-mk-quiet">{o.reasons.map((r) => t(`farmMap.buyer.reason.${r}` as Key)).join(', ')}</span>
            </li>
          ))}
          <li className="aq-fm-mk-quiet">{t('farmMap.buyer.transportNote')}</li>
        </ul>
      ) : null}
      {row.status === 'delivered' ? (
        <p className="aq-fm-mk-quiet">{t('farmMap.buyer.deliveredLine', { got: row.received_kg ?? 0, bad: row.rejected_kg ?? 0 })}</p>
      ) : row.status === 'selected' ? (
        closing ? <DeliveryForm row={row} onDone={() => { setClosing(false); onChanged(); }} /> : (
          <AqButton onClick={() => setClosing(true)}><PackageCheck size={14} aria-hidden="true" />{t('farmMap.buyer.confirm')}</AqButton>
        )
      ) : null}
    </div>
  );
};
