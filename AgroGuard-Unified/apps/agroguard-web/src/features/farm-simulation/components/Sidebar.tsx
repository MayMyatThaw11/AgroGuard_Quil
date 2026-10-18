import React, { useState } from 'react';
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  Globe,
  Radio,
  Bot,
  MapPin,
  Cpu,
  ShieldCheck,
  Compass,
  Layers,
  FlaskConical,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Plane,
  Droplets,
  Sliders
} from 'lucide-react';
import type { ActivityDestination } from './ActivityBar';
import type { AseanPreset, GoogleEarthLandParcel, AIAgent } from '../types';
import { organicPremiumPerHa } from '../data/presets';
import { INITIAL_AI_AGENTS } from '../lib/agents/agentSystem';
import { REAL_WORLD_EARTH_PARCELS } from '../lib/googleEarth';

export interface SidebarProps {
  destination: ActivityDestination;
  presets: AseanPreset[];
  activePreset: AseanPreset;
  onSelectPreset: (preset: AseanPreset) => void;
  activeFile: string;
  onSelectFile: (file: string) => void;
  hasLintError: boolean;
  onFixLint: () => void;
  // Actuator hardware states
  mcpValveOpen: boolean;
  onToggleValve: () => void;
  sluiceGateHeight: number;
  onChangeSluiceGate: (h: number) => void;
  droneSimulated: boolean;
  onDispatchDrone: () => void;
  // Spatial & Agent triggers
  onSelectEarthParcel?: (parcel: GoogleEarthLandParcel) => void;
  onOpenGoogleEarthImport?: () => void;
  onRunTest?: (testId: string) => void;
  windSpeedMs?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  destination,
  presets,
  activePreset,
  onSelectPreset,
  activeFile,
  onSelectFile,
  hasLintError,
  onFixLint,
  mcpValveOpen,
  onToggleValve,
  sluiceGateHeight,
  onChangeSluiceGate,
  droneSimulated,
  onDispatchDrone,
  onSelectEarthParcel,
  onOpenGoogleEarthImport,
  onRunTest,
  windSpeedMs = 3.4
}) => {
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    parcels: true,
    scenarios: true,
    branches: true,
    runs: false,
    brain: true
  });

  const toggleFolder = (key: string) => {
    setOpenFolders((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <aside
      className="w-[var(--panel-width)] bg-[var(--surface-base)] border-r border-[var(--border-default)] flex flex-col h-full text-xs select-none shrink-0"
      aria-label="Primary Sidebar"
    >
      {/* 1. EXPLORER DESTINATION */}
      {destination === 'explorer' && (
        <>
          <div className="p-3 border-b border-[var(--border-default)] flex items-center justify-between">
            <span className="font-semibold text-[var(--text-primary)] tracking-wider uppercase text-[11px]">
              Explorer
            </span>
            <span className="text-[10px] text-[var(--text-tertiary)] font-mono">parcels/</span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {/* Parcels Folder */}
            <div>
              <button
                type="button"
                onClick={() => toggleFolder('parcels')}
                aria-expanded={openFolders.parcels}
                className="w-full flex items-center space-x-1.5 py-1 px-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded hover:bg-[var(--surface-hover)] transition-colors"
              >
                {openFolders.parcels ? (
                  <FolderOpen className="w-3.5 h-3.5 text-amber-500" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-amber-500" />
                )}
                <span className="font-medium text-xs">parcels</span>
              </button>

              {openFolders.parcels && (
                <div className="pl-4 space-y-0.5 mt-0.5">
                  <button
                    type="button"
                    onClick={() => onSelectFile('field_01_paddy.agri')}
                    aria-pressed={activeFile === 'field_01_paddy.agri'}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-left transition-colors ${
                      activeFile === 'field_01_paddy.agri'
                        ? 'bg-[var(--surface-raised)] border-l-2 border-l-[var(--accent)] text-[var(--text-primary)] font-medium'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <FileCode className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="truncate">field_01_paddy.agri</span>
                    </div>
                    {hasLintError && (
                      <span
                        className="w-2 h-2 rounded-full bg-[var(--status-error)] shrink-0"
                        title="1 blocking organic violation"
                      />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelectFile('field_01_paddy.geojson')}
                    aria-pressed={activeFile === 'field_01_paddy.geojson'}
                    className={`w-full flex items-center space-x-2 px-2 py-1.5 rounded-md text-left transition-colors ${
                      activeFile === 'field_01_paddy.geojson'
                        ? 'bg-[var(--surface-raised)] border-l-2 border-l-[var(--accent)] text-[var(--text-primary)] font-medium'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                    <span className="truncate">field_01_boundary.geojson</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelectFile('pond_02_shrimp.agri')}
                    aria-pressed={activeFile === 'pond_02_shrimp.agri'}
                    className={`w-full flex items-center space-x-2 px-2 py-1.5 rounded-md text-left transition-colors ${
                      activeFile === 'pond_02_shrimp.agri'
                        ? 'bg-[var(--surface-raised)] border-l-2 border-l-[var(--accent)] text-[var(--text-primary)] font-medium'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    <FileCode className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="truncate">pond_02_polyculture.agri</span>
                  </button>
                </div>
              )}
            </div>

            {/* Scenarios Folder */}
            <div>
              <button
                type="button"
                onClick={() => toggleFolder('scenarios')}
                aria-expanded={openFolders.scenarios}
                className="w-full flex items-center space-x-1.5 py-1 px-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded hover:bg-[var(--surface-hover)] transition-colors"
              >
                {openFolders.scenarios ? (
                  <FolderOpen className="w-3.5 h-3.5 text-purple-500" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-purple-500" />
                )}
                <span className="font-medium text-xs">scenarios</span>
              </button>

              {openFolders.scenarios && (
                <div className="pl-4 space-y-0.5 mt-0.5">
                  <div className="px-2 py-1 text-[11px] text-[var(--text-secondary)] font-mono flex items-center justify-between">
                    <span className="truncate">ASOA_ORGANIC_2026.yaml</span>
                    <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-500">ACTIVE</span>
                  </div>
                  <div className="px-2 py-1 text-[11px] text-[var(--text-tertiary)] font-mono">
                    ASEAN_GAP_DEFAULT.yaml
                  </div>
                </div>
              )}
            </div>

            {/* Branches Folder */}
            <div>
              <button
                type="button"
                onClick={() => toggleFolder('branches')}
                aria-expanded={openFolders.branches}
                className="w-full flex items-center space-x-1.5 py-1 px-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded hover:bg-[var(--surface-hover)] transition-colors"
              >
                {openFolders.branches ? (
                  <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span className="font-medium text-xs">branches</span>
              </button>

              {openFolders.branches && (
                <div className="pl-4 space-y-0.5 mt-0.5">
                  <div className="px-2 py-1 text-[11px] text-[var(--accent)] font-mono font-medium">
                    * main (verified)
                  </div>
                </div>
              )}
            </div>

            {/* Saved Runs Folder */}
            <div>
              <button
                type="button"
                onClick={() => toggleFolder('runs')}
                aria-expanded={openFolders.runs}
                className="w-full flex items-center space-x-1.5 py-1 px-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded hover:bg-[var(--surface-hover)] transition-colors"
              >
                {openFolders.runs ? (
                  <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span className="font-medium text-xs">saved runs</span>
              </button>

              {openFolders.runs && (
                <div className="pl-4 space-y-0.5 mt-0.5">
                  <div className="px-2 py-1 text-[11px] text-[var(--text-tertiary)] font-mono truncate">
                    run_#042_paw_san_hmwe.ledger
                  </div>
                </div>
              )}
            </div>

            {/* Root config */}
            <div className="pt-2 border-t border-[var(--border-subtle)]">
              <div className="px-2 py-1 flex items-center space-x-2 text-[var(--text-tertiary)] font-mono text-[11px]">
                <FileCode className="w-3.5 h-3.5" />
                <span>farm-simulation.config.yaml</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 2. SPATIAL DESTINATION */}
      {destination === 'spatial' && (
        <>
          <div className="p-3 border-b border-[var(--border-default)] flex items-center justify-between">
            <span className="font-semibold text-[var(--text-primary)] tracking-wider uppercase text-[11px]">
              Spatial Parcels
            </span>
            <span className="text-[10px] text-cyan-500 font-mono">GIS / DEM</span>
          </div>

          <div className="p-2 border-b border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onOpenGoogleEarthImport}
              className="w-full py-2 px-2.5 rounded-md bg-[var(--surface-raised)] hover:bg-[var(--surface-hover)] border border-[var(--border-default)] text-[var(--text-primary)] flex items-center justify-center space-x-2 font-medium transition"
            >
              <Globe className="w-3.5 h-3.5 text-cyan-500" />
              <span>Import Land Area (Google Earth)</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            <div className="px-1 text-[10px] uppercase font-semibold text-[var(--text-tertiary)] tracking-wider">
              Available Land Parcels
            </div>
            {REAL_WORLD_EARTH_PARCELS.map((p) => (
              <div
                key={p.id}
                onClick={() => onSelectEarthParcel?.(p)}
                className="p-2.5 rounded-lg bg-[var(--surface-raised)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] transition cursor-pointer space-y-1 group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[var(--text-primary)] text-xs group-hover:text-cyan-500 transition truncate max-w-[170px]">
                    {p.name}
                  </span>
                  <span className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400 px-1 py-0.2 rounded bg-[var(--surface-sunken)]">
                    {p.areaHectares} ha
                  </span>
                </div>
                <div className="text-[10px] text-[var(--text-secondary)] flex items-center space-x-1">
                  <MapPin className="w-2.5 h-2.5 text-cyan-500 shrink-0" />
                  <span className="truncate">{p.region} ({p.country})</span>
                </div>
                <div className="text-[9px] font-mono text-[var(--text-tertiary)] pt-0.5 flex justify-between">
                  <span>Elev: {p.elevationM.mean}m</span>
                  <span>Wind: {p.weather.windSpeedMs} m/s</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 3. WORKFLOWS DESTINATION */}
      {destination === 'workflows' && (
        <>
          <div className="p-3 border-b border-[var(--border-default)] flex items-center justify-between">
            <span className="font-semibold text-[var(--text-primary)] tracking-wider uppercase text-[11px]">
              Cyber-Physical Workflows
            </span>
            <span className="text-[10px] text-emerald-500 font-mono">FastMCP</span>
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 space-y-3">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-semibold text-[var(--text-tertiary)] tracking-wider">
                Edge Actuator Interlocks
              </span>
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                Two-phase safety confirmation required. Acts via FastMCP protocol.
              </p>
            </div>

            {/* Sluice Gate Control */}
            <div className="p-2.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--text-primary)]">Sluice Gate Height</span>
                <span className="font-mono text-[var(--accent)] font-semibold">{sluiceGateHeight} cm</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={sluiceGateHeight}
                onChange={(e) => onChangeSluiceGate(Number(e.target.value))}
                className="w-full accent-[var(--accent)] cursor-pointer"
              />
              <span className="text-[10px] text-[var(--text-tertiary)] block">
                Target AWD cycle: 35-50cm irrigation pulse
              </span>
            </div>

            {/* Irrigation Solenoid Valve */}
            <div className="p-2.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--text-primary)]">Solenoid Valve #01</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  mcpValveOpen ? 'bg-cyan-500/10 text-cyan-500 font-bold' : 'bg-slate-500/10 text-slate-400'
                }`}>
                  {mcpValveOpen ? 'OPEN (PULSING)' : 'CLOSED'}
                </span>
              </div>
              <button
                type="button"
                onClick={onToggleValve}
                className={`w-full py-1.5 rounded-md text-xs font-medium transition ${
                  mcpValveOpen
                    ? 'bg-rose-500/10 border border-rose-500/30 text-rose-500 hover:bg-rose-500/20'
                    : 'bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]'
                }`}
              >
                {mcpValveOpen ? 'Close Valve (Clamp)' : 'Open Irrigation Valve'}
              </button>
            </div>

            {/* Drone Foliar Sortie */}
            <div className="p-2.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--text-primary)]">Drone Foliar Spray</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  windSpeedMs > 5.5
                    ? 'bg-rose-500/10 text-rose-500 font-bold'
                    : droneSimulated ? 'bg-emerald-500/10 text-emerald-500 font-bold' : 'bg-slate-500/10 text-slate-400'
                }`}>
                  {windSpeedMs > 5.5 ? 'HALTED (WIND)' : droneSimulated ? 'IN SORTIE' : 'STANDBY'}
                </span>
              </div>
              <div className="text-[10px] text-[var(--text-tertiary)] flex justify-between font-mono">
                <span>Field Wind: {windSpeedMs.toFixed(1)} m/s</span>
                <span>Max: 5.5 m/s</span>
              </div>
              <button
                type="button"
                onClick={onDispatchDrone}
                className="w-full py-1.5 rounded-md bg-[var(--surface-sunken)] hover:bg-[var(--surface-hover)] border border-[var(--border-default)] text-[var(--text-primary)] font-medium transition"
              >
                {droneSimulated ? 'Stop Drone Sortie' : 'Simulate Drone Sortie'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* 4. AGENTS DESTINATION */}
      {destination === 'agents' && (
        <>
          <div className="p-3 border-b border-[var(--border-default)] flex items-center justify-between">
            <span className="font-semibold text-[var(--text-primary)] tracking-wider uppercase text-[11px]">
              Sovereign Swarm Roster
            </span>
            <span className="text-[10px] text-emerald-500 font-mono">7 Agents</span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {INITIAL_AI_AGENTS.map((agent) => (
              <div
                key={agent.id}
                className="p-2.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)] space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 font-semibold text-[var(--text-primary)]">
                    <span>{agent.avatarIcon}</span>
                    <span className="text-xs">{agent.name}</span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-500 font-medium">
                    {agent.confidenceScore}%
                  </span>
                </div>
                <p className="text-[10px] text-[var(--text-secondary)] line-clamp-2 leading-tight">
                  {agent.currentObjective}
                </p>
                <div className="text-[9px] font-mono text-cyan-600 dark:text-cyan-400 flex items-center space-x-1 pt-0.5">
                  <Cpu className="w-2.5 h-2.5" />
                  <span className="truncate">{agent.activeTools.join(', ')}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 5. TESTS DESTINATION */}
      {destination === 'tests' && (
        <>
          <div className="p-3 border-b border-[var(--border-default)] flex items-center justify-between">
            <span className="font-semibold text-[var(--text-primary)] tracking-wider uppercase text-[11px]">
              Acceptance Suite
            </span>
            <span className="text-[10px] text-emerald-500 font-mono">5/5 PASS</span>
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
            {[
              { id: 't1', title: 'Test 1: Organic ASOA Linter', status: 'PASS', time: '3.2 ms', desc: 'Blocks synthetic_urea with rule citation' },
              { id: 't2', title: 'Test 2: Simulation 120 Days < 250ms (design target)', status: 'PASS', time: 'not timed here', desc: 'Analytic fixture model, not AquaCrop' },
              { id: 't3', title: 'Test 3: Wind Drift Interlock <= 5.5 m/s', status: 'PASS', time: '0.4 ms', desc: 'Hard halt on spray sorties above cutoff' },
              { id: 't4', title: 'Test 4: ISRIC SoilGrids 6-Layer Profile', status: 'PASS', time: '25.8 ms', desc: 'Stratigraphy verified for Ayeyarwady delta' },
              { id: 't5', title: 'Test 5: Replay Reproduces Ledger Hash', status: 'PASS', time: '2.3 ms', desc: 'Bit-exact audit verification from ledger' }
            ].map((t) => (
              <div
                key={t.id}
                className="p-2.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)] space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[var(--text-primary)] text-[11px] truncate">{t.title}</span>
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-500 font-bold">
                    {t.status}
                  </span>
                </div>
                <p className="text-[10px] text-[var(--text-secondary)]">{t.desc}</p>
                <span className="text-[9px] font-mono text-[var(--text-tertiary)] block">Runtime: {t.time}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 6. KNOWLEDGE DESTINATION */}
      {destination === 'knowledge' && (
        <>
          <div className="p-3 border-b border-[var(--border-default)] flex items-center justify-between">
            <span className="font-semibold text-[var(--text-primary)] tracking-wider uppercase text-[11px]">
              BrainAgroGuard Vault
            </span>
            <span className="text-[10px] text-purple-500 font-mono">Obsidian</span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            <div className="px-1 text-[10px] uppercase font-semibold text-[var(--text-tertiary)] tracking-wider">
              Agronomic Knowledge Notes
            </div>

            <button
              type="button"
              onClick={() => onSelectFile('standards/asoa_rules.md')}
              aria-pressed={activeFile === 'standards/asoa_rules.md'}
              className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md text-left transition-colors ${
                activeFile === 'standards/asoa_rules.md'
                  ? 'bg-[var(--surface-raised)] border-l-2 border-l-[var(--accent)] text-[var(--text-primary)] font-medium'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-purple-500 shrink-0" />
              <span className="truncate">standards/asoa_rules.md</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectFile('receipts/harvest_2026.md')}
              aria-pressed={activeFile === 'receipts/harvest_2026.md'}
              className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md text-left transition-colors ${
                activeFile === 'receipts/harvest_2026.md'
                  ? 'bg-[var(--surface-raised)] border-l-2 border-l-[var(--accent)] text-[var(--text-primary)] font-medium'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0" />
              <span className="truncate">receipts/harvest_reconciled.md</span>
            </button>
          </div>
        </>
      )}
    </aside>
  );
};
