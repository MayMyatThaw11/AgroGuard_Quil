import React from 'react';
import { useFarmStore, type LayerKind } from '../../store/farmStore.ts';

export const Legend = React.memo(function Legend() {
  const activeLayer = useFarmStore((s) => s.activeLayer);
  const setActiveLayer = useFarmStore((s) => s.setActiveLayer);
  const minNdviFilter = useFarmStore((s) => s.minNdviFilter);
  const setMinNdviFilter = useFarmStore((s) => s.setMinNdviFilter);
  const [collapsed, setCollapsed] = React.useState(false);

  const layers: LayerKind[] = ['crop', 'ndvi', 'sar', 'moisture'];

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="absolute bottom-[162px] left-3 bg-[#121915]/95 hover:bg-[#18231d] backdrop-blur-md border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] font-mono text-emerald-400 font-semibold shadow-xl z-10 flex items-center gap-1.5 cursor-pointer pointer-events-auto"
        title="Expand Layer Legend"
      >
        <span>LEGEND: {activeLayer.toUpperCase()}</span>
        <span className="text-slate-400">▲</span>
      </button>
    );
  }

  return (
    <div className="absolute bottom-[162px] left-3 bg-[#121915]/95 hover:bg-[#121915] backdrop-blur-md border border-white/10 rounded-xl p-2.5 text-xs text-slate-200 pointer-events-auto select-none shadow-2xl z-10 flex flex-col gap-2 min-w-[200px]">
      <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
          Layer Legend
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-emerald-400 uppercase font-semibold">
            {activeLayer}
          </span>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="text-slate-400 hover:text-white text-[10px] px-1 cursor-pointer"
            title="Collapse Legend"
          >
            ▼
          </button>
        </div>
      </div>

      {/* Layer Switcher Buttons */}
      <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-lg p-0.5">
        {layers.map((layer) => (
          <button
            key={layer}
            type="button"
            onClick={() => setActiveLayer(layer)}
            className={`flex-1 px-1.5 py-0.5 rounded text-[9px] font-mono uppercase font-bold transition cursor-pointer text-center ${
              activeLayer === layer
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {layer}
          </button>
        ))}
      </div>

      {activeLayer === 'crop' && (
        <div className="space-y-1 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#2f855a] shrink-0" />
            <span className="text-slate-300">Healthy (AWD Safe)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#b45309] shrink-0" />
            <span className="text-slate-300">Moisture Warning</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#b91c1c] shrink-0" />
            <span className="text-slate-300">Critical Water Stress</span>
          </div>
        </div>
      )}

      {activeLayer === 'ndvi' && (
        <div className="space-y-1.5 text-[11px]">
          <div className="flex gap-1 w-full h-2 rounded overflow-hidden border border-white/10">
            <span className="flex-1 bg-[#ef4444]" title="< 0.40 Sparse" />
            <span className="flex-1 bg-[#f59e0b]" title="0.40 - 0.55 Low" />
            <span className="flex-1 bg-[#eab308]" title="0.55 - 0.70 Moderate" />
            <span className="flex-1 bg-[#84cc16]" title="0.70 - 0.85 Vigorous" />
            <span className="flex-1 bg-[#10b981]" title="> 0.85 Dense Canopy" />
          </div>
          <div className="flex justify-between text-[9px] font-mono text-slate-400">
            <span>0.4 (Sparse)</span>
            <span>0.7</span>
            <span>0.9 (Vigorous)</span>
          </div>
          {/* NDVI Filter Slider */}
          <div className="pt-1.5 border-t border-white/5 space-y-1">
            <div className="flex justify-between text-[9px] font-mono text-slate-400">
              <span>NDVI Filter:</span>
              <span className="text-emerald-400 font-bold">{minNdviFilter.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="0.85"
              step="0.05"
              value={minNdviFilter}
              onChange={(e) => setMinNdviFilter(Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer h-1"
            />
          </div>
        </div>
      )}

      {activeLayer === 'sar' && (
        <div className="space-y-1 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#1d4ed8] shrink-0" />
            <span className="text-slate-300">&gt; 0.75 High Moisture</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#3b82f6] shrink-0" />
            <span className="text-slate-300">0.50 - 0.75 Moderate</span>
          </div>
        </div>
      )}

      {activeLayer === 'moisture' && (
        <div className="space-y-1 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#0284c7] shrink-0" />
            <span className="text-slate-300">Ponded Water (&gt; 3cm)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#0d9488] shrink-0" />
            <span className="text-slate-300">AWD Drained Root-zone</span>
          </div>
        </div>
      )}

      <span className="text-[9px] text-slate-500 font-mono pt-0.5 border-t border-white/5">
        Source: Sentinel &amp; LoRa Fixture
      </span>
    </div>
  );
});

Legend.displayName = 'Legend';


