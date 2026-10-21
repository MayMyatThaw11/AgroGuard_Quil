import React, { useMemo } from 'react';
import { ChevronRight, Route, ScanLine, ShieldCheck, Tractor } from 'lucide-react';
import { getFarmMap } from '../../lib/farmmap/farmMapData.ts';
import { fieldsOf } from '../../lib/farmmap/farmMapGeometry.ts';
import { nearestPoi } from '../../lib/farmmap/farmMapSearch.ts';
import { CROPS, RICE_STAGES, SOILS } from '../../lib/farmmap/farmMapTheme.ts';
import type { Farm, FarmStatus, PoiType } from '../../lib/farmmap/farmMapTypes.ts';
import { distanceLabel } from '../../lib/farmmap/farmMapWeather.ts';
import { benchmarkLine, useBenchmark, useFarmWeather } from '../../lib/farmmap/farmLive.ts';
import { NEAR_KINDS, favors, type Favor, type NearKind } from '../../lib/farmmap/surroundings.ts';
import type { SurroundingsScan } from './useSurroundings.ts';
import type { PickTarget } from '../../lib/farmmap/engine/engineTypes.ts';
import { usePaddySettingsStore } from '../../store/paddySettingsStore.ts';
import { formatNumber } from '../aq/format.ts';
import { AqBadge, AqButton } from '../aq/aqPrimitives.tsx';
import { AqProgress, AqSectionLabel, AqStatTile } from '../aq/aqLayout.tsx';
import { TechniqueFit } from '../site/TechniqueFit.tsx';
import { BarRow, DetailSection, KV, UpdatedLine } from './detailParts.tsx';
import { Glyph } from './Glyph.tsx';
import { tintStyle } from './tint.ts';
import { WeatherBlock } from './WeatherBlock.tsx';

interface FarmDetailProps {
  farm: Farm;
  field: string | null;
  onRoute: () => void;
  onFocus: () => void;
  onPick: (target: PickTarget) => void;
  onOpenOps: (farmId: string) => void;
  surroundings: SurroundingsScan | 'loading' | null;
}

const NEAR_LABEL: Record<NearKind, string> = {
  river: 'River or stream',
  canal: 'Canal or drain',
  coast: 'Sea coast',
  lake: 'Lake or pond',
  forest: 'Forest',
  wetland: 'Wetland',
  peak: 'Highest peak',
};

const FAVOR_TONE: Record<Favor['tone'], readonly ['accent' | 'warning' | 'neutral', string]> = {
  good: ['accent', 'Asset'],
  watch: ['warning', 'Watch'],
  info: ['neutral', 'Note'],
};

