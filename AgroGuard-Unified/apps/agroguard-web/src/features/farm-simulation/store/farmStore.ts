import { create } from 'zustand';
import { getFarm, getParcelsByFarm, getSensorsByFarm, getRobotsByFarm } from '../data/farm/index.ts';

export type LayerKind = 'crop' | 'ndvi' | 'sar' | 'moisture';

export type SelectableKind = 'parcel' | 'sensor' | 'structure' | 'robot' | 'pond' | 'canal';

export interface SelectedTarget {
  kind: SelectableKind;
  id: string;
}

export interface FarmStoreState {
  activeFarmId: string;
  selectedTarget: SelectedTarget | null;
  hoveredTarget: SelectedTarget | null;
  activeLayer: LayerKind;
  minNdviFilter: number;
  sensorStatusFilter: 'all' | 'online' | 'warning' | 'idle' | 'offline';
  robotStatusFilter: 'all' | 'online' | 'idle' | 'warning';
  day: number;
  isPlaying: boolean;
  playbackSpeed: number;
  viewMode: '3d' | 'table';
  resetCameraSignal: number;

  // Live simulation telemetry state
  liveSensorValues: Record<string, { value: number; status: 'online' | 'warning' | 'idle' | 'offline'; lastSeen: string }>;
  droneProgress: number; // 0..1 along waypoints

  // Actions
  setActiveFarmId: (farmId: string) => void;
  selectTarget: (target: SelectedTarget | null) => void;
  hoverTarget: (target: SelectedTarget | null) => void;
  setActiveLayer: (layer: LayerKind) => void;
  setMinNdviFilter: (ndvi: number) => void;
  setSensorStatusFilter: (filter: 'all' | 'online' | 'warning' | 'idle' | 'offline') => void;
  setRobotStatusFilter: (filter: 'all' | 'online' | 'idle' | 'warning') => void;
  setDay: (day: number) => void;
  setPlaying: (isPlaying: boolean) => void;
  togglePlaying: () => void;
  setPlaybackSpeed: (speed: number) => void;
  setViewMode: (mode: '3d' | 'table') => void;
  resetCamera: () => void;
  tickTelemetryDrift: () => void;
}

export const useFarmStore = create<FarmStoreState>((set, get) => ({
  activeFarmId: 'farm_myanmar',
  selectedTarget: null,
  hoveredTarget: null,
  activeLayer: 'crop',
  minNdviFilter: 0,
  sensorStatusFilter: 'all',
  robotStatusFilter: 'all',
  day: 42,
  isPlaying: false,
  playbackSpeed: 1,
  viewMode: '3d',
  resetCameraSignal: 0,
  liveSensorValues: {},
  droneProgress: 0,

  setActiveFarmId: (farmId) => {
    const formatted = farmId.startsWith('farm_') ? farmId : `farm_${farmId}`;
    set({
      activeFarmId: formatted,
      selectedTarget: null,
      hoveredTarget: null,
      resetCameraSignal: get().resetCameraSignal + 1
    });
  },

  selectTarget: (target) => set({ selectedTarget: target }),
  hoverTarget: (target) => set({ hoveredTarget: target }),
  setActiveLayer: (activeLayer) => set({ activeLayer }),
  setMinNdviFilter: (minNdviFilter) => set({ minNdviFilter }),
  setSensorStatusFilter: (sensorStatusFilter) => set({ sensorStatusFilter }),
  setRobotStatusFilter: (robotStatusFilter) => set({ robotStatusFilter }),
  setDay: (day) => set({ day: Math.max(1, Math.min(120, day)) }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  togglePlaying: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
  setViewMode: (viewMode) => set({ viewMode }),
  resetCamera: () => set((state) => ({ resetCameraSignal: state.resetCameraSignal + 1, selectedTarget: null })),

  tickTelemetryDrift: () => {
    const state = get();
    // Advance drone waypoint loop
    const nextDroneProgress = (state.droneProgress + 0.005) % 1;

    // Slight deterministic drift on active sensors
    const sensors = getSensorsByFarm(state.activeFarmId);
    const updatedValues = { ...state.liveSensorValues };

    sensors.forEach((s) => {
      const current = updatedValues[s.id]?.value ?? s.latestValue;
      const jitter = (Math.sin(Date.now() / 3000 + s.positionMetres.x) * 0.05);
      const val = Number((current + jitter).toFixed(2));
      updatedValues[s.id] = {
        value: val,
        status: s.status,
        lastSeen: 'Live (telemetry streaming)'
      };
    });

    set({
      droneProgress: nextDroneProgress,
      liveSensorValues: updatedValues
    });
  }
}));

