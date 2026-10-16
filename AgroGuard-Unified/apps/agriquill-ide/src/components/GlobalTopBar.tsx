import React, { useEffect, useRef, useState } from 'react';
import {
  Sprout,
  Search,
  ChevronDown,
  Play,
  Square,
  Download,
  MoreHorizontal,
  Bot,
  Columns,
  Layers,
  HelpCircle,
  FileCode,
  Globe2,
  Sliders,
  Sun,
  Moon,
  Sparkles,
  Cpu
} from 'lucide-react';
import { SignOutButton } from './SignOutButton.tsx';
import { listContracts, type ContractListing } from '../lib/api.ts';
import { currentFarmId, farmHref } from '../lib/onboardFiles.ts';
import type { AseanPreset } from '../types';
import { organicPremiumPerHa } from '../data/presets';

export interface GlobalTopBarProps {
  presets: AseanPreset[];
  activePreset: AseanPreset;
  onSelectPreset: (preset: AseanPreset) => void;
  isSimulating: boolean;
  onRunScenario: () => void;
  activeAgentCount: number;
  onOpenAgents: () => void;
  onOpenCommandPalette: () => void;
  onExportSnapshot: () => void;
  onExportGeoJSON?: () => void;
  onExportAgriScript?: () => void;
  onOpenTour: () => void;
  isSplitView: boolean;
  onToggleSplit: () => void;
  inspectorOpen: boolean;
  onToggleInspector: () => void;
  outputDrawerOpen: boolean;
  onToggleOutputDrawer: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenGoogleEarth?: () => void;
  onOpenPerformance?: () => void;
}

const BRING_FARM = '__bring_your_farm__';

