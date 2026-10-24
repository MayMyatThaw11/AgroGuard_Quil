import React, { useMemo } from 'react';
import { Box, ChevronRight, Route, ScanLine, ShieldCheck, Tractor } from 'lucide-react';
import { getFarmMap } from '../../lib/farmmap/farmMapData.ts';
import { decide } from '../../lib/farmmap/farmDecisions.ts';
import { fieldsOf } from '../../lib/farmmap/farmMapGeometry.ts';
import { nearestPoi } from '../../lib/farmmap/farmMapSearch.ts';
import { CROPS, SOILS } from '../../lib/farmmap/farmMapTheme.ts';
import { cropLabel, irrigationLabel, soilLabel, stageAt, stageLabel, statusLabel } from '../../lib/farmmap/farmMapText.ts';
import { activeLocale, useT, type Key } from '../../lib/i18n.ts';
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
import { FarmDecisions } from './FarmDecisions.tsx';
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
  onOpen3d: () => void;
  surroundings: SurroundingsScan | 'loading' | null;
}

const NEAR_LABEL: Record<NearKind, Key> = {
  river: 'farmMap.near.river',
  canal: 'farmMap.near.canal',
  coast: 'farmMap.near.coast',
  lake: 'farmMap.near.lake',
  forest: 'farmMap.near.forest',
  wetland: 'farmMap.near.wetland',
  peak: 'farmMap.near.peak',
};

const FAVOR_TONE: Record<Favor['tone'], readonly ['accent' | 'warning' | 'neutral', Key]> = {
  good: ['accent', 'farmMap.farm.asset'],
  watch: ['warning', 'farmMap.status.watch'],
  info: ['neutral', 'farmMap.common.note'],
};

