import React, { useEffect } from 'react';
import { CircleX, Info, TriangleAlert, WandSparkles } from 'lucide-react';
import { MODULES } from '../../lib/livetwin/twinPlansData.ts';
import type { CheckIssue, Outcome } from '../../lib/livetwin/twinPlans.ts';
import type { ModuleId, PlanConfig } from '../../lib/livetwin/twinTypes.ts';
import { AqBadge } from '../aq/aqPrimitives.tsx';
import { AqSectionLabel, AqStatTile } from '../aq/aqLayout.tsx';
import { TechniqueFit } from '../site/TechniqueFit.tsx';
import { plMoney, plN } from './twinFormat.ts';
import { useTwin } from './useTwin.ts';

export const Caption: React.FC<{ children: React.ReactNode; flush?: boolean }> = ({ children, flush = false }) => (
  <p className={`aq-tw-caption${flush ? ' is-flush' : ''}`}>{children}</p>
);

interface MethodStackProps {
  cfg: PlanConfig;
  active: PlanConfig | null;
  organic: boolean;
  onPick: (module: ModuleId, option: string) => void;
}

export const MethodStack: React.FC<MethodStackProps> = ({ cfg, active, organic, onPick }) => (
  <div className="aq-tw-stack">
    {MODULES.map((module) => (
      <div key={module.id} className="aq-tw-module">
        <AqSectionLabel aside={active && active[module.id] !== cfg[module.id] ? 'changed' : undefined}>{module.label}</AqSectionLabel>
        <div className="aq-tw-options" role="radiogroup" aria-label={module.label}>
          {module.options.map((option) => {
            const on = cfg[module.id] === option.id;
            const barred = organic && ((module.id === 'protect' && option.id === 'calendar') || (module.id === 'nutrient' && option.id === 'fixed'));
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={on}
                className={`aq-tw-option${on ? ' is-on' : ''}${barred ? ' is-barred' : ''}`}
                onClick={() => onPick(module.id, option.id)}
              >
                <span className="aq-tw-radio" aria-hidden="true" />
                <span className="aq-tw-option-copy">
                  <span className="aq-tw-option-name">
                    {option.name}
                    {option.trad ? <span className="aq-tw-faint"> · traditional</span> : null}
                  </span>
                  <span className="aq-tw-option-desc">{barred ? 'Not allowed on organic farms (ASOA).' : option.desc}</span>
                </span>
                <AqBadge tone={option.trad ? 'neutral' : 'accent'}>{option.fam}</AqBadge>
              </button>
            );
          })}
        </div>
      </div>
    ))}
  </div>
);

const ISSUE_ICON = { block: CircleX, warn: TriangleAlert, adjust: WandSparkles, info: Info } as const;

export const Issues: React.FC<{ issues: readonly Pick<CheckIssue, 'level' | 'msg'>[] }> = ({ issues }) => {
  if (!issues.length) return null;
  return (
    <div className="aq-tw-issues">
      {issues.map((issue, i) => {
        const Icon = ISSUE_ICON[issue.level];
        return (
          <div key={i} className={`aq-tw-issue is-${issue.level}`}>
            <Icon size={14} aria-hidden="true" />
            <span>{issue.msg}</span>
          </div>
        );
      })}
    </div>
  );
};

