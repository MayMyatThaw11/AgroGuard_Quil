import React from 'react';
import { CloudRain, Wind } from 'lucide-react';
import type { CrewAgentId, CrewTask, OpsWeatherDay } from '../../data/ops/types.ts';
import { DEFAULT_VALUES } from '../../lib/paddySettings.ts';
import { WIND_CEILING_MS } from '../../lib/safety.ts';
import { CREW_MAX_HEIGHT, CREW_MIN_HEIGHT, useOpsStore } from '../../store/opsStore.ts';
import { CREW_META, formatDay } from './crewMeta.ts';

const DEFAULT_SPRAY_ADVISORY_MS = DEFAULT_VALUES.spray_wind_advisory_ms;
const CREW_ORDER: CrewAgentId[] = ['water_steward', 'crop_scout', 'pest_watcher', 'harvest_planner', 'drone_pilot'];

interface OpsCrewTimelineProps {
  forecastDates: string[];
  forecastWeather: OpsWeatherDay[];
}

export const OpsCrewTimeline: React.FC<OpsCrewTimelineProps> = ({ forecastDates, forecastWeather }) => {
  const plan = useOpsStore((s) => s.plan);
  const status = useOpsStore((s) => s.planStatus);
  const dayOffset = useOpsStore((s) => s.dayOffset);
  const setDayOffset = useOpsStore((s) => s.setDayOffset);
  const select = useOpsStore((s) => s.select);
  const focusTask = useOpsStore((s) => s.focusTask);
  const crewHeight = useOpsStore((s) => s.crewHeight);
  const setCrewHeight = useOpsStore((s) => s.setCrewHeight);

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = crewHeight;
    const onMove = (move: PointerEvent) => setCrewHeight(startHeight + (startY - move.clientY));
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const resizeByKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowUp') setCrewHeight(crewHeight + 16);
    else if (event.key === 'ArrowDown') setCrewHeight(crewHeight - 16);
    else return;
    event.preventDefault();
  };

  const counts = new Map<CrewAgentId, number>(plan?.crew.map((m) => [m.id, m.task_count]) ?? []);
  const advisoryRaw = plan?.thresholds.spray_wind_advisory_ms;
  const sprayAdvisory = typeof advisoryRaw === 'number' ? advisoryRaw : DEFAULT_SPRAY_ADVISORY_MS;

  const openTask = (task: CrewTask) => {
    setDayOffset(task.day_offset);
    focusTask(task.id);
    if (task.paddy_id) select({ kind: 'paddy', id: task.paddy_id });
    else if (task.asset_id) select({ kind: 'asset', id: task.asset_id });
    else select(null);
  };

  return (
    <section className="ops-crew ops-panel" aria-label="Farmer crew schedule">
      <div
        className="ops-crew-resize"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize crew schedule"
        aria-valuemin={CREW_MIN_HEIGHT}
        aria-valuemax={CREW_MAX_HEIGHT}
        aria-valuenow={crewHeight}
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={resizeByKey}
      />
      <div className="ops-crew-members">
        <p className="ops-eyebrow mb-1">Farmer crew</p>
        {CREW_ORDER.map((id) => {
          const meta = CREW_META[id];
          const Icon = meta.icon;
          return (
            <div key={id} className="ops-member">
              <span className="ops-avatar" style={{ background: meta.color }}>
                <Icon className="w-3.5 h-3.5" />
              </span>
              <span className="flex-1 font-semibold">{meta.short}</span>
              <span className="tabular-nums text-(--ops-ink-3)">
                {status === 'ready' ? counts.get(id) ?? 0 : '·'}
              </span>
            </div>
          );
        })}
      </div>

      <ol className="ops-days" aria-label="Forecast days">
        <li className={`ops-day ${dayOffset < 0 ? 'is-active' : ''}`}>
          <button
            type="button"
            className="ops-day-select"
            aria-pressed={dayOffset < 0}
            onClick={() => {
              setDayOffset(-1);
              select(null);
            }}
          >
            <span className="ops-day-head">
              <span>Now</span>
              <span className="text-[11px] font-semibold text-(--ops-ink-3)">observed</span>
            </span>
            <span className="text-[11px] leading-snug text-(--ops-ink-3)">
              {status === 'offline'
                ? 'Planner offline. Start it with npm run dev:full.'
                : status === 'ready'
                  ? `${plan?.tasks.length ?? 0} proposals over ${forecastDates.length} days`
                  : 'Planning the next days'}
            </span>
          </button>
        </li>
        {forecastDates.map((date, i) => {
          const weather = forecastWeather[i];
          const tasks = plan?.tasks.filter((t) => t.day_offset === i) ?? [];
          const active = dayOffset === i;
          const windy = weather.windMs > WIND_CEILING_MS;
          const breezy = !windy && weather.windMs > sprayAdvisory;
          return (
            <li key={date} className={`ops-day ${active ? 'is-active' : ''}`}>
              <button
                type="button"
                className="ops-day-select"
                aria-pressed={active}
                aria-label={`${formatDay(date)}, day ${i + 1}: rain ${weather.rainMm.toFixed(0)} mm, wind ${weather.windMs.toFixed(1)} m/s${windy ? ' above drone ceiling' : breezy ? ' above spray advisory' : ''}, humidity ${weather.rhPct.toFixed(0)}%, ${tasks.length} proposals`}
                onClick={() => setDayOffset(i)}
              >
                <span className="ops-day-head">
                  <span>{formatDay(date)}</span>
                  <span className="text-[11px] font-semibold text-(--ops-ink-3)">+{i + 1}</span>
                </span>
                <span className="ops-day-weather" aria-hidden>
                  <span className="inline-flex items-center gap-0.5">
                    <CloudRain className="w-3 h-3" />
                    {weather.rainMm.toFixed(0)} mm
                  </span>
                  <span className={`inline-flex items-center gap-0.5 ${windy ? 'is-alert' : breezy ? 'is-caution' : ''}`}>
                    <Wind className="w-3 h-3" />
                    {weather.windMs.toFixed(1)}
                    {windy ? ' halt' : breezy ? ' no spray' : ''}
                  </span>
                </span>
              </button>
              {tasks.length > 0 && (
                <ul className="ops-day-tasks">
                  {tasks.slice(0, 2).map((task) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        className="ops-task-chip"
                        style={{
                          background: task.blocked_reason ? 'var(--ops-blocked)' : CREW_META[task.agent].color,
                        }}
                        title={task.title}
                        onClick={() => openTask(task)}
                      >
                        {task.blocked_reason ? `Blocked: ${task.title}` : task.title}
                      </button>
                    </li>
                  ))}
                  {tasks.length > 2 && (
                    <li>
                      <button
                        type="button"
                        className="ops-day-more"
                        onClick={() => {
                          setDayOffset(i);
                          select(null);
                        }}
                      >
                        +{tasks.length - 2} more
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
};
