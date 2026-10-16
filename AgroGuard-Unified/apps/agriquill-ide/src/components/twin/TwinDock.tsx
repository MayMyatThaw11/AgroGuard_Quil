import React, { useEffect, useState } from 'react';
import { Bot, Clock, Droplets, List, Plane, Tractor, Trash2 } from 'lucide-react';
import type { PlannedTask } from '../../lib/livetwin/twinStore.ts';
import type { MachineKind } from '../../lib/livetwin/twinTypes.ts';
import { AqBadge, AqButton } from '../aq/aqPrimitives.tsx';
import { AqDataTable, type AqColumn } from '../aq/AqDataTable.tsx';
import { AqDialog } from '../aq/AqDialog.tsx';
import { AqProgress, AqTabs } from '../aq/aqLayout.tsx';
import { duration, simTime } from './twinTime.ts';
import { useTwin } from './useTwin.ts';

const TICK_MS = 500;
const SPEEDS = ['1', '60', '600'] as const;
type Speed = (typeof SPEEDS)[number];
const ICON: Record<MachineKind, React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = { drone: Plane, robot: Bot, tractor: Tractor, pump: Droplets };
const TONE = { done: 'accent', working: 'accent', travelling: 'water', cancelled: 'neutral', planned: 'warning' } as const;

