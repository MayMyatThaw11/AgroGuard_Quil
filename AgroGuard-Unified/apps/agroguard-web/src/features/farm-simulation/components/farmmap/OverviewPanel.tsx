import React, { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { getFarmMap } from '../../lib/farmmap/farmMapData.ts';
import { CROPS } from '../../lib/farmmap/farmMapTheme.ts';
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

const SAMPLE = <AqBadge>Sample data</AqBadge>;
const fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 });

export const FarmsRollup: React.FC<{ farms: readonly RollupFarm[] }> = ({ farms }) => {
  const r = farmsRollup(farms, loadedHarvests, loadedRecords);
  if (r.farms === 0) return null;
  return (
    <>
      <div className="aq-fm-tiles is-three">
        <AqStatTile label="Farms" value={String(r.farms)} />
        <AqStatTile label="Area" value={r.areaUnknown === r.farms ? '—' : fmt(r.areaHa)} unit="ha" />
        <AqStatTile label="At risk" value={String(r.alerts)} tone={r.alerts ? 'alert' : 'default'} />
      </div>
      <p className="aq-fm-note">
        From your farm contracts{r.demo ? ` · ${r.demo} bundled demo` : ''}{r.areaUnknown ? ` · ${r.areaUnknown} with area unknown, left out of the hectares` : ''}
      </p>
      <More label="Harvest and stock">
        <KV
          k="Harvest at national yield"
          v={r.harvest ? `${fmt(r.harvest.lowT)}–${fmt(r.harvest.highT)} t` : 'not loaded'}
          sub={r.harvest ? `FAOSTAT 5-year range, ${r.harvest.farms} of ${r.farms} farms · open a farm to add its reference` : 'opens with each farm; open a farm to load its FAOSTAT reference'}
        />
        <KV k="Certificates due in 60 days" v={r.certificatesDue ? String(r.certificatesDue.due) : 'not loaded'} sub={r.certificatesDue ? `${r.certificatesDue.expired} expired · ${r.certificatesDue.farms} of ${r.farms} farms loaded` : 'open a farm to load its certificate dates'} />
        <KV k="Lots in store" v={r.lotsInStore ? `${r.lotsInStore.lots} · ${fmt(r.lotsInStore.kg)} kg` : 'not loaded'} sub={r.lotsInStore ? `${r.lotsInStore.farms} of ${r.farms} farms loaded` : 'open a farm to load its stored lots'} />
      </More>
    </>
  );
};

function CountryList({ onPick }: { onPick: (target: PickTarget) => void }) {
  const data = getFarmMap();
  return (
    <div className="aq-fm-overview">
      <h2 className="aq-title">ASEAN overview</h2>
      <div className="aq-fm-badges">{SAMPLE}</div>
      <p className="aq-meta">
        {data.farms.length.toLocaleString()} farms in 11 countries. Pick a country bubble, search a town, or scroll in. Regions load as you get close; everything else stays unloaded.
      </p>
      {[...data.countries].sort((a, b) => b.n - a.n).map((c) => (
        <button key={c.country} type="button" className="aq-fm-near" onClick={() => onPick({ kind: 'country', country: c })}>
          <span className="aq-fm-near-name">{c.country}</span>
          <span className="aq-fm-near-km">
            {c.n} farms{c.risk ? <span className="is-down"> · {c.risk} at risk</span> : null}
          </span>
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

export const OverviewPanel: React.FC<OverviewPanelProps> = ({ farms, stats, onPick }) => {
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
        <h2 className="aq-title">In view</h2>
        <p className="aq-meta">Loaded regions only · updates as you move</p>
        <div className="aq-fm-badges">{SAMPLE}</div>
        <div className="aq-fm-tiles is-three">
          <AqStatTile label="Farms" value={String(farms.length)} />
          <AqStatTile label="Area" value={Math.round(hectares).toLocaleString()} unit="ha" />
          <AqStatTile label="Alerts" value={String(alerts)} tone={alerts ? 'alert' : 'default'} />
        </div>
      </DetailSection>
      {hectares ? (
        <DetailSection>
          <AqSectionLabel aside="share of area">Crops</AqSectionLabel>
          <div className="aq-fm-share" role="img" aria-label="Share of area by crop">
            {byCrop.map(([id, area]) => (
              <i key={id} title={CROPS[id].label} style={shareStyle(CROPS[id].color, (area / hectares) * 100)} />
            ))}
          </div>
          <div className="aq-fm-swatches">
            {byCrop.map(([id, area]) => (
              <span key={id} className="aq-fm-swatch-item">
                <i className="aq-fm-swatch" style={tintStyle(CROPS[id].color)} aria-hidden="true" />
                {CROPS[id].label} {Math.round((area / hectares) * 100)}%
              </span>
            ))}
          </div>
        </DetailSection>
      ) : null}
      <DetailSection>
        <AqSectionLabel aside="worst first">Needs attention</AqSectionLabel>
        {worst.length ? (
          worst.map((f) => (
            <button key={f.id} type="button" className="aq-fm-near is-attention" onClick={() => onPick({ kind: 'farm', id: f.id })}>
              <i className={`aq-fm-flag is-${f.status}`} aria-hidden="true" />
              <span className="aq-fm-near-copy">
                <span className="aq-fm-near-name">{f.id} · {f.name}</span>
                <span className="aq-fm-near-sub">{f.flood > f.drought ? `Flood risk ${f.flood}%` : `Drought risk ${f.drought}%`} · NDVI {f.ndvi.toFixed(2)}</span>
              </span>
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          ))
        ) : (
          <p className="aq-fm-note">
            {farms.length ? 'No farms in view need action. The crew keeps watching.' : loading ? 'Regions are still loading…' : 'No farms in this area. Try another region or clear filters.'}
          </p>
        )}
      </DetailSection>
    </>
  );
};
