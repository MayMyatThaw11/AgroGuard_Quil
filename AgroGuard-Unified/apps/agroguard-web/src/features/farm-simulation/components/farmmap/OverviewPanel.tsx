import React, { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { getFarmMap } from '../../lib/farmmap/farmMapData.ts';
import { CROPS } from '../../lib/farmmap/farmMapTheme.ts';
import { cropLabel } from '../../lib/farmmap/farmMapText.ts';
import { activeLocale, useT } from '../../lib/i18n.ts';
import type { CropId, Farm } from '../../lib/farmmap/farmMapTypes.ts';
import type { EngineStats, PickTarget } from '../../lib/farmmap/engine/engineTypes.ts';
import { farmsRollup, type RollupFarm } from '../../lib/farmmap/ownFarms.ts';
import { AqSectionLabel, AqStatTile } from '../aq/aqLayout.tsx';
import { AqBadge } from '../aq/aqPrimitives.tsx';
import { DetailSection, KV, More } from './detailParts.tsx';
import { shareStyle, tintStyle } from './tint.ts';
import { loadedHarvests, loadedRecords } from './useOwnFarms.ts';

interface OverviewPanelProps {
  farms: readonly Farm[];
  stats: EngineStats;
  onPick: (target: PickTarget) => void;
}

function attention(farms: readonly Farm[]): Farm[] {
  return farms
    .filter((f) => f.status !== 'ok')
    .sort((a, b) => (a.status === 'risk' ? 0 : 1) - (b.status === 'risk' ? 0 : 1) || b.flood + b.drought - (a.flood + a.drought))
    .slice(0, 8);
}

const fmt = (v: number) => v.toLocaleString(activeLocale(), { maximumFractionDigits: 1 });

export const FarmsRollup: React.FC<{ farms: readonly RollupFarm[] }> = ({ farms }) => {
  const t = useT();
  const r = farmsRollup(farms, loadedHarvests, loadedRecords);
  if (r.farms === 0) return null;
  return (
    <>
      <div className="aq-fm-tiles is-three">
        <AqStatTile label={t('farmMap.common.farms')} value={String(r.farms)} />
        <AqStatTile label={t('farmMap.common.area')} value={r.areaUnknown === r.farms ? '—' : fmt(r.areaHa)} unit="ha" />
        <AqStatTile label={t('farmMap.status.risk')} value={String(r.alerts)} tone={r.alerts ? 'alert' : 'default'} />
      </div>
      <p className="aq-fm-note">
        {t('farmMap.over.fromContracts')}{r.demo ? ` · ${t('farmMap.over.demo', { n: r.demo })}` : ''}{r.areaUnknown ? ` · ${t('farmMap.over.areaUnknown', { n: r.areaUnknown })}` : ''}
      </p>
      <More label={t('farmMap.over.harvestStock')}>
        <KV
          k={t('farmMap.over.harvestNational')}
          v={r.harvest ? `${fmt(r.harvest.lowT)}–${fmt(r.harvest.highT)} t` : t('farmMap.common.notLoaded')}
          sub={r.harvest ? t('farmMap.over.harvestSub', { n: r.harvest.farms, total: r.farms }) : t('farmMap.over.harvestOpen')}
        />
        <KV k={t('farmMap.over.certsDue')} v={r.certificatesDue ? String(r.certificatesDue.due) : t('farmMap.common.notLoaded')} sub={r.certificatesDue ? t('farmMap.over.certsSub', { expired: r.certificatesDue.expired, n: r.certificatesDue.farms, total: r.farms }) : t('farmMap.over.certsOpen')} />
        <KV k={t('farmMap.rec.lotsInStore')} v={r.lotsInStore ? `${r.lotsInStore.lots} · ${fmt(r.lotsInStore.kg)} kg` : t('farmMap.common.notLoaded')} sub={r.lotsInStore ? t('farmMap.over.farmsLoaded', { n: r.lotsInStore.farms, total: r.farms }) : t('farmMap.over.lotsOpen')} />
      </More>
    </>
  );
};

function CountryList({ onPick }: { onPick: (target: PickTarget) => void }) {
  const t = useT();
  const data = getFarmMap();
  return (
    <div className="aq-fm-overview">
      <h2 className="aq-title">{t('farmMap.keys.overview')}</h2>
      <div className="aq-fm-badges"><AqBadge>{t('farmMap.over.sample')}</AqBadge></div>
      <p className="aq-meta">
        {t('farmMap.over.lead', { n: data.farms.length.toLocaleString(activeLocale()) })}
      </p>
      {[...data.countries].sort((a, b) => b.n - a.n).map((c) => (
        <button key={c.country} type="button" className="aq-fm-near" onClick={() => onPick({ kind: 'country', country: c })}>
          <span className="aq-fm-near-name">{c.country}</span>
          <span className="aq-fm-near-km">
            {t('farmMap.tip.farms', { n: c.n })}{c.risk ? <span className="is-down"> · {t('farmMap.over.atRisk', { n: c.risk })}</span> : null}
          </span>
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

export const OverviewPanel: React.FC<OverviewPanelProps> = ({ farms, stats, onPick }) => {
  const t = useT();
  const worst = useMemo(() => attention(farms), [farms]);
  const hectares = farms.reduce((sum, f) => sum + f.area, 0);
  const byCrop = useMemo(() => {
    const totals = new Map<CropId, number>();
    farms.forEach((f) => totals.set(f.crop, (totals.get(f.crop) ?? 0) + f.area));
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [farms]);
  const alerts = farms.filter((f) => f.status === 'risk').length;
  const loading = stats.chunks.loading + stats.chunks.queued > 0;

  if (stats.overview) return <CountryList onPick={onPick} />;
  return (
    <>
      <DetailSection className="is-head">
        <h2 className="aq-title">{t('farmMap.over.inView')}</h2>
        <p className="aq-meta">{t('farmMap.over.inViewNote')}</p>
        <div className="aq-fm-badges"><AqBadge>{t('farmMap.over.sample')}</AqBadge></div>
        <div className="aq-fm-tiles is-three">
          <AqStatTile label={t('farmMap.common.farms')} value={String(farms.length)} />
          <AqStatTile label={t('farmMap.common.area')} value={Math.round(hectares).toLocaleString(activeLocale())} unit="ha" />
          <AqStatTile label={t('farmMap.over.alerts')} value={String(alerts)} tone={alerts ? 'alert' : 'default'} />
        </div>
      </DetailSection>
      {hectares ? (
        <DetailSection>
          <AqSectionLabel aside={t('farmMap.over.share')}>{t('farmMap.over.crops')}</AqSectionLabel>
          <div className="aq-fm-share" role="img" aria-label={t('farmMap.over.shareLabel')}>
            {byCrop.map(([id, area]) => (
              <i key={id} title={cropLabel(id)} style={shareStyle(CROPS[id].color, (area / hectares) * 100)} />
            ))}
          </div>
          <div className="aq-fm-swatches">
            {byCrop.map(([id, area]) => (
              <span key={id} className="aq-fm-swatch-item">
                <i className="aq-fm-swatch" style={tintStyle(CROPS[id].color)} aria-hidden="true" />
                {cropLabel(id)} {Math.round((area / hectares) * 100)}%
              </span>
            ))}
          </div>
        </DetailSection>
      ) : null}
      <DetailSection>
        <AqSectionLabel aside={t('farmMap.over.worstFirst')}>{t('farmMap.over.attention')}</AqSectionLabel>
        {worst.length ? (
          worst.map((f) => (
            <button key={f.id} type="button" className="aq-fm-near is-attention" onClick={() => onPick({ kind: 'farm', id: f.id })}>
              <i className={`aq-fm-flag is-${f.status}`} aria-hidden="true" />
              <span className="aq-fm-near-copy">
                <span className="aq-fm-near-name">{f.id} · {f.name}</span>
                <span className="aq-fm-near-sub">{f.flood > f.drought ? `${t('farmMap.layer.flood')} ${f.flood}%` : `${t('farmMap.layer.drought')} ${f.drought}%`} · NDVI {f.ndvi.toFixed(2)}</span>
              </span>
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          ))
        ) : (
          <p className="aq-fm-note">
            {farms.length ? t('farmMap.over.allGood') : loading ? t('farmMap.over.stillLoading') : t('farmMap.over.empty')}
          </p>
        )}
      </DetailSection>
    </>
  );
};
