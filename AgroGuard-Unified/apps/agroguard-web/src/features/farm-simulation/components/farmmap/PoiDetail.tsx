import React from 'react';
import { OctagonAlert, Route } from 'lucide-react';
import { getFarmMap } from '../../lib/farmmap/farmMapData.ts';
import { benchmarkLine, useBenchmark, useFarmWeather } from '../../lib/farmmap/farmLive.ts';
import { cropLabel, machineStateLabel, poiTypeLabel } from '../../lib/farmmap/farmMapText.ts';
import { activeLocale, tr, useT } from '../../lib/i18n.ts';
import type { MachinePoi, MachineState, MarketPoi, Poi } from '../../lib/farmmap/farmMapTypes.ts';
import type { PickTarget } from '../../lib/farmmap/engine/engineTypes.ts';
import { WIND_CEILING_MS } from '../../lib/safety.ts';
import { AqBadge, AqButton } from '../aq/aqPrimitives.tsx';
import { AqProgress, AqSectionLabel, AqStatTile, AqStatusDot } from '../aq/aqLayout.tsx';
import { DetailSection, KV, UpdatedLine } from './detailParts.tsx';
import { Glyph } from './Glyph.tsx';
import { WeatherBlock } from './WeatherBlock.tsx';

interface PoiDetailProps {
  poi: Poi;
  onRoute: () => void;
  onPick: (target: PickTarget) => void;
}

const BADGE_TONE = { market: 'warning', storage: 'neutral', mill: 'neutral', water: 'water', station: 'water', machine: 'neutral', livestock: 'neutral' } as const;
const STATE_DOT: Record<MachineState, string> = { Working: 'active', 'En route': 'moving', Idle: 'idle', Maintenance: 'warning' };

function DroneHold({ poi, wind }: { poi: MachinePoi; wind: number | null }) {
  if (poi.kind !== 'drone' || wind === null || wind <= WIND_CEILING_MS) return null;
  return (
    <div className="aq-alert is-alert" role="alert">
      <OctagonAlert size={15} aria-hidden="true" />
      <p>
        {tr('farmMap.poi.sprayHold', { wind: wind.toFixed(1), ceiling: WIND_CEILING_MS })}
      </p>
    </div>
  );
}

function MarketSpecifics({ poi }: { poi: MarketPoi }) {
  const t = useT();
  const state = useBenchmark(poi.crop, poi.country);
  const benchmark = state.status === 'ready' ? state.value.benchmark : null;
  return (
    <>
      {benchmark && benchmark.usd_per_tonne !== null ? (
        <div className="aq-fm-tiles">
          <AqStatTile label={t('farmMap.poi.benchmark')} value={benchmark.usd_per_tonne.toLocaleString(activeLocale())} unit="USD/t" />
          <AqStatTile label={t('farmMap.poi.month')} value={benchmark.month} />
        </div>
      ) : null}
      <p className="aq-fm-note">{benchmarkLine(state)}. {t('farmMap.poi.notFarmGate')}</p>
      <KV k={t('farmMap.poi.hours')} v={poi.hours} />
      <KV k={t('farmMap.poi.commodity')} v={cropLabel(poi.crop)} />
    </>
  );
}

