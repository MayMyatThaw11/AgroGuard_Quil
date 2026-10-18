import React, { useEffect, useRef, useState } from 'react';
import type { AseanPreset } from '../types.ts';
import { useFarmStore } from '../store/farmStore.ts';
import { shouldLiftStoreDay } from '../lib/daySync.ts';
import { FarmScene } from './farm3d/FarmScene.tsx';
import { TableView } from './farm3d/TableView.tsx';
import { AgriQillTopBar } from './farm3d/AgriQillTopBar.tsx';
import { MlBrainModal } from './farm3d/MlBrainModal.tsx';

interface SpatialCanvasProps {
  activePreset: AseanPreset;
  onSelectPreset?: (preset: AseanPreset) => void;
  currentDay: number;
  onSelectDay?: (day: number) => void;
  isSimulating: boolean;
  onToggleSimulate?: () => void;
  mcpValveOpen: boolean;
  sluiceGateHeight: number;
}

export const SpatialCanvas: React.FC<SpatialCanvasProps> = React.memo(({
  activePreset,
  onSelectPreset,
  currentDay,
  onSelectDay,
  isSimulating,
  onToggleSimulate: _onToggleSimulate,
  mcpValveOpen: _mcpValveOpen,
  sluiceGateHeight: _sluiceGateHeight
}) => {
  const viewMode = useFarmStore((s) => s.viewMode);
  const activeFarmId = useFarmStore((s) => s.activeFarmId);
  const setActiveFarmId = useFarmStore((s) => s.setActiveFarmId);
  const storeDay = useFarmStore((s) => s.day);
  const setDay = useFarmStore((s) => s.setDay);
  const setPlaying = useFarmStore((s) => s.setPlaying);
  const tickTelemetryDrift = useFarmStore((s) => s.tickTelemetryDrift);

  const [mlBrainOpen, setMlBrainOpen] = useState(false);

  // The day value this component last pushed into the store (not the day
  // itself — see shouldLiftStoreDay). Lets the lift-up effect below tell its
  // own write apart from an external one, instead of echoing it back and
  // forth with the push-down effect forever.
  const lastPushedDayRef = useRef<number | null>(null);

  // Sync active farm with preset selection from parent
  useEffect(() => {
    setActiveFarmId(activePreset.id);
  }, [activePreset.id, setActiveFarmId]);

  // Sync active preset up when farm changes in store (e.g. from top bar dropdown)
  useEffect(() => {
    const rawId = activeFarmId.replace(/^farm_/, '');
    if (rawId !== activePreset.id) {
      // Find preset by id
      import('../data/presets.ts').then(({ ASEAN_PRESETS }) => {
        const match = ASEAN_PRESETS.find((p) => p.id === rawId);
        if (match && onSelectPreset) {
          onSelectPreset(match);
        }
      });
    }
  }, [activeFarmId, activePreset.id, onSelectPreset]);

  // Sync simulation day (1..120) from parent. Record the value the store
  // actually applied (setDay clamps) so the lift-up effect below can tell
  // this write apart from an external one — see shouldLiftStoreDay.
  useEffect(() => {
    setDay(currentDay);
    lastPushedDayRef.current = useFarmStore.getState().day;
  }, [currentDay, setDay]);

  // Sync simulation day up when something other than the push-down effect
  // above changes the store's day (e.g. a future in-3D-view day scrub).
  useEffect(() => {
    if (shouldLiftStoreDay(storeDay, lastPushedDayRef.current) && onSelectDay) {
      lastPushedDayRef.current = storeDay;
      onSelectDay(storeDay);
    }
  }, [storeDay, onSelectDay]);

  // Sync playing state
  useEffect(() => {
    setPlaying(isSimulating);
  }, [isSimulating, setPlaying]);

  // Live telemetry drift interval (every 2 seconds)
  useEffect(() => {
    const timer = setInterval(() => {
      tickTelemetryDrift();
    }, 2000);
    return () => clearInterval(timer);
  }, [tickTelemetryDrift]);

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col h-full bg-[#090d0b] relative overflow-hidden select-none font-sans">
      {/* Top Context Bar (AgriQill Ag IDE Top Bar) */}
      <AgriQillTopBar onOpenMlBrain={() => setMlBrainOpen(true)} />

      {/* Main Full-Viewport Operational Canvas */}
      <div className="flex-1 min-h-0 min-w-0 relative overflow-hidden">
        {viewMode === '3d' ? <FarmScene /> : <TableView />}
      </div>

      {/* ML Best Practices & Agricultural Brain Modal */}
      <MlBrainModal isOpen={mlBrainOpen} onClose={() => setMlBrainOpen(false)} />
    </div>
  );
});

SpatialCanvas.displayName = 'SpatialCanvas';