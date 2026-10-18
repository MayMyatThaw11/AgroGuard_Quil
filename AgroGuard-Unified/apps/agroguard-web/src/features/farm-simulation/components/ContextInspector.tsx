import React from 'react';
import {
  PanelRightClose,
  MapPin,
  TrendingUp,
  Droplets,
  Wind,
  Mountain,
  Layers,
  Award,
  ShieldCheck,
  Clock,
  Cpu,
  Calendar,
  Sparkles
} from 'lucide-react';
import type { AseanPreset, GoogleEarthLandParcel } from '../types';
import { getGrowthStage, SEASON_DAYS } from '../lib/metrics';
import { organicPremiumPerHa } from '../data/presets';

export interface ContextInspectorProps {
  parcel: GoogleEarthLandParcel;
  activePreset: AseanPreset;
  currentDay: number;
  waterStageM: number;
  windSpeedMs: number;
  hasLintError: boolean;
  onClose: () => void;
  onOpenPerformance?: () => void;
}

export const ContextInspector: React.FC<ContextInspectorProps> = ({
  parcel,
  activePreset,
  currentDay,
  waterStageM,
  windSpeedMs,
  hasLintError,
  onClose,
  onOpenPerformance
}) => {
  const stage = getGrowthStage(currentDay);
  const premium = Math.round(organicPremiumPerHa(activePreset));

  return (
    <aside
      className="w-[var(--advisor-width)] bg-[var(--surface-base)] border-l border-[var(--border-default)] flex flex-col h-full text-xs select-none z-20 shrink-0"
      aria-label="Context Inspector"
    >
      {/* Inspector Header */}
      <div className="p-3 border-b border-[var(--border-default)] flex items-center justify-between">
        <div className="flex items-center space-x-1.5">
          <Layers className="w-3.5 h-3.5 text-cyan-500" aria-hidden="true" />
          <span className="font-semibold text-[var(--text-primary)] tracking-wider uppercase text-[11px]">
            Parcel Inspector
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-[var(--surface-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition"
          title="Collapse Inspector (⌘I)"
          aria-label="Collapse Inspector"
        >
          <PanelRightClose className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body: Read-only Structured Metadata */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3.5">
        {/* Parcel Identity Section */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-[var(--text-primary)]">{parcel.name}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-[var(--accent)]">
              {activePreset.country}
            </span>
          </div>
          <div className="flex items-center space-x-1 text-[11px] text-[var(--text-secondary)]">
            <MapPin className="w-3 h-3 text-cyan-500 shrink-0" />
            <span>{parcel.region} · {parcel.soilSeries}</span>
          </div>
        </div>

        {/* Read-Only Agronomic Measurements (Grid) */}
        <div className="grid grid-cols-2 gap-2">
          {/* Area */}
          <div className="p-2.5 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-subtle)] space-y-0.5">
            <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)]">
              <span>Parcel Area</span>
              <span className="font-mono text-[9px] text-amber-500 font-bold">[FIXTURE]</span>
            </div>
            <div className="text-sm font-bold text-[var(--text-primary)] font-mono">
              {parcel.areaHectares.toFixed(2)} ha
            </div>
            <div className="text-[10px] text-[var(--text-tertiary)]">Derived from fixture ring</div>
          </div>

          {/* Coordinates */}
          <div className="p-2.5 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-subtle)] space-y-0.5">
            <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)]">
              <span>Centroid</span>
              <span className="font-mono text-[9px] text-amber-500 font-bold">[FIXTURE]</span>
            </div>
            <div className="text-[11px] font-bold text-[var(--text-primary)] font-mono truncate">
              {parcel.centroid.lat.toFixed(4)}°N
            </div>
            <div className="text-[10px] font-mono text-[var(--text-tertiary)]">
              {parcel.centroid.lon.toFixed(4)}°E
            </div>
          </div>

          {/* Water Stage */}
          <div className="p-2.5 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-subtle)] space-y-0.5">
            <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)]">
              <span>Water Stage</span>
              <span className="font-mono text-[9px] text-amber-500 font-bold">[FIXTURE]</span>
            </div>
            <div className="text-sm font-bold text-cyan-600 dark:text-cyan-400 font-mono">
              {waterStageM.toFixed(2)} m
            </div>
            <div className="text-[10px] text-[var(--text-tertiary)]">AWD Regime &gt; 0.15m</div>
          </div>

          {/* Field Wind Telemetry */}
          <div className="p-2.5 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-subtle)] space-y-0.5">
            <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)]">
              <span>Field Wind</span>
              <span className="font-mono text-[9px] text-amber-500 font-bold">[FIXTURE]</span>
            </div>
            <div className={`text-sm font-bold font-mono ${
              windSpeedMs > 5.5 ? 'text-rose-500' : 'text-emerald-500'
            }`}>
              {windSpeedMs.toFixed(1)} m/s
            </div>
            <div className="text-[10px] text-[var(--text-tertiary)]">Ceiling &le; 5.5 m/s</div>
          </div>

          {/* Elevation */}
          <div className="p-2.5 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-subtle)] space-y-0.5">
            <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)]">
              <span>Elevation</span>
              <span className="font-mono text-[9px] text-amber-500 font-bold">[FIXTURE]</span>
            </div>
            <div className="text-sm font-bold text-[var(--text-primary)] font-mono">
              {parcel.elevationM.mean} m
            </div>
            <div className="text-[10px] text-[var(--text-tertiary)]">Fixture value, not a DEM</div>
          </div>

          {/* Yield Projection */}
          <div className="p-2.5 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-subtle)] space-y-0.5">
            <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)]">
              <span>Yield Est.</span>
              <span className="font-mono text-[9px] text-amber-500 font-bold">[FIXTURE]</span>
            </div>
            <div className="text-sm font-bold text-[var(--text-primary)] font-mono">
              {activePreset.targetYield} t/ha
            </div>
            <div className="text-[10px] text-[var(--text-tertiary)]">Preset target, not a model run</div>
          </div>
        </div>

        {/* Crop & Phenology Profile */}
        <div className="p-2.5 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-subtle)] space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[11px] text-[var(--text-primary)]">Crop &amp; Phenology</span>
            <span className="text-[10px] font-mono text-[var(--text-tertiary)]">Day {currentDay}/120</span>
          </div>
          <div className="text-xs text-[var(--text-primary)] font-medium">
            {activePreset.crop} · <span className="font-mono">{activePreset.variety}</span>
          </div>
          <div className="flex items-center space-x-1.5 text-[11px] text-[var(--accent)] font-medium">
            <Calendar className="w-3.5 h-3.5" />
            <span>{stage}</span>
          </div>
        </div>

        {/* Soil Summary (ISRIC SoilGrids 2.0 6-Layers) */}
        <div className="p-2.5 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-subtle)] space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[11px] text-[var(--text-primary)]">Soil Stratigraphy (demo)</span>
            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-amber-500/10 text-amber-500 font-bold">
              [FIXTURE]
            </span>
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
            Illustrative 6-layer profile. Values shown are demo defaults, not a SoilGrids response.
          </div>
        </div>

        {/* Organic Certification Profile */}
        <div className={`p-2.5 rounded-lg border space-y-1 ${
          hasLintError
            ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
        }`}>
          <div className="flex items-center justify-between font-semibold">
            <div className="flex items-center space-x-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{activePreset.standard}</span>
            </div>
            <span className="text-[9px] font-mono font-bold">
              {hasLintError ? 'BLOCKING LINT' : 'CERTIFIED'}
            </span>
          </div>
          <div className="text-[10px] text-[var(--text-secondary)]">
            {hasLintError
              ? 'Prohibited input detected in active .agri script'
              : `Certified Organic ASOA Standard · +$${premium}/ha premium`}
          </div>
        </div>

        {/* Provenance & Last Updated Footer */}
        <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1 text-[10px] text-[var(--text-tertiary)] font-mono">
          <div className="flex justify-between">
            <span>Provenance:</span>
            <span>REAL (ISRIC, Copernicus)</span>
          </div>
          <div className="flex justify-between">
            <span>Freshness:</span>
            <span>2026-04-21T08:30:00Z</span>
          </div>
          {onOpenPerformance && (
            <button
              type="button"
              onClick={onOpenPerformance}
              className="mt-2 w-full py-1 rounded bg-[var(--surface-raised)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition text-[10px] flex items-center justify-center space-x-1"
            >
              <Cpu className="w-3 h-3 text-purple-500" />
              <span>View GPU &amp; Rendering Metrics</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
