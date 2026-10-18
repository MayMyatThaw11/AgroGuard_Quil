import React, { Suspense, lazy, useState, useEffect } from 'react';
import { ASEAN_PRESETS, organicPremiumPerHa } from './data/presets';
import type { AseanPreset, CommitRecord, GoogleEarthLandParcel } from './types';
import { GlobalTopBar } from './components/GlobalTopBar';
import { ActivityBar, type ActivityDestination } from './components/ActivityBar';
import { Sidebar } from './components/Sidebar';
import { CodeEditor } from './components/CodeEditor';
import { FieldScenePanel } from './components/scene/FieldScenePanel';
import { SpatialCanvas } from './components/SpatialCanvas';
import type { LayerId } from './components/scene/FieldScene';
import { StatusBar } from './components/StatusBar';
import { WorkflowDAG } from './components/WorkflowDAG';
import { BrainVault } from './components/BrainVault';
import { GitLedger } from './components/GitLedger';
import { ContextInspector } from './components/ContextInspector';
import { ContextToolbar } from './components/ContextToolbar';
import { SimulationTimeline } from './components/SimulationTimeline';
import { OutputDrawer, type OutputDrawerTab } from './components/OutputDrawer';
import { CommandPalette } from './components/CommandPalette';
import { IntuitiveTourModal } from './components/IntuitiveTourModal';
import { GoogleEarthImportModal } from './components/GoogleEarthImportModal';
import { AgentStudio } from './components/AgentStudio';
import { FarmOpsView } from './components/ops/FarmOpsView';
import { PaddySettingsView } from './components/paddy/PaddySettingsView';
import { FleetMonitorView } from './components/fleet/FleetMonitorView';
import { AgronomyView } from './components/agronomy/AgronomyView';
const FarmMapView = lazy(() => import('./components/farmmap/FarmMapView').then((module) => ({ default: module.FarmMapView })));
const TwinWorkspace = lazy(() => import('./components/twin/TwinWorkspace').then((module) => ({ default: module.TwinWorkspace })));
import { REAL_WORLD_EARTH_PARCELS } from './lib/googleEarth';
import { DEMO_FARM_ID, INITIAL_AI_AGENTS } from './lib/agents/agentSystem';
import { deriveReplayMetrics, SEASON_DAYS } from './lib/metrics';
import { buildRecordHash } from './lib/hash';
import { useTheme } from './lib/useTheme';
import { backendHealthy, getTerritoryProfile, runSim } from './lib/api';
import { ChevronRight, ChevronLeft } from 'lucide-react';

