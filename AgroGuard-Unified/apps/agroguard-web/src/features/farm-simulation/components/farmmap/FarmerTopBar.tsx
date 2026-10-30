import React, { useEffect, useRef, useState } from 'react';
import { Handshake, Languages } from 'lucide-react';
import { getCues, loadCueState, showCue } from '../../lib/farmmap/marketCues.ts';
import { marketEnabled } from '../../lib/farmmap/market.ts';
import { loadActiveProducer, myProducers } from '../../lib/farmmap/producers.ts';
import { LANGS, isLang, setLang, useLang, useT } from '../../lib/i18n.ts';
import { browserStorage } from '../../lib/paddySettingsBoot.ts';
import { AqButton } from '../aq/aqPrimitives.tsx';

function useCueCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let live = true;
    marketEnabled()
      .then((r) => (r.enabled ? myProducers() : []))
      .then(async (rows) => {
        const id = loadActiveProducer(browserStorage());
        const mine = rows.find((p) => p.id === id) ?? (rows.length === 1 ? rows[0] : null);
        if (!mine) return 0;
        const state = loadCueState(browserStorage());
        const [cue] = await getCues(mine.id, state.seenAt);
        return cue && showCue(cue, state) ? (cue.kind === 'new-buyers' ? Number(cue.params.n) || 1 : 1) : 0;
      })
      .then((n) => live && setCount(n), () => live && setCount(0));
    return () => {
      live = false;
    };
  }, []);
  return count;
}

export const FarmerTopBar: React.FC<{ farmName: string | null; onSell: () => void }> = ({ farmName, onSell }) => {
  const t = useT();
  const lang = useLang();
  const count = useCueCount();
  const before = useRef(0);
  const [ripple, setRipple] = useState(false);
  useEffect(() => {
    if (count > before.current) setRipple(true);
    before.current = count;
  }, [count]);

  return (
    <header className="aq-fm-top aq-fm-farmer-top">
      <h1 className="aq-fm-title-text">{farmName ?? t('farmMap.farmer.myFarm')}</h1>
      <div className="aq-fm-top-actions">
        <label className="aq-fm-viewas">
          <Languages size={15} aria-hidden="true" />
          <span className="aq-sr-only">{t('farmMap.farmer.language')}</span>
          <select className="aq-fm-select" value={lang} onChange={(e) => isLang(e.target.value) && setLang(e.target.value)}>
            {LANGS.map((l) => <option key={l.id} value={l.id} lang={l.id}>{l.name}</option>)}
          </select>
        </label>
        <AqButton variant="primary" large onClick={onSell}>
          <Handshake size={16} aria-hidden="true" />
          {t('farmMap.farmer.sell')}
          {count ? <span className={`aq-fm-farmer-badge${ripple ? ' is-ripple' : ''}`} onAnimationEnd={() => setRipple(false)}>{count}</span> : null}
        </AqButton>
      </div>
    </header>
  );
};
