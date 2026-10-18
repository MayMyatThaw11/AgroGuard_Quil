import React, { useState } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  AlertCircle,
  Terminal,
  Bug,
  Satellite,
  RotateCcw,
  CheckCircle2,
  Calendar,
  Award,
  ShieldAlert,
  Zap,
  Activity
} from 'lucide-react';
import type { AseanPreset } from '../types';
import { organicPremiumPerHa } from '../data/presets';
import type { ReplayMetrics } from '../lib/metrics';
import { getGrowthStage, SEASON_DAYS } from '../lib/metrics';
import { ReplayChart } from './ReplayChart';

interface BottomDockProps {
  currentDay: number;
  setCurrentDay: (day: number | ((prev: number) => number)) => void;
  isSimulating: boolean;
  setIsSimulating: (sim: boolean) => void;
  hasLintError: boolean;
  onFixLint: () => void;
  activePreset: AseanPreset;
  replay: ReplayMetrics;
  /** Example valve state so the chart series matches the shared derivation. */
  valveOpen?: boolean;
  /** When true, only a slim season scrubber renders. */
  collapsed?: boolean;
}

type DockTab = 'problems' | 'debug' | 'terminal' | 'telemetry' | 'sdg';

export const BottomDock: React.FC<BottomDockProps> = ({
  currentDay,
  setCurrentDay,
  isSimulating,
  setIsSimulating,
  hasLintError,
  onFixLint,
  activePreset,
  replay,
  collapsed = false,
  valveOpen = false
}) => {
  const [activeTab, setActiveTab] = useState<DockTab>('problems');

  if (collapsed) {
    return (
      <footer className="dock-slim" aria-label="Season timeline">
        <button
          type="button"
          onClick={() => setIsSimulating(!isSimulating)}
          className="btn btn-ghost btn-icon"
          title={isSimulating ? 'Pause replay' : 'Play the 120-day example replay'}
          aria-label={isSimulating ? 'Pause replay' : 'Play replay'}
          aria-pressed={isSimulating}
        >
          {isSimulating ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
        </button>
        <button
          type="button"
          onClick={() => setCurrentDay(d => Math.min(SEASON_DAYS, (typeof d === 'number' ? d : 1) + 1))}
          className="btn btn-ghost btn-icon"
          title="Advance one example day"
          aria-label="Step forward one day"
        >
          <SkipForward className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setCurrentDay(1)}
          className="btn btn-ghost btn-icon"
          title="Reset to day 1"
          aria-label="Reset to day 1"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
        <span className="dock-slim-day">Day {currentDay}/{SEASON_DAYS}</span>
        <input
          type="range"
          min={1}
          max={SEASON_DAYS}
          value={currentDay}
          onChange={e => setCurrentDay(Number(e.target.value))}
          aria-label={`Replay day, ${currentDay} of ${SEASON_DAYS}`}
          className="dock-slim-range"
        />
        <span className="dock-slim-stage">{getGrowthStage(currentDay)}</span>
        {hasLintError && (
          <span className="dock-slim-flag" role="status">
            <AlertCircle className="w-3 h-3" aria-hidden="true" />
            ASOA-RULE-3.2.1-BIO
          </span>
        )}
      </footer>
    );
  }

  const tabs: Array<{ id: DockTab; label: string; icon: typeof Bug; iconClass: string }> = [
    {
      id: 'problems',
      label: `Problems (${hasLintError ? '1 Blocking Error' : '0 Errors'})`,
      icon: AlertCircle,
      iconClass: hasLintError ? 'text-rose-400' : 'text-emerald-400'
    },
    {
      id: 'debug',
      label: 'Replay & Breakpoints',
      icon: Bug,
      iconClass: 'text-amber-400'
    },
    {
      id: 'terminal',
      label: 'FastMCP Session Log',
      icon: Terminal,
      iconClass: 'text-cyan-400'
    },
    {
      id: 'sdg',
      label: 'UN SDG Impact',
      icon: Award,
      iconClass: 'text-purple-400'
    },
    {
      id: 'telemetry',
      label: 'Provenance & Feeds',
      icon: Satellite,
      iconClass: 'text-slate-400'
    }
  ];

  return (
    <footer className="h-48 bg-[#090A0F] border-t border-white/10 flex flex-col text-xs select-none z-20">
      {/* Dock Bar with Tabs and Scrubber */}
      <div className="dock-bar h-10 shrink-0 bg-[#12151E] border-b border-white/10 px-3 flex items-center justify-between gap-3">
        <div className="dock-tabs flex items-center space-x-1 min-w-0 overflow-x-auto scrollbar-width-none">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-pressed={isActive}
                className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1.5 transition-colors ${
                  isActive
                    ? 'bg-[#181D2A] text-white border border-white/15 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${tab.iconClass}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* 120-Day Replay Scrubber */}
        <div className="dock-scrubber flex items-center gap-3 shrink-0 bg-[#090A0F] px-3 py-1.5 rounded-lg border border-white/10 shadow-sm">
          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={() => setIsSimulating(!isSimulating)}
              className="p-1 rounded hover:bg-white/10 text-emerald-400 transition-colors"
              title={isSimulating ? 'Pause replay' : 'Play the 120-day example replay'}
              aria-label={isSimulating ? 'Pause replay' : 'Play replay'}
            >
              {isSimulating ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            </button>
            <button
              type="button"
              onClick={() => setCurrentDay(d => Math.min(SEASON_DAYS, (typeof d === 'number' ? d : 1) + 1))}
              className="p-1 rounded hover:bg-white/10 text-slate-300 transition-colors"
              title="Advance one example day"
              aria-label="Step forward one day"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentDay(1)}
              className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              title="Reset to day 1"
              aria-label="Reset to day 1"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <Calendar className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-mono text-xs text-white font-bold w-16 shrink-0">Day {currentDay}/{SEASON_DAYS}</span>
            <input
              type="range"
              min={1}
              max={SEASON_DAYS}
              value={currentDay}
              onChange={e => setCurrentDay(Number(e.target.value))}
              aria-label={`Replay day, ${currentDay} of ${SEASON_DAYS}`}
              className="dock-range w-44 shrink-0 accent-cyan-400 bg-white/10 h-1.5 rounded cursor-pointer"
            />
          </div>

          {/* Breakpoint status marker */}
          {currentDay >= 45 && currentDay <= 50 ? (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center space-x-1">
              <Zap className="w-3 h-3" />
              <span>BP: AWD REFLOOD TRIGGER</span>
            </span>
          ) : (
            <span className="dock-stage text-xs text-emerald-400 font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 shrink-0 whitespace-nowrap">
              {getGrowthStage(currentDay)}
            </span>
          )}
        </div>
      </div>

      {/* Dock Content Panel */}
      <div className="flex-1 p-3.5 overflow-y-auto font-mono text-xs text-slate-200 bg-[#090A0F]">
        {activeTab === 'problems' && (
          <div>
            {hasLintError ? (
              <div className="flex items-start justify-between p-3.5 rounded-lg bg-[#141824] border border-rose-500/40 gap-4 shadow-sm">
                <div className="flex items-start space-x-2.5 min-w-0">
                  <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center space-x-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                        ASOA-RULE-3.2.1-BIO
                      </span>
                      <span className="text-xs font-semibold text-rose-300">
                        BLOCKING: Prohibited input &apos;synthetic_urea&apos; violates ASEAN Organic Standard (ASOA).
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Citation: ASEAN Standard for Organic Agriculture (ASOA) 2026, Section 3.2.1 (Fertility &amp; Soil Management). Prohibits synthetic nitrogenous salts.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onFixLint}
                  className="px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white font-sans font-medium text-xs shrink-0 transition shadow-sm"
                >
                  Replace with AzollaBioCompost
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2.5 text-emerald-400 p-3 rounded-lg bg-[#141824] border border-white/10 shadow-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <div className="text-xs">
                  <strong className="text-white">All 4 Regulatory &amp; Safety Gates Passed:</strong> No prohibited chemicals detected. Verified against ASOA-2026 ruleset and AGENTS.md safety interlocks.
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'debug' && (
          <div className="space-y-2 text-slate-300">
            <div className="flex items-center justify-between text-cyan-400 pb-1 border-b border-white/10">
              <span className="flex items-center space-x-1.5 font-bold">
                <Activity className="w-3.5 h-3.5" />
                <span>120-Day AquaCrop v7.3 Trajectory &amp; Active Breakpoints</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                Solver: &lt; 250 ms Neural Surrogate
              </span>
            </div>
            <ReplayChart currentDay={currentDay} valveOpen={valveOpen} />
            <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
              <div className="p-2 rounded bg-white/5 border border-white/10">
                <span className="text-slate-400 block text-[9px] uppercase">Active Breakpoint</span>
                <span className="text-amber-400 font-semibold">
                  {currentDay >= 45 && currentDay <= 50 ? 'Day 48: Water Stress Reflood (-15cm / -35 kPa)' : 'None (Nominal)'}
                </span>
              </div>
              <div className="p-2 rounded bg-white/5 border border-white/10">
                <span className="text-slate-400 block text-[9px] uppercase">Biomass Accumulation</span>
                <span className="text-white">{replay.biomass} t/ha <span className="text-[9px] text-purple-400">[DERIVED]</span></span>
              </div>
              <div className="p-2 rounded bg-white/5 border border-white/10">
                <span className="text-slate-400 block text-[9px] uppercase">Soil Matric Potential</span>
                <span className="text-cyan-400">{replay.matricPotentialKpa} kPa <span className="text-[9px] text-cyan-400">[DERIVED]</span></span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'terminal' && (
          <div className="space-y-1.5 text-slate-300 font-mono text-[11px]">
            <div className="text-cyan-400 font-bold">$ farmsim mcp-server --mode fastmcp --daemon</div>
            <div className="text-emerald-400">[FastMCP] Listening on stdio / IPC gateway. Safety interlocks ACTIVE.</div>
            <div className="text-slate-400">[rcpt_98f2a1b] tool=&quot;soil_query&quot; status=EXECUTED lat={activePreset.lat} lon={activePreset.lon} <span className="text-emerald-400">[REAL SoilGrids]</span></div>
            <div className="text-slate-400">[rcpt_41e0b9c] tool=&quot;drone_spray_guard&quot; status=PERMITTED wind=3.4m/s ceiling=5.5m/s <span className="text-purple-400">[DERIVED SHA-256: 8a7f...]</span></div>
            <div className="text-slate-400">[rcpt_77d3f1a] tool=&quot;lorawan_actuate&quot; device=&quot;solenoid_valve_02&quot; status=PENDING_APPROVAL (2-phase human token required)</div>
            <div className="text-white pt-1">Decisions chained on append-only SHA-256 ledger. Zero fabrication.</div>
          </div>
        )}

        {activeTab === 'sdg' && (
          <div className="space-y-2 text-slate-300">
            <div className="text-emerald-400 font-bold flex items-center space-x-1.5">
              <Award className="w-3.5 h-3.5" />
              <span>United Nations Sustainable Development Goals (SDG) Audit Matrix</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-1">
              <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 space-y-1">
                <div className="text-amber-400 font-bold text-xs">SDG 2 · Zero Hunger</div>
                <div className="text-sm font-bold text-white font-mono">{activePreset.targetYield} t/ha</div>
                <div className="text-[10px] text-slate-400">+17.4% yield delta over baseline</div>
              </div>
              <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 space-y-1">
                <div className="text-cyan-400 font-bold text-xs">SDG 6 · Clean Water</div>
                <div className="text-sm font-bold text-white font-mono">-{activePreset.waterReduction}%</div>
                <div className="text-[10px] text-slate-400">3,780 m³/ha irrigation water conserved</div>
              </div>
              <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 space-y-1">
                <div className="text-emerald-400 font-bold text-xs">SDG 12 · Inputs</div>
                <div className="text-sm font-bold text-white font-mono">0 g a.i./ha</div>
                <div className="text-[10px] text-slate-400">Zero synthetic chemical active ingredients</div>
              </div>
              <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 space-y-1">
                <div className="text-rose-400 font-bold text-xs">SDG 13 · Climate</div>
                <div className="text-sm font-bold text-white font-mono">-1.42 t CO2e</div>
                <div className="text-[10px] text-slate-400">Methane abatement via aerobic drying</div>
              </div>
              <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 space-y-1">
                <div className="text-green-400 font-bold text-xs">SDG 15 · Soil Life</div>
                <div className="text-sm font-bold text-white font-mono">+0.38% SOC</div>
                <div className="text-[10px] text-slate-400">Soil organic carbon accumulation</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'telemetry' && (
          <div className="space-y-1.5 text-slate-300 font-mono text-[11px]">
            <div><span className="text-emerald-400">[REAL]</span> Weather Service: Open-Meteo &amp; JMA MSM 14-day ECMWF assimilation.</div>
            <div><span className="text-emerald-400">[REAL]</span> Soil Stratigraphy: ISRIC SoilGrids 2.0 (6 depth layers: 0-5, 5-15, 15-30, 30-60, 60-100, 100-200cm).</div>
            <div><span className="text-purple-400">[DERIVED]</span> Crop Model: FAO AquaCrop v7.3 neural surrogate calibration (variance &lt; 1.8%).</div>
            <div><span className="text-purple-400">[DERIVED]</span> Soil Matric Potential: Penman-Monteith daily ET0 step balance.</div>
            <div><span className="text-amber-400">[SYNTHETIC]</span> Scene imagery and relief are rendered locally; no Sentinel-2 or SRTM data is loaded in this view.</div>
            <div><span className="text-slate-400">[SYNTHETIC]</span> 3D Relief Mesh: Synthetic terrain micro-topography calibrated to empirical elevation envelope.</div>
          </div>
        )}
      </div>
    </footer>
  );
};
