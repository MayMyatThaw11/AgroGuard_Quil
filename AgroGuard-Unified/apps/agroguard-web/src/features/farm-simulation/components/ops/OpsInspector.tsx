import React from 'react';
import { Cpu, PanelRightClose, X } from 'lucide-react';
import type { CrewTask, OpsAsset, OpsFarm, OpsHistory, OpsPaddy, OpsWeatherDay } from '../../data/ops/types.ts';
import { effectiveFromPlan } from '../../lib/paddySettings.ts';
import { fieldOptions, type OptionStatus } from '../../lib/fieldOptions.ts';
import { useOpsStore } from '../../store/opsStore.ts';
import { OpsForecastChart } from './OpsForecastChart.tsx';
import { OpsTaskCard } from './OpsTaskCard.tsx';
import { FarmCheckCard } from './FarmCheckCard.tsx';
import { assetCaption } from './OpsMarkers.tsx';
import { CREW_META, formatDay, methodLabel, observedDates } from './crewMeta.ts';
import { HerdPanel } from '../field/HerdPanel.tsx';
import { AccessCodeField } from '../field/AccessCodeField.tsx';
import { ProposalList } from '../field/ProposalList.tsx';
import { TubeReadingForm } from '../field/TubeReadingForm.tsx';
import type { FarmField } from '../field/useFarmField.ts';
import { SIGN_IN_TO_APPROVE } from '../../lib/apiError.ts';
import { checkWindCeiling, WIND_CEILING_MS } from '../../lib/safety.ts';

interface OpsInspectorProps {
  farm: OpsFarm;
  history: OpsHistory;
  forecastDates: string[];
  forecastWeather: OpsWeatherDay[];
  field?: FarmField;
  onReplan?: () => void;
  onHide?: () => void;
}

function ReporterField({ field }: { field: FarmField }) {
  return (
    <label className="block text-[11px] text-(--ops-ink-2)">
      Your name (recorded with readings and decisions)
      <input
        className="ops-input mt-1"
        type="text"
        autoComplete="name"
        maxLength={80}
        value={field.reporter}
        onChange={(e) => field.setReporter(e.target.value)}
      />
      <AccessCodeField className="block mt-2" />
    </label>
  );
}

function QueueStatus({ field }: { field: FarmField }) {
  if (field.queued === 0 && field.conflicts.length === 0) return null;
  return (
    <div className="mt-2 text-[11px]" role="status">
      {field.queued > 0 && (
        <p className="text-(--ops-amber)">
          {field.queued} waiting to send{field.online ? '' : ' (offline)'}
          {field.lastError ? `: ${field.lastError}` : ''}.{' '}
          <button type="button" className="underline" onClick={() => void field.flush()}>
            Retry now
          </button>
        </p>
      )}
      {field.conflicts.map((message) => (
        <p key={message} className="text-(--ops-red)">
          Not accepted: {message}
        </p>
      ))}
    </div>
  );
}

const OPTION_LABEL: Record<OptionStatus, string> = { running: 'Running', option: 'Option', watch: 'Watch' };

const ASSET_ROLE: Record<OpsAsset['kind'], string> = {
  pump: 'Lifts canal water into the main channel. Runs only after an approved irrigation proposal.',
  gate: 'Paddy inlet gate. The reading is the current opening above the sill.',
  sluice: 'Concrete sluice controlling canal exchange. The reading is the gate opening.',
  drone: 'Multispectral scouting and spraying drone. Hard halt above 5.5 m/s wind.',
  tractor: 'Harvest haulage with trailer. Booked by the Harvest Planner on dry-day windows.',
  robot: 'Ground robot for close-up leaf imaging along the bunds.',
};