export const StrategyBars: React.FC<{ farmId: string; current: string }> = ({ farmId, current }) => {
  const twin = useTwin();
  const water = MODULES[0];
  const rows = water.options.map((option) => ({ option, run: twin.plans.simFarm(farmId, option.id) })).filter((row) => row.run);
  if (!rows.length) return <Caption>No weather data for this farm yet, so the strategies cannot be replayed.</Caption>;
  const max = Math.max(1, ...rows.map((row) => row.run?.m3 ?? 0));
  const base = rows.find((row) => row.option.trad)?.run ?? null;
  return (
    <div className="aq-tw-bars">
      {rows.map(({ option, run }) => {
        if (!run) return null;
        const on = option.id === current;
        const save = base && base.m3 > 0 ? ((base.m3 - run.m3) / base.m3) * 100 : null;
        return (
          <div key={option.id} className="aq-tw-bar-row">
            <span className={`aq-tw-bar-name${on ? ' is-on' : ''}`}>{option.name}</span>
            <span className="aq-tw-track">
              <span
                className={`aq-tw-fill${option.trad ? ' is-base' : on ? ' is-current' : ''}`}
                style={{ width: `${Math.max(1.5, (run.m3 / max) * 100)}%` }}
              />
            </span>
            <span className="aq-tw-bar-value">
              {plN(run.m3)} m³
              <span className={run.stress ? 'aq-tw-alert' : 'aq-tw-faint'}>
                {option.trad ? ' · base' : save != null ? ` · ${save >= 0 ? '−' : '+'}${plN(Math.abs(save))}%` : ''}
                {run.stress ? ` · ${run.stress} stress d` : ''}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
};

export const OutcomeTiles: React.FC<{ outcome: Outcome | null }> = ({ outcome }) => {
  const twin = useTwin();
  if (!outcome) return null;
  const costs = twin.plans.costs();
  return (
    <div className="aq-tw-tiles">
      <AqStatTile label="Water pumped (plan)" value={plN(outcome.water?.m3)} unit="m³" />
      <AqStatTile
        label="Saved vs flooding"
        value={outcome.savedPct != null ? plN(outcome.savedPct) : '—'}
        unit={`% · ${plN(outcome.savedM3)} m³`}
        tone={(outcome.savedM3 ?? 0) > 0 ? 'accent' : 'default'}
      />
      <AqStatTile
        label="Spray area avoided"
        value={plN(outcome.pest.avoidedHa, 1)}
        unit={`ha · ${outcome.pest.avoidedN} sprays`}
        tone={outcome.pest.avoidedHa > 0 ? 'accent' : 'default'}
      />
      <AqStatTile label="Stress days (plan)" value={outcome.water ? String(outcome.water.stress) : '—'} unit="paddy-days" tone={outcome.water?.stress ? 'alert' : 'default'} />
      <AqStatTile
        label={`Cost avoided${costs.demo ? ' (demo prices)' : ''}`}
        value={plMoney(outcome.money.total, costs.currency)}
        tone={outcome.money.total > 0 ? 'accent' : 'default'}
      />
    </div>
  );
};

const NEAR_ROWS: readonly (readonly [string, string])[] = [
  ['river', 'River'], ['canal', 'Canal'], ['water', 'Water'], ['waterfall', 'Waterfall'], ['coast', 'Coast'], ['wetland', 'Wetland'],
  ['forest', 'Forest'], ['peak', 'Peak'], ['aquaculture', 'Fish ponds'], ['farmland', 'Farmland'], ['village', 'Village'], ['town', 'Town'], ['protected', 'Protected'],
];

const distanceText = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

export const SiteCard: React.FC<{ farmId: string; compact?: boolean }> = ({ farmId, compact = false }) => {
  const twin = useTwin();
  useEffect(() => {
    twin.store.soil(farmId);
  }, [twin, farmId]);
  const analysis = twin.site(farmId, true);
  const farm = twin.store.farm(farmId);
  if (!analysis) return null;
  const near = analysis.s?.near ?? {};
  const rows = NEAR_ROWS.filter(([key]) => near[key]);
  const tiles: readonly (readonly [string, string])[] = [
    ['Elevation', analysis.elev != null ? `${Math.round(analysis.elev)} m` : '—'],
    ['Slope (300 m)', analysis.slope != null ? `${analysis.slope}%` : twin.gis.status(`${farmId}:slope`) ? 'retrying' : '—'],
    ['Flood risk', analysis.flood ?? '—'],
    ['Salinity', analysis.saline ?? '—'],
    ['Rain 90 d', analysis.rain90 != null ? `${Math.round(analysis.rain90)} mm` : '—'],
  ];
  const waiting =
    analysis.status === 'loading'
      ? 'Reading OpenStreetMap around the farm…'
      : analysis.status === 'queued'
        ? 'Queued for OpenStreetMap (one farm every few seconds, fair use)…'
        : analysis.status === 'error'
          ? `OpenStreetMap did not answer (${analysis.err ?? 'error'}). Nothing is shown in its place.`
          : 'Loading…';
  return (
    <div className="aq-tw-site">
      <AqSectionLabel aside="OSM · Copernicus DEM · SoilGrids">Site and surroundings (GIS)</AqSectionLabel>
      <div className="aq-tw-facts">
        {tiles.map(([label, value]) => (
          <div key={label} className="aq-tw-fact">
            <span className="aq-tw-fact-label">{label}</span>
            <span className="aq-tw-fact-value">{value}</span>
          </div>
        ))}
      </div>
      {analysis.s ? (
        <div className="aq-tw-near">
          {analysis.pinIn.length ? <p className="aq-tw-caption is-flush">Pin lies in: {analysis.s.inside.map((x) => x.label + (x.name ? ` (${x.name})` : '')).join(', ')}</p> : null}
          {(compact ? rows.slice(0, 7) : rows).map(([key, label]) => {
            const item = near[key];
            return (
              <div key={key} className="aq-tw-near-row">
                <span className="aq-tw-faint">{label}</span>
                <span>
                  {item.name ? `${item.name} · ` : ''}
                  {distanceText(item.d)}
                  {item.n > 1 ? ` · ${item.n} mapped` : ''}
                  {item.ele != null && key === 'peak' ? ` · ${Math.round(item.ele)} m` : ''}
                </span>
              </div>
            );
          })}
          {!rows.length ? <Caption>No mapped water, forest, settlements or protected areas within 4 km in OpenStreetMap.</Caption> : null}
        </div>
      ) : (
        <Caption flush>{waiting}</Caption>
      )}
      <Issues issues={analysis.flags} />
      <Caption flush>
        Distances use OSM feature centres (large forests or lakes may be closer at their edge). Terrain is the Copernicus 90 m DEM; slope is between the farm point and points 300 m away.
      </Caption>
      {farm ? <TechniqueFit lat={farm.lat} lon={farm.lon} shown={compact ? 3 : 5} /> : null}
    </div>
  );
};