const Surroundings: React.FC<{ scan: SurroundingsScan | 'loading' | null; elevationM: number | null; onFocus: () => void }> = ({ scan, elevationM, onFocus }) => {
  if (scan === 'loading') {
    return (
      <DetailSection>
        <AqSectionLabel aside="OpenStreetMap">Land around the farm</AqSectionLabel>
        <p className="aq-fm-note" role="status">Reading rivers, coast, forest and hills around the farm…</p>
      </DetailSection>
    );
  }
  if (!scan) {
    return (
      <DetailSection>
        <AqSectionLabel aside="OpenStreetMap">Land around the farm</AqSectionLabel>
        <p className="aq-fm-note">Zoom in on the farm to read the rivers, coast, forest and hills around it.</p>
        <AqButton variant="secondary" onClick={onFocus}><ScanLine size={14} aria-hidden="true" />Zoom to the farm</AqButton>
      </DetailSection>
    );
  }
  const radius = distanceLabel(scan.radiusKm);
  const found = NEAR_KINDS.filter((kind) => scan.near[kind]);
  const absent = NEAR_KINDS.filter((kind) => !scan.near[kind]).map((kind) => NEAR_LABEL[kind].toLowerCase());
  const notes = favors(scan.near, elevationM);
  return (
    <DetailSection>
      <AqSectionLabel aside={`OpenStreetMap · ${radius} around`}>Land around the farm</AqSectionLabel>
      {found.map((kind) => {
        const hit = scan.near[kind];
        if (!hit) return null;
        const value = kind === 'peak' && hit.ele !== null ? `${Math.round(hit.ele)} m · ${distanceLabel(hit.km)}` : hit.km === 0 ? 'on site' : distanceLabel(hit.km);
        return <KV key={kind} k={NEAR_LABEL[kind]} v={value} sub={hit.name ?? undefined} />;
      })}
      {absent.length ? <p className="aq-fm-note">None within {radius}: {absent.join(', ')}.</p> : null}
      {notes.length ? (
        <ul className="aq-fm-favors" aria-label="What the land suggests">
          {notes.map((note) => {
            const [tone, label] = FAVOR_TONE[note.tone];
            return (
              <li key={note.text}>
                <AqBadge tone={tone}>{label}</AqBadge>
                <span>{note.text}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      <UpdatedLine>Screening rules · distances and thresholds TO VERIFY per crop and country</UpdatedLine>
    </DetailSection>
  );
};

const STATUS: Record<FarmStatus, readonly ['accent' | 'warning' | 'alert', string]> = {
  ok: ['accent', 'Healthy'],
  watch: ['warning', 'Watch'],
  risk: ['alert', 'At risk'],
};

const NEARBY: PoiType[] = ['market', 'storage', 'mill', 'water'];

export const FarmDetail: React.FC<FarmDetailProps> = ({ farm, field, onRoute, onFocus, onPick, onOpenOps, surroundings }) => {
  const data = getFarmMap();
  const safeDepthCm = usePaddySettingsStore((s) => s.applied.awd_safe_depth_cm);
  const anchor = data.anchorById[farm.anchor];
  const crop = CROPS[farm.crop];
  const soil = SOILS[farm.soil];
  const geometry = useMemo(() => fieldsOf(farm), [farm]);
  const nearby = useMemo(() => NEARBY.map((type) => nearestPoi(data, farm, type)).filter((hit) => hit !== null), [data, farm]);
  const picked = field ? geometry.fields.find((f) => f.id === field) : undefined;
  const stage = farm.crop === 'rice' ? RICE_STAGES[farm.stageI][0] : null;
  const now = Date.now();
  const [tone, statusLabel] = STATUS[farm.status];
  const belowSafe = farm.water !== null && farm.water <= safeDepthCm;
  const water = farm.water;
  const weather = useFarmWeather(farm.lat, farm.lon);
  const benchmark = useBenchmark(farm.crop, farm.country);

  return (
    <>
      <DetailSection className="is-head">
        <div className="aq-fm-head">
          <span className="aq-fm-crop-tile" style={tintStyle(crop.color)}><Glyph name={crop.icon} size={20} strokeWidth={2.2} /></span>
          <div className="aq-fm-head-copy">
            <h2 className="aq-title">{farm.name}</h2>
            <p className="aq-meta"><strong>{farm.id}</strong> · {farm.town}, {farm.country}</p>
          </div>
        </div>
        <div className="aq-fm-badges">
          <AqBadge>Illustrative farm</AqBadge>
          <AqBadge tone={tone}>{statusLabel}</AqBadge>
          <AqBadge>{crop.label}{stage ? ` · ${stage}` : ''}</AqBadge>
          {farm.organic ? <AqBadge tone="accent"><ShieldCheck size={12} aria-hidden="true" />ASOA organic</AqBadge> : null}
        </div>
        <UpdatedLine>Field values illustrative · weather, elevation and market benchmark live</UpdatedLine>
        {farm.crop === 'rice' ? (
          <AqButton variant="primary" large onClick={() => onOpenOps(farm.id)}>
            <Tractor size={14} aria-hidden="true" />
            Open field monitor
          </AqButton>
        ) : (
          <p className="aq-fm-note">The field monitor covers rice paddies. This is a {crop.label.toLowerCase()} farm.</p>
        )}
      </DetailSection>
      {picked ? (
        <DetailSection className="is-picked">
          <AqSectionLabel aside="selected on map">Field {picked.id.split('-').pop()}</AqSectionLabel>
          <div className="aq-fm-tiles is-three">
            <AqStatTile label="Area" value={String(picked.area)} unit="ha" />
            <AqStatTile label="Stage" value={picked.stage ?? crop.label} />
            <AqStatTile label="Crop" value={crop.label.split(' ')[0]} />
          </div>
        </DetailSection>
      ) : null}
      <DetailSection>
        <div className="aq-fm-tiles">
          <AqStatTile label="Area" value={String(farm.area)} unit={`ha · ${farm.fieldsN} fields`} />
          <AqStatTile label="NDVI · generated" value={farm.ndvi.toFixed(2)} tone={farm.ndvi < 0.5 ? 'warning' : 'default'} />
          <AqStatTile label="Soil moisture" value={String(farm.moisture)} unit="% vol" tone={farm.moisture < 20 ? 'warning' : 'default'} />
          {water !== null ? (
            <AqStatTile label="Water level" value={formatNumber(water)} unit="cm" tone={belowSafe ? 'alert' : water < -1 ? 'warning' : 'default'} />
          ) : (
            <AqStatTile label="Yield forecast" value={String(farm.yieldF)} unit={crop.unit} />
          )}
        </div>
        {water !== null ? <KV k="Yield forecast (p50)" v={farm.yieldF} sub={crop.unit} /> : null}
        {water !== null ? <KV k="AWD re-flood level" v={`${formatNumber(safeDepthCm)} cm`} sub="paddy settings" /> : null}
      </DetailSection>
      <DetailSection>
        <AqSectionLabel>Soil & irrigation</AqSectionLabel>
        <KV k="Soil" v={<span className="aq-fm-soil"><i className="aq-fm-swatch" style={tintStyle(soil[1])} />{soil[0]}</span>} />
        <KV k="pH · organic matter" v={`${farm.ph.toFixed(1)} · ${farm.om}%`} />
        <KV k="Irrigation" v={farm.irrigation} />
        <KV
          k="Elevation"
          v={weather.status === 'ready' && weather.value.elevationM !== null ? Math.round(weather.value.elevationM) : '—'}
          sub={weather.status === 'ready' ? 'm · Copernicus DEM' : weather.status === 'loading' ? 'loading' : 'unavailable'}
        />
      </DetailSection>
      <DetailSection>
        <AqSectionLabel aside="Open-Meteo">Rain</AqSectionLabel>
        <KV
          k="Last 30 days"
          v={weather.status === 'ready' && weather.value.rain30Mm !== null ? weather.value.rain30Mm : '—'}
          sub="mm"
        />
        <KV
          k="Next 3 days"
          v={weather.status === 'ready' ? +weather.value.days.reduce((s, d) => s + d.mm, 0).toFixed(1) : '—'}
          sub="mm"
        />
      </DetailSection>
      <Surroundings scan={surroundings} elevationM={weather.status === 'ready' ? weather.value.elevationM : null} onFocus={onFocus} />
      <WeatherBlock lat={farm.lat} lon={farm.lon} />
      <DetailSection>
        <TechniqueFit lat={farm.lat} lon={farm.lon} shown={3} />
      </DetailSection>
      <DetailSection>
        <AqSectionLabel aside="road distance ≈ ×1.3">Nearby</AqSectionLabel>
        {nearby.map(({ poi, km }) => (
          <button key={poi.id} type="button" className="aq-fm-near" onClick={() => onPick({ kind: 'poi', id: poi.id })}>
            <Glyph name={poi.icon} size={14} />
            <span className="aq-fm-near-copy">
              <span className="aq-fm-near-name">{poi.label}</span>
              {poi.type === 'market' ? <span className="aq-fm-near-sub">{benchmarkLine(benchmark)}</span> : null}
            </span>
            <span className="aq-fm-near-km">{distanceLabel(km)}</span>
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        ))}
      </DetailSection>
      <DetailSection className="is-actions">
        <AqButton variant="primary" onClick={onRoute}><Route size={14} aria-hidden="true" />Route to market</AqButton>
        <AqButton variant="secondary" onClick={onFocus}><ScanLine size={14} aria-hidden="true" />Fly to</AqButton>
      </DetailSection>
    </>
  );
};
