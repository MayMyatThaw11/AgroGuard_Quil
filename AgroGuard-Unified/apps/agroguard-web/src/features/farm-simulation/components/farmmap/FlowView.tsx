import React, { useEffect, useMemo, useState } from 'react';
import { getFlows, type FarmFlows } from '../../lib/api.ts';
import { failedText } from '../../lib/apiError.ts';
import type { ContractSpec } from '../../lib/contractFarm.ts';
import { flowSummary, type FlowTerm } from '../../lib/farmmap/flowSummary.ts';
import { PROVENANCE_CLASS, PROVENANCE_LABEL } from '../../lib/provenance.ts';
import { AqProgress, AqSectionLabel } from '../aq/aqLayout.tsx';
import { DetailSection, KV, More } from './detailParts.tsx';

const TONE: Record<FlowTerm['key'], 'water' | 'accent' | 'warning'> = { rain: 'water', transpiration: 'accent', evaporation: 'warning', percolation: 'water' };
const GAS_LABEL: Record<string, string> = { n2o: 'N₂O (no fertiliser logged)', urea_co2: 'urea CO₂', fuel: 'machine fuel' };
const m3 = (v: number) => `${v.toLocaleString('en-US')} m³`;

const Term: React.FC<{ term: FlowTerm; scale: number }> = ({ term, scale }) => (
  <div className="aq-fm-bar-row is-flow">
    <span className="aq-fm-kv-key">{term.label}</span>
    {term.m3 === null ? <span className="aq-fm-note">not known</span> : <AqProgress label={`${term.label} ${m3(term.m3)}`} value={term.m3 / scale} tone={TONE[term.key]} />}
    <span className="aq-fm-bar-value">{term.m3 === null ? '—' : m3(term.m3)}</span>
  </div>
);

export const FlowView: React.FC<{ farmId: string; spec: ContractSpec }> = ({ farmId, spec }) => {
  const [data, setData] = useState<FarmFlows | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setData(null);
    setFailed(null);
    getFlows(farmId).then((f) => alive && setData(f), (err: unknown) => alive && setFailed(failedText(err, 'Flows are unavailable right now')));
    return () => {
      alive = false;
    };
  }, [farmId]);
  const areas = useMemo(() => Object.fromEntries(spec.parcels.map((p) => [p.id, p.area_ha ?? null])), [spec]);
  const summary = flowSummary(data, areas);

  if (!summary || !data) {
    return (
      <DetailSection>
        <AqSectionLabel>Water and methane flows</AqSectionLabel>
        <p className="aq-fm-note">{failed ?? (data ? data.missing?.[0]?.reason ?? 'Add field areas to see the flows.' : 'Loading the water and methane flows…')}</p>
      </DetailSection>
    );
  }
  const net = summary.netM3;
  return (
    <DetailSection>
      <AqSectionLabel aside={`next ${summary.days} days`}>Water and methane flows</AqSectionLabel>
      <div className="aq-fm-badges">
        <span className={PROVENANCE_CLASS.modelled}>{PROVENANCE_LABEL.modelled}</span>
      </div>
      {summary.inflow.map((t) => <Term key={t.key} term={t} scale={summary.scale} />)}
      {summary.outflow.map((t) => <Term key={t.key} term={t} scale={summary.scale} />)}
      <KV k="Balance" v={net === null ? 'not known' : `${net > 0 ? '+' : ''}${m3(net)}`} sub={net === null ? 'a term is missing' : net < 0 ? 'the field loses more than rain brings; irrigation is not logged' : 'rain covers the known losses'} />
      {summary.evaporationUpperBound ? <p className="aq-fm-note">Evaporation is an upper bound on days the water depth is unknown or the soil is drying.</p> : null}
      {summary.methane ? (
        <KV
          k="Methane this season"
          v={`${summary.methane.kgHa} kg/ha`}
          sub={`${summary.methane.low}–${summary.methane.high} kg/ha · ${summary.methane.regime}${summary.methane.savedKgHa ? ` · ${summary.methane.savedKgHa} kg/ha less than continuous flooding` : ''}`}
        />
      ) : null}
      {summary.nitrogen ? (
        <KV
          k="Nitrogen this season"
          v={`${summary.nitrogen.appliedKg} kg N applied`}
          sub={`${summary.nitrogen.airKg} kg to air · ${summary.nitrogen.waterKg} kg washed out · ${summary.nitrogen.n2oKg} kg as N₂O${summary.nitrogen.notCounted ? ` · ${summary.nitrogen.notCounted} rows without a rate or N %` : ''}`}
        />
      ) : <KV k="Nitrogen this season" v="no fertiliser logged" sub="log fertiliser with its rate and N % to see where it goes" />}
      {summary.climate ? (
        <KV
          k="Greenhouse gases this season"
          v={`${summary.climate.farmT} t CO₂e`}
          sub={`${summary.climate.lowT}–${summary.climate.highT} t${summary.climate.leftOut.length ? ` · not counted: ${summary.climate.leftOut.map((k) => GAS_LABEL[k] ?? k).join(', ')}` : ''}`}
        />
      ) : null}
      {summary.wettestDay ? <KV k="Leaf wetness" v={`${summary.wettestDay.wetHours} h`} sub={`wettest day ${summary.wettestDay.date} · humid hours favour blast and sheath blight`} /> : null}
      <More label="How these are worked out">
        {(data.parcels ?? []).map((p) => (
          <KV key={p.id} k={`${p.id} (${p.stage ?? 'stage unknown'})`} v={`rain ${p.water.total.rain_mm} · crop ${p.water.total.transpiration_mm} · evap ${p.water.total.evaporation_mm} · drain ${p.water.total.percolation_mm ?? '—'} mm`} sub={p.methane.kg_ha === null ? p.methane.reason : `${p.methane.season_days} days, ${p.methane.season_basis}`} />
        ))}
        <p className="aq-fm-note">{data.parcels?.[0]?.water.method}</p>
        {data.parcels?.[0]?.water.unknown.map((u) => <p key={u.field} className="aq-fm-note">Not counted: {u.reason}</p>)}
        {data.parcels?.[0]?.methane.assumed?.map((a) => <p key={a} className="aq-fm-note">Assumed: {a}</p>)}
        <p className="aq-fm-note">Water: {data.sources?.water}</p>
        <p className="aq-fm-note">Methane: {data.sources?.methane}</p>
        <p className="aq-fm-note">Nitrogen: {data.parcels?.[0]?.nitrogen?.source}</p>
        <p className="aq-fm-note">CO₂e: {data.parcels?.[0]?.climate?.source}</p>
        <p className="aq-fm-note">Weather: {data.sources?.weather}</p>
      </More>
    </DetailSection>
  );
};
