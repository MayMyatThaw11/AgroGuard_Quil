import React from 'react';
import { Plus, Minus, RotateCw, RotateCcw, Home } from 'lucide-react';
import { useFarmStore } from '../../store/farmStore.ts';

export const FloatingCameraControls: React.FC = React.memo(() => {
  const resetCamera = useFarmStore((s) => s.resetCamera);

  return (
    <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex flex-col bg-[#121915]/90 backdrop-blur-md border border-white/10 rounded-xl p-1 shadow-xl pointer-events-auto text-slate-300">
      <button
        type="button"
        onClick={() => {
          // Camera zoom simulation via key dispatch or event
          window.dispatchEvent(new CustomEvent('agriqill-camera-zoom', { detail: { delta: -1 } }));
        }}
        className="p-2 hover:bg-white/10 rounded-lg hover:text-white transition-colors cursor-pointer"
        title="Zoom in (+)"
      >
        <Plus size={16} />
      </button>

      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(new CustomEvent('agriqill-camera-zoom', { detail: { delta: 1 } }));
        }}
        className="p-2 hover:bg-white/10 rounded-lg hover:text-white transition-colors cursor-pointer"
        title="Zoom out (-)"
      >
        <Minus size={16} />
      </button>

      <div className="h-px bg-white/10 my-0.5 mx-1" />

      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(new CustomEvent('agriqill-camera-rotate'));
        }}
        className="p-2 hover:bg-white/10 rounded-lg hover:text-white transition-colors cursor-pointer"
        title="Rotate isometric angle"
      >
        <RotateCw size={15} />
      </button>

      <button
        type="button"
        onClick={resetCamera}
        className="p-2 hover:bg-white/10 rounded-lg hover:text-white transition-colors cursor-pointer"
        title="Reset to default isometric angle"
      >
        <Home size={15} />
      </button>
    </div>
  );
});

FloatingCameraControls.displayName = 'FloatingCameraControls';

