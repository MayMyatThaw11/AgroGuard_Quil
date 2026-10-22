import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, CircleCheck, CircleHelp, OctagonAlert, TriangleAlert } from 'lucide-react';
import { fieldInfo, latestHealthUpdate, type AgroguardField, type HealthUpdateSummary } from '../../lib/agroguard.ts';
import { getRadar, getRisk, getSatellite, getSummary, type FarmRadar, type FarmRisk, type FarmSatellite, type FarmSummary, type MonitoringPaddy, type RiverCell } from '../../lib/api.ts';
import { haversineKm } from '../../lib/farmmap/farmMapRandom.ts';
import { AWD_SAFE_DEPTH_CM, PAW_SAN_T_HA, advisoryLitres, farmCentroid, pawSanHarvest, readAgroguardLocal, type OwnStatus } from '../../lib/farmmap/ownFarms.ts';
import { browserStorage } from '../../lib/paddySettingsBoot.ts';
import { PROVENANCE_CLASS, PROVENANCE_LABEL, type ProvenanceLevel } from '../../lib/provenance.ts';
import { AqSectionLabel } from '../aq/aqLayout.tsx';
import { AqBadge, AqButton } from '../aq/aqPrimitives.tsx';
import { OpsForecastChart } from '../ops/OpsForecastChart.tsx';
import { DetailSection, KV, UpdatedLine } from './detailParts.tsx';
import type { OwnFarmLive } from './useOwnFarms.ts';

const MIN_TRUST_CHECKS = 10;
const EXPERIMENTAL = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('experimental');
const STATUS: Record<OwnStatus, { tone: 'accent' | 'warning' | 'alert' | 'neutral'; word: string; Icon: typeof CircleCheck }> = {
  ok: { tone: 'accent', word: 'Healthy', Icon: CircleCheck },
  watch: { tone: 'warning', word: 'Watch', Icon: TriangleAlert },
  risk: { tone: 'alert', word: 'At risk', Icon: OctagonAlert },
  unknown: { tone: 'neutral', word: 'Unknown', Icon: CircleHelp },
};

const Prov: React.FC<{ level: ProvenanceLevel }> = ({ level }) => <span className={PROVENANCE_CLASS[level]}>{PROVENANCE_LABEL[level]}</span>;

const cm = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 });

