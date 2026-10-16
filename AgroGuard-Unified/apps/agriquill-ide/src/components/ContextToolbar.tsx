import React, { useEffect, useRef, useState } from 'react';
import {
  Layers,
  ChevronDown,
  Check,
  Eye,
  EyeOff,
  Sliders,
  Ruler,
  SplitSquareVertical,
  RotateCcw,
  Sparkles,
  Mountain,
  Droplets,
  Plane,
  Radio,
  FileCode,
  ShieldCheck,
  AlertTriangle,
  Play,
  MoreHorizontal
} from 'lucide-react';
import type { LayerId } from './scene/FieldScene';

export interface ContextToolbarProps {
  activeMode: string;
  parcelName: string;
  onOpenParcelPicker?: () => void;
  baseLayer: LayerId;
  onChangeBaseLayer: (layer: LayerId) => void;
  layerOpacity: number;
  onChangeOpacity: (opacity: number) => void;
  waterStageM: number;
  onChangeWaterStage: (stage: number) => void;
  reliefExaggeration: number;
  onChangeRelief: (relief: number) => void;
  droneVisible: boolean;
  onToggleDrone: () => void;
  compareMode: boolean;
  onToggleCompare: () => void;
  measureMode: boolean;
  onToggleMeasure: () => void;
  onResetView: () => void;
  hasLintError?: boolean;
  onFixLint?: () => void;
  activeFile?: string;
}

