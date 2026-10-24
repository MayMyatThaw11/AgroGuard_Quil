import React, { useEffect, useMemo, useState } from 'react';
import { Box, CalendarClock, CircleCheck, CircleHelp, OctagonAlert, TriangleAlert } from 'lucide-react';
import { fieldInfo, latestHealthUpdate, type AgroguardField, type HealthUpdateSummary } from '../../lib/agroguard.ts';
import { getHarvestReference, getRadar, getRisk, getRoadmap, getSatellite, getSummary, type FarmRadar, type FarmRisk, type FarmSatellite, type FarmSummary, type HarvestList, type HarvestReference, type HarvestScore, type MonitoringPaddy, type PersonaPlans, type RiverCell, type Roadmap } from '../../lib/api.ts';
import { failedText } from '../../lib/apiError.ts';
import { haversineKm } from '../../lib/farmmap/farmMapRandom.ts';
import { AWD_SAFE_DEPTH_CM, PAW_SAN_T_HA, advisoryLitres, farmCentroid, nationalHarvest, pawSanHarvest, readAgroguardLocal, todayLine, type OwnStatus, type TodayLine } from '../../lib/farmmap/ownFarms.ts';
import { browserStorage } from '../../lib/paddySettingsBoot.ts';
import { PROVENANCE_CLASS, PROVENANCE_LABEL, type ProvenanceLevel } from '../../lib/provenance.ts';
import { statusLabel } from '../../lib/farmmap/farmMapText.ts';
import { activeLocale, tr, useT, type Key } from '../../lib/i18n.ts';
import { AqSectionLabel } from '../aq/aqLayout.tsx';
import { AqBadge, AqButton } from '../aq/aqPrimitives.tsx';
import { FLOOD_WORD } from '../../lib/farmview/flood.ts';
import { OpsForecastChart } from '../ops/OpsForecastChart.tsx';
import { DetailSection, KV, More, UpdatedLine } from './detailParts.tsx';
import { FlowView } from './FlowView.tsx';
import { SeasonStrip } from './SeasonStrip.tsx';
import { PersonaPlan } from './PersonaPlan.tsx';
import { HarvestRecords, type HarvestPrefill } from './HarvestRecords.tsx';
import { RecordsSection } from './RecordsSection.tsx';
import { FieldNotesSection } from './FieldNotesSection.tsx';
import { SeasonSection } from './SeasonSection.tsx';
import type { SeasonReplay } from '../../lib/api.ts';
import { TechniqueFit } from '../site/TechniqueFit.tsx';
import { rememberHarvest, type OwnFarmLive } from './useOwnFarms.ts';

const MIN_TRUST_CHECKS = 10;
const EXPERIMENTAL = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('experimental');
const STATUS: Record<OwnStatus, { tone: 'accent' | 'warning' | 'alert' | 'neutral'; Icon: typeof CircleCheck }> = {
  ok: { tone: 'accent', Icon: CircleCheck },
  watch: { tone: 'warning', Icon: TriangleAlert },
  risk: { tone: 'alert', Icon: OctagonAlert },
  unknown: { tone: 'neutral', Icon: CircleHelp },
};

const TODAY: Record<TodayLine['tone'], { className: string; Icon: typeof CircleCheck }> = {
  alert: { className: 'aq-alert is-error', Icon: OctagonAlert },
  warning: { className: 'aq-alert is-warning', Icon: TriangleAlert },
  neutral: { className: 'aq-alert', Icon: CalendarClock },
};

const Prov: React.FC<{ level: ProvenanceLevel }> = ({ level }) => <span className={PROVENANCE_CLASS[level]}>{PROVENANCE_LABEL[level]}</span>;

const cm = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const fmt = (v: number) => v.toLocaleString(activeLocale(), { maximumFractionDigits: 1 });
const span = (lo: number, hi: number) => (fmt(lo) === fmt(hi) ? `${lo.toFixed(2)}–${hi.toFixed(2)}` : `${fmt(lo)}–${fmt(hi)}`);

