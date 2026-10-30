import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { getOutlook, PRODUCE, type Outlook, type Produce } from '../../lib/farmmap/market.ts';
import { useT, type Key } from '../../lib/i18n.ts';
import { DetailSection } from './detailParts.tsx';
import { TownOutlook } from './TownOutlook.tsx';

const AHEAD_DAYS = 21;
const produceKey = (p: Produce) => `farmMap.produce.${p}` as Key;

export const RingDetail: React.FC<{ town: string; produce: Produce; onProduce: (p: Produce) => void; onClose: () => void }> = ({ town, produce, onProduce, onClose }) => {
  const t = useT();
  const [outlook, setOutlook] = useState<Outlook | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setOutlook(null);
    setFailed(false);
    const on = new Date(Date.now() + AHEAD_DAYS * 86400000).toISOString().slice(0, 10);
    getOutlook(town, produce, on).then((o) => live && setOutlook(o), () => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [town, produce]);

  return (
    <>
      <DetailSection className="is-head">
        <div className="aq-fm-mk-head">
          <button type="button" className="aq-icon-btn" aria-label={t('farmMap.market.back')} onClick={onClose}><ArrowLeft size={16} aria-hidden="true" /></button>
          <div>
            <h2 className="aq-title">{town}</h2>
            <label className="aq-fm-group">
              <span className="aq-fm-mk-quiet">{t('farmMap.market.produce')}</span>
              <select className="aq-fm-select" value={produce} onChange={(e) => onProduce(e.target.value as Produce)}>
                {PRODUCE.map((p) => <option key={p} value={p}>{t(produceKey(p))}</option>)}
              </select>
            </label>
          </div>
        </div>
      </DetailSection>
      {outlook ? <TownOutlook outlook={outlook} produceWord={t(produceKey(produce))} /> : null}
      {failed ? <DetailSection><p className="aq-fm-mk-quiet">{t('farmMap.signals.comingSoon')}</p></DetailSection> : null}
    </>
  );
};