const Surroundings: React.FC<{ scan: SurroundingsScan | 'loading' | null; elevationM: number | null; onFocus: () => void }> = ({ scan, elevationM, onFocus }) => {
  const t = useT();
  if (scan === 'loading') {
    return (
      <DetailSection>
        <AqSectionLabel aside="OpenStreetMap">{t('farmMap.farm.around')}</AqSectionLabel>
        <p className="aq-fm-note" role="status">{t('farmMap.farm.reading')}</p>
      </DetailSection>
    );
  }
  if (!scan) {
    return (
      <DetailSection>
        <AqSectionLabel aside="OpenStreetMap">{t('farmMap.farm.around')}</AqSectionLabel>
        <p className="aq-fm-note">{t('farmMap.farm.zoomToRead')}</p>
        <AqButton variant="secondary" onClick={onFocus}><ScanLine size={14} aria-hidden="true" />{t('farmMap.farm.zoomTo')}</AqButton>
      </DetailSection>
    );
  }
  const radius = distanceLabel(scan.radiusKm);
  const found = NEAR_KINDS.filter((kind) => scan.near[kind]);
  const absent = NEAR_KINDS.filter((kind) => !scan.near[kind]).map((kind) => t(NEAR_LABEL[kind]).toLocaleLowerCase(activeLocale()));
  const notes = favors(scan.near, elevationM);
  return (
    <DetailSection>
      <AqSectionLabel aside={t('farmMap.farm.osmAround', { radius })}>{t('farmMap.farm.around')}</AqSectionLabel>
      {found.map((kind) => {
        const hit = scan.near[kind];
        if (!hit) return null;
        const value = kind === 'peak' && hit.ele !== null ? `${Math.round(hit.ele)} m · ${distanceLabel(hit.km)}` : hit.km === 0 ? t('farmMap.farm.onSite') : distanceLabel(hit.km);
        return <KV key={kind} k={t(NEAR_LABEL[kind])} v={value} sub={hit.name ?? undefined} />;
      })}
      {absent.length ? <p className="aq-fm-note">{t('farmMap.farm.noneWithin', { radius, list: absent.join(', ') })}</p> : null}
      {notes.length ? (
        <ul className="aq-fm-favors" aria-label={t('farmMap.farm.suggests')}>
          {notes.map((note) => {
            const [tone, label] = FAVOR_TONE[note.tone];
            return (
              <li key={note.text}>
                <AqBadge tone={tone}>{t(label)}</AqBadge>
                <span>{note.text}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      <UpdatedLine>{t('farmMap.farm.screening')}</UpdatedLine>
    </DetailSection>
  );
};

const TONE: Record<FarmStatus, 'accent' | 'warning' | 'alert'> = { ok: 'accent', watch: 'warning', risk: 'alert' };

const NEARBY: PoiType[] = ['market', 'storage', 'mill', 'water'];

export const FarmDetail: React.FC<FarmDetailProps> = ({ farm, field, onRoute, onFocus, onPick, onOpenOps, onOpen3d, surroundings }) => {
  const t = useT();
  const data = getFarmMap();
  const safeDepthCm = usePaddySettingsStore((s) => s.applied.awd_safe_depth_cm);
  const anchor = data.anchorById[farm.anchor];
  const crop = CROPS[farm.crop];
  const soil = SOILS[farm.soil];
  const geometry = useMemo(() => fieldsOf(farm), [farm]);
  const nearby = useMemo(() => NEARBY.map((type) => nearestPoi(data, farm, type)).filter((hit) => hit !== null), [data, farm]);
  const picked = field ? geometry.fields.find((f) => f.id === field) : undefined;
  const stage = farm.crop === 'rice' ? stageAt(farm.stageI) : null;
  const cropName = cropLabel(farm.crop);
  const now = Date.now();
  const tone = TONE[farm.status];
  const belowSafe = farm.water !== null && farm.water <= safeDepthCm;
  const water = farm.water;
  const weather = useFarmWeather(farm.lat, farm.lon);
  const benchmark = useBenchmark(farm.crop, farm.country);
  const forecastReady = weather.status === 'ready';
  const marketKm = nearby.find(({ poi }) => poi.type === 'market')?.km ?? null;
  const decisions = useMemo(
    () => decide({
      crop: farm.crop, status: farm.status, stageI: farm.stageI, water: farm.water, safeDepthCm, moisture: farm.moisture, ndvi: farm.ndvi,
      areaHa: farm.area, yieldPerHa: farm.yieldF, yieldUnit: crop.unit,
      rainDays: weather.status === 'ready' ? weather.value.days.map((day) => ({ date: day.date, mm: day.mm })) : null,
      marketKm,
    }),
    [farm, safeDepthCm, crop.unit, weather, marketKm],
  );

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
          <AqBadge>{t('farmMap.farm.illustrative')}</AqBadge>
          <AqBadge tone={tone}>{statusLabel(farm.status)}</AqBadge>
          <AqBadge>{cropName}{stage ? ` · ${stage}` : ''}</AqBadge>
          {farm.organic ? <AqBadge tone="accent"><ShieldCheck size={12} aria-hidden="true" />{t('farmMap.farm.organic')}</AqBadge> : null}
        </div>
        <UpdatedLine>{t('farmMap.farm.valuesNote')}</UpdatedLine>
        <AqButton variant="secondary" large onClick={onOpen3d}>
          <Box size={14} aria-hidden="true" />
          {t('farmMap.farmView.open')}
        </AqButton>
        {farm.crop === 'rice' ? (
          <AqButton variant="primary" large onClick={() => onOpenOps(farm.id)}>
            <Tractor size={14} aria-hidden="true" />
            {t('farmMap.common.openMonitor')}
          </AqButton>
        ) : (
          <p className="aq-fm-note">{t('farmMap.farm.notRice', { crop: cropName.toLocaleLowerCase(activeLocale()) })}</p>
        )}
      </DetailSection>
      <FarmDecisions decisions={decisions} forecastReady={forecastReady} />
      {picked ? (
        <DetailSection className="is-picked">
          <AqSectionLabel aside={t('farmMap.farm.selected')}>{t('farmMap.farm.field', { id: picked.id.split('-').pop() ?? '' })}</AqSectionLabel>
          <div className="aq-fm-tiles is-three">
            <AqStatTile label={t('farmMap.common.area')} value={String(picked.area)} unit="ha" />
            <AqStatTile label={t('farmMap.farm.stage')} value={picked.stage ? stageLabel(picked.stage) : cropName} />
            <AqStatTile label={t('farmMap.common.crop')} value={cropName} />
          </div>
        </DetailSection>
      ) : null}
      <DetailSection>
        <div className="aq-fm-tiles">
          <AqStatTile label={t('farmMap.common.area')} value={String(farm.area)} unit={`ha · ${t('farmMap.common.fields', { n: farm.fieldsN })}`} />
          <AqStatTile label={t('farmMap.farm.ndvi')} value={farm.ndvi.toFixed(2)} tone={farm.ndvi < 0.5 ? 'warning' : 'default'} />
          <AqStatTile label={t('farmMap.farm.moisture')} value={String(farm.moisture)} unit="% vol" tone={farm.moisture < 20 ? 'warning' : 'default'} />
          {water !== null ? (
            <AqStatTile label={t('farmMap.farm.waterLevel')} value={formatNumber(water)} unit="cm" tone={belowSafe ? 'alert' : water < -1 ? 'warning' : 'default'} />
          ) : (
            <AqStatTile label={t('farmMap.farm.yield')} value={String(farm.yieldF)} unit={crop.unit} />
          )}
        </div>
        {water !== null ? <KV k={t('farmMap.farm.yieldP50')} v={farm.yieldF} sub={crop.unit} /> : null}
        {water !== null ? <KV k={t('farmMap.farm.awd')} v={`${formatNumber(safeDepthCm)} cm`} sub={t('farmMap.farm.paddySettings')} /> : null}
      </DetailSection>
      <DetailSection>
        <AqSectionLabel>{t('farmMap.farm.soilIrrigation')}</AqSectionLabel>
        <KV k={t('farmMap.farm.soil')} v={<span className="aq-fm-soil"><i className="aq-fm-swatch" style={tintStyle(soil[1])} />{soilLabel(farm.soil)}</span>} />
        <KV k={t('farmMap.farm.ph')} v={`${farm.ph.toFixed(1)} · ${farm.om}%`} />
        <KV k={t('farmMap.farm.irrigation')} v={irrigationLabel(farm.irrigation)} />
        <KV
          k={t('farmMap.farm.elevation')}
          v={weather.status === 'ready' && weather.value.elevationM !== null ? Math.round(weather.value.elevationM) : '—'}
          sub={weather.status === 'ready' ? 'm · Copernicus DEM' : weather.status === 'loading' ? t('farmMap.common.loadingLower') : t('farmMap.common.unavailableLower')}
        />
      </DetailSection>
      <DetailSection>
        <AqSectionLabel aside="Open-Meteo">{t('farmMap.flow.rain')}</AqSectionLabel>
        <KV
          k={t('farmMap.farm.last30')}
          v={weather.status === 'ready' && weather.value.rain30Mm !== null ? weather.value.rain30Mm : '—'}
          sub="mm"
        />
        <KV
          k={t('farmMap.farm.next3')}
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
        <AqSectionLabel aside={t('farmMap.farm.roadDistance')}>{t('farmMap.farm.nearby')}</AqSectionLabel>
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
        <AqButton variant="primary" onClick={onRoute}><Route size={14} aria-hidden="true" />{t('farmMap.farm.routeMarket')}</AqButton>
        <AqButton variant="secondary" onClick={onFocus}><ScanLine size={14} aria-hidden="true" />{t('farmMap.farm.flyTo')}</AqButton>
      </DetailSection>
    </>
  );
};