export const TwinDock: React.FC = () => {
  const twin = useTwin();
  const state = twin.store.get();
  const [, tick] = useState(0);
  const [all, setAll] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'endAt', dir: 'asc' });
  useEffect(() => {
    const timer = window.setInterval(() => tick((v) => v + 1), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);
  const now = twin.store.simNow();
  const live = state.tasks.filter((t) => t.status !== 'cancelled');
  const counts = { planned: 0, travelling: 0, working: 0, done: 0, cancelled: 0 };
  live.forEach((t) => {
    counts[twin.store.taskStatus(t, now)] += 1;
  });
  const active = live
    .filter((t) => ['travelling', 'working'].includes(twin.store.taskStatus(t, now)))
    .sort((a, b) => a.endAt - b.endAt)
    .slice(0, 3);
  const drift = Math.abs(now - Date.now());
  const idle = !counts.planned && !counts.travelling && !counts.working;
  const speed = String(state.clock.speed) as Speed;

  const columns: readonly AqColumn<PlannedTask>[] = [
    { key: 'id', label: 'Task', width: 120, render: (r) => <code>{r.id.slice(-8)}</code> },
    { key: 'machineId', label: 'Machine', width: 86, render: (r) => r.machineId },
    { key: 'farmId', label: 'Farm', width: 76, render: (r) => r.farmId },
    { key: 'action', label: 'Action', render: (r) => r.action },
    { key: 'paddies', label: 'Paddies', width: 76, align: 'right', render: (r) => r.paddyIds.length },
    { key: 'km', label: 'km', width: 64, align: 'right', render: (r) => r.km },
    { key: 'workH', label: 'Work', width: 72, align: 'right', render: (r) => duration(r.workH) },
    { key: 'endAt', label: 'Ends', width: 116, render: (r) => simTime(r.endAt, now) },
    { key: 'status', label: 'Status', width: 104, render: (r) => <AqBadge tone={TONE[twin.store.taskStatus(r, now)]}>{twin.store.taskStatus(r, now)}</AqBadge> },
  ];
  const rows = state.tasks.slice().sort((a, b) => {
    const sign = sort.dir === 'asc' ? 1 : -1;
    const value = (t: PlannedTask) => (sort.key === 'endAt' ? t.endAt : sort.key === 'km' ? t.km : sort.key === 'workH' ? t.workH : String((t as unknown as Record<string, unknown>)[sort.key] ?? ''));
    const x = value(a);
    const y = value(b);
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sign;
  });
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const chosen = rows.find((r) => r.id === selectedTask) ?? null;

  return (
    <>
      <div className="aq-tw-dock">
        <div className="aq-tw-dock-card is-clock">
          <span className="aq-tw-dock-title">
            <Clock size={13} aria-hidden="true" />
            {new Date(now).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            <span className="aq-meta">{state.source === 'api' ? 'API clock' : 'sim clock'}</span>
          </span>
          <AqTabs<Speed>
            value={SPEEDS.includes(speed) ? speed : '60'}
            label="Simulation speed"
            onChange={(v) => twin.store.setSpeed(Number(v))}
            items={[
              { value: '1', label: 'Real time' },
              { value: '60', label: '×60' },
              { value: '600', label: '×600' },
            ]}
          />
          {drift > 60000 && idle ? (
            <button type="button" className="aq-fm-link" onClick={() => twin.store.syncNow()}>
              Sim clock is {duration(drift / 3600000)} {now > Date.now() ? 'ahead' : 'behind'} · reset to now
            </button>
          ) : null}
          <span className="aq-meta">
            {counts.planned} queued · {counts.travelling} travelling · {counts.working} working · {counts.done} done
          </span>
        </div>
        {active.map((task) => {
          const status = twin.store.taskStatus(task, now);
          const travelling = status === 'travelling';
          const progress = travelling ? (now - task.startAt) / Math.max(1, task.arriveAt - task.startAt) : (now - task.arriveAt) / Math.max(1, task.endAt - task.arriveAt);
          const Icon = ICON[task.kind];
          return (
            <div key={task.id} className="aq-tw-dock-card">
              <span className="aq-tw-dock-title">
                <Icon size={13} aria-hidden={true} />
                {task.machineId} → {task.farmId}
              </span>
              <span className="aq-meta">{travelling ? `Travelling ${task.km} km · arrives ${simTime(task.arriveAt, now)}` : `${task.action} · done ${simTime(task.endAt, now)}`}</span>
              <AqProgress value={Math.max(0, Math.min(1, progress))} tone={travelling ? 'water' : 'accent'} label={`${task.machineId} progress`} />
            </div>
          );
        })}
        <button type="button" className="aq-tw-dock-card is-button" onClick={() => setAll(true)}>
          <List size={15} aria-hidden="true" />
          All tasks
          <span className="aq-meta">{live.length.toLocaleString('en-US')}</span>
        </button>
      </div>
      {all ? (
        <AqDialog
          title={`Tasks · ${live.length.toLocaleString('en-US')}`}
          description={state.source === 'api' ? 'Tasks as returned by your API.' : 'Simulated execution on the sim clock. Times come from the routing model and demo work rates.'}
          width={980}
          onClose={() => setAll(false)}
          footer={
            <>
              <AqButton
                variant="ghost"
                disabled={!state.tasks.length}
                onClick={() => setConfirmClear(true)}
              >
                <Trash2 size={14} aria-hidden="true" />
                Clear all
              </AqButton>
              <span className="aq-spacer" />
              {chosen && twin.store.taskStatus(chosen, now) === 'planned' ? (
                <AqButton variant="danger" onClick={() => twin.store.cancel(chosen.id)}>
                  Cancel {chosen.id.slice(-8)}
                </AqButton>
              ) : null}
              <AqButton onClick={() => setAll(false)}>Close</AqButton>
            </>
          }
        >
          <div className="aq-tw-tasks">
            <AqDataTable<PlannedTask>
              columns={columns}
              rows={rows}
              label="Tasks"
              rowKey={(r) => r.id}
              selectedKey={selectedTask}
              sortKey={sort.key}
              sortDirection={sort.dir}
              emptyText="No tasks yet. Plan one from the composer or the practice plans."
              onSort={(key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))}
              onSelect={(row) => setSelectedTask(row.id)}
            />
          </div>
        </AqDialog>
      ) : null}
      {confirmClear ? (
        <AqDialog
          title="Clear all tasks?"
          description="This removes every task and the water the finished pump tasks added to the model. It cannot be undone."
          onClose={() => setConfirmClear(false)}
          footer={
            <>
              <AqButton variant="ghost" onClick={() => setConfirmClear(false)}>
                Keep tasks
              </AqButton>
              <AqButton
                variant="danger"
                onClick={() => {
                  twin.store.clearTasks();
                  setConfirmClear(false);
                }}
              >
                Clear all
              </AqButton>
            </>
          }
        />
      ) : null}
    </>
  );
};
