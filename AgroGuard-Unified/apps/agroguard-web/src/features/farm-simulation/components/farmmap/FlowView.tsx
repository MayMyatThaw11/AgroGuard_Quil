import React, { useEffect, useMemo, useState } from 'react';
import { getFlows, type FarmFlows } from '../../lib/api.ts';
import { failedText } from '../../lib/apiError.ts';
import type { ContractSpec } from '../../lib/contractFarm.ts';
import { flowSummary, type FlowTerm } from '../../lib/farmmap/flowSummary.ts';
import { PROVENANCE_CLASS, PROVENANCE_LABEL } from '../../lib/provenance.ts';
import { activeLocale, tr, useT, type Key } from '../../lib/i18n.ts';
import { AqProgress, AqSectionLabel } from '../aq/aqLayout.tsx';
import { DetailSection, KV, More } from './detailParts.tsx';

const TONE: Record<FlowTerm['key'], 'water' | 'accent' | 'warning'> = { rain: 'water', transpiration: 'accent', evaporation: 'warning', percolation: 'water' };
const GAS_LABEL: Record<string, Key> = { n2o: 'farmMap.flow.gasN2o', urea_co2: 'farmMap.flow.gasUrea', fuel: 'farmMap.flow.gasFuel' };
const m3 = (v: number) => `${v.toLocaleString(activeLocale())} m³`;

const Term: React.FC<{ term: FlowTerm; scale: number }> = ({ term, scale }) => (
  <div className="aq-fm-bar-row is-flow">
    <span className="aq-fm-kv-key">{term.label}</span>
    {term.m3 === null ? <span className="aq-fm-note">{tr('farmMap.flow.notKnown')}</span> : <AqProgress label={`${term.label} ${m3(term.m3)}`} value={term.m3 / scale} tone={TONE[term.key]} />}
    <span className="aq-fm-bar-value">{term.m3 === null ? '—' : m3(term.m3)}</span>
  </div>
);

export const FlowView: React.FC<{ farmId: string; spec: ContractSpec }> = ({ farmId, spec }) => {
  const t = useT();
  const [data, setData] = useState<FarmFlows | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setData(null);
    setFailed(null);
    getFlows(farmId).then((f) => alive && setData(f), (err: unknown) => alive && setFailed(failedText(err, t('farmMap.flow.failed'))));
    return () => {
      alive = false;
    };
  }, [farmId]);
  const areas = useMemo(() => Object.fromEntries(spec.parcels.map((p) => [p.id, p.area_ha ?? null])), [spec]);
  const summary = flowSummary(data, areas);

  if (!summary || !data) {
    return (
      <DetailSection>
        <AqSectionLabel>{t('farmMap.flow.title')}</AqSectionLabel>
        <p className="aq-fm-note">{failed ?? (data ? data.missing?.[0]?.reason ?? t('farmMap.flow.addAreas') : t('farmMap.flow.loading'))}</p>
      </DetailSection>
    );
  }
  const net = summary.netM3;
  return (
    <DetailSection>
      <AqSectionLabel aside={t('farmMap.flow.nextDays', { n: summary.days })}>{t('farmMap.flow.title')}</AqSectionLabel>
      <div className="aq-fm-badges">
        <span className={PROVENANCE_CLASS.modelled}>{PROVENANCE_LABEL.modelled}</span>
      </div>
      {summary.inflow.map((t) => <Term key={t.key} term={t} scale={summary.scale} />)}
      {summary.outflow.map((t) => <Term key={t.key} term={t} scale={summary.scale} />)}
      <KV k={t('farmMap.flow.balance')} v={net === null ? t('farmMap.flow.notKnown') : `${net > 0 ? '+' : ''}${m3(net)}`} sub={net === null ? t('farmMap.flow.termMissing') : net < 0 ? t('farmMap.flow.losing') : t('farmMap.flow.covered')} />
      {summary.evaporationUpperBound ? <p className="aq-fm-note">{t('farmMap.flow.upperBound')}</p> : null}
      {summary.methane ? (
        <KV
          k={t('farmMap.flow.methane')}
          v={`${summary.methane.kgHa} kg/ha`}
          sub={`${summary.methane.low}–${summary.methane.high} kg/ha · ${summary.methane.regime}${summary.methane.savedKgHa ? ` · ${t('farmMap.flow.saved', { n: summary.methane.savedKgHa })}` : ''}`}
        />
      ) : null}
      {summary.nitrogen ? (
        <KV
          k={t('farmMap.flow.nitrogen')}
          v={t('farmMap.flow.nApplied', { n: summary.nitrogen.appliedKg })}
          sub={`${t('farmMap.flow.nFate', { air: summary.nitrogen.airKg, water: summary.nitrogen.waterKg, n2o: summary.nitrogen.n2oKg })}${summary.nitrogen.notCounted ? ` · ${t('farmMap.flow.nRows', { n: summary.nitrogen.notCounted })}` : ''}`}
        />
      ) : <KV k={t('farmMap.flow.nitrogen')} v={t('farmMap.flow.noFertiliser')} sub={t('farmMap.flow.logFertiliser')} />}
      {summary.climate ? (
        <KV
          k={t('farmMap.flow.ghg')}
          v={`${summary.climate.farmT} t CO₂e`}
          sub={`${summary.climate.lowT}–${summary.climate.highT} t${summary.climate.leftOut.length ? ` · ${t('farmMap.flow.notCounted', { list: summary.climate.leftOut.map((k) => (GAS_LABEL[k] ? t(GAS_LABEL[k]) : k)).join(', ') })}` : ''}`}
        />
      ) : null}
      {summary.wettestDay ? <KV k={t('farmMap.flow.leafWetness')} v={`${summary.wettestDay.wetHours} h`} sub={t('farmMap.flow.wettest', { date: summary.wettestDay.date })} /> : null}
      <More label={t('farmMap.flow.how')}>
        {(data.parcels ?? []).map((p) => (
          <KV key={p.id} k={`${p.id} (${p.stage ?? t('farmMap.flow.stageUnknown')})`} v={t('farmMap.flow.parcelMm', { rain: p.water.total.rain_mm, crop: p.water.total.transpiration_mm, evap: p.water.total.evaporation_mm, drain: p.water.total.percolation_mm ?? '—' })} sub={p.methane.kg_ha === null ? p.methane.reason : `${t('farmMap.common.days', { n: p.methane.season_days ?? '?' })}, ${p.methane.season_basis}`} />
        ))}
        <p className="aq-fm-note">{data.parcels?.[0]?.water.method}</p>
        {data.parcels?.[0]?.water.unknown.map((u) => <p key={u.field} className="aq-fm-note">{t('farmMap.flow.notCountedReason', { reason: u.reason })}</p>)}
        {data.parcels?.[0]?.methane.assumed?.map((a) => <p key={a} className="aq-fm-note">{t('farmMap.flow.assumed', { text: a })}</p>)}
        <p className="aq-fm-note">{t('farmMap.flow.srcWater', { src: data.sources?.water ?? '' })}</p>
        <p className="aq-fm-note">{t('farmMap.flow.srcMethane', { src: data.sources?.methane ?? '' })}</p>
        <p className="aq-fm-note">{t('farmMap.flow.srcNitrogen', { src: data.parcels?.[0]?.nitrogen?.source ?? '' })}</p>
        <p className="aq-fm-note">CO₂e: {data.parcels?.[0]?.climate?.source}</p>
        <p className="aq-fm-note">{t('farmMap.flow.srcWeather', { src: data.sources?.weather ?? '' })}</p>
      </More>
    </DetailSection>
  );
};