function ago(iso: string | null | undefined): string {
  const minutes = iso ? Math.round((Date.now() - Date.parse(iso)) / 60000) : Number.NaN;
  if (Number.isNaN(minutes)) return tr('farmMap.ago.unknown');
  if (minutes < 60) return tr('farmMap.ago.min', { n: Math.max(0, minutes) });
  if (minutes < 48 * 60) return tr('farmMap.ago.h', { n: Math.round(minutes / 60) });
  return tr('farmMap.ago.days', { n: Math.round(minutes / 1440) });
}

const km = (a: { lat: number; lon: number } | null, lat: number | null | undefined, lon: number | null | undefined) =>
  a && typeof lat === 'number' && typeof lon === 'number' ? tr('farmMap.own.kmAway', { km: haversineKm(a, { lat, lon }).toFixed(1) }) : tr('farmMap.own.noLocation');

const Tile: React.FC<{ label: string; value: string; unit?: string; level: ProvenanceLevel; tone?: 'warning' | 'alert' }> = ({ label, value, unit, level, tone }) => (
  <div className={`aq-stat ${tone ? `is-${tone}` : ''}`}>
    <div className="aq-stat-label">{label}</div>
    <div className="aq-stat-value">
      {value}
      {unit ? <span className="aq-stat-unit">{unit}</span> : null}
    </div>
    <Prov level={level} />
  </div>
);


const pct = (v: number | null | undefined) => (v == null ? '?' : `${Math.round(v * 100)} %`);

const RiverLine: React.FC<{ label: string; cell: RiverCell }> = ({ label, cell }) => (
  <KV
    k={label}
    v={cell.levels ? tr('farmMap.own.riverLevels', { q2: fmt(cell.levels.q2), q5: fmt(cell.levels.q5) }) : tr('farmMap.own.noLevels')}
    sub={
      cell.levels
        ? tr('farmMap.own.riverSub', { km: cell.km, years: cell.years, chance: pct(cell.forecast?.q5.chance), high: cell.high_years.join(', ') || tr('farmMap.own.none') })
        : cell.reason
    }
  />
);

function chartSummary(p: MonitoringPaddy): string {
  const band = p.model?.band;
  if (!band || band.p50.length === 0) return '';
  const last = band.p50.length - 1;
  return tr('farmMap.own.chart', { id: p.id, first: cm(band.p50[0]), last: cm(band.p50[last]), days: last + 1, low: cm(band.p10[last]), high: cm(band.p90[last]), floor: AWD_SAFE_DEPTH_CM });
}