export const GlobalTopBar: React.FC<GlobalTopBarProps> = ({
  presets,
  activePreset,
  onSelectPreset,
  isSimulating,
  onRunScenario,
  activeAgentCount = 7,
  onOpenAgents,
  onOpenCommandPalette,
  onExportSnapshot,
  onExportGeoJSON,
  onExportAgriScript,
  onOpenTour,
  isSplitView,
  onToggleSplit,
  inspectorOpen,
  onToggleInspector,
  outputDrawerOpen,
  onToggleOutputDrawer,
  theme,
  onToggleTheme,
  onOpenGoogleEarth,
  onOpenPerformance
}) => {
  const [envDropdownOpen, setEnvDropdownOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const [farms, setFarms] = useState<ContractListing[]>([]);
  const farmId = currentFarmId(window.location.search);

  const envRef = useRef<HTMLDivElement | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const overflowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (envRef.current && !envRef.current.contains(target)) setEnvDropdownOpen(false);
      if (exportRef.current && !exportRef.current.contains(target)) setExportMenuOpen(false);
      if (overflowRef.current && !overflowRef.current.contains(target)) setOverflowMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    let live = true;
    listContracts()
      .then((body) => live && setFarms(body.contracts))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const farmOptions = farms.some((f) => f.farm_id === farmId) ? farms : [{ farm_id: farmId, name: null }, ...farms];

  return (
    <header className="h-11 bg-[var(--surface-base)] border-b border-[var(--border-default)] flex items-center justify-between px-3 text-xs select-none z-30 shrink-0">
      {/* 1. Left: AgriQuill Logo + Compact Version Badge */}
      <div className="flex items-center space-x-2.5 shrink-0">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-md bg-[var(--surface-raised)] border border-[var(--border-default)] flex items-center justify-center text-[var(--accent)]">
            <Sprout className="w-3.5 h-3.5 text-[var(--accent)]" aria-hidden="true" />
          </div>
          <span className="font-semibold text-xs tracking-tight text-[var(--text-primary)]">
            AgriQuill
          </span>
        </div>
        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-[var(--text-tertiary)] bg-[var(--surface-sunken)] border border-[var(--border-subtle)]">
          BETA v0.9.4
        </span>
      </div>

      {/* 2. Center: Command Search & Combined Environment Context */}
      <div className="flex items-center space-x-2.5 max-w-xl flex-1 justify-center px-4">
        {/* Command Search */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="flex items-center justify-between px-2.5 py-1 rounded-md bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition text-[11px] w-56 md:w-64"
          title="Open Command Palette (Ctrl+K or ⌘K)"
          aria-label="Search or run a command"
        >
          <div className="flex items-center space-x-2 truncate">
            <Search className="w-3 h-3 text-[var(--text-tertiary)] shrink-0" aria-hidden="true" />
            <span className="truncate">Search or run a command…</span>
          </div>
          <kbd className="hidden sm:inline-block px-1.5 py-0.2 text-[9px] font-mono text-[var(--text-tertiary)] bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded shadow-2xs">
            ⌘K
          </kbd>
        </button>

        {/* Environment Context: Combined Selector */}
        <div className="relative" ref={envRef}>
          <button
            type="button"
            onClick={() => setEnvDropdownOpen(!envDropdownOpen)}
            aria-expanded={envDropdownOpen}
            className={`flex items-center space-x-2 px-2.5 py-1 rounded-md border text-[11px] transition ${
              envDropdownOpen
                ? 'bg-[var(--surface-raised)] border-[var(--border-strong)] text-[var(--text-primary)]'
                : 'bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            title="Active Agroecological Environment Context (Country, Region, Crop, Variety)"
          >
            <span className="text-xs" aria-hidden="true">{activePreset.flag}</span>
            <span className="font-medium text-[var(--text-primary)] truncate max-w-[190px]">
              {activePreset.country} · {activePreset.crop}
            </span>
            <ChevronDown className="w-3 h-3 text-[var(--text-tertiary)] shrink-0" aria-hidden="true" />
          </button>

          {/* Environment Dropdown Popover */}
          {envDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-80 max-h-96 overflow-y-auto rounded-lg bg-[var(--surface-base)] border border-[var(--border-default)] shadow-lg z-50 p-1.5 space-y-1">
              <div className="px-2 py-1 text-[10px] uppercase font-semibold text-[var(--text-tertiary)] tracking-wider border-b border-[var(--border-subtle)] mb-1 flex justify-between">
                <span>Select Production Template</span>
                <span>11 ASEAN Nations</span>
              </div>
              {presets.map((p) => {
                const isSelected = p.id === activePreset.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onSelectPreset(p);
                      setEnvDropdownOpen(false);
                    }}
                    className={`w-full text-left p-2 rounded-md transition flex items-start justify-between text-xs ${
                      isSelected
                        ? 'bg-[var(--surface-raised)] border-l-2 border-l-[var(--accent)] text-[var(--text-primary)]'
                        : 'hover:bg-[var(--surface-hover)] text-[var(--text-secondary)]'
                    }`}
                  >
                    <div className="space-y-0.5 min-w-0 pr-2">
                      <div className="flex items-center space-x-1.5 font-medium text-[var(--text-primary)]">
                        <span>{p.flag}</span>
                        <span>{p.country}</span>
                        <span className="text-[10px] text-[var(--text-tertiary)] font-normal">({p.region})</span>
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] truncate">
                        {p.crop} · <span className="font-mono">{p.variety}</span>
                      </div>
                      <div className="text-[10px] font-mono text-[var(--accent)]">
                        Water -{p.waterReduction}% · Yield {p.targetYield} t/ha
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-[var(--accent)] shrink-0 mt-0.5">
                      +${Math.round(organicPremiumPerHa(p))}/ha
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <select
          aria-label="Farm"
          title="Farm"
          value={farmId}
          onChange={(e) => {
            if (e.target.value === BRING_FARM) {
              onOpenGoogleEarth?.();
              return;
            }
            const { pathname, search, hash } = window.location;
            window.location.assign(`${pathname}${farmHref(search, e.target.value)}${hash}`);
          }}
          className="px-2 py-1 rounded-md bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-primary)] text-[11px] max-w-[180px] truncate"
        >
          {farmOptions.map((f) => (
            <option key={f.farm_id} value={f.farm_id}>
              {f.name ? `${f.name} (${f.farm_id})` : f.farm_id}
            </option>
          ))}
          {onOpenGoogleEarth && <option value={BRING_FARM}>Bring your farm…</option>}
        </select>
      </div>

      {/* 3. Right: Agent Status, Primary "Run Scenario", Export Menu, Overflow Menu, Avatar */}
      <div className="flex items-center space-x-2 shrink-0">
        {/* Agent Status Control */}
        <button
          type="button"
          onClick={onOpenAgents}
          className="flex items-center space-x-1.5 px-2 py-1 rounded-md bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition text-[11px]"
          title="Autonomous Multi-Agent Swarm Status"
        >
          <Bot className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" aria-hidden="true" />
          <span className="font-mono">Agents · {activeAgentCount}</span>
        </button>

        {/* The ONLY Prominent Filled Accent Button: "Run Scenario" / "Stop Run" */}
        <button
          type="button"
          onClick={onRunScenario}
          className={`flex items-center space-x-1.5 px-3 py-1 rounded-md font-semibold text-[11px] shadow-sm transition active:scale-95 ${
            isSimulating
              ? 'bg-[var(--status-warning)] text-slate-950 hover:opacity-90'
              : 'bg-[var(--accent-strong)] text-white hover:bg-[var(--accent)]'
          }`}
          title={isSimulating ? 'Stop active scenario execution' : 'Execute complete 120-day physiological crop scenario'}
        >
          {isSimulating ? (
            <>
              <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              <span>Stop Run</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              <span>Run Scenario</span>
            </>
          )}
        </button>

        {/* Export Menu */}
        <div className="relative" ref={exportRef}>
          <button
            type="button"
            onClick={() => setExportMenuOpen(!exportMenuOpen)}
            aria-expanded={exportMenuOpen}
            className="flex items-center space-x-1 px-2 py-1 rounded-md bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition text-[11px]"
            title="Export workspace artifacts and ledger"
            aria-label="Export menu"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden xl:inline">Export</span>
            <ChevronDown className="w-3 h-3 text-[var(--text-tertiary)]" aria-hidden="true" />
          </button>

          {exportMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 rounded-lg bg-[var(--surface-base)] border border-[var(--border-default)] shadow-lg z-50 p-1 space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  onExportSnapshot();
                  setExportMenuOpen(false);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[var(--surface-hover)] text-xs text-[var(--text-primary)] flex items-center space-x-2"
              >
                <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>Download Workspace Snapshot</span>
              </button>
              {onExportGeoJSON && (
                <button
                  type="button"
                  onClick={() => {
                    onExportGeoJSON();
                    setExportMenuOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[var(--surface-hover)] text-xs text-[var(--text-primary)] flex items-center space-x-2"
                >
                  <Globe2 className="w-3.5 h-3.5 text-cyan-500" />
                  <span>Export Parcel GeoJSON</span>
                </button>
              )}
              {onExportAgriScript && (
                <button
                  type="button"
                  onClick={() => {
                    onExportAgriScript();
                    setExportMenuOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[var(--surface-hover)] text-xs text-[var(--text-primary)] flex items-center space-x-2"
                >
                  <FileCode className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Export .agri DSL Script</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Global Overflow Menu */}
        <div className="relative" ref={overflowRef}>
          <button
            type="button"
            onClick={() => setOverflowMenuOpen(!overflowMenuOpen)}
            aria-expanded={overflowMenuOpen}
            className="p-1.5 rounded-md bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
            title="More actions and view layout settings"
            aria-label="Overflow menu"
          >
            <MoreHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
          </button>

          {overflowMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 rounded-lg bg-[var(--surface-base)] border border-[var(--border-default)] shadow-lg z-50 p-1.5 space-y-1 text-xs text-[var(--text-secondary)]">
              <div className="px-2 py-0.5 text-[10px] uppercase font-semibold text-[var(--text-tertiary)] tracking-wider">
                View Layout
              </div>
              <button
                type="button"
                onClick={() => {
                  onToggleInspector();
                  setOverflowMenuOpen(false);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-[var(--surface-hover)] text-[var(--text-primary)] flex items-center justify-between"
              >
                <span>Right Inspector</span>
                <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                  {inspectorOpen ? 'Visible (⌘I)' : 'Hidden (⌘I)'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleOutputDrawer();
                  setOverflowMenuOpen(false);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-[var(--surface-hover)] text-[var(--text-primary)] flex items-center justify-between"
              >
                <span>Output Drawer</span>
                <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                  {outputDrawerOpen ? 'Visible (⌘J)' : 'Hidden (⌘J)'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleSplit();
                  setOverflowMenuOpen(false);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-[var(--surface-hover)] text-[var(--text-primary)] flex items-center justify-between"
              >
                <span>Split Layout (Editor + Scene)</span>
                <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                  {isSplitView ? 'Active' : 'Off'}
                </span>
              </button>

              <div className="h-px bg-[var(--border-subtle)] my-1" />

              <div className="px-2 py-0.5 text-[10px] uppercase font-semibold text-[var(--text-tertiary)] tracking-wider">
                Tools & Spatial
              </div>
              {onOpenGoogleEarth && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenGoogleEarth();
                    setOverflowMenuOpen(false);
                  }}
                  className="w-full text-left px-2 py-1 rounded hover:bg-[var(--surface-hover)] text-[var(--text-primary)] flex items-center space-x-2"
                >
                  <Globe2 className="w-3.5 h-3.5 text-cyan-500" />
                  <span>Bring your farm or import land…</span>
                </button>
              )}
              {onOpenPerformance && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenPerformance();
                    setOverflowMenuOpen(false);
                  }}
                  className="w-full text-left px-2 py-1 rounded hover:bg-[var(--surface-hover)] text-[var(--text-primary)] flex items-center space-x-2"
                >
                  <Cpu className="w-3.5 h-3.5 text-purple-500" />
                  <span>Developer Performance HUD</span>
                </button>
              )}

              <div className="h-px bg-[var(--border-subtle)] my-1" />

              <div className="px-2 py-0.5 text-[10px] uppercase font-semibold text-[var(--text-tertiary)] tracking-wider">
                Preferences & Help
              </div>
              <button
                type="button"
                onClick={() => {
                  onToggleTheme();
                  setOverflowMenuOpen(false);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-[var(--surface-hover)] text-[var(--text-primary)] flex items-center justify-between"
              >
                <div className="flex items-center space-x-2">
                  {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-cyan-600" />}
                  <span>Appearance</span>
                </div>
                <span className="font-mono text-[10px] text-[var(--text-tertiary)] capitalize">
                  {theme}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenTour();
                  setOverflowMenuOpen(false);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-[var(--surface-hover)] text-[var(--text-primary)] flex items-center space-x-2"
              >
                <HelpCircle className="w-3.5 h-3.5 text-emerald-500" />
                <span>Quick Tour & Architecture</span>
              </button>
            </div>
          )}
        </div>

        <SignOutButton className="px-2 py-1 rounded-md bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition text-[11px]" />
        {/* User Avatar */}
        <div
          className="w-6 h-6 rounded-full bg-[var(--surface-raised)] border border-[var(--border-default)] flex items-center justify-center font-mono text-[10px] font-semibold text-[var(--text-primary)] shadow-2xs"
          title="Operator: Linn Htet Aung (Agricultural Lead)"
          aria-label="User profile: Linn Htet Aung"
        >
          LH
        </div>
      </div>
    </header>
  );
};
