import React, { useEffect, useRef, useState } from 'react';
import { createPopper, type Instance as PopperInstance } from '@popperjs/core';
import {
  Play,
  Satellite,
  GitCommit,
  ChevronDown,
  Activity,
  RefreshCw,
  Search,
  Columns,
  Sprout,
  Globe2,
  Bot,
  Wind,
  Sun,
  Moon
} from 'lucide-react';
import type { AseanPreset } from '../types';
import { organicPremiumPerHa } from '../data/presets';

interface HeaderProps {
  presets: AseanPreset[];
  activePreset: AseanPreset;
  onSelectPreset: (preset: AseanPreset) => void;
  onSimulate: () => void;
  isSimulating: boolean;
  onFetchSatellite: () => void;
  isFetchingData: boolean;
  onCommit: () => void;
  onOpenCommandPalette: () => void;
  isSplitView: boolean;
  onToggleSplit: () => void;
  onOpenGoogleEarth?: () => void;
  activeEarthParcelName?: string;
  onOpenAgentStudio?: () => void;
  activeAgentCount?: number;
  windSpeedMs?: number;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  presets,
  activePreset,
  onSelectPreset,
  onSimulate,
  isSimulating,
  onFetchSatellite,
  isFetchingData,
  onCommit,
  onOpenCommandPalette,
  isSplitView,
  onToggleSplit,
  onOpenGoogleEarth,
  activeEarthParcelName,
  onOpenAgentStudio,
  activeAgentCount = 4,
  windSpeedMs = 3.4,
  theme = 'dark',
  onToggleTheme
}) => {
  const [presetDropdownOpen, setPresetDropdownOpen] = useState(false);
  const presetTriggerRef = useRef<HTMLButtonElement | null>(null);
  const presetMenuRef = useRef<HTMLDivElement | null>(null);
  const popperRef = useRef<PopperInstance | null>(null);

  // Popper owns positioning (flip/shift keep the 11-preset menu inside the
  // viewport); React owns open state. The instance lives only while open.
  useEffect(() => {
    if (!presetDropdownOpen) return;
    const trigger = presetTriggerRef.current;
    const menu = presetMenuRef.current;
    if (!trigger || !menu) return;
    const popper = createPopper(trigger, menu, {
      placement: 'bottom',
      strategy: 'fixed',
      modifiers: [
        { name: 'offset', options: { offset: [0, 6] } },
        { name: 'flip', options: { fallbackPlacements: ['bottom-start', 'bottom-end', 'top'] } },
        { name: 'preventOverflow', options: { padding: 8 } }
      ]
    });
    popperRef.current = popper;
    return () => {
      popper.destroy();
      popperRef.current = null;
    };
  }, [presetDropdownOpen]);

  // Escape closes and returns focus to the trigger; outside pointer-down
  // closes without stealing focus. Popper alone positions — it never
  // supplies these behaviours.
  useEffect(() => {
    if (!presetDropdownOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPresetDropdownOpen(false);
        presetTriggerRef.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        !presetMenuRef.current?.contains(target) &&
        !presetTriggerRef.current?.contains(target)
      ) {
        setPresetDropdownOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [presetDropdownOpen]);

  return (
    <header className="h-11 bg-[var(--surface-sunken)] border-b border-[var(--border-default)] flex items-center justify-between px-3 text-xs select-none z-30">
      {/* Left: Product Brand & Breadcrumbs */}
      <div className="brand-block flex items-center space-x-3">
        <div className="flex items-center space-x-2">
          <span className="p-1.5 rounded-md bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--accent)] flex items-center justify-center">
            <Sprout className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
          </span>
          <div className="flex items-center space-x-1.5 font-bold tracking-tight text-[var(--text-primary)]">
            <span translate="no" className="text-[13px] font-semibold text-[var(--text-primary)]">
              AgriQuill IDE
            </span>
          </div>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-[var(--surface-raised)] text-[var(--accent)] border border-[var(--border-default)]">
            BETA v0.9.4
          </span>
        </div>

        {/* Breadcrumb Path */}
        <div className="brand-crumb hidden xl:flex items-center space-x-1.5 text-[var(--text-tertiary)] text-[11px] font-mono shrink-0 pl-2 border-l border-[var(--border-default)]">
          <span>AgroGuard-Lite</span>
          <span>/</span>
          <span>parcels</span>
          <span>/</span>
          <span className="text-[var(--text-primary)] font-medium">{activePreset.id}_field_01.agri</span>
        </div>
      </div>

      {/* Center: Command Palette Search Bar & 11 ASEAN Preset Selector */}
      <div className="header-search flex items-center space-x-2">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="flex items-center space-x-2 px-3 py-1 rounded-md bg-[var(--surface-raised)] hover:bg-[var(--surface-hover)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-white transition shadow-sm text-[11px] focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
        >
          <Search className="w-3.5 h-3.5 text-[var(--text-tertiary)]" aria-hidden="true" />
          <span className="header-search-label font-sans">Search or run command…</span>
          <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-hover)] text-[10px] text-[var(--text-secondary)] font-mono ml-2 border border-[var(--border-default)]">
            ⌘K
          </kbd>
        </button>

        {/* 11 ASEAN Preset Selector Dropdown */}
        <div className="relative shrink-0">
          <button
            ref={presetTriggerRef}
            type="button"
            onClick={() => setPresetDropdownOpen(!presetDropdownOpen)}
            aria-expanded={presetDropdownOpen}
            aria-haspopup="menu"
            className="flex items-center space-x-2 px-2.5 py-1 rounded-md bg-[var(--surface-raised)] hover:bg-[var(--surface-hover)] border border-[var(--border-strong)] text-[var(--text-primary)] transition shadow-sm focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          >
            <span className="text-sm" aria-hidden="true">{activePreset.flag}</span>
            <span className="font-semibold text-[11px] text-[var(--accent)]">{activePreset.country}:</span>
            <span className="text-[11px] text-[var(--text-secondary)] truncate max-w-[130px]">{activePreset.crop}</span>
            <ChevronDown className="w-3 h-3 text-[var(--text-tertiary)]" aria-hidden="true" />
          </button>

          {presetDropdownOpen && (
            <div
              ref={presetMenuRef}
              role="menu"
              aria-label="ASEAN enterprise presets"
              className="w-80 max-h-96 overflow-y-auto bg-[var(--surface-base)] border border-[var(--border-strong)] rounded-lg shadow-2xl p-1.5 z-50"
            >
              <div className="px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] border-b border-[var(--border-default)] flex justify-between items-center">
                <span>ASEAN Regional Presets</span>
                <span className="text-[10px] text-[var(--text-tertiary)] font-normal">11 verified templates</span>
              </div>
              <div className="py-1 space-y-0.5">
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    role="menuitemradio"
                    aria-checked={activePreset.id === preset.id}
                    onClick={() => {
                      onSelectPreset(preset);
                      setPresetDropdownOpen(false);
                      presetTriggerRef.current?.focus();
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left transition ${
                      activePreset.id === preset.id
                        ? 'bg-[var(--accent-subtle)] border border-[var(--accent)]/30 text-[var(--accent)]'
                        : 'hover:bg-[var(--surface-hover)] text-[var(--text-primary)]'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <span className="text-base" aria-hidden="true">{preset.flag}</span>
                      <div className="truncate">
                        <div className="font-medium text-[11px]">{preset.country}</div>
                        <div className="text-[10px] text-[var(--text-tertiary)] truncate">{preset.crop}</div>
                      </div>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-hover)] text-[var(--status-simulated)] font-mono">
                      +${Math.round(organicPremiumPerHa(preset))}/ha
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Google Earth Land Importer Trigger */}
        {onOpenGoogleEarth && (
          <button
            type="button"
            onClick={onOpenGoogleEarth}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-500/40 text-cyan-300 transition text-[11px] shadow-sm font-medium"
            title="Import real-world digital elevation models and boundaries from Google Earth & Sentinel-2"
          >
            <Globe2 className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
            <span className="hidden xl:inline">{activeEarthParcelName || 'Google Earth GIS'}</span>
            <span className="xl:hidden">Earth GIS</span>
          </button>
        )}

        {/* AI Agent Swarm Hub Trigger */}
        {onOpenAgentStudio && (
          <button
            type="button"
            onClick={onOpenAgentStudio}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/40 text-emerald-300 transition text-[11px] shadow-sm font-medium"
            title="Open Autonomous Multi-Agent Swarm & FastMCP Tool Orchestration"
          >
            <Bot className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
            <span>AI Agents ({activeAgentCount})</span>
          </button>
        )}
      </div>

      {/* Right: Layout Toggle, Planetary Ingest, Simulation Trigger, and Commit */}
      <div className="header-actions flex items-center space-x-2 shrink-0">
        {/* Quick Theme Toggle */}
        {onToggleTheme && (
          <button
            type="button"
            onClick={onToggleTheme}
            className="flex items-center space-x-1.5 px-2 py-1 rounded-md bg-[var(--surface-raised)] hover:bg-[var(--surface-hover)] border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition text-[11px] focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            aria-label={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          >
            {theme === 'dark' ? (
              <Sun className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-cyan-600" aria-hidden="true" />
            )}
            <span className="header-action-label hidden lg:inline">{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onToggleSplit}
          className={`flex items-center space-x-1.5 px-2 py-1 rounded-md border text-[11px] transition focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
            isSplitView
              ? 'bg-[var(--accent-subtle)] border-[var(--accent)]/40 text-[var(--accent)]'
              : 'bg-[var(--surface-raised)] hover:bg-[var(--surface-hover)] border-[var(--border-strong)] text-[var(--text-secondary)]'
          }`}
          title="Toggle Split-Screen Layout (Code Editor + Spatial Canvas)"
        >
          <Columns className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="header-action-label hidden md:inline">{isSplitView ? 'Split: ON' : 'Split: OFF'}</span>
        </button>

        {/* Fetch Satellite & Soil Button */}
        <button
          type="button"
          onClick={onFetchSatellite}
          disabled={isFetchingData}
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-[var(--surface-raised)] hover:bg-[var(--surface-hover)] border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition text-[11px] focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-50"
          title="Simulated load of example SAR, NDVI and soil-profile fixtures. No API is called."
        >
          {isFetchingData ? (
            <RefreshCw className="w-3.5 h-3.5 text-[var(--status-simulated)] animate-spin" aria-hidden="true" />
          ) : (
            <Satellite className="w-3.5 h-3.5 text-[var(--status-simulated)]" aria-hidden="true" />
          )}
          <span className="header-action-label hidden sm:inline">Load Demo</span>
        </button>

        {/* Simulate Area Button */}
        <button
          type="button"
          onClick={onSimulate}
          className={`flex items-center space-x-1.5 px-3 py-1 rounded-md font-medium shadow-sm transition text-[11px] active:scale-95 focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
            isSimulating
              ? 'bg-[var(--status-warning)] text-[var(--surface-sunken)] hover:opacity-90'
              : 'bg-[var(--accent-strong)] text-[var(--surface-sunken)] hover:opacity-90'
          }`}
        >
          {isSimulating ? (
            <Activity className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
          )}
          <span className="header-action-label">{isSimulating ? 'Pause Replay' : 'Replay Season'}</span>
        </button>

        {/* Commit to Main Ledger */}
        <button
          type="button"
          onClick={onCommit}
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] border border-[var(--border-strong)] text-[var(--text-primary)] font-medium transition text-[11px] focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          title="Append an example decision record to the in-memory demo ledger"
        >
          <GitCommit className="w-3.5 h-3.5 text-[var(--status-simulated)]" aria-hidden="true" />
          <span className="header-action-label hidden md:inline">Save Record</span>
        </button>
      </div>
    </header>
  );
};