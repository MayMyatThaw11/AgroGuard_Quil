import React from 'react';
import { ArrowDownRight, Layers, MapPin, Package, Sprout, Store, TrendingDown } from 'lucide-react';
import { barWidth, isPrice, outlookTone, viss, type Advice, type Outlook, type OutlookLevel } from '../../lib/farmmap/market.ts';
import { activeLocale, useT, type Key } from '../../lib/i18n.ts';
import { DetailSection } from './detailParts.tsx';

export const LEVEL_KEY: Record<OutlookLevel, Key> = {
  short: 'farmMap.market.level.short',
  balanced: 'farmMap.market.level.balanced',
  glut: 'farmMap.market.level.glut',
  'no-buyers': 'farmMap.market.level.noBuyers',
  'no-data': 'farmMap.market.level.noData',
};
const VERDICT_KEY: Record<OutlookLevel, Key> = {
  short: 'farmMap.market.verdict.short',
  balanced: 'farmMap.market.verdict.balanced',
  glut: 'farmMap.market.verdict.glut',
  'no-buyers': 'farmMap.market.verdict.noBuyers',
  'no-data': 'farmMap.market.verdict.noData',
};
const ADVICE_KEY: Record<Advice['id'], Key> = {
  'presell-bulk': 'farmMap.market.advice.presellBulk',
  'try-nearby': 'farmMap.market.advice.tryNearby',
  'stagger-harvest': 'farmMap.market.advice.staggerHarvest',
  'price-fell': 'farmMap.market.advice.priceFell',
  'plant-other': 'farmMap.market.advice.plantOther',
  'reach-processors': 'farmMap.market.advice.reachProcessors',
};
const ADVICE_ICON: Record<Advice['id'], React.ElementType> = {
  'presell-bulk': Package,
  'try-nearby': MapPin,
  'stagger-harvest': Layers,
  'price-fell': TrendingDown,
  'plant-other': Sprout,
  'reach-processors': Store,
};

export function useWeight(): (kg: number) => string {
  const t = useT();
  const burmese = activeLocale().startsWith('my');
  return (kg: number) => {
    const main = kg >= 1000 ? t('farmMap.market.tShort', { n: (kg / 1000).toLocaleString(activeLocale(), { maximumFractionDigits: 1 }) }) : t('farmMap.market.kgShort', { n: kg.toLocaleString(activeLocale()) });
    return burmese ? `${main} (${t('farmMap.market.viss', { n: viss(kg).toLocaleString(activeLocale()) })})` : main;
  };
}

const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' });

export const SupplyBars: React.FC<{ supply: number; demand: number; max?: number; early?: boolean }> = ({ supply, demand, max, early = false }) => {
  const t = useT();
  const weight = useWeight();
  const top = max ?? Math.max(supply, demand);
  const rows = [
    { kind: 'supply', label: t('farmMap.market.chart.supply'), value: supply },
    { kind: 'demand', label: t('farmMap.market.chart.demand'), value: demand },
  ];
  return (
    <div className={`aq-fm-mk-bars ${early ? 'is-early' : ''}`}>
      {rows.map((row) => (
        <div key={row.kind} className={`aq-fm-mk-bar is-${row.kind}`} title={`${row.label}: ${weight(row.value)}`}>
          <span className="aq-fm-mk-bar-label">{row.label}</span>
          <span className="aq-fm-mk-bar-value">{weight(row.value)}</span>
          <span className="aq-fm-mk-bar-track" aria-hidden="true">
            <span className="aq-fm-mk-bar-fill" style={{ width: `${barWidth(row.value, top)}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
};

export const TownOutlook: React.FC<{ outlook: Outlook; produceWord: string; onAdvice?: (advice: Advice) => void }> = ({ outlook, produceWord, onAdvice }) => {
  const t = useT();
  const weight = useWeight();
  const tone = outlookTone(outlook.level);
  const early = outlook.coverage.label === 'early';
  const on = new Date(`${outlook.on}T00:00:00`);
  const from = new Date(on.getTime() - 14 * 86400000).toISOString().slice(0, 10);
  const to = new Date(on.getTime() + 14 * 86400000).toISOString().slice(0, 10);
  const price = outlook.price;
  return (
    <DetailSection className={`aq-fm-mk-outlook is-${tone}`}>
      <div className="aq-fm-mk-verdict">
        <p className="aq-fm-mk-verdict-text" aria-live="polite">{t(VERDICT_KEY[outlook.level], { town: outlook.town, produce: produceWord })}</p>
        <span className={`aq-fm-mk-level is-${tone}`}>
          <i aria-hidden="true" />
          {t(LEVEL_KEY[outlook.level])}
        </span>
      </div>
      {early ? <p className="aq-fm-mk-early">{t('farmMap.market.early', { n: outlook.coverage.listings, b: outlook.coverage.buyers })}</p> : null}
      <SupplyBars supply={outlook.supply_kg} demand={outlook.demand_kg} early={early} />
      <p className="aq-fm-mk-quiet">{t('farmMap.market.window', { from: day(from), to: day(to) })}</p>
      {isPrice(price) ? (
        <div className="aq-fm-mk-price">
          <p>
            {t('farmMap.market.price', { price: Math.round(price.latest_mmk_kg).toLocaleString(activeLocale()), market: price.market })}
            {price.change_3m_pct !== null ? <span className={price.change_3m_pct < 0 ? 'is-down' : 'is-up'}>, {t('farmMap.market.priceChange', { pct: price.change_3m_pct > 0 ? `+${price.change_3m_pct}` : price.change_3m_pct })}</span> : null}
          </p>
          <p className="aq-fm-mk-quiet">{price.source.provider}{price.market_km !== undefined ? `, ${t('farmMap.market.priceKm', { km: price.market_km })}` : ''}</p>
        </div>
      ) : (
        <p className="aq-fm-mk-quiet">{t('farmMap.market.noPrice', { reason: price.reason })}</p>
      )}
      {outlook.advice.length ? (
        <div className="aq-fm-mk-advice">
          <p className="aq-fm-mk-subhead">{t('farmMap.market.doTitle')}</p>
          {outlook.advice.map((a) => {
            const Icon = ADVICE_ICON[a.id] ?? ArrowDownRight;
            const params = { ...a.params, w: typeof a.params.unmet_kg === 'number' ? weight(a.params.unmet_kg) : '', produce: produceWord };
            return (
              <button key={a.id} type="button" className="aq-fm-mk-advice-row" onClick={() => onAdvice?.(a)}>
                <Icon size={16} aria-hidden="true" />
                <span>{t(ADVICE_KEY[a.id], params)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {outlook.nearby.length ? (
        <div className="aq-fm-mk-nearby">
          <p className="aq-fm-mk-subhead">{t('farmMap.market.nearby')}</p>
          {outlook.nearby.map((n) => (
            <p key={n.town} className="aq-fm-mk-nearby-row">
              <i className={`aq-fm-mk-dot is-${outlookTone(n.level)}`} aria-hidden="true" />
              <span>{n.town}</span>
              <span className="aq-fm-mk-quiet">{t(LEVEL_KEY[n.level])}, {t('farmMap.market.away', { km: n.km })}</span>
            </p>
          ))}
        </div>
      ) : null}
    </DetailSection>
  );
};