export const App: React.FC = () => {
  const { theme, toggle: toggleTheme } = useTheme();
  const [activePreset, setActivePreset] = useState<AseanPreset>(ASEAN_PRESETS[0]);
  // Farm Simulation opens on the 3D farm model; every other view is one click away.
  const [activeDestination, setActiveDestination] = useState<ActivityDestination>('spatial');
  const [activeView, setActiveView] = useState<string>('spatial');
  const [activeFile, setActiveFile] = useState<string>('field_01_paddy.agri');
  const [currentDay, setCurrentDay] = useState<number>(42);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isFetchingData, setIsFetchingData] = useState<boolean>(false);
  const [workflowRunning, setWorkflowRunning] = useState<boolean>(false);
  const [isSplitView, setIsSplitView] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [isTourOpen, setIsTourOpen] = useState<boolean>(false);
  const [activityBarOpen, setActivityBarOpen] = useState<boolean>(true);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(true);
  const [outputDrawerOpen, setOutputDrawerOpen] = useState<boolean>(false);
  const [outputDrawerTab, setOutputDrawerTab] = useState<OutputDrawerTab>('problems');
  const [timelineSpeed, setTimelineSpeed] = useState<1 | 2 | 4>(1);

  // Spatial & Contextual states
  const [baseLayer, setBaseLayer] = useState<LayerId>('imagery');
  const [layerOpacity, setLayerOpacity] = useState<number>(0.68);
  const [waterStageM, setWaterStageM] = useState<number>(0.18);
  const [reliefExaggeration, setReliefExaggeration] = useState<number>(12);
  const [compareMode, setCompareMode] = useState<boolean>(false);
  const [measureMode, setMeasureMode] = useState<boolean>(false);

  // Google Earth Land Import State
  const [importedParcel, setImportedParcel] = useState<GoogleEarthLandParcel>(REAL_WORLD_EARTH_PARCELS[0]);
  const [isGoogleEarthModalOpen, setIsGoogleEarthModalOpen] = useState<boolean>(false);

  const [windSpeedMs, setWindSpeedMs] = useState<number>(3.4);

  // FastMCP Hardware States
  const [mcpValveOpen, setMcpValveOpen] = useState<boolean>(false);
  const [sluiceGateHeight, setSluiceGateHeight] = useState<number>(45);
  const [droneSimulated, setDroneSimulated] = useState<boolean>(true);

  // Initial code template
  const [codeText, setCodeText] = useState<string>(generateAgriCode(ASEAN_PRESETS[0], true));
  const [connection, setConnection] = useState<'offline' | 'connecting' | 'online'>('connecting');
  const [dataFreshness, setDataFreshness] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    backendHealthy().then((ok) => { if (alive) setConnection(ok ? 'online' : 'offline'); });
    return () => { alive = false; };
  }, []);

  const hasLintError = codeText.split('\n').some(line =>
    !line.trim().startsWith('//') && line.includes('synthetic_urea')
  );

  // Keep OutputDrawer closed on startup so the 3D diorama canvas is fully unobstructed;
  // agronomists can toggle it anytime via ⌘J or clicking the status bar error badge.

  // Global Keyboard Shortcuts (⌘K, ⌘B, ⌘⌥B, ⌘I, ⌘J)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsCommandPaletteOpen(open => !open);
      } else if (modifier && event.altKey && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setActivityBarOpen(open => !open);
      } else if (modifier && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setSidebarOpen(open => !open);
      } else if (modifier && event.key.toLowerCase() === 'i') {
        event.preventDefault();
        setInspectorOpen(open => !open);
      } else if (modifier && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        setOutputDrawerOpen(open => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const exportWorkspace = () => {
    const snapshot = JSON.stringify({
      schemaVersion: 1, mode: 'demo', activePreset, codeText,
      currentDay, ledger: commits, exportedAt: new Date().toISOString()
    }, null, 2);
    const url = URL.createObjectURL(new Blob([snapshot], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'farm-simulation-demo-workspace.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const [commits, setCommits] = useState<CommitRecord[]>([]);

  // Load real commits from the backend append-only ledger when reachable;
  // leave the ledger view empty rather than fabricating entries.
  useEffect(() => {
    fetch('/api/v1/agriquill/ledger')
      .then(r => (r.ok ? r.json() : null))
      .then(body => {
        if (body && Array.isArray(body.entries)) {
          interface RawLedgerItem {
            hash?: string;
            timestamp?: string;
            kind?: string;
            payload?: { standard?: string };
          }
          setCommits(body.entries.slice(-20).reverse().map((e: RawLedgerItem) => ({
            hash: String(e.hash ?? '').replace('sha256:', '').slice(0, 7),
            author: 'Farm Simulation Ledger',
            time: String(e.timestamp ?? ''),
            message: String(e.kind ?? ''),
            standard: String(e.payload?.standard ?? ''),
            yieldDelta: ''
          })));
        }
      })
      .catch(() => setDataFreshness('ledger offline — showing empty ledger'));
  }, []);



  // Replay metrics come from one shared derivation so the canvas, dock and
  // HUD cannot report conflicting values for the same quantity.
  const replay = deriveReplayMetrics(currentDay, mcpValveOpen);

  const handleSelectPreset = (preset: AseanPreset) => {
    setActivePreset(preset);
    setCodeText(generateAgriCode(preset, hasLintError));
  };

  const handleSelectEarthParcel = (parcel: GoogleEarthLandParcel) => {
    setImportedParcel(parcel);
    const matchingPreset = ASEAN_PRESETS.find(p => p.country.toLowerCase() === parcel.country.toLowerCase());
    if (matchingPreset) {
      setActivePreset({
        ...matchingPreset,
        lat: parcel.centroid.lat,
        lon: parcel.centroid.lon,
        region: parcel.region
      });
    }
    setWindSpeedMs(parcel.weather.windSpeedMs);
    setCodeText(generateAgriCodeForEarth(parcel, hasLintError));
  };

  const handleFixLint = () => {
    setCodeText((prev) => prev.replaceAll('synthetic_urea', 'AzollaBioCompost'));
  };

  const handleToggleSimulate = () => {
    setIsSimulating((prev) => {
      if (!prev) {
        // Starting: record one real backend sim run (fire-and-forget, honest status).
        runSim(importedParcel ? importedParcel.id : activePreset.id, SEASON_DAYS)
          .then((job) => setDataFreshness(`sim ${job.task_id} ${job.status} · analytic fixture model, not AquaCrop`))
          .catch(() => setDataFreshness('sim offline — replay only'));
      }
      return !prev;
    });
  };

  // Stop is distinct from pause: pause preserves the replay position, stop
  // pauses and rewinds to day 1. The two are never used interchangeably.
  const handleStopReplay = () => {
    setIsSimulating(false);
    setCurrentDay(1);
  };

  const handleFetchSatellite = () => {
    setIsFetchingData(true);
    getTerritoryProfile(activePreset.lat, activePreset.lon)
      .then((p) => setDataFreshness(new Date().toISOString().replace('T', ' ').slice(0, 16) + `Z · ${p.soil_profile.provider}`))
      .catch(() => setDataFreshness('offline — live providers unavailable'))
      .finally(() => setIsFetchingData(false));
  };

  const scenePanelProps = {
    isFetchingData,
    onFetchSatellite: handleFetchSatellite,
    onToggleSimulate: handleToggleSimulate,
    onStopReplay: handleStopReplay,
    onOpenView: setActiveView,
    onOpenPalette: () => setIsCommandPaletteOpen(true),
    importedParcel,
    onOpenGoogleEarthImport: () => setIsGoogleEarthModalOpen(true),
    droneSimulated,
    onToggleDrone: () => setDroneSimulated(!droneSimulated),
    mcpValveOpen,
    windSpeedMs
  };

  const handleSelectDestination = (dest: ActivityDestination) => {
    if (activeDestination === dest) {
      setSidebarOpen(open => !open);
    } else {
      setActiveDestination(dest);
      setSidebarOpen(dest !== 'spatial' && dest !== 'operations' && dest !== 'agronomy');
      if (dest === 'operations') setActiveView('farm-map');
      else if (dest === 'agronomy') setActiveView('agronomy');
      else if (dest === 'spatial') setActiveView('spatial');
      else if (dest === 'workflows') setActiveView('workflow');
      else if (dest === 'agents') setActiveView('agents');
      else if (dest === 'knowledge') setActiveView('vault');
      else if (dest === 'explorer') setActiveView('editor');
      else if (dest === 'tests') setActiveView('spatial');
    }
  };

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if (isSimulating) {
      const stepMs = Math.max(50, Math.round(250 / timelineSpeed));
      timer = setInterval(() => {
        setCurrentDay(d => {
          if (d >= SEASON_DAYS) {
            setIsSimulating(false);
            return SEASON_DAYS;
          }
          return d + 1;
        });
      }, stepMs);
    }
    return () => clearInterval(timer);
  }, [isSimulating, timelineSpeed]);

  const handleCommit = () => {
    if (hasLintError) {
      setActiveView('editor');
      return;
    }
    const newRecord: CommitRecord = {
      hash: buildRecordHash({
        presetId: activePreset.id,
        day: currentDay,
        commitCount: commits.length + 1
      }),
      author: 'Linn Htet Aung',
      time: 'Just now',
      message: `Compile Decision Package: ${activePreset.crop} on main ledger (illustrative water -${activePreset.waterReduction}%)`,
      standard: activePreset.standard,
      yieldDelta: `Example +$${Math.round(organicPremiumPerHa(activePreset))}/ha premium`
    };
    setCommits(previous => [newRecord, ...previous]);
  };

  const showSplitEditor = isSplitView && activeView === 'editor';
  const isFullBleed = activeView === 'spatial' || activeView === 'ops' || activeView === 'paddy-settings' || activeView === 'fleet' || activeView === 'farm-map' || activeView === 'twin' || activeView === 'agronomy';

  const [selectedFarmId, setSelectedFarmId] = useState<string>(
    () => new URLSearchParams(window.location.search).get('farm') || DEMO_FARM_ID
  );
  const [mapFocus, setMapFocus] = useState<{ lat: number; lon: number } | null>(null);

  const openPaddySettings = () => {
    setSidebarOpen(false);
    setActiveView('paddy-settings');
  };

  const returnToOperations = (farmId?: string) => {
    if (farmId) setSelectedFarmId(farmId);
    setActiveDestination('operations');
    setSidebarOpen(false);
    setActiveView('ops');
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[var(--surface-sunken)] text-[var(--text-primary)] font-sans-ui overflow-hidden select-none">
      {/* 1. GLOBAL TOP BAR */}
      <GlobalTopBar
        presets={ASEAN_PRESETS}
        activePreset={activePreset}
        onSelectPreset={handleSelectPreset}
        isSimulating={isSimulating}
        onRunScenario={handleToggleSimulate}
        activeAgentCount={INITIAL_AI_AGENTS.length}
        onOpenAgents={() => {
          setActiveDestination('agents');
          setActiveView('agents');
        }}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onExportSnapshot={exportWorkspace}
        onExportGeoJSON={() => {
          const blob = new Blob([JSON.stringify(importedParcel, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${importedParcel.id}.geojson`;
          a.click();
        }}
        onExportAgriScript={() => {
          const blob = new Blob([codeText], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = activeFile;
          a.click();
        }}
        onOpenTour={() => setIsTourOpen(true)}
        isSplitView={isSplitView}
        onToggleSplit={() => setIsSplitView(!isSplitView)}
        inspectorOpen={inspectorOpen}
        onToggleInspector={() => setInspectorOpen(!inspectorOpen)}
        outputDrawerOpen={outputDrawerOpen}
        onToggleOutputDrawer={() => setOutputDrawerOpen(!outputDrawerOpen)}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenGoogleEarth={() => setIsGoogleEarthModalOpen(true)}
        onOpenPerformance={() => {
          setOutputDrawerOpen(true);
          setOutputDrawerTab('tests');
        }}
      />

      {/* 5. CONTEXTUAL TOOLBAR (Directly above active workbench, non-spatial views) */}
      {!isFullBleed && (
        <ContextToolbar
          activeMode={activeView}
          parcelName={importedParcel ? importedParcel.name : `${activePreset.country} Field #01`}
          onOpenParcelPicker={() => setIsGoogleEarthModalOpen(true)}
          baseLayer={baseLayer}
          onChangeBaseLayer={setBaseLayer}
          layerOpacity={layerOpacity}
          onChangeOpacity={setLayerOpacity}
          waterStageM={waterStageM}
          onChangeWaterStage={setWaterStageM}
          reliefExaggeration={reliefExaggeration}
          onChangeRelief={setReliefExaggeration}
          droneVisible={droneSimulated}
          onToggleDrone={() => setDroneSimulated(!droneSimulated)}
          compareMode={compareMode}
          onToggleCompare={() => setCompareMode(!compareMode)}
          measureMode={measureMode}
          onToggleMeasure={() => setMeasureMode(!measureMode)}
          onResetView={() => {
            setWaterStageM(0.18);
            setReliefExaggeration(12);
            setLayerOpacity(0.68);
          }}
          hasLintError={hasLintError}
          onFixLint={handleFixLint}
          activeFile={activeFile}
        />
      )}

      {/* Main Workspace Body */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* 2. LEFT ACTIVITY BAR (Hideable with smooth sliding transition) */}
        <ActivityBar
          activeDestination={activeDestination}
          onSelectDestination={handleSelectDestination}
          errorCount={hasLintError ? 1 : 0}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(open => !open)}
          activityBarOpen={activityBarOpen}
          onToggleActivityBar={() => setActivityBarOpen(false)}
          onOpenAccount={() => {
            setOutputDrawerOpen(true);
            setOutputDrawerTab('logs');
          }}
          onOpenHelp={() => setIsTourOpen(true)}
          onOpenSettings={openPaddySettings}
          settingsActive={activeView === 'paddy-settings'}
        />

        {/* Floating expand trigger when Activity Bar Rail is collapsed */}
        {!activityBarOpen && (
          <button
            type="button"
            onClick={() => setActivityBarOpen(true)}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-40 px-1 py-3 rounded-r-md bg-[var(--surface-raised)] border border-l-0 border-[var(--border-default)] shadow-lg text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--surface-hover)] transition-all duration-200"
            title="Expand Activity Bar Rail (⌘⌥B)"
            aria-label="Expand Activity Bar Rail"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}

        {/* 3. PRIMARY SIDEBAR (Changes according to Activity Bar, collapsible with ⌘B) */}
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden flex shrink-0 ${
            sidebarOpen ? 'w-[var(--panel-width)] opacity-100' : 'w-0 opacity-0 pointer-events-none'
          }`}
        >
          <Sidebar
            destination={activeDestination}
            presets={ASEAN_PRESETS}
            activePreset={activePreset}
            onSelectPreset={handleSelectPreset}
            activeFile={activeFile}
            onSelectFile={(file: string) => {
              setActiveFile(file);
              setIsSplitView(false);
              setActiveView(file.endsWith('.md') ? 'vault' : file.endsWith('.geojson') ? 'spatial' : 'editor');
            }}
            hasLintError={hasLintError}
            onFixLint={handleFixLint}
            mcpValveOpen={mcpValveOpen}
            onToggleValve={() => setMcpValveOpen(!mcpValveOpen)}
            sluiceGateHeight={sluiceGateHeight}
            onChangeSluiceGate={setSluiceGateHeight}
            droneSimulated={droneSimulated}
            onDispatchDrone={() => setDroneSimulated(!droneSimulated)}
            onSelectEarthParcel={handleSelectEarthParcel}
            onOpenGoogleEarthImport={() => setIsGoogleEarthModalOpen(true)}
            onRunTest={() => {
              setOutputDrawerOpen(true);
              setOutputDrawerTab('tests');
            }}
            windSpeedMs={windSpeedMs}
          />
        </div>

        {/* 4. MAIN WORKBENCH (Dominant visual surface, >= 60% of workspace) */}
        <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 flex overflow-hidden">
            {showSplitEditor && (
              <div className="split-pane w-1/2 border-r border-[var(--border-default)] flex flex-col h-full">
                <CodeEditor
                  activePreset={activePreset}
                  hasLintError={hasLintError}
                  onFixLint={handleFixLint}
                  codeText={codeText}
                  setCodeText={setCodeText}
                />
              </div>
            )}

            <div className={`flex-1 min-w-0 min-h-0 flex flex-col h-full ${!showSplitEditor && activeView === 'editor' ? 'w-full' : ''}`}>
              {activeView === 'editor' && !isSplitView && (
                <CodeEditor
                  activePreset={activePreset}
                  hasLintError={hasLintError}
                  onFixLint={handleFixLint}
                  codeText={codeText}
                  setCodeText={setCodeText}
                />
              )}

              {(showSplitEditor || activeView === 'spatial' || activeView === 'presets') && (
                <SpatialCanvas
                  activePreset={activePreset}
                  onSelectPreset={handleSelectPreset}
                  currentDay={currentDay}
                  onSelectDay={setCurrentDay}
                  isSimulating={isSimulating}
                  onToggleSimulate={handleToggleSimulate}
                  mcpValveOpen={mcpValveOpen}
                  sluiceGateHeight={sluiceGateHeight}
                />
              )}

              {activeView === 'ops' && (
                <FarmOpsView
                  farmId={selectedFarmId}
                  onBack={(at) => {
                    setMapFocus(at ?? null);
                    setActiveDestination('operations');
                    setActiveView('farm-map');
                  }}
                />
              )}
              {activeView === 'agronomy' && <AgronomyView />}
              {activeView === 'paddy-settings' && <PaddySettingsView onBack={() => returnToOperations()} />}
              {activeView === 'farm-map' && (
                <Suspense fallback={<div className="aq-root aq-farmmap-loading" role="status">Loading the farm map</div>}>
                  <FarmMapView
                    focus={mapFocus}
                    onOpenFleet={() => setActiveView('fleet')}
                    onOpenOps={returnToOperations}
                  />
                </Suspense>
              )}
              {activeView === 'fleet' && (
                <FleetMonitorView
                  onOpenFarmMap={() => setActiveView('farm-map')}
                  onOpenOps={(farmId) => returnToOperations(farmId)}
                  onOpenSettings={openPaddySettings}
                  onOpenTwin={() => setActiveView('twin')}
                />
              )}
              {activeView === 'twin' && (
                <Suspense fallback={<div className="aq-root aq-farmmap-loading" role="status">Loading practice plans</div>}>
                  <TwinWorkspace onBack={() => setActiveView('fleet')} />
                </Suspense>
              )}

              {activeView === 'workflow' && (
                <WorkflowDAG
                  activePreset={activePreset}
                  onRunWorkflow={() => {
                    setWorkflowRunning(true);
                    setTimeout(() => setWorkflowRunning(false), 2000);
                  }}
                  workflowRunning={workflowRunning}
                  currentDay={currentDay}
                  onSelectDay={setCurrentDay}
                />
              )}

              {activeView === 'vault' && (
                <BrainVault activePreset={activePreset} />
              )}

              {activeView === 'ledger' && (
                <GitLedger commits={commits} />
              )}

              {(activeView === 'agents' || activeView === 'mcp') && (
                <AgentStudio farmId={selectedFarmId} script={codeText} />
              )}
            </div>
          </div>

          {/* 6. AUTHORITATIVE SIMULATION TIMELINE (Bottom of workbench, non-spatial views) */}
          {!isFullBleed && (
            <SimulationTimeline
              currentDay={currentDay}
              onSelectDay={setCurrentDay}
              isSimulating={isSimulating}
              onToggleSimulate={handleToggleSimulate}
              speed={timelineSpeed}
              onChangeSpeed={setTimelineSpeed}
              onRestart={() => {
                setCurrentDay(1);
                setIsSimulating(false);
              }}
              breakpoints={[35, 68, 92]}
            />
          )}
        </main>

        {/* 7. RIGHT INSPECTOR (Contextual, read-only telemetry, collapsible with ⌘I, non-spatial views) */}
        {!isFullBleed && (
          <div
            className={`transition-all duration-300 ease-in-out overflow-hidden flex shrink-0 ${
              inspectorOpen ? 'w-[var(--advisor-width)] opacity-100' : 'w-0 opacity-0 pointer-events-none'
            }`}
          >
            <ContextInspector
              parcel={importedParcel}
              activePreset={activePreset}
              currentDay={currentDay}
              waterStageM={waterStageM}
              windSpeedMs={windSpeedMs}
              hasLintError={hasLintError}
              onClose={() => setInspectorOpen(false)}
              onOpenPerformance={() => {
                setOutputDrawerOpen(true);
                setOutputDrawerTab('tests');
              }}
            />
          </div>
        )}

        {/* Floating expand trigger when Right Inspector is collapsed */}
        {!isFullBleed && !inspectorOpen && (
          <button
            type="button"
            onClick={() => setInspectorOpen(true)}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-40 px-1.5 py-3 rounded-l-md bg-[var(--surface-raised)] border border-r-0 border-[var(--border-default)] shadow-lg text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--surface-hover)] flex flex-col items-center gap-1.5 transition-all duration-200 group"
            title="Expand Context Inspector (⌘I)"
            aria-label="Expand Context Inspector"
          >
            <ChevronLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
            <span className="[writing-mode:vertical-rl] tracking-wider uppercase text-[9px] font-semibold text-[var(--text-secondary)]">Inspector</span>
          </button>
        )}
      </div>

      {/* 8. BOTTOM OUTPUT DRAWER (Tabs: Problems, Tests, Logs, Receipts, Terminal) */}
      <OutputDrawer
        isOpen={outputDrawerOpen}
        onClose={() => setOutputDrawerOpen(false)}
        activeTab={outputDrawerTab}
        onSelectTab={setOutputDrawerTab}
        hasLintError={hasLintError}
        onApplyFix={handleFixLint}
        onGoToCode={() => {
          setActiveView('editor');
          setIsSplitView(false);
        }}
        onViewRuleSource={() => {
          setActiveDestination('knowledge');
          setActiveView('vault');
        }}
        receipts={[]}
      />

      {/* 9. STATUS BAR */}
      <StatusBar
        branch="main"
        scenarioLabel={activePreset.standard}
        connection={connection}
        errorCount={hasLintError ? 1 : 0}
        warningCount={windSpeedMs > 5.5 ? 1 : 0}
        onOpenOutputDrawer={() => {
          setOutputDrawerOpen(true);
          setOutputDrawerTab('problems');
        }}
        onOpenDemoDisclaimer={() => setIsTourOpen(true)}
      />

      {/* Cmd+K Command Palette Modal */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        presets={ASEAN_PRESETS}
        onSelectPreset={handleSelectPreset}
        onSimulate={handleToggleSimulate}
        onFetchSatellite={handleFetchSatellite}
        onFixLint={handleFixLint}
        onSetActiveView={(view: string) => {
          setActiveView(view);
          if (view === 'ops') {
            setActiveDestination('operations');
            setSidebarOpen(false);
          } else if (view === 'fleet' || view === 'farm-map') {
            setActiveDestination('operations');
            setSidebarOpen(false);
          } else if (view === 'paddy-settings') {
            setSidebarOpen(false);
          }
        }}
        onOpenTerminal={() => {
          setOutputDrawerOpen(true);
          setOutputDrawerTab('terminal');
        }}
        onToggleSplit={() => setIsSplitView(!isSplitView)}
        isSplitView={isSplitView}
      />

      {/* Guided Tour Modal */}
      <IntuitiveTourModal
        isOpen={isTourOpen}
        onClose={() => setIsTourOpen(false)}
        onQuickDemo={() => {
          setIsSimulating(true);
          handleFixLint();
        }}
      />

      {/* Google Earth GIS Land Importer Modal */}
      <GoogleEarthImportModal
        isOpen={isGoogleEarthModalOpen}
        onClose={() => setIsGoogleEarthModalOpen(false)}
        onSelectParcel={handleSelectEarthParcel}
        currentParcelId={importedParcel?.id}
      />
    </div>
  );
};

function generateAgriCodeForEarth(parcel: GoogleEarthLandParcel, hasError: boolean): string {
  const fert = hasError ? 'synthetic_urea' : 'AzollaBioCompost';
  const lat = parcel.centroid.lat.toFixed(4);
  const lon = parcel.centroid.lon.toFixed(4);
  return `// Farm Simulation agronomic contract (.agri)
// Imported from Google Earth: ${parcel.region} (${parcel.country}), centroid [${lat}, ${lon}]
// The verifier checks units, ranges and safety invariants; thresholds marked TO VERIFY need a local source.

farm ${parcel.id}_farm {
    name: "${parcel.country} imported parcel"
    location: [${lat}, ${lon}]
    standard: ASEAN_ORGANIC_ASOA

${contractTerms()}
}

parcel ${parcel.id} {
    area: ${parcel.areaHectares} ha
    soil: soilgrids_profile("${parcel.soilSeries}")
    hydrology {
        regime: AWD_SAFE
        trigger_irrig_below: -15 cm
        flowering_lock_depth: 3 cm .. 5 cm
        percolation: 3 mm/day
    }
    fertigation {
        source: "${fert}"
        max_nitrogen_rate: 65.0 kg_N/ha
    }
    sensors { water_depth: "${parcel.id}-tube" }
}
`;
}

function contractTerms(): string {
  return `    actuation_gates {
        max_wind_speed: 5.5 m/s
        valid_delta_t: 2.0 C .. 8.0 C
        max_rain_6h_post: 10.0 mm
    }

    yield_logic {
        max_canopy_nitrogen: 85 kg/ha
        min_marginal_roi: 1.5x
    }

    schedule {
        crew: 2
        irrigate: 3 h
        spray: 2 h
        scout: 1 h
    }`;
}

function generateAgriCode(preset: AseanPreset, hasError: boolean): string {
  const fert = hasError ? 'synthetic_urea' : 'AzollaBioCompost';
  return `// Farm Simulation agronomic contract (.agri), written once by the buyer's agronomist
// Region: ${preset.country}, ${preset.region}. Standard: ${preset.standard}
// The scheduler computes the daily plan from these terms; field use needs local sources for TO VERIFY values.

farm ${preset.id}_coop {
    name: "${preset.country} contract cooperative"
    location: [${preset.lat}, ${preset.lon}]
    standard: "${preset.standard}"

${contractTerms()}
}

parcel ${preset.id}_field_01 {
    area: 12.5 ha
    crop: "${preset.variety}"
    soil: soilgrids_profile("depth:0-60cm")
    hydrology {
        regime: AWD_SAFE
        trigger_irrig_below: -15 cm
        flowering_lock_depth: 3 cm .. 5 cm
        percolation: 3 mm/day
    }
    fertigation {
        source: "${fert}"
        max_nitrogen_rate: 65.0 kg_N/ha
    }
    sensors { water_depth: "${preset.id}-field-01-tube" }
}
`;
}
