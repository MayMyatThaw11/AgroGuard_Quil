import React, { useState } from 'react';
import {
  GitBranch,
  CircleDot,
  Radio,
  Clock,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Database,
  Layers,
  Sparkles
} from 'lucide-react';

export interface StatusBarProps {
  branch?: string;
  scenarioLabel: string;
  connection: 'offline' | 'connecting' | 'online';
  errorCount: number;
  warningCount?: number;
  onOpenOutputDrawer?: () => void;
  onOpenDemoDisclaimer?: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  branch = 'main',
  scenarioLabel,
  connection,
  errorCount,
  warningCount = 0,
  onOpenOutputDrawer,
  onOpenDemoDisclaimer
}) => {
  const [demoPopoverOpen, setDemoPopoverOpen] = useState(false);

  const providerLabel = connection === 'online' ? 'Providers 5/5' : connection === 'connecting' ? 'Providers 4/5 (Connecting)' : 'Providers 3/5 (Local Fallback)';

  return (
    <footer
      className="h-6 bg-[var(--surface-base)] border-t border-[var(--border-default)] px-3 flex items-center justify-between text-[11px] font-mono text-[var(--text-tertiary)] select-none z-30 shrink-0"
      role="contentinfo"
      aria-label="Workspace Status Bar"
    >
      {/* Left: Branch · Scenario · Providers · Provenance */}
      <div className="flex items-center space-x-3 truncate">
        {/* Branch */}
        <span className="flex items-center space-x-1 text-[var(--text-primary)]">
          <GitBranch className="w-3 h-3 text-[var(--text-secondary)]" aria-hidden="true" />
          <span>{branch}</span>
        </span>

        <span className="text-[var(--border-strong)]">·</span>

        {/* Active Scenario */}
        <span className="flex items-center space-x-1 text-[var(--text-secondary)] truncate">
          <CircleDot className="w-3 h-3 text-[var(--accent)]" aria-hidden="true" />
          <span className="truncate">{scenarioLabel}</span>
        </span>

        <span className="text-[var(--border-strong)]">·</span>

        {/* Providers */}
        <span className={`flex items-center space-x-1 ${
          connection === 'online' ? 'text-emerald-500' : 'text-amber-500'
        }`}>
          <Radio className="w-3 h-3" aria-hidden="true" />
          <span>{providerLabel}</span>
        </span>

        <span className="text-[var(--border-strong)]">·</span>

        {/* Provenance Summary */}
        <span className="hidden md:inline-flex items-center space-x-1 text-[var(--text-tertiary)]">
          <Layers className="w-3 h-3" aria-hidden="true" />
          <span>REAL 3 · DERIVED 2 · SYNTHETIC 1</span>
        </span>
      </div>

      {/* Right: Diagnostics · Demo Data Indicator */}
      <div className="flex items-center space-x-3 shrink-0">
        {/* Diagnostics / Problem Count */}
        <button
          type="button"
          onClick={onOpenOutputDrawer}
          className={`flex items-center space-x-1 px-1.5 py-0.5 rounded transition ${
            errorCount > 0
              ? 'text-rose-500 hover:bg-rose-500/10 font-bold'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
          }`}
          title="Toggle Problems & Output Drawer (⌘J)"
        >
          {errorCount > 0 ? (
            <>
              <AlertTriangle className="w-3 h-3 text-rose-500" />
              <span>{errorCount} blocking issue</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              <span>No problems</span>
            </>
          )}
        </button>

        {/* Quiet Demo Data Indicator Popover */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setDemoPopoverOpen(!demoPopoverOpen)}
            className="flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-[var(--surface-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition"
            title="Data provenance"
          >
            <Database className="w-3 h-3 text-cyan-500" />
            <span className="hidden sm:inline">Data provenance</span>
          </button>

          {demoPopoverOpen && (
            <div className="absolute right-0 bottom-full mb-1 w-80 rounded-lg bg-[var(--surface-base)] border border-[var(--border-default)] shadow-xl p-3 z-50 text-xs font-sans text-[var(--text-secondary)] space-y-2">
              <div className="font-semibold text-[var(--text-primary)] flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-500" />
                <span>Agricultural Trust &amp; Provenance Notice</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                <strong>Live:</strong> weather (Open-Meteo), elevation (Copernicus DEM), world prices (World Bank Pink Sheet), soil (ISRIC SoilGrids), field readings (LoRaWAN, AgroGuard, scouts) and the contract plan.{' '}
                <strong>Illustrative:</strong> farm-map positions, 3D terrain and the demo fixture when you switch to it. No device runs without a human PIN approval.
              </p>
              <div className="pt-1.5 border-t border-[var(--border-subtle)] text-[10px] font-mono flex justify-between text-[var(--text-tertiary)]">
                <span>Savings figures: design targets</span>
                <button
                  type="button"
                  onClick={() => setDemoPopoverOpen(false)}
                  className="text-[var(--accent)] hover:underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </footer>
  );
};