function TaskList({
  tasks,
  farm,
  weather,
  focusId,
  empty,
  readOnly,
}: {
  tasks: CrewTask[];
  farm: OpsFarm;
  weather: OpsWeatherDay[];
  focusId: string | null;
  empty: string;
  readOnly: boolean;
}) {
  if (tasks.length === 0) return <p className="text-[12px] text-(--ops-ink-3)">{empty}</p>;
  return (
    <div>
      {tasks.map((task) => (
        <OpsTaskCard
          key={task.id}
          task={task}
          standard={farm.standard}
          weather={weather[task.day_offset]}
          focused={focusId === task.id}
          farmId={farm.id}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}

function PlanState() {
  const status = useOpsStore((s) => s.planStatus);
  const error = useOpsStore((s) => s.planError);
  if (status === 'loading' || status === 'idle') {
    return (
      <div className="space-y-2" aria-busy>
        <div className="ops-skeleton h-16" />
        <div className="ops-skeleton h-16" />
      </div>
    );
  }
  if (status === 'offline') {
    return (
      <p className="text-[12px] leading-relaxed text-(--ops-ink-2)" role="alert">
        No crew plan: {error}. If the API is not running, start the whole workspace with{' '}
        <code className="font-mono text-[11px]">npm run start</code>; the Farm Simulation API is backend/agriquill on port 8010.
      </p>
    );
  }
  return null;
}

function DronesToday({ windMs, sprayMs }: { windMs: number | undefined; sprayMs: number }) {
  const verdict = checkWindCeiling(windMs);
  if (verdict.permitted) {
    return (
      <p className="mt-2 text-[12px] font-semibold text-(--ops-ink-2)" role="status">
        Drones may fly today. Spraying is scheduled only below {sprayMs} m/s (design setting).
      </p>
    );
  }
  return (
    <p className="mt-2 text-[12px] font-semibold text-(--ops-red)" role="status">
      {verdict.rejection.code === 'REJECTED_WIND_EXCEEDED'
        ? `Drones held today: wind ${windMs?.toFixed(1)} m/s is above the ${WIND_CEILING_MS} m/s hard ceiling. No override.`
        : 'Drones held today: no valid wind reading.'}
    </p>
  );
}

function PaddyDetail({ paddy, farm, history, forecastDates, forecastWeather, field }: OpsInspectorProps & { paddy: OpsPaddy }) {
  const plan = useOpsStore((s) => s.plan);
  const catalog = useOpsStore((s) => s.catalog);
  const dayOffset = useOpsStore((s) => s.dayOffset);
  const focusId = useOpsStore((s) => s.focusTaskId);
  const source = useOpsStore((s) => s.source);
  const reading = useOpsStore((s) => s.water[paddy.id]);
  const observed = history.depthCm[paddy.id] ?? [];
  const ndvi = history.ndvi[paddy.id] ?? [];
  const now = source === 'live' ? (reading?.value ?? null) : observed.length ? observed[observed.length - 1] : null;
  const band = plan?.forecast.series[paddy.id] ?? null;
  const crop = catalog?.crops.find((c) => c.id === paddy.cropId);
  const thresholds = effectiveFromPlan(plan?.thresholds);
  const floor = paddy.stage === 'Flowering' ? thresholds.flowering_min_depth_cm : thresholds.awd_safe_depth_cm;
  const minAhead = band ? Math.min(...band.p50) : null;
  const tasks = plan?.tasks.filter((t) => t.paddy_id === paddy.id) ?? [];
  const seasonDays = crop?.season_days ?? 120;
  const herds = useOpsStore((s) => s.herds);
  const options = fieldOptions({
    cropId: paddy.cropId,
    stage: paddy.stage,
    waterCm: now,
    herdKinds: herds.filter((h) => h.paddy === paddy.id).map((h) => h.kind),
    organic: /ORGANIC/i.test(farm.standard),
    sprayTasks: tasks.filter((t) => /spray/i.test(t.title)).length,
  });

  return (
    <>
      <section className="ops-section">
        <p className="ops-eyebrow">Paddy</p>
        <h2 className="text-[17px] font-bold tracking-tight">{paddy.id}</h2>
        <p className="text-[12px] text-(--ops-ink-2)">
          {paddy.cropName} · {paddy.stage} · day {paddy.daysSincePlanting} of ~{seasonDays}
        </p>
        <dl className="ops-stat-grid mt-3">
          <div className="ops-stat">
            <dt>Water now{reading?.source ? ` · ${reading.source.toLowerCase()}` : ''}</dt>
            <dd>
              {now === null ? '—' : now.toFixed(1)} <small>cm{reading?.sigma ? ` ± ${reading.sigma.toFixed(1)}` : ''}</small>
            </dd>
          </div>
          <div className="ops-stat">
            <dt>Lowest ahead (p50)</dt>
            <dd>
              {minAhead === null ? '—' : minAhead.toFixed(1)} <small>cm</small>
            </dd>
          </div>
          <div className="ops-stat">
            <dt>NDVI</dt>
            <dd title={ndvi.length ? undefined : 'No imagery source is connected for this paddy'}>
              {ndvi.length ? ndvi[ndvi.length - 1].toFixed(2) : '—'}
            </dd>
          </div>
          <div className="ops-stat">
            <dt>Area</dt>
            <dd>
              {paddy.areaHa.toFixed(2)} <small>ha</small>
            </dd>
          </div>
        </dl>
      </section>

      <section className="ops-section">
        <div className="flex items-baseline justify-between mb-1">
          <h3 className="ops-eyebrow">Water depth · observed + forecast</h3>
        </div>
        {observed.length > 0 ? (
          <OpsForecastChart
            historyDates={observedDates(history, observed)}
            observed={observed}
            forecastDates={forecastDates}
            band={band}
            floorCm={floor}
            dayOffset={dayOffset}
          />
        ) : (
          <p className="text-[12px] text-(--ops-ink-2)" role="status">
            {reading?.reason ?? 'No water reading for this paddy yet.'}
          </p>
        )}
        <p className="mt-1 text-[11px] text-(--ops-ink-3)">
          {source === 'live'
            ? reading?.source === 'DERIVED'
              ? 'Estimated: tube readings fused with live Open-Meteo rain and ET0, FAO-56 rice Kc and the contract percolation (Kalman filter). The band widens the longer it goes without a reading.'
              : 'Measured in the last 3 hours and fused with the water balance. Band is the 80% range if no one irrigates.'
            : 'Demo fixture: synthetic history, not field telemetry.'}
        </p>
        {source !== 'live' && plan?.forecast.backtest?.coverage_shown && plan.forecast.backtest.coverage ? (
          <p className="mt-1 text-[11px] font-semibold text-(--ops-ink-2)">
            Right in {plan.forecast.backtest.coverage.inside} of {plan.forecast.backtest.coverage.n} checks on this farm (held-out readings inside the band)
          </p>
        ) : null}
      </section>

      <section className="ops-section">
        <h3 className="ops-eyebrow mb-2">Farming options for this field</h3>
        <ul className="ops-options">
          {options.map((o) => (
            <li key={`${o.family}-${o.status}`}>
              <span className={`ops-chip${o.status === 'running' ? ' is-blue' : o.status === 'watch' ? ' is-amber' : ''}`}>{OPTION_LABEL[o.status]}</span>
              <span>
                <strong>{o.name}</strong> {o.text}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[11px] text-(--ops-ink-3)">From this field's monitoring · screening rules, TO VERIFY</p>
      </section>

      {source === 'live' && field && reading?.deviceId && (
        <section className="ops-section">
          <h3 className="ops-eyebrow mb-2">Log a field reading</h3>
          <ReporterField field={field} />
          <div className="mt-2">
            <TubeReadingForm
              deviceId={reading.deviceId}
              label={paddy.id}
              reporter={field.reporter}
              onQueue={field.add}
              readOnly={field.readOnly}
            />
          </div>
          <QueueStatus field={field} />
        </section>
      )}

      <section className="ops-section">
        <h3 className="ops-eyebrow mb-2">Crew tasks</h3>
        {plan ? (
          <TaskList
            tasks={tasks}
            farm={farm}
            weather={forecastWeather}
            focusId={focusId}
            empty="No action needed in this horizon. The crew keeps watching."
            readOnly={field?.readOnly ?? false}
          />
        ) : (
          <PlanState />
        )}
      </section>

      {crop && (
        <section className="ops-section">
          <h3 className="ops-eyebrow mb-2">{crop.name}</h3>
          <p className="text-[11px] font-semibold mb-1">Common problems</p>
          <ul className="list-disc pl-4 text-[12px] text-(--ops-ink-2) space-y-0.5">
            {crop.key_problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p className="text-[11px] font-semibold mt-2 mb-1">Traditional practice</p>
          <ul className="list-disc pl-4 text-[12px] text-(--ops-ink-2) space-y-0.5">
            {crop.traditional_practices.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-(--ops-ink-3)">
            Kc: {crop.kc ? crop.kc.join(' / ') : 'n/a'} ({crop.kc_source}). {crop.verification}
          </p>
        </section>
      )}
    </>
  );
}

function AssetDetail({ asset, farm, forecastWeather, field }: OpsInspectorProps & { asset: OpsAsset }) {
  const plan = useOpsStore((s) => s.plan);
  const focusId = useOpsStore((s) => s.focusTaskId);
  const select = useOpsStore((s) => s.select);
  const tasks = plan?.tasks.filter((t) => t.asset_id === asset.id) ?? [];
  return (
    <>
      <section className="ops-section">
        <div className="flex items-center gap-2">
          <span className="ops-pin">
            <span>{asset.number}</span>
          </span>
          <div>
            <p className="ops-eyebrow">{asset.kind}</p>
            <h2 className="text-[17px] font-bold tracking-tight leading-tight">{asset.id}</h2>
          </div>
        </div>
        <p className="mt-2 text-[12px] font-semibold">{assetCaption(asset)}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-(--ops-ink-2)">{ASSET_ROLE[asset.kind]}</p>
        {asset.serves.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {asset.serves.map((id) => (
              <button key={id} type="button" className="ops-chip" onClick={() => select({ kind: 'paddy', id })}>
                {id}
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="ops-section">
        <h3 className="ops-eyebrow mb-2">Proposed work</h3>
        {plan ? (
          <TaskList
            tasks={tasks}
            farm={farm}
            weather={forecastWeather}
            focusId={focusId}
            empty="No crew proposals for this asset in the forecast horizon."
            readOnly={field?.readOnly ?? false}
          />
        ) : (
          <PlanState />
        )}
      </section>
    </>
  );
}

function FarmSummary({ farm, forecastDates, forecastWeather, field, onReplan }: OpsInspectorProps) {
  const plan = useOpsStore((s) => s.plan);
  const dayOffset = useOpsStore((s) => s.dayOffset);
  const focusId = useOpsStore((s) => s.focusTaskId);
  const source = useOpsStore((s) => s.source);
  const herds = useOpsStore((s) => s.herds);
  const total = farm.paddies.length;
  const dayTasks = plan ? (dayOffset < 0 ? plan.tasks : plan.tasks.filter((t) => t.day_offset === dayOffset)) : [];
  return (
    <>
      <section className="ops-section">
        <p className="ops-eyebrow">Farm overview</p>
        <h2 className="text-[17px] font-bold tracking-tight">Crew briefing</h2>
        <p className="mt-1 text-[12px] text-(--ops-ink-2)">
          Select a paddy or a numbered asset on the map to see its forecast and proposed work.
        </p>
        {plan?.schedule && (
          <p className="mt-2 text-[11px] text-(--ops-ink-3)">
            Schedule: {plan.schedule.solver ?? 'day order'} · {plan.schedule.status}
            {plan.schedule.scheduled !== undefined ? ` · ${plan.schedule.scheduled} timed, ${plan.schedule.blocked ?? 0} blocked` : ''}
            {plan.schedule.reason ? ` · ${plan.schedule.reason}` : ''}
          </p>
        )}
        {source === 'live' && plan && (
          <DronesToday
            windMs={forecastWeather[0]?.windMs}
            sprayMs={effectiveFromPlan(plan.thresholds).spray_wind_advisory_ms}
          />
        )}
      </section>
      {source === 'live' && field && (
        <section className="ops-section">
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="ops-eyebrow">Proposals to approve</h3>
            <button type="button" className="ops-btn" onClick={() => void field.watch()} disabled={field.readOnly || field.watching}>
              {field.readOnly ? SIGN_IN_TO_APPROVE : field.watching ? 'Checking' : 'Check thresholds'}
            </button>
          </div>
          <ReporterField field={field} />
          <div className="mt-2">
            <ProposalList
              proposals={field.proposals}
              reporter={field.reporter}
              pendingIds={field.pendingIds}
              onQueue={field.add}
              readOnly={field.readOnly}
            />
          </div>
          {field.watchError && (
            <p className="mt-1 text-[11px] text-(--ops-red)" role="alert">
              {field.watchError}
            </p>
          )}
          <QueueStatus field={field} />
        </section>
      )}
      {source === 'live' && field && (
        <section className="ops-section">
          <h3 className="ops-eyebrow mb-2">Mixed farming · animals and fish</h3>
          <HerdPanel
            farmId={farm.id}
            herds={herds}
            paddyIds={farm.paddies.map((p) => p.id)}
            reporter={field.reporter}
            canAdd
            onQueue={field.add}
            onChanged={() => onReplan?.()}
            readOnly={field.readOnly}
          />
        </section>
      )}
      {source === 'live' && <FarmCheckCard farmId={farm.id} />}
      {plan && (
        <section className="ops-section">
          <h3 className="ops-eyebrow mb-2">
            {dayOffset < 0 ? `All proposals, next ${forecastDates.length} days` : `Proposals for ${formatDay(forecastDates[dayOffset])}`}
          </h3>
          <TaskList
            tasks={dayTasks}
            farm={farm}
            weather={forecastWeather}
            focusId={focusId}
            empty="No proposals on this day."
            readOnly={field?.readOnly ?? false}
          />
        </section>
      )}
      <section className="ops-section">
        {plan ? (
          <>
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-4 h-4 text-(--ops-green)" />
              <span className="text-[12px] font-bold">Forecast model</span>
            </div>
            <p className="text-[12px] font-semibold">Selected: {methodLabel(plan.forecast.method)}</p>
            {plan.forecast.backtest && (
              <table className="mt-2 w-full text-[11px]">
                <caption className="sr-only">Hold-out mean absolute error by candidate model</caption>
                <thead>
                  <tr className="text-(--ops-ink-3)">
                    <th className="text-left font-semibold pb-1">Candidate</th>
                    <th className="text-right font-semibold pb-1">Hold-out MAE</th>
                    <th className="text-right font-semibold pb-1">In P10–P90 band</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(plan.forecast.backtest.candidates)
                    .sort((a, b) => a[1] - b[1])
                    .map(([name, mae]) => {
                      const cover = plan.forecast.backtest?.band_coverage?.[name];
                      return (
                        <tr key={name} className={name === plan.forecast.method ? 'font-bold' : ''}>
                          <td className="py-0.5">{methodLabel(name)}</td>
                          <td className="py-0.5 text-right tabular-nums">{mae.toFixed(2)} cm</td>
                          <td className="py-0.5 text-right tabular-nums">
                            {cover && plan.forecast.backtest?.coverage_shown ? `${cover.inside} of ${cover.n}` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
            {plan.forecast.backtest && (
              <p className="mt-1 text-[11px] text-(--ops-ink-3)">
                Neural residual: {plan.forecast.backtest.neural_candidate}. Scored on {plan.forecast.backtest.series_scored}{' '}
                paddies.{plan.forecast.backtest.band_method ? ` Band: ${plan.forecast.backtest.band_method}.` : ''}
                {plan.forecast.backtest.coverage_shown === false ? ' Band coverage shows after 10 held-out readings.' : ' An honest 80 % band holds about 8 of every 10.'}
              </p>
            )}
            {plan.forecast.physics && (
              <dl className="ops-stat-grid mt-2">
                <div className="ops-stat">
                  <dt>Learned daily loss</dt>
                  <dd>
                    {plan.forecast.physics.mean_daily_loss_cm.toFixed(2)} <small>cm/d</small>
                  </dd>
                </div>
                <div className="ops-stat">
                  <dt>Rain retained</dt>
                  <dd>
                    {(plan.forecast.physics.rain_gain_cm_per_mm * 10).toFixed(2)} <small>mm/mm</small>
                  </dd>
                </div>
              </dl>
            )}
            <p className="mt-2 text-[11px] text-(--ops-ink-3)">
              {plan.forecast.backtest?.note ?? plan.forecast.fallback_reason} Computed in {plan.forecast.compute_ms} ms.
            </p>
            <p className="mt-3 text-[11px] font-semibold">
              {plan.paddies_without_action.length} of {total} paddies need no water action this horizon.
            </p>
            <p className="mt-2 text-[11px] text-(--ops-ink-3)">{plan.approval_policy}</p>
            <p className="mt-1 text-[11px] font-mono text-(--ops-ink-3) break-all">
              Ledger {plan.ledger_commit_hash}
            </p>
          </>
        ) : (
          <PlanState />
        )}
      </section>
      {plan && (
        <section className="ops-section">
          <h3 className="ops-eyebrow mb-2">The crew</h3>
          <ul className="space-y-2">
            {plan.crew.map((member) => {
              const meta = CREW_META[member.id];
              const Icon = meta.icon;
              return (
                <li key={member.id} className="flex gap-2">
                  <span className="ops-avatar" style={{ background: meta.color }}>
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold">
                      {member.name} <span className="font-medium text-(--ops-ink-3)">· {member.task_count}</span>
                    </p>
                    <p className="text-[11px] italic text-(--ops-ink-2)">&ldquo;{member.voice}&rdquo;</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

export const OpsInspector: React.FC<OpsInspectorProps> = (props) => {
  const selection = useOpsStore((s) => s.selection);
  const select = useOpsStore((s) => s.select);
  const paddy = selection?.kind === 'paddy' ? props.farm.paddies.find((p) => p.id === selection.id) : undefined;
  const asset = selection?.kind === 'asset' ? props.farm.assets.find((a) => a.id === selection.id) : undefined;

  return (
    <aside className="ops-inspector ops-panel" aria-label="Inspector">
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        {props.onHide ? (
          <button
            type="button"
            className="ops-btn is-icon"
            onClick={props.onHide}
            aria-label="Hide inspector (])"
            title="Hide inspector (])"
          >
            <PanelRightClose className="w-4 h-4" />
          </button>
        ) : null}
        {selection ? (
          <button
            type="button"
            className="ops-btn is-icon"
            onClick={() => select(null)}
            aria-label="Clear selection"
            title="Back to farm overview"
          >
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </div>
      <div className="ops-scroll">
        {paddy && <PaddyDetail {...props} paddy={paddy} />}
        {asset && <AssetDetail {...props} asset={asset} />}
        {!paddy && !asset && <FarmSummary {...props} />}
      </div>
    </aside>
  );
};