function ago(iso: string | null | undefined): string {
  const minutes = iso ? Math.round((Date.now() - Date.parse(iso)) / 60000) : Number.NaN;
  if (Number.isNaN(minutes)) return 'time unknown';
  if (minutes < 60) return `${Math.max(0, minutes)} min ago`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / 1440)} days ago`;
}

const km = (a: { lat: number; lon: number } | null, lat: number | null | undefined, lon: number | null | undefined) =>
  a && typeof lat === 'number' && typeof lon === 'number' ? `${haversineKm(a, { lat, lon }).toFixed(1)} km away` : 'location not given';

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

const More: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <AqButton variant="ghost" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <ChevronDown size={14} aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : undefined }} />
        {label}
      </AqButton>
      {open ? <div>{children}</div> : null}
    </div>
  );
};

const FLOOD_WORD = { low: 'Low', watch: 'Watch', high: 'High', unknown: 'Unknown' } as const;

const pct = (v: number | null | undefined) => (v == null ? '?' : `${Math.round(v * 100)} %`);

const RiverLine: React.FC<{ label: string; cell: RiverCell }> = ({ label, cell }) => (
  <KV
    k={label}
    v={cell.levels ? `2-yr ${fmt(cell.levels.q2)} · 5-yr ${fmt(cell.levels.q5)} m³/s` : 'No flood levels'}
    sub={
      cell.levels
        ? `${cell.km} km · ${cell.years} years · chance of 5-yr flow ${pct(cell.forecast?.q5.chance)} · past high years ${cell.high_years.join(', ') || 'none'}`
        : cell.reason
    }
  />
);

function chartSummary(p: MonitoringPaddy): string {
  const band = p.model?.band;
  if (!band || band.p50.length === 0) return '';
  const last = band.p50.length - 1;
  return `${p.id} water depth forecast: ${cm(band.p50[0])} cm tomorrow to ${cm(band.p50[last])} cm in ${last + 1} days, 80 % band ${cm(band.p10[last])} to ${cm(band.p90[last])} cm, floor ${AWD_SAFE_DEPTH_CM} cm.`;
}

export const OwnFarmDetail: React.FC<{ farm: OwnFarmLive; onLink: (fieldId: number | null) => void; onFocus: () => void }> = ({ farm, onLink, onFocus }) => {
  const [summary, setSummary] = useState<FarmSummary | null>(null);
  const [health, setHealth] = useState<HealthUpdateSummary | null | 'error'>(null);
  const [sat, setSat] = useState<FarmSatellite | 'loading' | 'error'>('loading');
  const [agField, setAgField] = useState<AgroguardField | null>(null);
  const [fieldDraft, setFieldDraft] = useState('1');
  const [radar, setRadar] = useState<FarmRadar | 'error' | null>(null);
  const [risk, setRisk] = useState<FarmRisk | 'error' | null>(null);
  const centre = useMemo(() => farmCentroid(farm.spec), [farm.spec]);
  const local = useMemo(() => {
    const storage = browserStorage();
    return storage ? readAgroguardLocal(storage) : { crop: null, advisory: null };
  }, [farm.checkedAt]);

  useEffect(() => {
    let alive = true;
    getSummary(farm.id).then((s) => alive && setSummary(s), () => alive && setSummary(null));
    latestHealthUpdate().then((h) => alive && setHealth(h), () => alive && setHealth('error'));
    setSat('loading');
    getSatellite(farm.id).then((s) => alive && setSat(s), () => alive && setSat('error'));
    setRadar(null);
    setRisk(null);
    getRisk(farm.id).then((r) => alive && setRisk(r), () => alive && setRisk('error'));
    if (EXPERIMENTAL) getRadar(farm.id).then((r) => alive && setRadar(r), () => alive && setRadar('error'));
    return () => {
      alive = false;
    };
  }, [farm.id]);

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
  const flood = risk && risk !== 'error' ? risk : null;
  const elev = flood?.elevation?.mean_m ?? null;
  const actions = (flood?.parcels ?? []).filter((p) => p.advice.action !== 'none');

  return (
    <>
      <DetailSection className="is-head">
        <h2 className="aq-title">{farm.spec.farm.name ?? farm.id}</h2>
        <p className="aq-meta">
          {farm.seed ? 'Demo farm' : 'Your farm'} · {farm.spec.parcels.length} parcels · {area.toFixed(2)} ha
          {elev !== null ? ` · ${flood?.elevation?.within_dem_error ? `about ${elev} m, near sea level` : `${elev} m above sea level`}` : ''}
        </p>
        <div className="aq-fm-badges">
          <AqBadge tone={status.tone}><status.Icon size={12} aria-hidden="true" />{status.word}</AqBadge>
          {farm.seed ? <AqBadge>Demo contract</AqBadge> : null}
        </div>
        <More label="Why this status">
          {farm.reasons.map((r) => <p key={r} className="aq-fm-note">{r}</p>)}
          <UpdatedLine>Checked {ago(farm.checkedAt)}</UpdatedLine>
        </More>
      </DetailSection>

      <DetailSection>
        <div className="aq-fm-tiles">
          {measured?.model ? (
            <Tile
              label={`Water ${measured.id}`}
              value={`${cm(measured.model.depth_cm)} ± ${cm(measured.model.sigma_cm)}`}
              unit="cm"
              level={measured.model.source === 'MEASURED' ? 'measured' : 'modelled'}
              tone={measured.model.depth_cm < AWD_SAFE_DEPTH_CM ? 'alert' : undefined}
            />
          ) : <Tile label="Water depth" value="—" level="unavailable" />}
          {assessment ? (
            <Tile label="Field health" value={String(Math.round(assessment.healthScore))} unit="/ 100" level="modelled" tone={assessment.status === 'critical' ? 'alert' : assessment.status === 'warning' ? 'warning' : undefined} />
          ) : <Tile label="Field health" value="—" level="unavailable" />}
          {local.advisory ? (
            <Tile label="Water advice" value={local.advisory.status.replace(/_/g, ' ')} level="modelled" />
          ) : <Tile label="Water advice" value="—" level="unavailable" />}
          {local.crop?.crop ? (
            <Tile label="Suggested crop" value={local.crop.crop} level="modelled" />
          ) : <Tile label="Suggested crop" value="—" level="unavailable" />}
        </div>
      </DetailSection>

      {water.litres !== null || harvest || risk ? (
        <DetailSection>
          <div className="aq-fm-tiles">
            {risk ? (
              <Tile
                label="Flood risk, 30 days"
                value={flood ? FLOOD_WORD[flood.level] : 'Unknown'}
                level={flood && flood.level !== 'unknown' ? 'modelled' : 'unavailable'}
                tone={flood?.level === 'high' ? 'alert' : flood?.level === 'watch' ? 'warning' : undefined}
              />
            ) : null}
            {water.litres !== null ? <Tile label="Water to add" value={fmt(water.litres / 1000)} unit="m³" level="inferred" /> : null}
            {harvest ? <Tile label="Expected harvest" value={`${fmt(harvest.lowT)}–${fmt(harvest.highT)}`} unit="t" level="inferred" /> : null}
          </div>
          {water.litres !== null ? <p className="aq-fm-note">Water: {fmt(water.litres)} L net, before field losses · {local.advisory?.netDepthMm} mm over {area.toFixed(2)} ha</p> : null}
          {harvest ? <p className="aq-fm-note">Harvest: Paw San {harvest.areaHa} ha × {PAW_SAN_T_HA[0]}–{PAW_SAN_T_HA[1]} t/ha · TO VERIFY</p> : null}
          {actions.map((p) => (
            <div key={`flood-${p.id}`} className={`aq-alert ${p.advice.action === 'harvest_early' ? 'is-warning' : 'is-error'}`} role="status">
              <span><b>{p.id}:</b> {p.advice.text}</span>
            </div>
          ))}
        </DetailSection>
      ) : null}

      {charted.length > 0 ? (
        <DetailSection>
          <AqSectionLabel aside="P10–P90">Water forecast</AqSectionLabel>
          {charted.map((p) => p.model?.band ? (
            <figure key={p.id} aria-label={chartSummary(p)} style={{ margin: 0 }}>
              <OpsForecastChart historyDates={p.model.series_dates} observed={p.model.series} forecastDates={p.model.band_dates} band={p.model.band} floorCm={AWD_SAFE_DEPTH_CM} dayOffset={-1} />
            </figure>
          ) : null)}
          <p className="aq-fm-note">
            {decisions && decisions.scored >= MIN_TRUST_CHECKS ? `Right in ${decisions.inside_band} of ${decisions.scored} checks on this farm` : `Trust score after ${MIN_TRUST_CHECKS} checked readings · ${decisions?.scored ?? 0} so far`}
          </p>
        </DetailSection>
      ) : (
        <DetailSection>
          <p className="aq-fm-note">Add a tube reading to start the water forecast.</p>
        </DetailSection>
      )}

      <DetailSection>
        <AqSectionLabel aside="Sentinel-2">Satellite</AqSectionLabel>
        {sat === 'loading' ? <p className="aq-fm-note">Reading Sentinel-2 scenes for your boundary…</p> : sat === 'error' ? (
          <p className="aq-fm-note">Satellite data is unavailable right now. The rest of this panel is unaffected.</p>
        ) : sat.parcels.length === 0 ? <p className="aq-fm-note">Add a closed boundary to read satellite data.</p> : sat.parcels.map((p) => {
          const latest = [...p.series].reverse().find((s) => s.status === 'clear');
          return (
            <div key={p.id}>
              {latest ? (
                <KV k={`${p.id} NDVI · NDWI`} v={<>{latest.ndvi?.toFixed(2)} · {latest.ndwi?.toFixed(2)} <Prov level="measured" /></>} sub={latest.datetime.slice(0, 10)} />
              ) : <KV k={p.id} v="No clear scene" sub={p.missing[0]?.reason} />}
              <div className="aq-fm-badges" aria-label={`${p.id} scenes: ${p.series.map((s) => `${s.datetime.slice(5, 10)} ${s.status}`).join(', ')}`}>
                {p.series.slice(-6).map((s) => (
                  <AqBadge key={s.scene_id} tone={s.status === 'clear' ? 'accent' : 'neutral'}>{s.datetime.slice(5, 10)} {s.status === 'clear' ? s.ndvi?.toFixed(2) : 'cloud'}</AqBadge>
                ))}
              </div>
            </div>
          );
        })}
      </DetailSection>

      {farm.fieldId === null ? (
        <DetailSection>
          <AqSectionLabel>AgroGuard field</AqSectionLabel>
          <div className="aq-fm-kv">
            <span className="aq-input-wrap" style={{ width: 96 }}>
              <input className="aq-input" inputMode="numeric" value={fieldDraft} onChange={(e) => setFieldDraft(e.target.value)} aria-label="AgroGuard field id" />
            </span>
            <AqButton variant="primary" onClick={() => { const id = Number(fieldDraft); if (Number.isInteger(id) && id > 0) onLink(id); }}>Link field</AqButton>
          </div>
        </DetailSection>
      ) : null}

      <DetailSection>
        <More label="Details and sources">
          {paddies.map((p) => (
            <div key={p.id}>
              <KV k={p.id} v={p.model ? `${cm(p.model.depth_cm)} ± ${cm(p.model.sigma_cm)} cm` : 'Unknown'} sub={p.model ? 'Kalman filter · noise TO VERIFY' : p.missing[0]?.reason} />
              {p.model?.flags.map((f) => <p key={f.observed_at} className="aq-fm-note">{f.kind.replace(/_/g, ' ')}{f.status ? ` (${f.status})` : ''} · read {cm(f.reading_cm)} cm · expected {cm(f.predicted_cm)} cm · {f.meaning}</p>)}
            </div>
          ))}
          {farm.monitoringError ? <p className="aq-fm-note">Water data unavailable: {farm.monitoringError}</p> : null}
          {farm.fieldId !== null ? (
            <>
              <KV k="AgroGuard field" v={agField ? `#${agField.id} ${agField.name}` : `#${farm.fieldId}`} sub={agField ? km(centre, agField.latitude, agField.longitude) : undefined} />
              {farm.fieldError ? <p className="aq-fm-note">Field data unavailable: {farm.fieldError}</p> : null}
              {assessment ? <KV k="Health basis" v={assessment.status} sub={`rule-based vs crop profile #${assessment.cropProfileId ?? '?'} · ${ago(assessment.createdAt)} · simulated device`} /> : null}
              {(assessment?.evidence?.factors ?? []).map((f) => (
                <KV key={f.factor} k={f.factor.replace(/_/g, ' ')} v={`${f.value ?? '—'} ${f.unit ?? ''}`} sub={`${f.status} · ${f.range_min ?? '?'}–${f.range_max ?? '?'}`} />
              ))}
              <AqButton variant="ghost" onClick={() => onLink(null)}>Unlink field</AqButton>
            </>
          ) : null}
          {local.advisory ? <KV k="Water advice" v={local.advisory.netDepthMm !== null ? `${local.advisory.netDepthMm} mm deficit` : 'no deficit computed'} sub={`advisory only · this browser · ${ago(local.advisory.capturedAt)}`} /> : null}
          {water.reason ? <KV k="Water to add" v="Not computed" sub={water.reason} /> : null}
          {!harvest ? <KV k="Expected harvest" v="Not available" sub={`a range is given only for Paw San (${PAW_SAN_T_HA[0]}–${PAW_SAN_T_HA[1]} t/ha, TO VERIFY)`} /> : null}
          {local.crop ? <KV k="Crop conditions" v={`pH ${local.crop.soilPh} · ${local.crop.rainfallMm} mm · ${local.crop.temperatureC} °C`} sub={`${local.crop.validatedOnFieldData ? 'field-validated' : 'not field-validated'} · ${km(centre, local.crop.lat, local.crop.lon)}`} /> : null}
          {health === 'error' ? <KV k="Health update" v="Unavailable" sub="service not reachable" /> : health ? (
            <KV k="Health update" v={`Looks like ${health.diseaseName ?? health.healthStatus}`} sub={`${health.detection?.confidence != null ? `${Math.round(health.detection.confidence)} % · ` : ''}${health.township ?? km(centre, health.latitude, health.longitude)} · ${ago(health.reportedAt)}`} />
          ) : null}
          {sat !== 'loading' && sat !== 'error' ? sat.parcels.flatMap((p) => p.series.map((s) => (
            <KV key={`${p.id}-${s.scene_id}`} k={s.datetime.slice(0, 10)} v={s.status === 'clear' ? `NDVI ${s.ndvi?.toFixed(2)} · NDWI ${s.ndwi?.toFixed(2)}` : s.status} sub={s.reason ?? s.scene_id} />
          ))) : null}
          {risk === 'error' ? <KV k="Flood risk" v="Unavailable" sub="farm map API not reachable" /> : null}
          {flood ? (
            <>
              {flood.elevation?.mean_m != null ? <KV k="Height" v={`${flood.elevation.min_m}–${flood.elevation.max_m} m`} sub={`Copernicus DEM, ${flood.elevation.accuracy ?? ''}`} /> : null}
              {flood.main ? <RiverLine label="Main river cell" cell={flood.main} /> : null}
              {flood.nearest && flood.nearest !== flood.main && (flood.nearest.lat !== flood.main?.lat || flood.nearest.lon !== flood.main?.lon) ? <RiverLine label="Nearest river cell" cell={flood.nearest} /> : null}
              {flood.parcels?.[0]?.planting ? <p className="aq-fm-note">{flood.parcels[0].planting.text}</p> : null}
              {flood.missing.map((m) => <p key={m.reason} className="aq-fm-note">{m.reason}</p>)}
              {flood.assumptions?.limit ? <p className="aq-fm-note">{flood.assumptions.limit}. {flood.assumptions.levels}.</p> : null}
            </>
          ) : null}
          {radar === 'error' ? <KV k="Radar (shadow)" v="Unavailable" sub="Planetary Computer not reachable" /> : radar ? radar.parcels.map((p) => {
            const last = [...p.series].reverse().find((s) => s.vv_db !== null);
            return (
              <div key={`radar-${p.id}`}>
                <KV k={`${p.id} radar (shadow)`} v={last ? `VV ${last.vv_db} dB · ${last.call}` : 'No reading'} sub={last ? `Sentinel-1 ${last.datetime.slice(0, 10)} · open-water threshold TO VERIFY` : p.missing[0]?.reason} />
                {p.revisit?.same_orbit_days ? <p className="aq-fm-note">Same-orbit revisit {p.revisit.same_orbit_days} days, so wet-dry cycles under {p.revisit.shortest_resolvable_cycle_days} days are not detectable.</p> : null}
                <p className="aq-fm-note">{p.agreement?.agree != null ? `Agrees with the water-depth estimate on ${p.agreement.agree} of ${p.agreement.pairs} dates (chance ${Math.round((p.agreement.chance ?? 0) * p.agreement.pairs)})` : p.agreement?.reason}</p>
              </div>
            );
          }) : null}
          <UpdatedLine>Contract {farm.sha256.slice(0, 12)}</UpdatedLine>
          <AqButton variant="ghost" onClick={onFocus}>Fly to boundary</AqButton>
        </More>
      </DetailSection>
    </>
  );
};