export const ContextToolbar: React.FC<ContextToolbarProps> = ({
  activeMode,
  parcelName,
  onOpenParcelPicker,
  baseLayer,
  onChangeBaseLayer,
  layerOpacity,
  onChangeOpacity,
  waterStageM,
  onChangeWaterStage,
  reliefExaggeration,
  onChangeRelief,
  droneVisible,
  onToggleDrone,
  compareMode,
  onToggleCompare,
  measureMode,
  onToggleMeasure,
  onResetView,
  hasLintError = false,
  onFixLint,
  activeFile = 'field_01_paddy.agri'
}) => {
  const [layersOpen, setLayersOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const layersRef = useRef<HTMLDivElement | null>(null);
  const moreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (layersRef.current && !layersRef.current.contains(target)) setLayersOpen(false);
      if (moreRef.current && !moreRef.current.contains(target)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const baseLayerLabels: Record<LayerId, string> = {
    imagery: 'Optical (Sentinel-2)',
    relief: 'Terrain Relief (synthetic)',
    ndvi: 'Vegetation NDVI Canopy',
    elevation: 'Elevation DEM Model'
  };

  return (
    <div
      className="h-9 px-3 bg-[var(--surface-base)] border-b border-[var(--border-default)] flex items-center justify-between text-xs select-none z-10 shrink-0"
      role="toolbar"
      aria-label="Contextual workbench toolbar"
    >
      {/* SPATIAL CONTEXTUAL ACTIONS */}
      {activeMode === 'spatial' && (
        <div className="flex items-center space-x-2 w-full justify-between">
          <div className="flex items-center space-x-2">
            {/* 1. Select Field */}
            <button
              type="button"
              onClick={onOpenParcelPicker}
              className="flex items-center space-x-1 px-2 py-1 rounded bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-primary)] font-medium text-[11px] transition"
              title="Select or switch agricultural parcel"
            >
              <span className="truncate max-w-[140px]">{parcelName}</span>
              <ChevronDown className="w-3 h-3 text-[var(--text-tertiary)]" />
            </button>

            {/* 2. Currently Selected Base Layer Compact Chip */}
            <span className="hidden sm:inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-[var(--surface-sunken)] text-[var(--text-secondary)] text-[10px] font-mono border border-[var(--border-subtle)]">
              <span>Layer:</span>
              <span className="font-semibold text-[var(--accent)]">{baseLayerLabels[baseLayer]}</span>
            </span>

            {/* 3. Layers Popover Button */}
            <div className="relative" ref={layersRef}>
              <button
                type="button"
                onClick={() => setLayersOpen(!layersOpen)}
                aria-expanded={layersOpen}
                className={`flex items-center space-x-1.5 px-2 py-1 rounded text-[11px] font-medium border transition ${
                  layersOpen
                    ? 'bg-[var(--accent-subtle)] border-[var(--accent)]/40 text-[var(--accent)]'
                    : 'bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Manage optical, NDVI, terrain, and operational layers"
              >
                <Layers className="w-3 h-3 text-cyan-500" />
                <span>Layers</span>
                <ChevronDown className="w-3 h-3 text-[var(--text-tertiary)]" />
              </button>

              {/* Categorized Layers Popover Panel */}
              {layersOpen && (
                <div className="absolute top-full left-0 mt-1 w-80 max-h-[460px] overflow-y-auto rounded-lg bg-[var(--surface-base)] border border-[var(--border-default)] shadow-xl z-50 p-2.5 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between pb-1 border-b border-[var(--border-subtle)]">
                    <span className="font-semibold text-[var(--text-primary)] text-[11px] uppercase tracking-wider">
                      Geospatial Data Layers
                    </span>
                    <span className="text-[10px] font-mono text-[var(--text-tertiary)]">5 Categories</span>
                  </div>

                  {/* Group 1: Base */}
                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
                      Base Layers
                    </div>
                    {[
                      { id: 'imagery' as LayerId, name: 'Optical Satellite', prov: 'SYNTHETIC', fresh: 'rendered, not imagery' },
                      { id: 'relief' as LayerId, name: 'Shaded Terrain Relief', prov: 'SYNTHETIC', fresh: 'procedural, no DEM' },
                    ].map(row => (
                      <div
                        key={row.id}
                        onClick={() => onChangeBaseLayer(row.id)}
                        className={`flex items-center justify-between p-1.5 rounded cursor-pointer transition ${
                          baseLayer === row.id ? 'bg-[var(--surface-raised)] font-medium text-[var(--text-primary)]' : 'hover:bg-[var(--surface-hover)] text-[var(--text-secondary)]'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            name="baseLayer"
                            checked={baseLayer === row.id}
                            onChange={() => onChangeBaseLayer(row.id)}
                            className="accent-[var(--accent)]"
                          />
                          <span className="text-xs">{row.name}</span>
                        </div>
                        <div className="flex items-center space-x-1.5 font-mono text-[9px]">
                          <span className="px-1 py-0.2 rounded bg-amber-500/10 text-amber-500 font-bold border border-amber-500/20">
                            [{row.prov}]
                          </span>
                          <span className="text-[var(--text-tertiary)]">{row.fresh}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Group 2: Vegetation */}
                  <div className="space-y-1 pt-1 border-t border-[var(--border-subtle)]">
                    <div className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
                      Vegetation & Canopy
                    </div>
                    <div
                      onClick={() => onChangeBaseLayer('ndvi')}
                      className={`flex items-center justify-between p-1.5 rounded cursor-pointer transition ${
                        baseLayer === 'ndvi' ? 'bg-[var(--surface-raised)] font-medium text-[var(--text-primary)]' : 'hover:bg-[var(--surface-hover)] text-[var(--text-secondary)]'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name="baseLayer"
                          checked={baseLayer === 'ndvi'}
                          onChange={() => onChangeBaseLayer('ndvi')}
                          className="accent-[var(--accent)]"
                        />
                        <span className="text-xs">NDVI Canopy Health</span>
                      </div>
                      <div className="flex items-center space-x-1.5 font-mono text-[9px]">
                        <span className="px-1 py-0.2 rounded bg-amber-500/10 text-amber-500 font-bold border border-amber-500/20">
                          [SYNTHETIC]
                        </span>
                        <span className="text-[var(--text-tertiary)]">no imagery source</span>
                      </div>
                    </div>
                  </div>

                  {/* Group 3: Land & DEM */}
                  <div className="space-y-1 pt-1 border-t border-[var(--border-subtle)]">
                    <div className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
                      Land & Topography
                    </div>
                    <div
                      onClick={() => onChangeBaseLayer('elevation')}
                      className={`flex items-center justify-between p-1.5 rounded cursor-pointer transition ${
                        baseLayer === 'elevation' ? 'bg-[var(--surface-raised)] font-medium text-[var(--text-primary)]' : 'hover:bg-[var(--surface-hover)] text-[var(--text-secondary)]'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name="baseLayer"
                          checked={baseLayer === 'elevation'}
                          onChange={() => onChangeBaseLayer('elevation')}
                          className="accent-[var(--accent)]"
                        />
                        <span className="text-xs">Digital Elevation Model</span>
                      </div>
                      <div className="flex items-center space-x-1.5 font-mono text-[9px]">
                        <span className="px-1 py-0.2 rounded bg-amber-500/10 text-amber-500 font-bold border border-amber-500/20">
                          [SYNTHETIC]
                        </span>
                        <span className="text-[var(--text-tertiary)]">procedural relief</span>
                      </div>
                    </div>
                    {/* Relief Exaggeration Slider */}
                    <div className="p-1.5 bg-[var(--surface-sunken)] rounded text-[11px] space-y-1">
                      <div className="flex justify-between text-[10px] text-[var(--text-secondary)] font-mono">
                        <span>Terrain Relief Exaggeration</span>
                        <span className="text-[var(--accent)] font-semibold">×{reliefExaggeration}</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="220"
                        value={reliefExaggeration}
                        onChange={(e) => onChangeRelief(Number(e.target.value))}
                        className="w-full accent-[var(--accent)] h-1"
                      />
                    </div>
                  </div>

                  {/* Group 4: Environment & AWD Water Stage */}
                  <div className="space-y-1 pt-1 border-t border-[var(--border-subtle)]">
                    <div className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
                      Environment & Hydrology
                    </div>
                    <div className="p-1.5 bg-[var(--surface-sunken)] rounded text-[11px] space-y-1">
                      <div className="flex justify-between text-[10px] text-[var(--text-secondary)] font-mono">
                        <span className="flex items-center space-x-1">
                          <Droplets className="w-3 h-3 text-cyan-500" />
                          <span>Water Stage Level</span>
                        </span>
                        <span className="text-cyan-500 font-semibold">{waterStageM.toFixed(2)} m</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1.5"
                        step="0.01"
                        value={waterStageM}
                        onChange={(e) => onChangeWaterStage(Number(e.target.value))}
                        className="w-full accent-cyan-500 h-1"
                      />
                    </div>
                  </div>

                  {/* Group 5: Operations & Drone Flight */}
                  <div className="space-y-1 pt-1 border-t border-[var(--border-subtle)]">
                    <div className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
                      Operations & Field Paths
                    </div>
                    <div className="flex items-center justify-between p-1.5 rounded bg-[var(--surface-sunken)]">
                      <div className="flex items-center space-x-2">
                        <Plane className={`w-3.5 h-3.5 ${droneVisible ? 'text-emerald-500' : 'text-slate-400'}`} />
                        <span className="text-xs">Autonomous Drone Scout</span>
                      </div>
                      <button
                        type="button"
                        onClick={onToggleDrone}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                          droneVisible
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
                            : 'bg-slate-500/10 text-slate-400'
                        }`}
                      >
                        {droneVisible ? 'Active' : 'Muted'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 4. Compare Tool */}
            <button
              type="button"
              onClick={onToggleCompare}
              className={`flex items-center space-x-1 px-2 py-1 rounded text-[11px] border transition ${
                compareMode
                  ? 'bg-[var(--accent-subtle)] border-[var(--accent)]/40 text-[var(--accent)] font-medium'
                  : 'bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title="Compare AWD vs Continuous Flooding"
            >
              <SplitSquareVertical className="w-3 h-3" />
              <span>Compare</span>
            </button>

            {/* 5. Measure Tool */}
            <button
              type="button"
              onClick={onToggleMeasure}
              className={`flex items-center space-x-1 px-2 py-1 rounded text-[11px] border transition ${
                measureMode
                  ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-600 dark:text-cyan-400 font-medium'
                  : 'bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title="Measure field perimeter and distance"
            >
              <Ruler className="w-3 h-3" />
              <span>Measure</span>
            </button>
          </div>

          {/* Right: Camera Reset & More */}
          <div className="flex items-center space-x-1.5">
            <button
              type="button"
              onClick={onResetView}
              className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition"
              title="Reset 3D camera framing"
              aria-label="Reset Camera"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* CODE EDITOR CONTEXTUAL ACTIONS */}
      {activeMode === 'editor' && (
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center space-x-2">
            <span className="font-mono text-[11px] text-[var(--text-primary)] font-medium flex items-center space-x-1.5">
              <FileCode className="w-3.5 h-3.5 text-emerald-500" />
              <span>parcels/{activeFile}</span>
            </span>
            {hasLintError && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-rose-500/10 text-rose-500 border border-rose-500/30 flex items-center space-x-1">
                <AlertTriangle className="w-3 h-3" />
                <span>1 Blocking Diagnostic (ASOA)</span>
              </span>
            )}
          </div>
          {hasLintError && onFixLint && (
            <button
              type="button"
              onClick={onFixLint}
              className="px-2 py-1 rounded bg-[var(--surface-raised)] hover:bg-[var(--surface-hover)] border border-[var(--border-default)] text-[var(--accent)] font-medium text-[11px] transition"
            >
              Review Candidate Alternative
            </button>
          )}
        </div>
      )}

      {/* OTHER MODES (Workflows, Agents, Tests, Knowledge) */}
      {activeMode !== 'spatial' && activeMode !== 'editor' && (
        <div className="flex items-center justify-between w-full">
          <span className="font-medium text-[11px] text-[var(--text-primary)] capitalize">
            {activeMode} Workbench View
          </span>
          <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
            Verified Cyber-Physical Environment
          </span>
        </div>
      )}
    </div>
  );
};
