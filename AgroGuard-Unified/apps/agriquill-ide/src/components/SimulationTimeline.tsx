import React from 'react';
import {
  RotateCcw,
  SkipBack,
  Play,
  Pause,
  SkipForward,
  Flag,
  AlertTriangle,
  Droplets,
  Bug,
  Calendar
} from 'lucide-react';
import { SEASON_DAYS, getGrowthStage } from '../lib/metrics';

export interface SimulationTimelineProps {
  currentDay: number;
  onSelectDay: (day: number) => void;
  isSimulating: boolean;
  onToggleSimulate: () => void;
  speed: 1 | 2 | 4;
  onChangeSpeed: (speed: 1 | 2 | 4) => void;
  onRestart: () => void;
  breakpoints?: number[];
}

export const SimulationTimeline: React.FC<SimulationTimelineProps> = ({
  currentDay,
  onSelectDay,
  isSimulating,
  onToggleSimulate,
  speed,
  onChangeSpeed,
  onRestart,
  breakpoints = [35, 68, 92]
}) => {
  const stage = getGrowthStage(currentDay);
  const strategy = currentDay < 45 ? 'AWD Deficit Regime' : currentDay < 85 ? 'Canopy Inundation' : 'Pre-Harvest Drain';

  const handlePrevDay = () => {
    onSelectDay(Math.max(1, currentDay - 1));
  };

  const handleNextDay = () => {
    onSelectDay(Math.min(SEASON_DAYS, currentDay + 1));
  };

  return (
    <div
      className="h-12 px-3 bg-[var(--surface-base)] border-t border-[var(--border-default)] flex items-center justify-between text-xs select-none z-10 shrink-0 gap-3"
      role="region"
      aria-label="Authoritative simulation timeline"
    >
      {/* 1. Left Controls: Restart, Prev, Play/Pause, Next, Speed */}
      <div className="flex items-center space-x-1.5 shrink-0">
        <button
          type="button"
          onClick={onRestart}
          className="p-1.5 rounded hover:bg-[var(--surface-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition"
          title="Restart simulation to Day 1"
          aria-label="Restart simulation"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={handlePrevDay}
          disabled={currentDay <= 1}
          className="p-1.5 rounded hover:bg-[var(--surface-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition disabled:opacity-40"
          title="Step to previous day"
          aria-label="Previous day"
        >
          <SkipBack className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onToggleSimulate}
          className={`p-1.5 rounded font-semibold transition ${
            isSimulating
              ? 'bg-[var(--status-warning)] text-slate-950'
              : 'bg-[var(--surface-raised)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] border border-[var(--border-default)]'
          }`}
          title={isSimulating ? 'Pause timeline playback' : 'Play 120-day timeline'}
          aria-label={isSimulating ? 'Pause timeline' : 'Play timeline'}
        >
          {isSimulating ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
        </button>

        <button
          type="button"
          onClick={handleNextDay}
          disabled={currentDay >= SEASON_DAYS}
          className="p-1.5 rounded hover:bg-[var(--surface-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition disabled:opacity-40"
          title="Step to next day"
          aria-label="Next day"
        >
          <SkipForward className="w-3.5 h-3.5" />
        </button>

        {/* Speed Selector (1x, 2x, 4x) */}
        <div className="flex items-center space-x-0.5 ml-1 bg-[var(--surface-sunken)] p-0.5 rounded border border-[var(--border-subtle)] font-mono text-[10px]">
          {([1, 2, 4] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChangeSpeed(s)}
              className={`px-1.5 py-0.5 rounded transition ${
                speed === s
                  ? 'bg-[var(--surface-raised)] text-[var(--accent)] font-bold'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/* 2. Center: Draggable Timeline with Markers & Stages */}
      <div className="flex-1 max-w-2xl flex flex-col justify-center space-y-1 px-2">
        <div className="flex items-center justify-between text-[11px] font-mono">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-[var(--text-primary)]">
              Day {currentDay} <span className="text-[var(--text-tertiary)] font-normal">/ {SEASON_DAYS}</span>
            </span>
            <span className="px-1.5 py-0.2 rounded bg-[var(--surface-sunken)] text-[var(--accent)] text-[10px] font-medium border border-[var(--border-subtle)]">
              {stage}
            </span>
          </div>

          <div className="flex items-center space-x-2 text-[10px] text-[var(--text-secondary)]">
            <span className="flex items-center space-x-1">
              <Droplets className="w-3 h-3 text-cyan-500" />
              <span>{strategy}</span>
            </span>
          </div>
        </div>

        {/* Draggable Scrubber with Event & Risk Markers */}
        <div className="relative flex items-center h-4">
          <input
            type="range"
            min="1"
            max={SEASON_DAYS}
            value={currentDay}
            onChange={(e) => onSelectDay(Number(e.target.value))}
            className="w-full accent-[var(--accent)] cursor-pointer h-1.5 bg-[var(--surface-sunken)] rounded-full"
            aria-label="Simulation day scrubber"
          />

          {/* Breakpoint markers */}
          {breakpoints.map((bp) => {
            const pct = ((bp - 1) / (SEASON_DAYS - 1)) * 100;
            return (
              <div
                key={bp}
                style={{ left: `${pct}%` }}
                className="absolute -top-1 w-1.5 h-3 bg-amber-500/80 rounded-2xs pointer-events-none"
                title={`Breakpoint at Day ${bp}`}
              />
            );
          })}
        </div>
      </div>

      {/* 3. Right Status Chips */}
      <div className="hidden lg:flex items-center space-x-2 shrink-0 text-[10px] font-mono text-[var(--text-tertiary)]">
        <span className="flex items-center space-x-1 px-2 py-0.5 rounded bg-[var(--surface-sunken)] border border-[var(--border-subtle)]">
          <Flag className="w-3 h-3 text-amber-500" />
          <span title="Deterministic logistic fixture. Not a calibrated crop model.">Fixture model</span>
        </span>
      </div>
    </div>
  );
};