function Specifics({ poi, wind }: { poi: Poi; wind: number | null }) {
  switch (poi.type) {
    case 'market':
      return <MarketSpecifics poi={poi} />;
    case 'storage':
      return (
        <>
          <AqStatTile label={tr('farmMap.poi.capacity')} value={poi.capacity.toLocaleString(activeLocale())} unit="t" />
          <div className="aq-fm-bar-row">
            <span className="aq-fm-kv-key">{tr('farmMap.poi.used')}</span>
            <AqProgress label={tr('farmMap.poi.storageUsed')} value={poi.used / 100} tone={poi.used > 85 ? 'warning' : 'accent'} />
            <span className="aq-fm-bar-value">{poi.used}%</span>
          </div>
          <KV k={tr('farmMap.poi.free')} v={Math.round((poi.capacity * (100 - poi.used)) / 100).toLocaleString(activeLocale())} sub="t" />
        </>
      );
    case 'mill':
      return (
        <>
          <div className="aq-fm-tiles">
            <AqStatTile label={tr('farmMap.poi.throughput')} value={String(poi.capacity)} unit={tr('farmMap.poi.tPerDay')} />
            <AqStatTile label={tr('farmMap.poi.queue')} value={String(poi.queue)} tone={poi.queue > 9 ? 'warning' : 'default'} />
          </div>
          <KV k={tr('farmMap.poi.wait')} v={Math.round(poi.queue * 12)} sub="min" />
        </>
      );
    case 'water':
      return (
        <>
          <AqSectionLabel aside={tr('farmMap.poi.ofDesign')}>{tr('farmMap.poi.storageLevel')}</AqSectionLabel>
          <AqProgress label={tr('farmMap.poi.storageLevel')} value={poi.level / 100} tone={poi.level < 45 ? 'warning' : 'water'} />
          <KV k={tr('farmMap.poi.level')} v={poi.level} sub="%" />
        </>
      );
    case 'machine': {
      const held = poi.kind === 'drone' && poi.state === 'Working' && wind !== null && wind > WIND_CEILING_MS;
      const level = poi.battery ?? poi.fuel ?? 0;
      return (
        <>
          <DroneHold poi={poi} wind={wind} />
          <div className="aq-fm-tiles">
            <AqStatTile label={poi.battery !== null ? tr('farmMap.poi.battery') : tr('farmMap.poi.fuel')} value={String(level)} unit="%" tone={level < 30 ? 'warning' : 'default'} />
            <AqStatTile label={tr('farmMap.poi.state')} value={held ? tr('farmMap.poi.held') : machineStateLabel(poi.state)} tone={held ? 'alert' : 'default'} />
          </div>
        </>
      );
    }
    case 'livestock':
      return <AqStatTile label={poi.kind === 'fish' ? tr('farmMap.tip.pond') : tr('farmMap.poi.headCount')} value={poi.head !== null ? poi.head.toLocaleString(activeLocale()) : '1'} unit={poi.kind === 'fish' ? tr('farmMap.poi.pondUnit') : ''} />;
    case 'station':
      return null;
  }
}

export const PoiDetail: React.FC<PoiDetailProps> = ({ poi, onRoute, onPick }) => {
  const t = useT();
  const data = getFarmMap();
  const anchor = data.anchorById[poi.anchor];
  const farm = 'farm' in poi ? data.farmById[poi.farm] : null;
  const live = useFarmWeather(poi.lat, poi.lon);
  const wind = live.status === 'ready' ? live.value.windMs : null;
  return (
    <>
      <DetailSection className="is-head">
        <div className="aq-fm-head">
          <span className="aq-fm-poi-tile"><Glyph name={poi.icon} size={19} /></span>
          <div className="aq-fm-head-copy">
            <h2 className="aq-title">{poi.label}</h2>
            <p className="aq-meta">{poi.town}, {poi.country} · {poi.lat.toFixed(4)}, {poi.lon.toFixed(4)}</p>
          </div>
        </div>
        <div className="aq-fm-badges">
          <AqBadge tone={BADGE_TONE[poi.type]}>{poiTypeLabel(poi.type)}</AqBadge>
          {poi.type === 'machine' ? <AqBadge><AqStatusDot status={STATE_DOT[poi.state]} />{machineStateLabel(poi.state)}</AqBadge> : null}
        </div>
        <UpdatedLine>
          {t('farmMap.poi.illustrative', { wind: wind === null ? t('farmMap.poi.windUnknown') : t('farmMap.poi.windLive', { wind }) })}
        </UpdatedLine>
      </DetailSection>
      <DetailSection>
        <Specifics poi={poi} wind={wind} />
        {farm ? (
          <button type="button" className="aq-fm-kv is-link" onClick={() => onPick({ kind: 'farm', id: farm.id })}>
            <span className="aq-fm-kv-key">{t('farmMap.poi.belongs')}</span>
            <span className="aq-fm-kv-value">{farm.id} · {farm.name}</span>
          </button>
        ) : null}
      </DetailSection>
      {poi.type === 'station' ? <WeatherBlock lat={poi.lat} lon={poi.lon} /> : null}
      <DetailSection className="is-actions">
        <AqButton variant="primary" onClick={onRoute}><Route size={14} aria-hidden="true" />{t('farmMap.poi.routeHere')}</AqButton>
      </DetailSection>
    </>
  );
};
