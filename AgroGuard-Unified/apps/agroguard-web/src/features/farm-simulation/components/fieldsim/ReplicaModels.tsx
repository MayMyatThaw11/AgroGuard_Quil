import React from 'react';
import type { SeasonReplay } from '../../lib/api.ts';
import { ENGINE_LABEL } from '../../lib/farmmap/seasonPlayback.ts';
import { activeLocale, useT, type Key } from '../../lib/i18n.ts';

const REGIME: Record<'continuous' | 'awd' | 'pid', Key> = {
  continuous: 'farmMap.sim.continuous',
  awd: 'farmMap.sim.awd',
  pid: 'farmMap.sim.pid',
};

const tonnes = (kgPerHa: number) => (kgPerHa / 1000).toLocaleString(activeLocale(), { maximumFractionDigits: 1 });

export const ReplicaModels: React.FC<{ run: SeasonReplay; year: number }> = ({ run, year }) => {
  const t = useT();
  const season = run.years[year];
  if (!season) return null;
  const own = season.engines.own;
  const ownRun = own && 'days' in own ? own : null;
  const alerts = (ownRun?.windows ?? []).filter((w) => w.kind !== 'harvest');
  const heatDays = ownRun?.summary.heat_days ?? 0;
  return (
    <details className="aq-fm-replica-models">
      <summary>{t('farmMap.replica.models')}</summary>
      <p>{t('farmMap.replica.regime', { regime: t(REGIME[season.plan.water.regime]) })}</p>
      {Object.entries(season.engines).map(([name, result]) => {
        const engine = ENGINE_LABEL[name] ?? name;
        const yieldVar = 'days' in result ? result.summary.yield_kg_ha : null;
        const value = yieldVar?.value;
        const text =
          typeof value === 'number'
            ? t('farmMap.replica.engineYield', { engine, t: tonnes(value) })
            : yieldVar
              ? t('farmMap.replica.engineNoYield', { engine, reason: yieldVar.reason ?? '—' })
              : t('farmMap.replica.engineFailed', { engine, reason: 'reason' in result ? result.reason : '—' });
        return <p key={name}>{text}</p>;
      })}
      {ownRun?.summary.maturity_date ? <p>{t('farmMap.replica.maturity', { date: ownRun.summary.maturity_date, harvest: ownRun.summary.planned_harvest })}</p> : null}
      {heatDays > 0 ? <p>{t('farmMap.replica.heat', { n: heatDays })}</p> : null}
      {alerts.map((w) => (
        <p key={`${w.kind}-${w.start}`}>{t(`farmMap.sim.window.${w.kind}` as Key)} · {w.start ?? '—'} · {w.detail}</p>
      ))}
      <p>{t('farmMap.sim.uncalibrated')} · {t('farmMap.sim.comparison')}</p>
    </details>
  );
};
