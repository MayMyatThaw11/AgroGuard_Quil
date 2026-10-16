import React, { useEffect } from 'react';
import { LocateFixed, ShieldCheck, Workflow } from 'lucide-react';
import { statusOf, type FarmStatusKey } from '../../lib/livetwin/twinFilter.ts';
import type { Farm } from '../../lib/livetwin/twinTypes.ts';
import { SPRAY_WIND_LIMIT_KMH, WMO, compass, type WeatherNow } from '../../lib/livetwin/twinWeather.ts';
import { AqBadge, AqButton } from '../aq/aqPrimitives.tsx';
import { AqPanel, AqSectionLabel, AqStatTile } from '../aq/aqLayout.tsx';
import { Caption, SiteCard } from './PlanParts.tsx';
import { TwinComposer } from './TwinComposer.tsx';
import { plN } from './twinFormat.ts';
import { FIELDS_RIGHT_W } from './twinLayout.ts';
import { simTime } from './twinTime.ts';
import { useTwin } from './useTwin.ts';

interface TwinFarmPanelProps {
  selected: ReadonlySet<string>;
  onOpenPlan: (farmId: string) => void;
  onOpenProtect: (farmId: string) => void;
  onFocus: (ids: readonly string[]) => void;
  onHide: () => void;
}

const STATUS: Record<FarmStatusKey, readonly ['alert' | 'warning' | 'accent' | 'neutral', string]> = {
  alert: ['alert', 'At risk'],
  watch: ['warning', 'Watch'],
  ok: ['accent', 'OK'],
  nodata: ['neutral', 'No data'],
};