export const OwnFarmDetail: React.FC<{ farm: OwnFarmLive; onLink: (fieldId: number | null) => void; onFocus: () => void; onOpen3d?: () => void; extra?: React.ReactNode; onPlaySeason?: (run: SeasonReplay, parcelId: string, replica?: boolean) => void }> = ({ farm, onLink, onFocus, onOpen3d, extra, onPlaySeason }) => {
  const t = useT();
  const [summary, setSummary] = useState<FarmSummary | null>(null);
  const [summaryFailed, setSummaryFailed] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthUpdateSummary | null | 'error' | 'loading'>('loading');
  const [plan, setPlan] = useState<PersonaPlans | null>(null);
  const [sat, setSat] = useState<FarmSatellite | 'loading' | 'error'>('loading');
  const [agField, setAgField] = useState<AgroguardField | null>(null);
  const [fieldDraft, setFieldDraft] = useState('1');
  const [radar, setRadar] = useState<FarmRadar | 'error' | null>(null);
  const [risk, setRisk] = useState<FarmRisk | 'error' | null>(null);
  const [yieldRef, setYieldRef] = useState<HarvestReference | null>(null);
  const [roadmap, setRoadmap] = useState<Roadmap | string | null>(null);
  const [recorded, setRecorded] = useState<HarvestList | null>(null);
  const [prefill, setPrefill] = useState<HarvestPrefill | null>(null);
  const [score, setScore] = useState<HarvestScore | null>(null);
  const centre = useMemo(() => farmCentroid(farm.spec), [farm.spec]);
  const local = useMemo(() => {
    const storage = browserStorage();
    return storage ? readAgroguardLocal(storage) : { crop: null, advisory: null };
  }, [farm.checkedAt]);

  useEffect(() => {
    let alive = true;
    setSummary(null);
    setSummaryFailed(null);
    setHealth('loading');
    setPlan(null);
    getSummary(farm.id).then((s) => alive && setSummary(s), (err: unknown) => alive && setSummaryFailed(failedText(err, t('farmMap.own.trustUnavailable'))));
    latestHealthUpdate().then((h) => alive && setHealth(h), () => alive && setHealth('error'));
    setSat('loading');
    getSatellite(farm.id).then((s) => alive && setSat(s), () => alive && setSat('error'));
    setRadar(null);
    setRisk(null);
    getRisk(farm.id).then((r) => alive && setRisk(r), () => alive && setRisk('error'));
    setYieldRef(null);
    getHarvestReference(farm.id).then((r) => {
      rememberHarvest(farm.id, r);
      if (alive) setYieldRef(r);
    }, () => alive && setYieldRef(null));
    if (EXPERIMENTAL) getRadar(farm.id).then((r) => alive && setRadar(r), () => alive && setRadar('error'));
    return () => {
      alive = false;
    };
  }, [farm.id]);

  useEffect(() => {
    let alive = true;
    getRoadmap().then((r) => alive && setRoadmap(r), (err: unknown) => alive && setRoadmap(failedText(err, t('farmMap.own.roadmapUnavailable'))));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    if (farm.fieldId === null) setAgField(null);
    else fieldInfo(farm.fieldId).then((f) => alive && setAgField(f), () => alive && setAgField(null));
    return () => {
      alive = false;
    };
  }, [farm.fieldId]);

  const status = STATUS[farm.status];
  const area = farm.spec.parcels.reduce((s, p) => s + (p.area_ha ?? 0), 0);
  const paddies = farm.monitoring?.paddies ?? [];
  const measured = paddies.find((p) => p.model);
  const assessment = farm.field?.latestAssessment ?? null;
  const decisions = summary?.decisions;
  const charted = paddies.filter((p) => p.model?.band && p.model.band_dates.length > 0);
  const water = advisoryLitres(local.advisory, farm.fieldId, area);
  const harvest = pawSanHarvest(farm.spec);
  const recordedYields = (recorded?.harvests ?? []).filter((h) => !h.voided_at && h.yield.kg_ha_14 !== null);
  const ownYield = recordedYields.length ? { kg: recordedYields[0].yield.kg_ha_14 as number, count: recordedYields.length } : null;
  const national = harvest ? null : nationalHarvest(yieldRef);
  const nationalCheck = yieldRef?.parcels.find((p) => p.yield?.backtest)?.yield?.backtest ?? null;
  const flood = risk && risk !== 'error' ? risk : null;
  const elev = flood?.elevation?.mean_m ?? null;
  const actions = (flood?.parcels ?? []).filter((p) => p.advice.action !== 'none');
  const today = risk === null || (summary === null && summaryFailed === null)
    ? null
    : todayLine({ risk: flood, blocked: summary?.work.blocked ?? null, advisory: local.advisory, plan });
  const todayStyle = TODAY[today?.tone ?? 'neutral'];

  return (
    <>
      <DetailSection className="is-head">
        <h2 className="aq-title">{farm.spec.farm.name ?? farm.id}</h2>
        <p className="aq-meta">
          {farm.seed ? t('farmMap.own.demoFarm') : t('farmMap.own.yourFarm')} · {t('farmMap.common.parcels', { n: farm.spec.parcels.length })} · {area.toFixed(2)} ha
          {elev !== null ? ` · ${flood?.elevation?.within_dem_error ? t('farmMap.own.nearSea', { m: elev }) : t('farmMap.own.aboveSea', { m: elev })}` : ''}
        </p>
        <div className="aq-fm-badges">
          <AqBadge tone={status.tone}><status.Icon size={12} aria-hidden="true" />{statusLabel(farm.status)}</AqBadge>
          {farm.seed ? <AqBadge>{t('farmMap.own.demoContract')}</AqBadge> : null}
        </div>
        {onOpen3d ? <AqButton variant="secondary" onClick={onOpen3d}><Box size={14} aria-hidden="true" />{t('farmMap.farmView.open')}</AqButton> : null}
        <More label={t('farmMap.own.why')}>
          {farm.reasons.map((r) => <p key={r} className="aq-fm-note">{r}</p>)}
          <UpdatedLine>{t('farmMap.own.checked', { ago: ago(farm.checkedAt) })}</UpdatedLine>
        </More>
      </DetailSection>

      <DetailSection>
        <div className={todayStyle.className} role="status">
          <todayStyle.Icon size={14} aria-hidden="true" />
          <span><b>{t('farmMap.own.today')}</b> {today ? today.text : t('farmMap.common.loading')}</span>
        </div>
        {today ? <p className="aq-fm-note">{t('farmMap.own.from', { src: today.source })}</p> : null}
      </DetailSection>
      {onPlaySeason ? <SeasonSection key={`season-${farm.id}`} farmId={farm.id} parcels={farm.spec.parcels} onPlay={onPlaySeason} score={score} onRecordHarvest={setPrefill} /> : null}

      <DetailSection>
        <div className="aq-fm-tiles">
          {measured?.model ? (
            <Tile
              label={t('farmMap.own.waterOf', { id: measured.id })}
              value={`${cm(measured.model.depth_cm)} ± ${cm(measured.model.sigma_cm)}`}
              unit="cm"
              level={measured.model.source === 'MEASURED' ? 'measured' : 'modelled'}
              tone={measured.model.depth_cm < AWD_SAFE_DEPTH_CM ? 'alert' : undefined}
            />
          ) : <Tile label={t('farmMap.own.waterDepth')} value="—" level="unavailable" />}
          {assessment ? (
            <Tile label={t('farmMap.own.health')} value={String(Math.round(assessment.healthScore))} unit="/ 100" level="modelled" tone={assessment.status === 'critical' ? 'alert' : assessment.status === 'warning' ? 'warning' : undefined} />
          ) : <Tile label={t('farmMap.own.health')} value="—" level="unavailable" />}
          {local.advisory ? (
            <Tile label={t('farmMap.own.advice')} value={local.advisory.status.replace(/_/g, ' ')} level="modelled" />
          ) : <Tile label={t('farmMap.own.advice')} value="—" level="unavailable" />}
          {local.crop?.crop ? (
            <Tile label={t('farmMap.own.suggested')} value={local.crop.crop} level="modelled" />
          ) : <Tile label={t('farmMap.own.suggested')} value="—" level="unavailable" />}
        </div>
      </DetailSection>

      {water.litres !== null || harvest || national || risk || ownYield ? (
        <DetailSection>
          <div className="aq-fm-tiles">
            {risk ? (
              <Tile
                label={t('farmMap.own.flood30')}
                value={t(flood ? FLOOD_WORD[flood.level] : 'farmMap.status.unknown')}
                level={flood && flood.level !== 'unknown' ? 'modelled' : 'unavailable'}
                tone={flood?.level === 'high' ? 'alert' : flood?.level === 'watch' ? 'warning' : undefined}
              />
            ) : null}
            {water.litres !== null ? <Tile label={t('farmMap.own.waterToAdd')} value={fmt(water.litres / 1000)} unit="m³" level="inferred" /> : null}
            {harvest ? <Tile label={t('farmMap.own.expected')} value={`${fmt(harvest.lowT)}–${fmt(harvest.highT)}`} unit="t" level="inferred" /> : null}
            {ownYield ? <Tile label={t('farmMap.harvest.yourYield')} value={(ownYield.kg / 1000).toLocaleString(activeLocale(), { maximumFractionDigits: 2 })} unit="t/ha" level="measured" /> : null}
            {national ? <Tile label={t('farmMap.over.harvestNational')} value={span(national.lowT, national.highT)} unit="t" level="modelled" /> : null}
          </div>
          {water.litres !== null ? <p className="aq-fm-note">{t('farmMap.own.waterNote', { litres: fmt(water.litres), mm: local.advisory?.netDepthMm ?? '?', ha: area.toFixed(2) })}</p> : null}
          {ownYield ? <p className="aq-fm-note">{t('farmMap.harvest.yourYieldNote', { n: ownYield.count })}</p> : null}
          {harvest ? <p className="aq-fm-note">{t('farmMap.own.pawSan', { ha: harvest.areaHa, low: PAW_SAN_T_HA[0], high: PAW_SAN_T_HA[1] })}</p> : null}
          {national ? <p className="aq-fm-note">{t('farmMap.own.nationalNote', { ha: national.areaHa, country: yieldRef?.country_name ?? '', year: national.year ?? '?' })}</p> : null}
          {national && nationalCheck ? <p className="aq-fm-note">{t('farmMap.own.backtest', { within: nationalCheck.within_10, n: nationalCheck.n, years: nationalCheck.years, error: nationalCheck.mape_pct })}</p> : null}
          {actions.map((p) => (
            <div key={`flood-${p.id}`} className={`aq-alert ${p.advice.action === 'harvest_early' ? 'is-warning' : 'is-error'}`} role="status">
              <span><b>{p.id}:</b> {p.advice.text}</span>
            </div>
          ))}
        </DetailSection>
      ) : null}

      {charted.length > 0 ? (
        <DetailSection>
          <AqSectionLabel aside="P10–P90">{t('farmMap.own.forecast')}</AqSectionLabel>
          {charted.map((p) => p.model?.band ? (
            <figure key={p.id} aria-label={chartSummary(p)} style={{ margin: 0 }}>
              <OpsForecastChart historyDates={p.model.series_dates} observed={p.model.series} forecastDates={p.model.band_dates} band={p.model.band} floorCm={AWD_SAFE_DEPTH_CM} dayOffset={-1} />
            </figure>
          ) : null)}
          <p className="aq-fm-note">
            {summaryFailed ?? (!summary ? t('farmMap.own.trustLoading') : decisions && decisions.scored >= MIN_TRUST_CHECKS ? t('farmMap.own.trustRight', { n: decisions.inside_band, total: decisions.scored }) : t('farmMap.own.trustAfter', { min: MIN_TRUST_CHECKS, sofar: decisions ? t('farmMap.own.soFar', { n: decisions.scored }) : t('farmMap.own.noneReported') }))}
          </p>
        </DetailSection>
      ) : (
        <DetailSection>
          <p className="aq-fm-note">{t('farmMap.own.addReading')}</p>
        </DetailSection>
      )}

      {extra}
      <HarvestRecords key={`harvest-${farm.id}`} farmId={farm.id} spec={farm.spec} prefill={prefill} onPrefillDone={() => setPrefill(null)} onScore={setScore} onHarvests={setRecorded} />
      <RecordsSection key={farm.id} farmId={farm.id} spec={farm.spec} />
      <FieldNotesSection key={`notes-${farm.id}`} farmId={farm.id} />

      {centre ? (
        <DetailSection>
          <TechniqueFit key={`site-${farm.id}`} lat={centre.lat} lon={centre.lon} farmId={farm.id} shown={3} />
        </DetailSection>
      ) : null}

      <SeasonStrip farmId={farm.id} />

      <FlowView farmId={farm.id} spec={farm.spec} />

      <DetailSection>
        <AqSectionLabel aside="Sentinel-2">{t('farmMap.top.satellite')}</AqSectionLabel>
        {sat === 'loading' ? <p className="aq-fm-note">{t('farmMap.own.satReading')}</p> : sat === 'error' ? (
          <p className="aq-fm-note">{t('farmMap.own.satDown')}</p>
        ) : sat.parcels.length === 0 ? <p className="aq-fm-note">{t('farmMap.own.satBoundary')}</p> : sat.parcels.map((p) => {
          const latest = [...p.series].reverse().find((s) => s.status === 'clear');
          return (
            <div key={p.id}>
              {latest ? (
                <KV k={`${p.id} NDVI · NDWI`} v={<>{latest.ndvi?.toFixed(2)} · {latest.ndwi?.toFixed(2)} <Prov level="measured" /></>} sub={latest.datetime.slice(0, 10)} />
              ) : <KV k={p.id} v={t('farmMap.own.noScene')} sub={p.missing[0]?.reason} />}
              <div className="aq-fm-badges" aria-label={t('farmMap.own.scenes', { id: p.id, list: p.series.map((s) => `${s.datetime.slice(5, 10)} ${s.status}`).join(', ') })}>
                {p.series.slice(-6).map((s) => (
                  <AqBadge key={s.scene_id} tone={s.status === 'clear' ? 'accent' : 'neutral'}>{s.datetime.slice(5, 10)} {s.status === 'clear' ? s.ndvi?.toFixed(2) : t('farmMap.own.cloud')}</AqBadge>
                ))}
              </div>
            </div>
          );
        })}
      </DetailSection>

      {farm.fieldId === null ? (
        <DetailSection>
          <AqSectionLabel>{t('farmMap.own.agField')}</AqSectionLabel>
          <div className="aq-fm-kv">
            <span className="aq-input-wrap" style={{ width: 96 }}>
              <input className="aq-input" inputMode="numeric" value={fieldDraft} onChange={(e) => setFieldDraft(e.target.value)} aria-label={t('farmMap.own.agFieldId')} />
            </span>
            <AqButton variant="primary" onClick={() => { const id = Number(fieldDraft); if (Number.isInteger(id) && id > 0) onLink(id); }}>{t('farmMap.own.link')}</AqButton>
          </div>
        </DetailSection>
      ) : null}

      <PersonaPlan farmId={farm.id} assets={farm.spec.assets} onResult={setPlan} />

      <DetailSection>
        <More label={t('farmMap.own.details')}>
          {paddies.map((p) => (
            <div key={p.id}>
              <KV k={p.id} v={p.model ? `${cm(p.model.depth_cm)} ± ${cm(p.model.sigma_cm)} cm` : t('farmMap.status.unknown')} sub={p.model ? t('farmMap.own.kalman') : p.missing[0]?.reason} />
              {EXPERIMENTAL && p.model?.shadow ? (
                <KV
                  k={t('farmMap.own.shadowFilter', { id: p.id })}
                  v={<>{p.model.shadow.mae_cm ? `${p.model.shadow.mae_cm.augmented ?? '—'} vs ${p.model.shadow.mae_cm.one_state ?? '—'} cm` : t('farmMap.own.notScored')} <AqBadge>{t('farmMap.own.shadow')}</AqBadge></>}
                  sub={p.model.shadow.mae_cm ? t('farmMap.own.shadowSub', { pairs: p.model.shadow.pairs, verdict: p.model.shadow.status === 'promote' ? t('farmMap.own.promote') : t('farmMap.own.stayShadow') }) : p.model.shadow.reason}
                />
              ) : null}
              {p.model?.flags.map((f) => <p key={f.observed_at} className="aq-fm-note">{f.kind.replace(/_/g, ' ')}{f.status ? ` (${f.status})` : ''} · {t('farmMap.own.flag', { read: cm(f.reading_cm), expected: cm(f.predicted_cm) })} · {f.meaning}</p>)}
            </div>
          ))}
          {farm.monitoringError ? <p className="aq-fm-note">{t('farmMap.own.waterDown', { error: farm.monitoringError })}</p> : null}
          {farm.fieldId !== null ? (
            <>
              <KV k={t('farmMap.own.agField')} v={agField ? `#${agField.id} ${agField.name}` : `#${farm.fieldId}`} sub={agField ? km(centre, agField.latitude, agField.longitude) : undefined} />
              {farm.fieldError ? <p className="aq-fm-note">{t('farmMap.own.fieldDown', { error: farm.fieldError })}</p> : null}
              {assessment ? <KV k={t('farmMap.own.healthBasis')} v={assessment.status} sub={t('farmMap.own.healthSub', { id: assessment.cropProfileId ?? '?', ago: ago(assessment.createdAt) })} /> : null}
              {(assessment?.evidence?.factors ?? []).map((f) => (
                <KV key={f.factor} k={f.factor.replace(/_/g, ' ')} v={`${f.value ?? '—'} ${f.unit ?? ''}`} sub={`${f.status} · ${f.range_min ?? '?'}–${f.range_max ?? '?'}`} />
              ))}
              <AqButton variant="ghost" onClick={() => onLink(null)}>{t('farmMap.own.unlink')}</AqButton>
            </>
          ) : null}
          {local.advisory ? <KV k={t('farmMap.own.advice')} v={local.advisory.netDepthMm !== null ? t('farmMap.own.deficit', { mm: local.advisory.netDepthMm }) : t('farmMap.own.noDeficit')} sub={t('farmMap.own.advisoryOnly', { ago: ago(local.advisory.capturedAt) })} /> : null}
          {water.reason ? <KV k={t('farmMap.own.waterToAdd')} v={t('farmMap.own.notComputed')} sub={water.reason} /> : null}
          {!harvest ? (yieldRef?.parcels ?? []).map((p) => (
            <KV key={`yield-${p.parcel}`} k={t('farmMap.own.parcelHarvest', { id: p.parcel })} v={p.tonnes ? `${span(p.tonnes[0], p.tonnes[1])} t` : t('farmMap.common.notAvailable')} sub={p.tonnes ? `${p.yield?.item} · ${p.yield?.t_ha_5y?.join('–')} t/ha · ${p.yield?.flag_meaning ?? 'FAOSTAT'}` : p.reason} />
          )) : null}
          {!harvest && !yieldRef ? <KV k={t('farmMap.own.expected')} v={t('farmMap.common.notAvailable')} sub={t('farmMap.own.refDown')} /> : null}
          {local.crop ? <KV k={t('farmMap.own.cropConditions')} v={`pH ${local.crop.soilPh} · ${local.crop.rainfallMm} mm · ${local.crop.temperatureC} °C`} sub={`${local.crop.validatedOnFieldData ? t('farmMap.own.validated') : t('farmMap.own.notValidated')} · ${km(centre, local.crop.lat, local.crop.lon)}`} /> : null}
          {health === 'loading' ? <KV k={t('farmMap.own.healthUpdate')} v={t('farmMap.common.loading')} /> : health === 'error' ? <KV k={t('farmMap.own.healthUpdate')} v={t('farmMap.common.unavailable')} sub={t('farmMap.own.serviceDown')} /> : health ? (
            <KV k={t('farmMap.own.healthUpdate')} v={t('farmMap.own.looksLike', { what: health.diseaseName ?? health.healthStatus })} sub={`${health.detection?.confidence != null ? `${Math.round(health.detection.confidence)} % · ` : ''}${health.township ?? km(centre, health.latitude, health.longitude)} · ${ago(health.reportedAt)}`} />
          ) : null}
          {sat !== 'loading' && sat !== 'error' ? sat.parcels.flatMap((p) => p.series.map((s) => (
            <KV key={`${p.id}-${s.scene_id}`} k={s.datetime.slice(0, 10)} v={s.status === 'clear' ? `NDVI ${s.ndvi?.toFixed(2)} · NDWI ${s.ndwi?.toFixed(2)}` : s.status} sub={s.reason ?? s.scene_id} />
          ))) : null}
          {risk === 'error' ? <KV k={t('farmMap.layer.flood')} v={t('farmMap.common.unavailable')} sub={t('farmMap.own.apiDown')} /> : null}
          {flood ? (
            <>
              {flood.elevation?.mean_m != null ? <KV k={t('farmMap.own.height')} v={`${flood.elevation.min_m}–${flood.elevation.max_m} m`} sub={`Copernicus DEM, ${flood.elevation.accuracy ?? ''}`} /> : null}
              {flood.main ? <RiverLine label={t('farmMap.own.mainRiver')} cell={flood.main} /> : null}
              {flood.nearest && flood.nearest !== flood.main && (flood.nearest.lat !== flood.main?.lat || flood.nearest.lon !== flood.main?.lon) ? <RiverLine label={t('farmMap.own.nearestRiver')} cell={flood.nearest} /> : null}
              {flood.parcels?.[0]?.planting ? <p className="aq-fm-note">{flood.parcels[0].planting.text}</p> : null}
              {flood.missing.map((m) => <p key={m.reason} className="aq-fm-note">{m.reason}</p>)}
              {flood.assumptions?.limit ? <p className="aq-fm-note">{flood.assumptions.limit}. {flood.assumptions.levels}.</p> : null}
            </>
          ) : null}
          {radar === 'error' ? <KV k={t('farmMap.own.radar')} v={t('farmMap.common.unavailable')} sub={t('farmMap.own.pcDown')} /> : radar ? radar.parcels.map((p) => {
            const last = [...p.series].reverse().find((s) => s.vv_db !== null);
            return (
              <div key={`radar-${p.id}`}>
                <KV k={t('farmMap.own.radarOf', { id: p.id })} v={last ? `VV ${last.vv_db} dB · ${last.call}` : t('farmMap.own.noReading')} sub={last ? t('farmMap.own.radarSub', { date: last.datetime.slice(0, 10) }) : p.missing[0]?.reason} />
                {p.revisit?.same_orbit_days ? <p className="aq-fm-note">{t('farmMap.own.revisit', { days: p.revisit.same_orbit_days, cycle: p.revisit.shortest_resolvable_cycle_days ?? '?' })}</p> : null}
                <p className="aq-fm-note">{p.agreement?.agree != null ? t('farmMap.own.agrees', { n: p.agreement.agree, total: p.agreement.pairs, chance: Math.round((p.agreement.chance ?? 0) * p.agreement.pairs) }) : p.agreement?.reason}</p>
              </div>
            );
          }) : null}
          <More label={t('farmMap.own.notYet')}>
            {roadmap === null ? <p className="aq-fm-note">{t('farmMap.common.loading')}</p> : typeof roadmap === 'string' ? <p className="aq-fm-note">{roadmap}</p> : roadmap.blocked.map((b) => (
              <p key={b.item} className="aq-fm-note">{t('farmMap.own.needs', { title: b.title, item: b.item, needs: b.needs })}</p>
            ))}
          </More>
          <UpdatedLine>{t('farmMap.own.contract', { sha: farm.sha256.slice(0, 12) })}</UpdatedLine>
          <AqButton variant="ghost" onClick={onFocus}>{t('farmMap.own.flyBoundary')}</AqButton>
        </More>
      </DetailSection>
    </>
  );
};