const FarmDetail: React.FC<{ farm: Farm } & Omit<TwinFarmPanelProps, 'selected' | 'onHide'>> = ({ farm, onOpenPlan, onOpenProtect, onFocus }) => {
  const twin = useTwin();
  const state = twin.store.get();
  const model = state.model[farm.id];
  const weather = twin.store.wx(farm.id);
  const moisture = state.soilm[farm.id];
  const soil = state.soil[farm.id];
  const soilErr = state.soilErr[farm.id];
  useEffect(() => {
    twin.store.soil(farm.id);
  }, [twin, farm.id]);
  const [tone, label] = STATUS[statusOf(model)];
  const now = twin.store.simNow();
  const tasks = state.tasks.filter((t) => t.farmId === farm.id).slice(-4).reverse();
  return (
    <>
      <div className="aq-panel-section aq-tw-detail-head">
        <AqSectionLabel>Farm</AqSectionLabel>
        <h2 className="aq-title">
          {farm.id} · {farm.name}
        </h2>
        <p className="aq-meta">
          {farm.town ? `${farm.town}, ` : ''}
          {farm.region} · {farm.lat.toFixed(3)}, {farm.lon.toFixed(3)}
          {state.elev[farm.id] != null ? ` · ${Math.round(state.elev[farm.id])} m` : ''}
        </p>
        {farm.site ? (
          <p className="aq-meta">
            Mapped field {farm.site.osm} · {farm.site.areaHa} ha · OpenStreetMap
            {farm.site.landCover ? ` · land cover ${farm.site.landCover}` : ''}
          </p>
        ) : null}
        <div className="aq-tw-row is-wrap">
          <AqBadge tone={tone}>{label}</AqBadge>
          {farm.organic ? <AqBadge tone="accent">Organic · ASOA</AqBadge> : null}
        </div>
        <div className="aq-tw-row is-wrap">
          <AqButton variant="secondary" onClick={() => onOpenPlan(farm.id)}>
            <Workflow size={14} aria-hidden="true" />
            Practice plan
          </AqButton>
          <AqButton variant="secondary" onClick={() => onOpenProtect(farm.id)}>
            <ShieldCheck size={14} aria-hidden="true" />
            Crop protection
          </AqButton>
          <AqButton variant="ghost" onClick={() => onFocus([farm.id])}>
            <LocateFixed size={14} aria-hidden="true" />
            Zoom to
          </AqButton>
        </div>
      </div>
      <div className="aq-panel-section">
        <AqSectionLabel aside={weather?.simulated ? 'simulated' : `Open-Meteo${weather?.time ? ` · ${String(weather.time).slice(11, 16)} local` : ''}`}>Weather now</AqSectionLabel>
        {weather ? (
          <div className="aq-tw-tiles is-two">
            <AqStatTile label={WMO[weather.code] ?? 'Temperature'} value={String(Math.round(weather.temp))} unit="°C" />
            <AqStatTile label={`Wind from ${compass(weather.dir)}`} value={String(Math.round(weather.wind))} unit="km/h" tone={weather.wind > SPRAY_WIND_LIMIT_KMH ? 'warning' : 'default'} />
            <AqStatTile label="Rain now" value={plN(weather.rain, 1)} unit="mm/h" />
            <AqStatTile label="Rain next 72 h" value={plN(model?.rain72h, 1)} unit="mm" />
            <AqStatTile label="ET₀ today" value={plN(model?.et0Today, 1)} unit="mm" />
            <AqStatTile label="Soil moisture 3–9 cm" value={plN(moisture?.mid, 2)} unit="m³/m³" />
          </div>
        ) : (
          <p className="aq-hint">No weather data for this farm yet.</p>
        )}
        <Caption>{weather?.simulated ? 'Preset weather is on. Values are not observed.' : 'Open-Meteo current conditions and daily forecast. Soil moisture is model output, not a probe reading.'}</Caption>
      </div>
      <div className="aq-panel-section">
        <AqSectionLabel aside="SoilGrids 250 m">Soil 0–15 cm</AqSectionLabel>
        {soil && !soil.empty ? (
          <div className="aq-tw-tiles is-two">
            <AqStatTile label="Texture (USDA)" value={soil.texture ?? '—'} />
            <AqStatTile label="pH (H₂O)" value={plN(soil.ph, 1)} />
            <AqStatTile label="Clay" value={plN(soil.clay)} unit="%" />
            <AqStatTile label="Organic carbon" value={plN(soil.soc, 1)} unit="g/kg" />
          </div>
        ) : (
          <p className="aq-hint">
            {soil?.empty
              ? 'SoilGrids has no prediction at this point (water or built-up).'
              : soilErr && soilErr !== 'loading'
                ? `SoilGrids unavailable: ${soilErr}.`
                : 'Loading from SoilGrids (queued, about 5 requests per minute)…'}
          </p>
        )}
      </div>
      <div className="aq-panel-section">
        <SiteCard farmId={farm.id} compact />
      </div>
      <div className="aq-panel-section">
        <AqSectionLabel aside="Water now · lowest ahead">Paddies (model)</AqSectionLabel>
        <div className="aq-tw-paddies">
          {(model?.paddies ?? []).map((p) => (
            <div key={p.id} className="aq-tw-paddy-row">
              <b>{p.id}</b>
              <span className="aq-tw-faint">
                {p.stage} · d{p.day} · {p.gdd.toLocaleString('en-US')} °C·d
              </span>
              <span className={p.low <= -15 ? 'aq-tw-alert' : 'aq-tw-num'}>
                {plN(p.water, 1)} · {plN(p.low, 1)} cm
              </span>
            </div>
          ))}
        </div>
        <Caption>
          Water balance: Open-Meteo rain − Kc·ET₀ − seepage{model?.archive ? ', season start from ERA5 archive' : ''}. {model?.gaps ? `${model.gaps} day-steps had missing data. ` : ''}No field gauge
          connected, so not field-validated.
        </Caption>
      </div>
      {tasks.length ? (
        <div className="aq-panel-section">
          <AqSectionLabel>Tasks here</AqSectionLabel>
          {tasks.map((task) => (
            <p key={task.id} className="aq-tw-caption">
              <b>{task.machineId}</b> {task.action} · {twin.store.taskStatus(task, now)} · ends {simTime(task.endAt, now)}
            </p>
          ))}
        </div>
      ) : null}
    </>
  );
};

const GroupSummary: React.FC<{ ids: readonly string[]; all: boolean }> = ({ ids, all }) => {
  const twin = useTwin();
  const state = twin.store.get();
  const farms = ids.map((id) => twin.store.farm(id)).filter((f): f is Farm => f !== undefined);
  const models = farms.map((f) => state.model[f.id]).filter((m) => m && m.paddies.length);
  const weather = farms.map((f) => twin.store.wx(f.id)).filter((w): w is WeatherNow => w !== null);
  const paddies = models.reduce((n, m) => n + m.paddies.length, 0);
  const area = farms.reduce((total, f) => total + f.paddies.reduce((s, p) => s + p.areaHa, 0), 0);
  const risk = models.reduce((n, m) => n + (m.alerts ?? 0), 0);
  const winds = weather.map((w) => w.wind);
  const driest = farms
    .filter((f) => state.model[f.id]?.paddies.length)
    .sort((a, b) => (state.model[a.id].lowest ?? 0) - (state.model[b.id].lowest ?? 0))
    .slice(0, 5);
  return (
    <>
      <div className="aq-panel-section aq-tw-detail-head">
        <AqSectionLabel>{all ? 'Portfolio' : 'Selection'}</AqSectionLabel>
        <h2 className="aq-title">{farms.length.toLocaleString('en-US')} farms</h2>
        <p className="aq-meta">
          {paddies.toLocaleString('en-US')} paddies with data · {area.toFixed(1)} ha
        </p>
        <div className="aq-tw-tiles is-two">
          <AqStatTile label="Paddies at risk" value={risk.toLocaleString('en-US')} tone={risk ? 'alert' : 'default'} />
          <AqStatTile label="Raining now" value={`${weather.filter((w) => w.rain > 0.1).length} farms`} />
          <AqStatTile label="Wind range" value={winds.length ? `${Math.round(Math.min(...winds))}–${Math.round(Math.max(...winds))}` : '—'} unit="km/h" />
          <AqStatTile
            label={`Spray hold > ${SPRAY_WIND_LIMIT_KMH} km/h`}
            value={`${weather.filter((w) => w.wind > SPRAY_WIND_LIMIT_KMH).length} farms`}
            tone={weather.some((w) => w.wind > SPRAY_WIND_LIMIT_KMH) ? 'warning' : 'default'}
          />
        </div>
        {all ? <Caption>Select farms in the list, click them on the map (shift-click to add) or shift-drag a box to command many at once.</Caption> : null}
      </div>
      {driest.length ? (
        <div className="aq-panel-section">
          <AqSectionLabel aside="Lowest ahead">Driest forecast (model)</AqSectionLabel>
          {driest.map((farm) => (
            <p key={farm.id} className="aq-tw-driest">
              <span>
                <b>{farm.id}</b> {farm.name}
              </span>
              <span className={(state.model[farm.id].lowest ?? 0) <= -15 ? 'aq-tw-alert' : 'aq-tw-num'}>{plN(state.model[farm.id].lowest, 1)} cm</span>
            </p>
          ))}
        </div>
      ) : null}
    </>
  );
};

export const TwinFarmPanel: React.FC<TwinFarmPanelProps> = ({ selected, onOpenPlan, onOpenProtect, onFocus, onHide }) => {
  const twin = useTwin();
  const ids = [...selected];
  const single = ids.length === 1 ? twin.store.farm(ids[0]) : undefined;
  return (
    <AqPanel glass label="Farm details" side="right" width={FIELDS_RIGHT_W} hideLabel="Hide details (])" onHide={onHide}>
      <div className="aq-panel-scroll">
        {single ? (
          <FarmDetail farm={single} onOpenPlan={onOpenPlan} onOpenProtect={onOpenProtect} onFocus={onFocus} />
        ) : (
          <GroupSummary ids={ids.length ? ids : twin.store.get().farms.map((f) => f.id)} all={!ids.length} />
        )}
        {ids.length ? <TwinComposer ids={ids} /> : null}
      </div>
    </AqPanel>
  );
};
